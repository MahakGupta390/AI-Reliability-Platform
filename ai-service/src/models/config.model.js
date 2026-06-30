/**
 * src/models/config.model.js  [NEW — Screen 5]
 *
 * Single-document MongoDB collection that persists all tunable system
 * configuration: per-service baselines, detector thresholds, alert
 * thresholds, and the monitored-service registry. This is what makes
 * Screen 5's Save buttons actually persist across service restarts —
 * previously BASELINES/Z_SCORE_TRIGGER were hardcoded constants or
 * one-shot process.env reads.
 *
 * Design: ONE document with a fixed _id = "singleton" so there's always
 * exactly one config record. getOrCreateConfig() in configStore.js
 * upserts this on first boot using the original hardcoded defaults,
 * so behavior is identical to before until someone edits via Screen 5.
 */

const mongoose = require('mongoose');

const baselineSchema = new mongoose.Schema(
  {
    meanP99: { type: Number, required: true },
    stdDev:  { type: Number, required: true },
  },
  { _id: false },
);

const alertThresholdSchema = new mongoose.Schema(
  {
    p99WarnMs:        { type: Number, required: true },
    p99CriticalMs:    { type: Number, required: true },
    errorWarnPct:     { type: Number, required: true },
    errorCriticalPct: { type: Number, required: true },
  },
  { _id: false },
);

const configSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },

    // Per-service baselines — keyed by backend service name
    // e.g. "auth-service" -> { meanP99: 150, stdDev: 30 }
    baselines: {
      type: Map,
      of: baselineSchema,
      default: () => new Map([
        ['payment-service', { meanP99: 250, stdDev: 40 }],
        ['order-service',   { meanP99: 400, stdDev: 50 }],
        ['auth-service',    { meanP99: 150, stdDev: 30 }],
      ]),
    },

    // Detector tuning
    zScoreTrigger:  { type: Number, default: 3.0 },
    zScoreResolve:  { type: Number, default: 1.5 },
    pollIntervalMs: { type: Number, default: 10000 },

    // Per-service alert thresholds (frontend color-coding)
    alertThresholds: {
      type: Map,
      of: alertThresholdSchema,
      default: () => new Map([
        ['auth',     { p99WarnMs: 200, p99CriticalMs: 400, errorWarnPct: 0.5, errorCriticalPct: 2 }],
        ['payments', { p99WarnMs: 250, p99CriticalMs: 500, errorWarnPct: 0.5, errorCriticalPct: 2 }],
        ['orders',   { p99WarnMs: 180, p99CriticalMs: 350, errorWarnPct: 0.5, errorCriticalPct: 2 }],
      ]),
    },

    // Service registry — monitored on/off per service
    monitoredServices: {
      type: Map,
      of: Boolean,
      default: () => new Map([
        ['auth', true],
        ['payments', true],
        ['orders', true],
      ]),
    },

    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: String, default: 'system' },
  },
  { versionKey: false },
);

configSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

const Config = mongoose.model('Config', configSchema);
module.exports = Config;
