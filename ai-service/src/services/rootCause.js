const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';
const Z_SCORE_TRIGGER = parseFloat(process.env.Z_SCORE_TRIGGER || '3.0');

/**
 * SERVICE DEPENDENCY MAP
 * Defines which services call which downstream services.
 * When order-service is slow, we check if payment-service or auth-service
 * are ALSO slow — if they are, the root cause is the downstream service,
 * not order-service itself.
 *
 * Key:   service that is showing symptoms
 * Value: array of services it depends on (potential root causes)
 */
const SERVICE_DEPENDENCIES = {
  'order-service': ['payment-service', 'auth-service'],
  'payment-service': [],
  'auth-service': [],
};

/**
 * ROOT CAUSE ATTRIBUTION ALGORITHM
 *
 * The core insight: when service A is slow AND calls service B which is also slow,
 * service B is likely the root cause. Service A is a VICTIM of B's slowness.
 *
 * This uses the serviceLatencies data pattern established in Phase 2 where
 * order-service stores exactly how long each downstream call took.
 *
 * ALGORITHM STEPS:
 * 1. Check if the affected service has known downstream dependencies
 * 2. For each dependency, check if IT is also anomalous in the current snapshot
 * 3. If a dependency is anomalous: it is likely the root cause
 * 4. If no dependency is anomalous: the affected service is its own root cause
 * 5. Confidence is based on:
 *    - HIGH: downstream service Z-score is higher than affected service Z-score
 *            (downstream is MORE anomalous than upstream → clear cascade)
 *    - MEDIUM: downstream service is anomalous but less severely
 *    - LOW: no downstream anomaly found (self-caused or unknown external)
 *
 * EXAMPLE SCENARIO (payment-service HIGH_LATENCY=true):
 *   payment-service: Z = 8.2  (severely anomalous — has the injected delay)
 *   order-service:   Z = 7.1  (also anomalous — waiting for payment)
 *   auth-service:    Z = 0.3  (normal — not involved)
 *
 *   For order-service anomaly:
 *     → check dependencies: [payment-service, auth-service]
 *     → payment-service is anomalous (Z=8.2 > trigger)
 *     → payment-service Z (8.2) > order-service Z (7.1) → HIGH confidence
 *     → rootCause = "payment-service"
 *     → recommendation: "Investigate payment-service P99 latency (Z=8.2)..."
 */
const analyzeRootCause = (affectedService, allServicesSnapshot, allMetricsMap, BASELINES) => {
  const dependencies = SERVICE_DEPENDENCIES[affectedService] || [];

  logger.debug('Root cause analysis', {
    service: SERVICE_NAME,
    affectedService,
    dependencies,
    snapshotKeys: Object.keys(allServicesSnapshot),
  });

  // Case 1: Service has no dependencies → it is its own root cause
  if (dependencies.length === 0) {
    const currentP99 = allMetricsMap.get(affectedService) || 0;
    const baseline = BASELINES[affectedService];
    const zScore = baseline
      ? ((currentP99 - baseline.meanP99) / baseline.stdDev).toFixed(2)
      : 'unknown';

    return {
      rootCause: affectedService,
      confidence: 'HIGH',
      reason: `${affectedService} has no upstream dependencies. Self-caused latency anomaly.`,
      recommendation: `Investigate ${affectedService} directly. Check: MongoDB query performance, connection pool, memory usage, and CPU. Current P99: ${currentP99.toFixed(0)}ms, Z-score: ${zScore}.`,
      cascadeChain: [affectedService],
    };
  }

  // Case 2: Check each dependency for anomaly
  const anomalousDependencies = [];

  for (const dep of dependencies) {
    const depSnapshot = allServicesSnapshot[dep];
    if (!depSnapshot) continue;

    if (depSnapshot.status === 'anomalous' || depSnapshot.zScore > Z_SCORE_TRIGGER) {
      anomalousDependencies.push({
        service: dep,
        zScore: depSnapshot.zScore,
        currentP99Ms: depSnapshot.currentP99Ms,
      });
    }
  }

  if (anomalousDependencies.length === 0) {
    // No anomalous dependencies — self-caused
    const currentP99 = allMetricsMap.get(affectedService) || 0;

    return {
      rootCause: affectedService,
      confidence: 'MEDIUM',
      reason: `${affectedService} is anomalous but all its dependencies appear healthy. Likely self-caused.`,
      recommendation: `Investigate ${affectedService} internal performance. Check MongoDB queries, event loop lag, GC pressure, and memory leaks. Dependencies checked: [${dependencies.join(', ')}] — all appear normal.`,
      cascadeChain: [affectedService],
    };
  }

  // Sort anomalous dependencies by Z-score descending — highest is most likely cause
  anomalousDependencies.sort((a, b) => b.zScore - a.zScore);
  const primaryCause = anomalousDependencies[0];

  const affectedSnapshot = allServicesSnapshot[affectedService];
  const affectedZScore = affectedSnapshot?.zScore || 0;

  // Determine confidence by comparing Z-scores
  let confidence;
  let reason;

  if (primaryCause.zScore > affectedZScore) {
    confidence = 'HIGH';
    reason = `${primaryCause.service} Z-score (${primaryCause.zScore.toFixed(2)}) exceeds ${affectedService} Z-score (${affectedZScore.toFixed(2)}). Classic cascade pattern: downstream service is MORE anomalous than the upstream caller.`;
  } else if (primaryCause.zScore > Z_SCORE_TRIGGER) {
    confidence = 'MEDIUM';
    reason = `${primaryCause.service} is also anomalous (Z=${primaryCause.zScore.toFixed(2)}) but less severely than ${affectedService} (Z=${affectedZScore.toFixed(2)}). Possible cascade but could also be independent degradation.`;
  } else {
    confidence = 'LOW';
    reason = `${primaryCause.service} shows mild elevation but may not be the cause. Multiple factors possible.`;
  }

  const cascadeChain = [primaryCause.service, affectedService];

  const otherAnomalous = anomalousDependencies.slice(1).map((d) => d.service).join(', ');

  return {
    rootCause: primaryCause.service,
    confidence,
    reason,
    recommendation: `Investigate ${primaryCause.service} first (Z=${primaryCause.zScore.toFixed(2)}, P99=${primaryCause.currentP99Ms.toFixed(0)}ms). ${affectedService} is a victim of ${primaryCause.service} slowness. Resolving ${primaryCause.service} should restore ${affectedService}.${otherAnomalous ? ` Also anomalous: [${otherAnomalous}].` : ''}`,
    cascadeChain,
  };
};

/**
 * getRootCauseSummary
 * Human-readable one-liner for incident notifications.
 * Used in log messages and future alerting output.
 */
const getRootCauseSummary = (rootCauseResult) => {
  const { rootCause, confidence, cascadeChain } = rootCauseResult;
  if (cascadeChain.length > 1) {
    return `ROOT CAUSE: ${rootCause} [${confidence} confidence] → cascade to ${cascadeChain.slice(1).join(' → ')}`;
  }
  return `ROOT CAUSE: ${rootCause} [${confidence} confidence] — self-caused`;
};

module.exports = { analyzeRootCause, getRootCauseSummary, SERVICE_DEPENDENCIES };
