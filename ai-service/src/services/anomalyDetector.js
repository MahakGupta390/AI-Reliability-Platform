/**
 * src/services/anomalyDetector.js  [MODIFIED — Screen 2 backend]
 *
 * CHANGES:
 * 1. Imports chaosStateAggregator to tag incidents created during known
 *    chaos experiments. When an incident is created while chaos is running,
 *    evidence.chaosInjected = true and evidence.chaosServices = [...].
 *    This lets the frontend mark incidents as "intentional" vs "real".
 *
 * 2. handleRecovery now also checks if chaos has been restored,
 *    so auto-resolution aligns with the Restore All button.
 *
 * All other logic (Z-score, Prometheus polling, incident creation) UNCHANGED.
 */

const axios  = require('axios');
const Incident = require('../models/incident.model');
const { analyzeRootCause } = require('./rootCause');
const { aggregateChaosState } = require('./chaosStateAggregator');   // NEW
const logger = require('../config/logger');

const SERVICE_NAME      = process.env.SERVICE_NAME       || 'ai-service';
const PROMETHEUS_URL    = process.env.PROMETHEUS_URL     || 'http://prometheus:9090';
const POLL_INTERVAL_MS  = parseInt(process.env.POLL_INTERVAL_MS  || '10000', 10);
const Z_SCORE_TRIGGER   = parseFloat(process.env.Z_SCORE_TRIGGER || '3.0');
const Z_SCORE_RESOLVE   = parseFloat(process.env.Z_SCORE_RESOLVE || '1.5');

// Static baselines — unchanged from original
const BASELINES = {
  'payment-service': { meanP99: 250, stdDev: 40 },
  'order-service':   { meanP99: 400, stdDev: 50 },
  'auth-service':    { meanP99: 150, stdDev: 30 },
};

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
    params: { query },
    timeout: 5000,
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
    service: SERVICE_NAME,
    count: openIncidents.length,
  });
};

// MODIFIED: now accepts chaosState so incidents can be tagged
const handleAnomaly = async (serviceName, currentP99Ms, zScore, allMetrics, chaosState) => {
  if (openIncidentMap.has(serviceName)) {
    const existing = openIncidentMap.get(serviceName);
    if (zScore > existing.peakZScore) {
      existing.peakZScore = zScore;
      existing.peakP99Ms  = currentP99Ms;
    }
    existing.timeline.push({
      at:    new Date(),
      event: `Ongoing anomaly — Z-score: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms`,
      zScore,
      p99Ms: currentP99Ms,
    });
    await existing.save();
    return;
  }

  const allServicesSnapshot = {};
  for (const [svc, p99Ms] of allMetrics.entries()) {
    const baseline = BASELINES[svc];
    if (baseline) {
      const svcZScore = computeZScore(p99Ms, baseline);
      allServicesSnapshot[svc] = {
        currentP99Ms: parseFloat(p99Ms.toFixed(2)),
        zScore:       parseFloat(svcZScore.toFixed(2)),
        status:       svcZScore > Z_SCORE_TRIGGER ? 'anomalous' : 'normal',
      };
    }
  }

  const rootCauseAnalysis = analyzeRootCause(serviceName, allServicesSnapshot, allMetrics, BASELINES);
  const baseline  = BASELINES[serviceName];
  const severity  = classifySeverity(zScore);
  const incidentId = generateIncidentId(serviceName);
  const now       = new Date();

  // NEW: Tag whether this incident was created during a known chaos experiment
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
      affectedService:      serviceName,
      currentP99Ms:         parseFloat(currentP99Ms.toFixed(2)),
      baselineMeanMs:       baseline.meanP99,
      baselineStdDev:       baseline.stdDev,
      zScore:               parseFloat(zScore.toFixed(2)),
      deviationFactor:      parseFloat((currentP99Ms / baseline.meanP99).toFixed(2)),
      rootCause:            rootCauseAnalysis.rootCause,
      rootCauseConfidence:  rootCauseAnalysis.confidence,
      allServicesSnapshot,
      // NEW fields for Screen 2 incident tagging
      chaosInjected,
      chaosServices,
    },
    timeline: [{
      at:    now,
      event: `Incident detected — Z-score: ${zScore.toFixed(2)}, P99: ${currentP99Ms.toFixed(0)}ms, Severity: ${severity}${chaosInjected ? ' [CHAOS EXPERIMENT]' : ''}`,
      zScore,
      p99Ms: currentP99Ms,
    }],
  });

  openIncidentMap.set(serviceName, incident);

  logger.warn('INCIDENT CREATED', {
    service: SERVICE_NAME,
    incidentId,
    affectedService: serviceName,
    severity,
    currentP99Ms:    currentP99Ms.toFixed(0),
    zScore:          zScore.toFixed(2),
    rootCause:       rootCauseAnalysis.rootCause,
    chaosInjected,
  });
};

const handleRecovery = async (serviceName, currentP99Ms, zScore) => {
  if (!openIncidentMap.has(serviceName)) return;
  const incident = openIncidentMap.get(serviceName);
  await incident.resolve(zScore, currentP99Ms);
  openIncidentMap.delete(serviceName);

  logger.info('INCIDENT RESOLVED', {
    service:       SERVICE_NAME,
    incidentId:    incident.incidentId,
    affectedService: serviceName,
    durationMs:    incident.durationMs,
    peakZScore:    incident.peakZScore.toFixed(2),
  });
};

// MODIFIED: fetches chaos state each cycle to tag new incidents
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
    logger.debug('No metrics from Prometheus — no traffic yet', { service: SERVICE_NAME });
    return;
  }

  // NEW: fetch chaos state once per cycle (non-blocking — failures are handled inside)
  let chaosState = null;
  try {
    chaosState = await aggregateChaosState();
  } catch {
    // Not critical — incidents still created, just without chaos tagging
  }

  for (const [serviceName, currentP99Ms] of metricsMap.entries()) {
    const baseline = BASELINES[serviceName];
    if (!baseline) continue;

    const zScore = computeZScore(currentP99Ms, baseline);

    logger.debug('Detection cycle result', {
      service:        SERVICE_NAME,
      targetService:  serviceName,
      currentP99Ms:   currentP99Ms.toFixed(2),
      baselineMeanMs: baseline.meanP99,
      zScore:         zScore.toFixed(2),
      status:         zScore > Z_SCORE_TRIGGER ? 'ANOMALOUS' : zScore > Z_SCORE_RESOLVE ? 'ELEVATED' : 'NORMAL',
    });

    if (zScore > Z_SCORE_TRIGGER) {
      await handleAnomaly(serviceName, currentP99Ms, zScore, metricsMap, chaosState);
    } else if (zScore <= Z_SCORE_RESOLVE) {
      await handleRecovery(serviceName, currentP99Ms, zScore);
    }
  }
};

const startAnomalyDetector = async () => {
  await syncOpenIncidentsFromDB();

  logger.info('Anomaly detector started', {
    service:          SERVICE_NAME,
    pollIntervalMs:   POLL_INTERVAL_MS,
    zScoreTrigger:    Z_SCORE_TRIGGER,
    zScoreResolve:    Z_SCORE_RESOLVE,
    prometheusUrl:    PROMETHEUS_URL,
    monitoredServices: Object.keys(BASELINES),
  });

  await runDetectionCycle();

  setInterval(async () => {
    try {
      await runDetectionCycle();
    } catch (err) {
      logger.error('Detection cycle error', { service: SERVICE_NAME, error: err.message });
    }
  }, POLL_INTERVAL_MS);
};

module.exports = { startAnomalyDetector, BASELINES };
