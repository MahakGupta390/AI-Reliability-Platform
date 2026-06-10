/**
 * routes/metrics.routes.js
 *
 * GET /metrics            → JSON format (Phase 6, kept for AI service)
 * GET /metrics/prometheus → Prometheus text format (Phase 9A, scraped by Prometheus)
 *
 * IMPORTANT: /prometheus route must be defined BEFORE any wildcard routes.
 * Express matches routes in order — define specific routes before generic ones.
 */

const express = require('express');
const router = express.Router();
const { getMetrics, getPrometheusMetrics } = require('../controllers/metrics.controller');

// Prometheus text format — used by Prometheus server scrape config
router.get('/prometheus', getPrometheusMetrics);

// JSON format — used by AI service and manual debugging
router.get('/', getMetrics);

module.exports = router;
