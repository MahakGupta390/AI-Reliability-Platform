/**
 * src/services/anomalyDetector.js  [MODIFIED — Screen 5]
 *
 * CRITICAL CHANGE FROM SCREEN 3/4 VERSION:
 *
 * Previously: BASELINES was a hardcoded module-level `const` object, and
 * Z_SCORE_TRIGGER / Z_SCORE_RESOLVE / POLL_INTERVAL_MS were read ONCE from
 * process.env at module load time. Editing them via Screen 5 had NO EFFECT
 * on the running detector — only the dashboard display was updated, the
 * actual detection logic kept using the old frozen values until restart.
 *
 * Now: every read of baselines/thresholds/poll-interval goes through
 * configStore.js, which is backed by MongoDB and updated immediately
 * when Screen 5 saves a change (see configController.js). The very next
 * detection cycle (within POLL_INTERVAL_MS) picks up the new values —
 * matching the same "no restart needed" pattern already used by the
 * /simulate endpoint in Screen 2.
 *
 * setInterval is now self-rescheduling (uses setTimeout in a loop) so that
 * changing pollIntervalMs via Screen 5 takes effect on the NEXT tick too,
 * not just on the values used inside each cycle.
 *
 * All Z-score math, incident creation, root-cause analysis, and chaos
 * tagging logic from Screen 2/3 is UNCHANGED — only the SOURCE of the
 * threshold/baseline values has changed.
 */

const axios     = require('axios');
const Incident  = require('../models/incident.model');
const { analyzeRootCause } = require('./rootCause');
const { aggregateChaosState } = require('./chaosStateAggregator');
const configStore = require('../config/configStore');     // NEW — Screen 5
const logger    = require('../config/logger');

const SERVICE_NAME   = process.env.SERVICE_NAME   || 'ai-service';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';

// REMOVED: const POLL_INTERVAL_MS / Z_SCORE_TRIGGER / Z_SCORE_RESOLVE / BASELINES
// These now come from configStore on every read — see functions below.

const classifySeverity = (zScore) => {
  if (zScore > 8) return 'critical';
  if (zScore > 6) return 'high';
  if (zScore > 4) return 'medium';
  return 'low';
};

const generateIncidentId = (service) => {
  const now     = new Date();
  const date    = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const svcSlug = service.replace('-service', '').toUpperCase();
  return `INC-${date}-${svcSlug}`;
};

const fetchP99LatencyFromPrometheus = async () => {
  const query = 'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service))';
  const response = await axios.get(`${PROMETHEUS_URL}/api/v1/query`, {
    params: { query }, timeout: 5000,
  });
  const results = response.data?.data?.result || [];
  const metricsMap = new Map();
  for (const item of results) {
    const service      = item.metric?.service;
    const valueSeconds = parseFloat(item.value?.[1]);
    if (service && !isNaN(valueSeconds)) {
      metricsMap.set(service, valueSeconds * 1000);
    }
  }
  return metricsMap;
};

const computeZScore = (currentP99Ms, baseline) =>
  (currentP99Ms - baseline.meanP99) / baseline.stdDev;

const openIncidentMap = new Map();

const syncOpenIncidentsFromDB = async () => {
  const openIncidents = await Incident.find({ status: 'open' });
  for (const incident of openIncidents) {
    openIncidentMap.set(incident.affectedService, incident);
  }
  logger.info('Synced open incidents from MongoDB', {
    service: SERVICE_NAME, count: openIncidents.length,
  });
};

// MODIFIED: baseline now passed in (caller reads from configStore)
const handleAnomaly = async (serviceName, currentP99Ms, zScore, allMetrics, chaosState, baselines) => {
  if (openIncidentMap.has(serviceName)) {
    const existing = openIncidentMap.get(serviceName);
    if (zScore > existing.peakZScore) {
      existing.peakZScore = zScore;
      existing.peakP99Ms  = currentP99Ms;
    }
    existing.timeline.push({
      at: new Date(),
      event: `Ongoing — Z-score: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms`,
      zScore, p99Ms: currentP99Ms,
    });
    await existing.save();
    return;
  }

  // CHANGED: read zScoreTrigger live from configStore (was frozen const)
  const zScoreTrigger = configStore.getZScoreTrigger();

  const allServicesSnapshot = {};
  for (const [svc, p99Ms] of allMetrics.entries()) {
    const baseline = baselines[svc];
    if (baseline) {
      const svcZScore = computeZScore(p99Ms, baseline);
      allServicesSnapshot[svc] = {
        currentP99Ms: parseFloat(p99Ms.toFixed(2)),
        zScore:       parseFloat(svcZScore.toFixed(2)),
        status:       svcZScore > zScoreTrigger ? 'anomalous' : 'normal',
      };
    }
  }

  const rootCauseAnalysis = analyzeRootCause(serviceName, allServicesSnapshot, allMetrics, baselines);
  const baseline   = baselines[serviceName];
  const severity   = classifySeverity(zScore);
  const incidentId = generateIncidentId(serviceName);
  const now        = new Date();

  const chaosInjected = chaosState?.experimentRunning ?? false;
  const chaosServices = chaosState?.affectedServices  ?? [];

  const incident = await Incident.create({
    incidentId,
    status:   'open',
    severity,
    affectedService: serviceName,
    symptom: `P99 latency ${currentP99Ms.toFixed(0)}ms is ${zScore.toFixed(2)} standard deviations above baseline (${baseline.meanP99}ms ± ${baseline.stdDev}ms)`,
    detectedAt: now,
    peakZScore: zScore,
    peakP99Ms:  currentP99Ms,
    evidence: {
      affectedService:     serviceName,
      currentP99Ms:        parseFloat(currentP99Ms.toFixed(2)),
      baselineMeanMs:      baseline.meanP99,
      baselineStdDev:      baseline.stdDev,
      zScore:              parseFloat(zScore.toFixed(2)),
      deviationFactor:     parseFloat((currentP99Ms / baseline.meanP99).toFixed(2)),
      rootCause:           rootCauseAnalysis.rootCause,
      rootCauseConfidence: rootCauseAnalysis.confidence,
      allServicesSnapshot,
      chaosInjected,
      chaosServices,
    },
    timeline: [{
      at: now,
      event: `Detected — Z: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms, Severity: ${severity}${chaosInjected ? ' [CHAOS EXPERIMENT]' : ''}`,
      zScore, p99Ms: currentP99Ms,
    }],
  });

  openIncidentMap.set(serviceName, incident);

  logger.warn('INCIDENT CREATED', {
    service: SERVICE_NAME, incidentId,
    affectedService: serviceName, severity,
    currentP99Ms: currentP99Ms.toFixed(0), zScore: zScore.toFixed(2),
    rootCause: rootCauseAnalysis.rootCause, chaosInjected,
  });
};

