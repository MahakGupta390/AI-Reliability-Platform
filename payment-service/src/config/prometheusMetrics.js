/**
 * config/prometheusMetrics.js — Prometheus metric definitions (payment-service)
 *
 * Payment service has additional metrics specific to payment processing:
 * - Payment processing duration (separate from HTTP latency)
 * - Payment success/failure by method (card, upi, etc.)
 * - Payment amount histogram (track transaction size distribution)
 */

const client = require('prom-client');

const register = client.register;

register.setDefaultLabels({
  service: process.env.SERVICE_NAME || 'payment-service',
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
 * paymentsTotal
 * Tracks payment outcomes specifically.
 * Labels: status (success/failed), method (card/upi/netbanking/wallet)
 * Lets you see: "card payments failing more than UPI?"
 */
const paymentsTotal = new client.Counter({
  name: 'payments_total',
  help: 'Total number of payment transactions processed',
  labelNames: ['status', 'method'],
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
 * paymentProcessingDuration
 * Measures ONLY the simulated gateway call time, not total HTTP time.
 * This isolates gateway latency from service overhead.
 * Important for root cause: "is gateway slow or is our service slow?"
 *
 * Buckets skewed higher than HTTP buckets because payment gateways
 * are naturally slower (100ms–3000ms range is normal).
 */
const paymentProcessingDuration = new client.Histogram({
  name: 'payment_processing_duration_seconds',
  help: 'Time spent in payment gateway processing',
  labelNames: ['method', 'status'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 10],
  registers: [register],
});

/**
 * paymentAmountHistogram
 * Distribution of payment transaction amounts.
 * Useful for: detecting unusual large transactions, fraud patterns,
 * and understanding revenue distribution.
 * Buckets in USD.
 */
const paymentAmountHistogram = new client.Histogram({
  name: 'payment_amount_usd',
  help: 'Distribution of payment transaction amounts in USD',
  labelNames: ['method'],
  buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
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
  paymentsTotal,
  paymentProcessingDuration,
  paymentAmountHistogram,
};
