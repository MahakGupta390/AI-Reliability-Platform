/**
 * config/prometheusMetrics.js — Prometheus metric definitions (auth-service)
 *
 * WHY THIS FILE EXISTS:
 * prom-client uses a global registry by default. If you define metrics
 * in multiple files, you risk duplicate registration errors on hot-reload.
 * Defining ALL metrics in one module and exporting them ensures each metric
 * is registered exactly once (Node.js module cache guarantees this).
 *
 * METRIC TYPES USED:
 *
 * Counter:
 *   - Only goes up, never down
 *   - Use for: total requests, total errors, total logins
 *   - Prometheus queries rate() or increase() on counters
 *   - Example: httpRequestsTotal counts every HTTP request
 *
 * Histogram:
 *   - Records distribution of values in configurable buckets
 *   - Use for: latency, request sizes, response sizes
 *   - Automatically computes _sum, _count, _bucket
 *   - Prometheus queries histogram_quantile() for p95/p99
 *   - Example: httpRequestDuration records latency per request
 *
 * Gauge:
 *   - Can go up and down
 *   - Use for: active connections, current memory, queue depth
 *   - Example: activeRequests tracks concurrent in-flight requests
 *
 * LABEL STRATEGY:
 * Labels create dimensions in your metrics. Every unique combination
 * of label values is a separate time-series in Prometheus.
 * Keep cardinality low — never use userId, requestId, or IP as labels.
 * Those have infinite unique values and will OOM Prometheus.
 * Safe labels: service name, HTTP method, endpoint pattern, status code.
 */

const client = require('prom-client');

// ── REGISTRY ──────────────────────────────────────────────────────────────────
// Using the default global registry.
// All metrics defined here are automatically registered in it.
// GET /metrics calls register.metrics() which serializes everything in this registry.
const register = client.register;

// Set default labels applied to EVERY metric from this service.
// This means you never forget to label which service a metric came from.
register.setDefaultLabels({
  service: process.env.SERVICE_NAME || 'auth-service',
});

// Enable default Node.js metrics collection:
// - process_cpu_seconds_total
// - process_open_fds
// - process_heap_bytes
// - nodejs_eventloop_lag_seconds
// - nodejs_active_handles_total
// These are free observability into Node.js runtime health.
client.collectDefaultMetrics({ register });

// ── COUNTERS ──────────────────────────────────────────────────────────────────

/**
 * httpRequestsTotal
 * Increments on every completed HTTP request.
 * Labels: method (GET/POST), endpoint (/auth/login), statusCode (200/401/500)
 *
 * Prometheus queries:
 *   rate(http_requests_total[1m])          → requests per second
 *   increase(http_requests_total[5m])      → total requests in last 5min
 */
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests completed',
  labelNames: ['method', 'endpoint', 'statusCode'],
  registers: [register],
});

/**
 * httpErrorsTotal
 * Increments only on 4xx and 5xx responses.
 * Kept separate from httpRequestsTotal for simpler error rate queries.
 *
 * Prometheus queries:
 *   rate(http_errors_total[5m]) / rate(http_requests_total[5m]) * 100
 *   → error rate percentage
 */
const httpErrorsTotal = new client.Counter({
  name: 'http_errors_total',
  help: 'Total number of HTTP errors (4xx and 5xx responses)',
  labelNames: ['method', 'endpoint', 'statusCode'],
  registers: [register],
});

/**
 * authOperationsTotal
 * Tracks auth-specific operations: register, login, verify, profile
 * Lets you see which auth operations are most used.
 */
const authOperationsTotal = new client.Counter({
  name: 'auth_operations_total',
  help: 'Total number of authentication operations',
  labelNames: ['operation', 'status'],
  registers: [register],
});

// ── HISTOGRAMS ────────────────────────────────────────────────────────────────

/**
 * httpRequestDuration
 * Records latency of every HTTP request in seconds (Prometheus convention).
 * We store in ms internally but convert to seconds here because Prometheus
 * expects time in seconds by convention.
 *
 * BUCKETS EXPLANATION:
 * Buckets define the boundaries for latency distribution.
 * Each bucket counts: "how many requests completed in <= Xms"
 * Choose buckets that match your SLA thresholds.
 *
 * Our buckets (in seconds):
 *   0.005 =    5ms  ← extremely fast (health checks, cached responses)
 *   0.010 =   10ms  ← very fast
 *   0.025 =   25ms  ← fast
 *   0.050 =   50ms  ← acceptable
 *   0.100 =  100ms  ← target for auth operations
 *   0.250 =  250ms  ← slow but okay
 *   0.500 =  500ms  ← starting to be a problem
 *   1.000 = 1000ms  ← definitely slow
 *   2.500 = 2500ms  ← very slow — incident territory
 *   5.000 = 5000ms  ← timeout territory
 *   10.00 = 10000ms ← worst case
 *
 * Prometheus queries:
 *   histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
 *   → P95 latency over last 5 minutes
 */
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'endpoint', 'statusCode'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ── GAUGES ────────────────────────────────────────────────────────────────────

/**
 * activeRequests
 * Tracks currently in-flight requests at any moment.
 * Increments when request arrives, decrements when response is sent.
 *
 * Spikes in this value indicate the service is backed up.
 * Combined with high latency = cascading failure risk.
 */
const activeRequests = new client.Gauge({
  name: 'active_requests',
  help: 'Number of HTTP requests currently being processed',
  labelNames: ['method', 'endpoint'],
  registers: [register],
});

/**
 * serviceInfo
 * Static gauge that records service metadata.
 * Value is always 1 — the labels carry the information.
 * Useful for confirming which version/environment is running.
 */
const serviceInfo = new client.Gauge({
  name: 'service_info',
  help: 'Service information and metadata',
  labelNames: ['version', 'nodeVersion', 'environment'],
  registers: [register],
});

// Set service info once at startup
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
  authOperationsTotal,
};
