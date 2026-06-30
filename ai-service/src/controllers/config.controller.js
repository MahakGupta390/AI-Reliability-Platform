/**
 * src/controllers/config.controller.js  [NEW — Screen 5]
 *
 * Handlers for every Screen 5 panel:
 *
 *   GET   /analysis/baselines           → BaselineEditor read
 *   PATCH /analysis/baselines           → BaselineEditor save
 *   GET   /analysis                     → (existing — now reads from configStore)
 *   PATCH /analysis/detector            → DetectorConfigPanel save
 *   GET   /config/alert-thresholds      → AlertThresholds read
 *   PATCH /config/alert-thresholds      → AlertThresholds save
 *   GET   /config/registry              → RegistryTable monitored-status read
 *   PATCH /config/registry/:id          → RegistryTable monitored toggle save
 *
 * All writes go through configStore.js, which persists to MongoDB AND
 * updates the in-memory cache the detector reads from — so changes take
 * effect on the next detection cycle with zero restart.
 */

const configStore = require('../config/configStore');
const logger       = require('../config/logger');
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

// ── GET /analysis/baselines ───────────────────────────────────────────────────
const getBaselines = (req, res) => {
  res.status(200).json({
    success: true,
    baselines: configStore.getBaselines(),
  });
};

// ── PATCH /analysis/baselines ─────────────────────────────────────────────────
// Body: { service: "auth-service", meanP99: 150, stdDev: 30 }
const updateBaseline = async (req, res) => {
  try {
    const { service, meanP99, stdDev } = req.body;

    if (!service || typeof meanP99 !== 'number' || typeof stdDev !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'service (string), meanP99 (number), stdDev (number) are required',
      });
    }
    if (meanP99 <= 0 || stdDev <= 0) {
      return res.status(400).json({
        success: false,
        message: 'meanP99 and stdDev must be positive numbers',
      });
    }

    const updated = await configStore.updateBaseline(service, meanP99, stdDev);

    res.status(200).json({
      success: true,
      service,
      baseline: updated,
      message: `Baseline for ${service} updated. Effective on next detection cycle.`,
    });
  } catch (err) {
    logger.error('updateBaseline error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /analysis/detector ──────────────────────────────────────────────────
// Body: { zScoreTrigger?: 3.0, zScoreResolve?: 1.5, pollIntervalMs?: 10000 }
const updateDetector = async (req, res) => {
  try {
    const { zScoreTrigger, zScoreResolve, pollIntervalMs } = req.body;

    // Validate any provided fields
    if (zScoreTrigger !== undefined && (typeof zScoreTrigger !== 'number' || zScoreTrigger <= 0)) {
      return res.status(400).json({ success: false, message: 'zScoreTrigger must be a positive number' });
    }
    if (zScoreResolve !== undefined && (typeof zScoreResolve !== 'number' || zScoreResolve <= 0)) {
      return res.status(400).json({ success: false, message: 'zScoreResolve must be a positive number' });
    }
    if (pollIntervalMs !== undefined && (typeof pollIntervalMs !== 'number' || pollIntervalMs < 1000)) {
      return res.status(400).json({ success: false, message: 'pollIntervalMs must be >= 1000' });
    }

    // Cross-field validation: resolve threshold must stay below trigger
    const currentTrigger = zScoreTrigger ?? configStore.getZScoreTrigger();
    const currentResolve = zScoreResolve ?? configStore.getZScoreResolve();
    if (currentResolve >= currentTrigger) {
      return res.status(400).json({
        success: false,
        message: `zScoreResolve (${currentResolve}) must be lower than zScoreTrigger (${currentTrigger})`,
      });
    }

    const updated = await configStore.updateDetectorConfig({ zScoreTrigger, zScoreResolve, pollIntervalMs });

    res.status(200).json({
      success: true,
      detector: updated,
      message: 'Detector configuration updated. Effective on next poll cycle.',
    });
  } catch (err) {
    logger.error('updateDetector error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /config/alert-thresholds ──────────────────────────────────────────────
const getAlertThresholds = (req, res) => {
  res.status(200).json({
    success: true,
    thresholds: configStore.getAlertThresholds(),
  });
};

// ── PATCH /config/alert-thresholds ────────────────────────────────────────────
// Body: { service: "auth", p99WarnMs, p99CriticalMs, errorWarnPct, errorCriticalPct }
const updateAlertThreshold = async (req, res) => {
  try {
    const { service, p99WarnMs, p99CriticalMs, errorWarnPct, errorCriticalPct } = req.body;

    if (!service) {
      return res.status(400).json({ success: false, message: 'service is required' });
    }

    const threshold = { p99WarnMs, p99CriticalMs, errorWarnPct, errorCriticalPct };
    for (const [key, val] of Object.entries(threshold)) {
      if (typeof val !== 'number' || val < 0) {
        return res.status(400).json({ success: false, message: `${key} must be a non-negative number` });
      }
    }
    if (p99WarnMs >= p99CriticalMs) {
      return res.status(400).json({ success: false, message: 'p99WarnMs must be less than p99CriticalMs' });
    }
    if (errorWarnPct >= errorCriticalPct) {
      return res.status(400).json({ success: false, message: 'errorWarnPct must be less than errorCriticalPct' });
    }

    const updated = await configStore.updateAlertThreshold(service, threshold);

    res.status(200).json({
      success: true,
      service,
      threshold: updated,
      message: `Alert thresholds for ${service} updated.`,
    });
  } catch (err) {
    logger.error('updateAlertThreshold error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /config/registry ──────────────────────────────────────────────────────
const getRegistry = (req, res) => {
  res.status(200).json({
    success: true,
    monitored: configStore.getMonitoredServices(),
  });
};

// ── PATCH /config/registry/:id ────────────────────────────────────────────────
// Body: { monitored: boolean }
const updateMonitored = async (req, res) => {
  try {
    const { id } = req.params;
    const { monitored } = req.body;

    if (typeof monitored !== 'boolean') {
      return res.status(400).json({ success: false, message: 'monitored must be a boolean' });
    }

    const validIds = ['auth', 'payments', 'orders'];
    if (!validIds.includes(id)) {
      return res.status(400).json({ success: false, message: `id must be one of: ${validIds.join(', ')}` });
    }

    const updated = await configStore.updateMonitoredStatus(id, monitored);

    res.status(200).json({
      success: true,
      service: id,
      monitored: updated,
      message: `${id} is now ${monitored ? 'monitored' : 'excluded from monitoring'}.`,
    });
  } catch (err) {
    logger.error('updateMonitored error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getBaselines,
  updateBaseline,
  updateDetector,
  getAlertThresholds,
  updateAlertThreshold,
  getRegistry,
  updateMonitored,
};
