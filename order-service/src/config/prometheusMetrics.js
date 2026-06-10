/**
 * config/prometheusMetrics.js — Prometheus metric definitions (order-service)
 *
 * Order service has additional metrics for distributed call tracking:
 * - Downstream service call duration (auth-service calls, payment-service calls)
 * - Order outcomes by status
 * - serviceLatencies histogram (the key data from Phase 2)
 */

const client = require('prom-client');

const register = client.register;

register.setDefaultLabels({
  service: process.env.SERVICE_NAME || 'order-service',
});

client.collectDefaultMetrics({ register });

// ── COUNTERS ──────────────────────────────────────────────────────────────────

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests completed',
  labelNames: ['method', 'endpoint', 'statusCode'],
  registers: [register],
});

const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx responses)',
  labelNames: ['method', 'endpoint', 'statusCode'],
  registers: [register],
});

/**
 * ordersTotal
 * Tracks order outcomes by final status.
 * Labels: status (confirmed/failed/cancelled)
 * Critical business metric — directly measures revenue-affecting failures.
 */
const ordersTotal = new client.Counter({
  name: 'orders_total',
  help: 'Total number of orders by final status',
  labelNames: ['status'],
  registers: [register],
});

/**
 * downstreamCallsTotal
 * Tracks every outbound call to auth-service and payment-service.
 * Labels: target (auth-service/payment-service), status (success/timeout/error)
 * Key for understanding cascade failures.
 */
const downstreamCallsTotal = new client.Counter({
  name: 'downstream_calls_total',
  help: 'Total outbound calls to downstream services',
  labelNames: ['target', 'status'],
  registers: [register],
});

// ── HISTOGRAMS ────────────────────────────────────────────────────────────────

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'endpoint', 'statusCode'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * downstreamCallDuration
 * Measures latency of each downstream service call individually.
 * This is the Prometheus version of the serviceLatencies field.
 * Labels: target (which service), operation (verify/process-payment)
 *
 * KEY METRIC for root cause analysis:
 * histogram_quantile(0.99, downstream_call_duration_seconds_bucket{target="payment-service"})
 * → P99 of payment-service calls specifically
 * If this spikes, payment-service is the root cause of order slowness.
 */
const downstreamCallDuration = new client.Histogram({
  name: 'downstream_call_duration_seconds',
  help: 'Duration of outbound calls to downstream services',
  labelNames: ['target', 'operation'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── GAUGES ────────────────────────────────────────────────────────────────────

const activeRequests = new client.Gauge({
  name: 'active_requests',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'endpoint'],
  registers: [register],
});

const serviceInfo = new client.Gauge({
  name: 'service_info',
  help: 'Service information and metadata',
  labelNames: ['version', 'nodeVersion', 'environment'],
  registers: [register],
});

serviceInfo.set(
  {
    version: process.env.npm_package_version || '1.0.0',
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development',
  },
  1
);

module.exports = {
  register,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDuration,
  activeRequests,
  ordersTotal,
  downstreamCallsTotal,
  downstreamCallDuration,
};