const handleRecovery = async (serviceName, currentP99Ms, zScore) => {
  if (!openIncidentMap.has(serviceName)) return;
  const incident = openIncidentMap.get(serviceName);
  await incident.resolve(zScore, currentP99Ms);
  openIncidentMap.delete(serviceName);
  logger.info('INCIDENT RESOLVED', {
    service: SERVICE_NAME, incidentId: incident.incidentId,
    affectedService: serviceName, durationMs: incident.durationMs,
    peakZScore: incident.peakZScore.toFixed(2),
  });
};

// MODIFIED: reads baselines/thresholds/monitored-status fresh from configStore
// at the START of every cycle — so Screen 5 edits apply on the very next tick.
const runDetectionCycle = async () => {
  let metricsMap;
  try {
    metricsMap = await fetchP99LatencyFromPrometheus();
  } catch (err) {
    logger.error('Failed to fetch metrics from Prometheus', {
      service: SERVICE_NAME, error: err.message,
    });
    return;
  }

  if (metricsMap.size === 0) {
    logger.debug('No metrics from Prometheus yet', { service: SERVICE_NAME });
    return;
  }

  let chaosState = null;
  try {
    chaosState = await aggregateChaosState();
  } catch {
    // Non-critical — incidents still created, just without chaos tagging
  }

  // CHANGED: read live config at the top of every cycle (was frozen at module load)
  const baselines      = configStore.getBaselines();
  const zScoreTrigger   = configStore.getZScoreTrigger();
  const zScoreResolve   = configStore.getZScoreResolve();
  const monitoredMap    = configStore.getMonitoredServices();

  // Map backend service names to frontend ids for monitored-toggle lookup
  const BACKEND_TO_ID = { 'auth-service': 'auth', 'payment-service': 'payments', 'order-service': 'orders' };

  for (const [serviceName, currentP99Ms] of metricsMap.entries()) {
    const baseline = baselines[serviceName];
    if (!baseline) continue;

    // NEW — Screen 5: skip services that have been toggled off in the Registry
    const frontendId = BACKEND_TO_ID[serviceName];
    if (frontendId && monitoredMap[frontendId] === false) {
      logger.debug('Skipping unmonitored service', { service: SERVICE_NAME, target: serviceName });
      continue;
    }

    const zScore = computeZScore(currentP99Ms, baseline);

    logger.debug('Detection cycle', {
      service: SERVICE_NAME, targetService: serviceName,
      currentP99Ms: currentP99Ms.toFixed(2),
      zScore: zScore.toFixed(2),
      status: zScore > zScoreTrigger ? 'ANOMALOUS' : zScore > zScoreResolve ? 'ELEVATED' : 'NORMAL',
    });

    if (zScore > zScoreTrigger) {
      await handleAnomaly(serviceName, currentP99Ms, zScore, metricsMap, chaosState, baselines);
    } else if (zScore <= zScoreResolve) {
      await handleRecovery(serviceName, currentP99Ms, zScore);
    }
  }
};

// MODIFIED: self-rescheduling timer (setTimeout loop) instead of setInterval,
// so a poll-interval change via Screen 5 takes effect starting from the
// very next scheduled tick rather than only after the old interval finishes.
let detectorTimer = null;

const scheduleNextCycle = () => {
  const intervalMs = configStore.getPollIntervalMs();   // read fresh every time
  detectorTimer = setTimeout(async () => {
    try {
      await runDetectionCycle();
    } catch (err) {
      logger.error('Detection cycle error', { service: SERVICE_NAME, error: err.message });
    }
    scheduleNextCycle();   // reschedule using whatever the CURRENT interval is
  }, intervalMs);
};

const startAnomalyDetector = async () => {
  await syncOpenIncidentsFromDB();

  const baselines = configStore.getBaselines();
  logger.info('Anomaly detector started', {
    service:           SERVICE_NAME,
    pollIntervalMs:     configStore.getPollIntervalMs(),
    zScoreTrigger:      configStore.getZScoreTrigger(),
    zScoreResolve:      configStore.getZScoreResolve(),
    prometheusUrl:      PROMETHEUS_URL,
    monitoredServices:  Object.keys(baselines),
  });

  await runDetectionCycle();
  scheduleNextCycle();
};

const stopAnomalyDetector = () => {
  if (detectorTimer) clearTimeout(detectorTimer);
};

// BASELINES export removed — anyone needing baselines should call
// configStore.getBaselines() directly (live, mutable) instead of importing
// a frozen object. server.js and other controllers updated accordingly.
module.exports = { startAnomalyDetector, stopAnomalyDetector };
