/**
 * controllers/metrics.controller.js
 *
 * TWO ENDPOINTS:
 *
 * GET /metrics
 *   Returns: JSON from metricsStore (existing Phase 6 format)
 *   Used by: AI service (Phase 9E), humans debugging, existing tooling
 *   Format: { service, summary, latency, endpoints, recentRequests }
 *
 * GET /metrics/prometheus
 *   Returns: Prometheus text exposition format
 *   Used by: Prometheus server scraping (Phase 9A)
 *   Format: # HELP ... \n # TYPE ... \n metric_name{labels} value
 *   Content-Type: text/plain; version=0.0.4; charset=utf-8
 *
 * WHY KEEP BOTH:
 * The JSON endpoint is consumed by the Phase 9E AI service for
 * structured analysis and by engineers for quick debugging.
 * The Prometheus endpoint is consumed by Prometheus server for
 * persistent time-series storage and Grafana dashboards.
 * Removing either breaks a downstream consumer.
 */

const { computeMetrics } = require('../services/metrics.service');
const { register } = require('../config/prometheusMetrics');

/**
 * getMetrics — existing JSON endpoint (unchanged from Phase 6)
 */
const getMetrics = (req, res) => {
  const metrics = computeMetrics();
  res.status(200).json(metrics);
};

/**
 * getPrometheusMetrics — new Prometheus text format endpoint
 *
 * register.metrics() serializes all registered metrics into
 * the Prometheus text exposition format. This is what Prometheus
 * server expects when it scrapes the /metrics/prometheus endpoint.
 *
 * Content-Type MUST be set to the Prometheus content type.
 * Prometheus checks this header to confirm the format is correct.
 * Wrong content type = Prometheus rejects the response.
 */
const getPrometheusMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
};

module.exports = { getMetrics, getPrometheusMetrics };
