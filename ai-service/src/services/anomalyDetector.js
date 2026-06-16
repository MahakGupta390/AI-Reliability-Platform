const axios = require('axios');
const Incident = require('../models/incident.model');
const { analyzeRootCause } = require('./rootCause');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);
const Z_SCORE_TRIGGER = parseFloat(process.env.Z_SCORE_TRIGGER || '3.0');
const Z_SCORE_RESOLVE = parseFloat(process.env.Z_SCORE_RESOLVE || '1.5');

/**
 * STATIC BASELINES
 * Represent normal P99 latency behavior per service.
 * meanP99: expected P99 latency in milliseconds under normal load.
 * stdDev:  standard deviation of P99 latency under normal load.
 *
 * These values are derived from Phase 8 benchmarking results.
 * In Phase 9E, these get replaced by learned baselines from Prometheus
 * historical data using time-of-day and day-of-week bucketing.
 *
 * Z-score formula: zScore = (currentP99 - meanP99) / stdDev
 * zScore > 3.0 → anomalous (create incident)
 * zScore ≤ 1.5 → recovered (resolve incident)
 */
const BASELINES = {
  'payment-service': { meanP99: 250, stdDev: 40 },
  'order-service': { meanP99: 400, stdDev: 50 },
  'auth-service': { meanP99: 150, stdDev: 30 },
};

/**
 * Severity classification by Z-score magnitude.
 */
const classifySeverity = (zScore) => {
  if (zScore > 8) return 'critical';
  if (zScore > 6) return 'high';
  if (zScore > 4) return 'medium';
  return 'low';
};

/**
 * generateIncidentId
 * Produces a human-readable, sortable incident ID.
 * Format: INC-YYYYMMDD-HHMMSS-<service>
 */
const generateIncidentId = (service) => {
  const now = new Date();
  const date = now.toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const svcSlug = service.replace('-service', '').toUpperCase();
  return `INC-${date}-${svcSlug}`;
};

/**
 * fetchP99LatencyFromPrometheus
 * Queries Prometheus for current P99 latency per service.
 * Returns a Map: { serviceName → p99InMilliseconds }
 *
 * PromQL used:
 *   histogram_quantile(0.99,
 *     sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service)
 *   )
 *
 * The [1m] window gives a rolling 1-minute view — responsive to spikes
 * without being too noisy for one-off slow requests.
 *
 * Result is in SECONDS from Prometheus — we multiply by 1000 for ms.
 */
const fetchP99LatencyFromPrometheus = async () => {
  const query =
    'histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[1m])) by (le, service))';

  const url = `${PROMETHEUS_URL}/api/v1/query`;

  const response = await axios.get(url, {
    params: { query },
    timeout: 5000,
  });

  // ✅ FIX: Strict validation of response payload structural integrity
  if (!response || !response.data || !response.data.data || !Array.isArray(response.data.data.result)) {
    logger.warn('Prometheus returned an empty or invalid payload schema structure.', {
      service: SERVICE_NAME,
      responseData: response ? response.data : null
    });
    return new Map();
  }

  const results = response.data.data.result;
  const metricsMap = new Map();

  for (const item of results) {
    // ✅ FIX: Ensure item metrics properties exist before reading internal values
    if (!item || !item.metric || !Array.isArray(item.value)) {
      continue;
    }

    const service = item.metric.service;
    const valueSeconds = parseFloat(item.value[1]);

    if (service && !isNaN(valueSeconds)) {
      metricsMap.set(service, valueSeconds * 1000); // convert s → ms
    }
  }

  return metricsMap;
};

/**
 * computeZScore
 * Core statistical calculation.
 *
 * Z-score measures how many standard deviations a value is from the mean.
 * Z = (observed - mean) / stdDev
 *
 * Interpretation:
 *   Z < 1.5  → within normal variation
 *   Z 1.5–3  → elevated but not alarming
 *   Z > 3.0  → statistically anomalous (3 standard deviations above mean)
 *              probability of this being random: < 0.13%
 *   Z > 6.0  → extreme anomaly (> 6 standard deviations)
 */
const computeZScore = (currentP99Ms, baseline) => {
  return (currentP99Ms - baseline.meanP99) / baseline.stdDev;
};

/**
 * openIncidentMap
 * In-memory map of currently open incidents per service.
 * Key: service name  →  Value: Mongoose Incident document
 *
 * This prevents creating duplicate incidents for the same ongoing issue.
 * On startup, we also sync this from MongoDB in case of process restart.
 */
