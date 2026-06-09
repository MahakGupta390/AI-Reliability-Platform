/**
 * routes/metrics.routes.js
 *
 * GET /metrics — returns full metrics snapshot
 *
 * WHY no auth on this endpoint:
 * In production you would protect this behind an internal network or
 * API key. For now it's open so you can test it easily and so the
 * AI monitor in Phase 9 can poll it without auth complexity.
 *
 * FUTURE: In Phase 9 this gets replaced by Prometheus /metrics endpoint
 * which returns data in Prometheus text format instead of JSON.
 */

const express = require('express');
const router = express.Router();
const { getMetrics } = require('../controllers/metrics.controller');

router.get('/', getMetrics);

module.exports = router;
