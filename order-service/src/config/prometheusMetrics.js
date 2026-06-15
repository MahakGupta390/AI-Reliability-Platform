/**
 * config/prometheusMetrics.js — Prometheus metric definitions (order-service)
 *
 * CHANGES FROM PHASE 9A:
 * Added queue-specific gauges that BullMQ metrics are reported against.
 * These are updated periodically by a background interval in app.js.
 */

const client = require('prom-client');

const register = client.register;

register.setDefaultLabels({
  service: process.env.SERVICE_NAME || 'order-service',
});

client.collectDefaultMetrics({ register });

// ── HTTP COUNTERS ─────────────────────────────────────────────────────────────

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

const ordersTotal = new client.Counter({
  name: 'orders_total',
  help: 'Total number of orders by final status',
  labelNames: ['status'],
  registers: [register],
});

const downstreamCallsTotal = new client.Counter({
  name: 'downstream_calls_total',
  help: 'Total outbound calls to downstream services',
  labelNames: ['target', 'status'],
  registers: [register],
});

// ── HTTP HISTOGRAMS ───────────────────────────────────────────────────────────

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'endpoint', 'statusCode'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

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

// ── QUEUE GAUGES (NEW in Phase 9C) ────────────────────────────────────────────
// These track BullMQ queue depth per state.
// Updated every 15 seconds by a background interval in app.js.
//
// WHY gauges not counters:
// Queue depth can go up AND down (jobs are added and removed).
// Gauges represent current state values, counters only go up.
//
// OPERATIONAL SIGNIFICANCE:
// queue_jobs_waiting > 50 = worker can't keep up with demand
// queue_jobs_active  = 0  = worker may be down or idle
// queue_jobs_failed  growing = systematic processing failures

const queueJobsWaiting = new client.Gauge({
  name: 'queue_jobs_waiting',
  help: 'Number of jobs waiting to be processed in BullMQ queue',
  labelNames: ['queue'],
  registers: [register],
});

const queueJobsActive = new client.Gauge({
  name: 'queue_jobs_active',
  help: 'Number of jobs currently being processed by workers',
  labelNames: ['queue'],
  registers: [register],
});

const queueJobsCompleted = new client.Gauge({
  name: 'queue_jobs_completed',
  help: 'Number of completed jobs in BullMQ (rolling window)',
  labelNames: ['queue'],
  registers: [register],
});

const queueJobsFailed = new client.Gauge({
  name: 'queue_jobs_failed',
  help: 'Number of failed jobs in BullMQ (rolling window)',
  labelNames: ['queue'],
  registers: [register],
});

module.exports = {
  register,
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDuration,
  activeRequests,
  ordersTotal,
  downstreamCallsTotal,
  downstreamCallDuration,
  queueJobsWaiting,
  queueJobsActive,
  queueJobsCompleted,
  queueJobsFailed,
};