const openIncidentMap = new Map();

/**
 * syncOpenIncidentsFromDB
 * On startup, loads any open incidents from MongoDB into openIncidentMap.
 * Prevents the detector from creating duplicate incidents after a restart.
 */
const syncOpenIncidentsFromDB = async () => {
  const openIncidents = await Incident.find({ status: 'open' });
  for (const incident of openIncidents) {
    openIncidentMap.set(incident.affectedService, incident);
  }
  logger.info('Synced open incidents from MongoDB', {
    service: SERVICE_NAME,
    count: openIncidents.length,
    services: [...openIncidentMap.keys()],
  });
};

/**
 * handleAnomaly
 * Called when Z-score exceeds Z_SCORE_TRIGGER for a service.
 * Creates a new incident if one is not already open for this service.
 */
const handleAnomaly = async (serviceName, currentP99Ms, zScore, allMetrics) => {
  if (openIncidentMap.has(serviceName)) {
    // Incident already open — update peak values and add timeline entry
    const existing = openIncidentMap.get(serviceName);

    if (zScore > existing.peakZScore) {
      existing.peakZScore = zScore;
      existing.peakP99Ms = currentP99Ms;
    }

    existing.timeline.push({
      at: new Date(),
      event: `Ongoing anomaly — Z-score: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms`,
      zScore,
      p99Ms: currentP99Ms,
    });

    await existing.save();

    logger.info('Incident ongoing — updated', {
      service: SERVICE_NAME,
      incidentId: existing.incidentId,
      affectedService: serviceName,
      zScore: zScore.toFixed(2),
      currentP99Ms: currentP99Ms.toFixed(0),
    });

    return;
  }

  // Build complete snapshot of all services at time of incident
  const allServicesSnapshot = {};
  for (const [svc, p99Ms] of allMetrics.entries()) {
    const baseline = BASELINES[svc];
    if (baseline) {
      const svcZScore = computeZScore(p99Ms, baseline);
      allServicesSnapshot[svc] = {
        currentP99Ms: parseFloat(p99Ms.toFixed(2)),
        zScore: parseFloat(svcZScore.toFixed(2)),
        status: svcZScore > Z_SCORE_TRIGGER ? 'anomalous' : 'normal',
      };
    }
  }

  // Root cause attribution
  const rootCauseAnalysis = analyzeRootCause(serviceName, allServicesSnapshot, allMetrics, BASELINES);

  const baseline = BASELINES[serviceName];
  const severity = classifySeverity(zScore);
  const incidentId = generateIncidentId(serviceName);
  const now = new Date();

  const incident = await Incident.create({
    incidentId,
    status: 'open',
    severity,
    affectedService: serviceName,
    symptom: `P99 latency ${currentP99Ms.toFixed(0)}ms is ${zScore.toFixed(2)} standard deviations above baseline (${baseline.meanP99}ms ± ${baseline.stdDev}ms)`,
    detectedAt: now,
    peakZScore: zScore,
    peakP99Ms: currentP99Ms,
    evidence: {
      affectedService: serviceName,
      currentP99Ms: parseFloat(currentP99Ms.toFixed(2)),
      baselineMeanMs: baseline.meanP99,
      baselineStdDev: baseline.stdDev,
      zScore: parseFloat(zScore.toFixed(2)),
      deviationFactor: parseFloat((currentP99Ms / baseline.meanP99).toFixed(2)),
      rootCause: rootCauseAnalysis.rootCause,
      rootCauseConfidence: rootCauseAnalysis.confidence,
      allServicesSnapshot,
    },
    timeline: [
      {
        at: now,
        event: `Incident detected — Z-score: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms, Severity: ${severity}`,
        zScore,
        p99Ms: currentP99Ms,
      },
    ],
  });

  openIncidentMap.set(serviceName, incident);

  logger.warn('INCIDENT CREATED', {
    service: SERVICE_NAME,
    incidentId,
    affectedService: serviceName,
    severity,
    currentP99Ms: currentP99Ms.toFixed(0),
    baselineMeanMs: baseline.meanP99,
    zScore: zScore.toFixed(2),
    rootCause: rootCauseAnalysis.rootCause,
    confidence: rootCauseAnalysis.confidence,
  });
};

