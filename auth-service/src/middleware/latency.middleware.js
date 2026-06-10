/**
 * middleware/latency.middleware.js — Request latency measurement (auth-service)
 *
 * WHAT CHANGED FROM PHASE 4/5:
 * Added Prometheus instrument calls alongside existing metricsStore writes.
 * Both recording mechanisms run on every request.
 * metricsStore → used by custom /metrics JSON endpoint + future AI service
 * Prometheus   → used by Prometheus server scraping /metrics text format
 *
 * THE res.on('finish') HOOK:
 * Node.js HTTP response emits 'finish' after all response data has been
 * flushed to the underlying socket. This is the correct measurement point
 * for total request duration because it includes:
 * - Time in all middleware
 * - Time in route handlers
 * - Time in async operations (DB queries, bcrypt hashing)
 * - Time to serialize the response body
 */

const { addRecord } = require('../config/metricsStore');
const {
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDuration,
  activeRequests,
} = require('../config/prometheusMetrics');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

const latencyMiddleware = (req, res, next) => {
  if (EXCLUDED_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();

  // Normalize endpoint path for label — CRITICAL for Prometheus cardinality
  // /auth/login → /auth/login (fine, static)
  // We derive this at finish time using req.route to get pattern like /auth/:id
  // For now capture originalUrl — will be normalized in finish handler
  const method = req.method;

  // Increment active requests gauge — tracks concurrent in-flight requests
  // This increments BEFORE the request is processed
  activeRequests.inc({ method, endpoint: req.originalUrl });

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Normalize endpoint to route pattern to avoid cardinality explosion
    // req.route is set by Express after route matching
    // req.baseUrl + req.route.path = "/auth" + "/login" = "/auth/login"
    // Without normalization: /auth/65abc and /auth/65xyz = 2 time-series
    // With normalization: both become /auth/:id = 1 time-series
    const endpoint = req.route
      ? req.baseUrl + req.route.path
      : req.originalUrl;

    // ── EXISTING: metricsStore write (unchanged from Phase 4) ─────────────
    addRecord({
      service: SERVICE_NAME,
      requestId: req.requestId,
      method,
      endpoint,
      statusCode,
      latencyMs,
      timestamp: new Date().toISOString(),
    });

    // ── NEW: Prometheus instrument calls ──────────────────────────────────

    // Convert status code to string for label
    // Prometheus labels must be strings
    const statusCodeStr = String(statusCode);

    // Counter: increment total requests
    httpRequestsTotal.inc({ method, endpoint, statusCode: statusCodeStr });

    // Counter: increment errors (4xx and 5xx only)
    if (statusCode >= 400) {
      httpErrorsTotal.inc({ method, endpoint, statusCode: statusCodeStr });
    }

    // Histogram: observe latency in SECONDS (Prometheus convention)
    // We track ms internally but Prometheus expects seconds
    httpRequestDuration.observe(
      { method, endpoint, statusCode: statusCodeStr },
      latencyMs / 1000
    );

    // Gauge: decrement active requests (request is now complete)
    activeRequests.dec({ method, endpoint: req.originalUrl });

    // ── EXISTING: structured logging (unchanged from Phase 5) ─────────────
    const logLevel = statusCode >= 500 ? 'error'
                   : statusCode >= 400 ? 'warn'
                   : 'info';

    logger[logLevel]('← Completed', {
      service: SERVICE_NAME,
      requestId: req.requestId,
      method,
      endpoint,
      statusCode,
      latencyMs,
      timestamp: new Date().toISOString(),
    });
  });

  next();
};

module.exports = latencyMiddleware;
