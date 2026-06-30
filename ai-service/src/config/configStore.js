/**
 * src/config/configStore.js  [NEW — Screen 5]
 *
 * The bridge between Screen 5's Save buttons and the actual anomaly
 * detector logic. This module is a singleton in-memory cache, backed
 * by MongoDB (via config.model.js), that anomalyDetector.js reads
 * from on EVERY detection cycle instead of frozen constants.
 *
 * WHY this design instead of just reading Mongo every cycle:
 * The detector runs every POLL_INTERVAL_MS (default 10s). Hitting
 * MongoDB on every single cycle for config that rarely changes is
 * wasteful. Instead we cache in memory and only re-read from Mongo
 * when an explicit PATCH comes in via Screen 5 — see refreshFromDB().
 *
 * LIFECYCLE:
 *   1. On ai-service boot, loadConfigStore() is called once.
 *      It upserts the singleton doc (creating it with hardcoded
 *      defaults if this is the very first boot) and populates
 *      the in-memory cache.
 *   2. anomalyDetector.js calls getBaselines(), getZScoreTrigger(),
 *      getZScoreResolve(), getPollIntervalMs() on every cycle —
 *      these read the in-memory cache, zero DB latency added to
 *      the hot path.
 *   3. When Screen 5 PATCHes a value, the controller calls
 *      updateBaseline() / updateDetectorConfig() etc., which:
 *        a) writes to MongoDB (persists across restarts)
 *        b) updates the in-memory cache immediately
 *      so the very next detection cycle uses the new value —
 *      no restart needed, matching the existing process.env
 *      mutation pattern used by /simulate in Screen 2.
 */

const Config = require('../models/config.model');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

// In-memory cache — single source of truth read by the detector hot path
let cache = null;

/**
 * loadConfigStore
 * Called once at startup (from server.js, after connectDB()).
 * Upserts the singleton config doc and populates the cache.
 */
async function loadConfigStore() {
  let doc = await Config.findById('singleton');

  if (!doc) {
    doc = await Config.create({ _id: 'singleton' });
    logger.info('Config singleton created with defaults', { service: SERVICE_NAME });
  }

  cache = doc.toObject({ flattenMaps: true });
  logger.info('Config store loaded into memory', {
    service: SERVICE_NAME,
    zScoreTrigger:  cache.zScoreTrigger,
    zScoreResolve:  cache.zScoreResolve,
    pollIntervalMs: cache.pollIntervalMs,
    baselineServices: Object.keys(cache.baselines || {}),
  });

  return cache;
}

/**
 * refreshFromDB
 * Re-reads the singleton doc from MongoDB into the in-memory cache.
 * Called after any PATCH to guarantee the cache reflects the saved state
 * exactly (covers concurrent-write edge cases, multi-instance deployments).
 */
async function refreshFromDB() {
  const doc = await Config.findById('singleton');
  if (doc) {
    cache = doc.toObject({ flattenMaps: true });
  }
  return cache;
}

function ensureLoaded() {
  if (!cache) {
    throw new Error('configStore not loaded — call loadConfigStore() at startup before reading config');
  }
}

// ── Hot-path readers — called every detection cycle by anomalyDetector.js ────

function getBaselines() {
  ensureLoaded();
  return cache.baselines || {};
}

function getBaseline(serviceName) {
  ensureLoaded();
  return (cache.baselines || {})[serviceName] || null;
}

function getZScoreTrigger() {
  ensureLoaded();
  return cache.zScoreTrigger;
}

function getZScoreResolve() {
  ensureLoaded();
  return cache.zScoreResolve;
}

function getPollIntervalMs() {
  ensureLoaded();
  return cache.pollIntervalMs;
}

function getAlertThresholds() {
  ensureLoaded();
  return cache.alertThresholds || {};
}

function getMonitoredServices() {
  ensureLoaded();
  return cache.monitoredServices || {};
}

function getFullConfig() {
  ensureLoaded();
  return cache;
}

// ── Writers — called by Screen 5 PATCH controllers ───────────────────────────

/**
 * updateBaseline
 * Persists one service's baseline to MongoDB and refreshes the cache.
 */
async function updateBaseline(serviceName, meanP99, stdDev) {
  const doc = await Config.findById('singleton');
  if (!doc) throw new Error('Config singleton not found');

  doc.baselines.set(serviceName, { meanP99, stdDev });
  doc.updatedBy = 'aegis-dashboard';
  await doc.save();
  await refreshFromDB();

  logger.warn('BASELINE UPDATED via Screen 5', {
    service: SERVICE_NAME, target: serviceName, meanP99, stdDev,
  });

  return cache.baselines[serviceName];
}

/**
 * updateDetectorConfig
 * Persists Z-score trigger/resolve + poll interval and refreshes cache.
 * Accepts a partial patch — only provided fields are updated.
 */
async function updateDetectorConfig(patch) {
  const doc = await Config.findById('singleton');
  if (!doc) throw new Error('Config singleton not found');

  if (patch.zScoreTrigger  !== undefined) doc.zScoreTrigger  = patch.zScoreTrigger;
  if (patch.zScoreResolve  !== undefined) doc.zScoreResolve  = patch.zScoreResolve;
  if (patch.pollIntervalMs !== undefined) doc.pollIntervalMs = patch.pollIntervalMs;
  doc.updatedBy = 'aegis-dashboard';

  await doc.save();
  await refreshFromDB();

  logger.warn('DETECTOR CONFIG UPDATED via Screen 5', {
    service: SERVICE_NAME,
    zScoreTrigger:  cache.zScoreTrigger,
    zScoreResolve:  cache.zScoreResolve,
    pollIntervalMs: cache.pollIntervalMs,
  });

  return {
    zScoreTrigger:  cache.zScoreTrigger,
    zScoreResolve:  cache.zScoreResolve,
    pollIntervalMs: cache.pollIntervalMs,
  };
}

/**
 * updateAlertThreshold
 * Persists one service's alert thresholds (frontend color-coding).
 */
async function updateAlertThreshold(serviceId, threshold) {
  const doc = await Config.findById('singleton');
  if (!doc) throw new Error('Config singleton not found');

  doc.alertThresholds.set(serviceId, threshold);
  doc.updatedBy = 'aegis-dashboard';
  await doc.save();
  await refreshFromDB();

  logger.info('ALERT THRESHOLD UPDATED via Screen 5', {
    service: SERVICE_NAME, target: serviceId, ...threshold,
  });

  return cache.alertThresholds[serviceId];
}

/**
 * updateMonitoredStatus
 * Toggles whether a service is actively monitored by the detector.
 * When false, the detector skips that service entirely in runDetectionCycle.
 */
async function updateMonitoredStatus(serviceId, monitored) {
  const doc = await Config.findById('singleton');
  if (!doc) throw new Error('Config singleton not found');

  doc.monitoredServices.set(serviceId, monitored);
  doc.updatedBy = 'aegis-dashboard';
  await doc.save();
  await refreshFromDB();

  logger.info('MONITORED STATUS UPDATED via Screen 5', {
    service: SERVICE_NAME, target: serviceId, monitored,
  });

  return cache.monitoredServices[serviceId];
}

module.exports = {
  loadConfigStore,
  refreshFromDB,
  getBaselines,
  getBaseline,
  getZScoreTrigger,
  getZScoreResolve,
  getPollIntervalMs,
  getAlertThresholds,
  getMonitoredServices,
  getFullConfig,
  updateBaseline,
  updateDetectorConfig,
  updateAlertThreshold,
  updateMonitoredStatus,
};
