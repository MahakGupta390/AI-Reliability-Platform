/**
 * src/routes/config.routes.js  [NEW — Screen 5]
 *
 * Two route groups, mounted separately in server.js:
 *
 *   1. analysisConfigRouter — mounted at /analysis
 *      GET   /analysis/baselines
 *      PATCH /analysis/baselines
 *      PATCH /analysis/detector
 *      (GET /analysis and GET /analysis/baselines for read already
 *       existed pre-Screen 5 — this file ADDS the PATCH handlers
 *       and points the GET handler at the live configStore)
 *
 *   2. settingsConfigRouter — mounted at /config
 *      GET   /config/alert-thresholds
 *      PATCH /config/alert-thresholds
 *      GET   /config/registry
 *      PATCH /config/registry/:id
 */

const express = require('express');
const {
  getBaselines,
  updateBaseline,
  updateDetector,
  getAlertThresholds,
  updateAlertThreshold,
  getRegistry,
  updateMonitored,
} = require('../controllers/config.controller');

// ── /analysis sub-router ──────────────────────────────────────────────────────
const analysisConfigRouter = express.Router();
analysisConfigRouter.get('/baselines',   getBaselines);
analysisConfigRouter.patch('/baselines', updateBaseline);
analysisConfigRouter.patch('/detector',  updateDetector);

// ── /config sub-router ────────────────────────────────────────────────────────
const settingsConfigRouter = express.Router();
settingsConfigRouter.get('/alert-thresholds',    getAlertThresholds);
settingsConfigRouter.patch('/alert-thresholds',  updateAlertThreshold);
settingsConfigRouter.get('/registry',            getRegistry);
settingsConfigRouter.patch('/registry/:id',      updateMonitored);

module.exports = { analysisConfigRouter, settingsConfigRouter };
