/**
 * routes/simulate.routes.js  [NEW — Screen 2 backend]
 *
 * POST /simulate  — apply chaos config from Aegis AI frontend
 * GET  /simulate  — read current simulation state
 *
 * WHY a dedicated route instead of editing .env:
 * The original failureSimulator.middleware.js reads process.env at
 * RUNTIME on every request — meaning we can update process.env
 * dynamically at runtime without restarting the process.
 * This route does exactly that: it writes to process.env so the
 * existing middleware picks up changes immediately.
 *
 * This is safe for a local dev/demo environment. In production
 * you would use a config service or feature flags instead.
 */

const express = require('express');
const router = express.Router();
const { applySimulation, getSimulationState } = require('../controllers/simulate.controller');

// POST /simulate — apply new chaos config
router.post('/', applySimulation);

// GET /simulate — read current simulation flags (used by frontend health check)
router.get('/', getSimulationState);

module.exports = router;