/**
 * handleRecovery
 * Called when Z-score drops to or below Z_SCORE_RESOLVE for a service.
 * Auto-resolves the open incident and records the duration.
 */
const handleRecovery = async (serviceName, currentP99Ms, zScore) => {
  if (!openIncidentMap.has(serviceName)) return;

  const incident = openIncidentMap.get(serviceName);

  await incident.resolve(zScore, currentP99Ms);
  openIncidentMap.delete(serviceName);

  const durationSeconds = (incident.durationMs / 1000).toFixed(1);

  logger.info('INCIDENT RESOLVED', {
    service: SERVICE_NAME,
    incidentId: incident.incidentId,
    affectedService: serviceName,
    durationMs: incident.durationMs,
    durationSeconds,
    peakZScore: incident.peakZScore.toFixed(2),
    peakP99Ms: incident.peakP99Ms.toFixed(0),
    resolvedZScore: zScore.toFixed(2),
    currentP99Ms: currentP99Ms.toFixed(0),
  });
};

/**
 * runDetectionCycle
 * Single execution of the full anomaly detection loop.
 * Called every POLL_INTERVAL_MS milliseconds.
 *
 * Algorithm:
 * 1. Fetch current P99 from Prometheus for all services
 * 2. For each service that has a baseline defined:
 *    a. Compute Z-score
 *    b. If Z > 3.0 AND no open incident → create incident
 *    c. If Z > 3.0 AND incident open → update peak, add timeline entry
 *    d. If Z ≤ 1.5 AND incident open → auto-resolve
 */
const runDetectionCycle = async () => {
  let metricsMap;

  try {
    metricsMap = await fetchP99LatencyFromPrometheus();
  } catch (err) {
    logger.error('Failed to fetch metrics from Prometheus', {
      service: SERVICE_NAME,
      error: err.message,
      prometheusUrl: PROMETHEUS_URL,
    });
    return;
  }

  if (metricsMap.size === 0) {
    logger.debug('No metrics returned from Prometheus — services may have no traffic yet', {
      service: SERVICE_NAME,
    });
    return;
  }

  for (const [serviceName, currentP99Ms] of metricsMap.entries()) {
    const baseline = BASELINES[serviceName];

    if (!baseline) {
      // No baseline defined for this service — skip silently
      continue;
    }

    const zScore = computeZScore(currentP99Ms, baseline);

    logger.debug('Detection cycle result', {
      service: SERVICE_NAME,
      targetService: serviceName,
      currentP99Ms: currentP99Ms.toFixed(2),
      baselineMeanMs: baseline.meanP99,
      zScore: zScore.toFixed(2),
      status: zScore > Z_SCORE_TRIGGER ? 'ANOMALOUS' : zScore > Z_SCORE_RESOLVE ? 'ELEVATED' : 'NORMAL',
    });

    if (zScore > Z_SCORE_TRIGGER) {
      await handleAnomaly(serviceName, currentP99Ms, zScore, metricsMap);
    } else if (zScore <= Z_SCORE_RESOLVE) {
      await handleRecovery(serviceName, currentP99Ms, zScore);
    }
    // Zone between Z_SCORE_RESOLVE and Z_SCORE_TRIGGER is a hysteresis buffer.
    // We don't create or resolve incidents in this zone.
    // This prevents rapid open/close flapping when Z-score hovers near 3.0.
  }
};

/**
 * startAnomalyDetector
 * Exported entry point. Called from server.js after MongoDB connects.
 * Syncs open incidents from DB, then starts the polling loop.
 */
const startAnomalyDetector = async () => {
  await syncOpenIncidentsFromDB();

  logger.info('Anomaly detector started', {
    service: SERVICE_NAME,
    pollIntervalMs: POLL_INTERVAL_MS,
    zScoreTrigger: Z_SCORE_TRIGGER,
    zScoreResolve: Z_SCORE_RESOLVE,
    prometheusUrl: PROMETHEUS_URL,
    monitoredServices: Object.keys(BASELINES),
  });

  // Run immediately on startup, then on interval
  await runDetectionCycle();

  setInterval(async () => {
    try {
      await runDetectionCycle();
    } catch (err) {
      logger.error('Detection cycle error', {
        service: SERVICE_NAME,
        error: err.message,
        stack: err.stack,
      });
    }
  }, POLL_INTERVAL_MS);
};

module.exports = { startAnomalyDetector, BASELINES };
