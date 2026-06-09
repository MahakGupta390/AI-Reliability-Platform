

/**
 * middleware/latency.middleware.js — Request latency measurement
 *
 * WHAT this does:
 * Measures the time from when a request arrives to when the response
 * is fully sent. Records this data to the in-memory metrics store
 * and logs a structured latency event for every request.
 *
 * HOW it works:
 * 1. Record start time when request arrives (before next() is called)
 * 2. Hook into res.on('finish') — fires AFTER response is sent to client
 * 3. Calculate latency = finish time - start time
 * 4. Write record to metricsStore
 * 5. Log structured latency event
 *
 * WHY res.on('finish') and not just after next():
 * next() returns immediately after passing control to the next middleware.
 * For async route handlers, the response hasn't been sent yet at that point.
 * The 'finish' event fires only when the response bytes have been flushed
 * to the socket — which is the true end of the request lifecycle.
 *
 * WHAT WE SKIP:
 * Health checks (/health) are excluded from metrics.
 * They're called every 30s by Docker/load balancers and would
 * flood your metrics with noise that has nothing to do with real traffic.
 */

const { addRecord } = require('../config/metricsStore');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'service';

// Endpoints to exclude from metrics tracking
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

const latencyMiddleware = (req, res, next) => {
  // Skip excluded paths
  if (EXCLUDED_PATHS.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // Record the exact moment this request arrived
  // Date.now() is ms precision — sufficient for latency tracking
  // For sub-ms precision you'd use process.hrtime.bigint()
  const startTime = Date.now();

  // Hook: fires when response is fully sent to the client
  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;

    // Normalize the endpoint path
    // WHY: /orders/65a1b2c3... and /orders/65x9y8z7... are the same endpoint
    // We want metrics grouped by route pattern, not specific IDs
    // Express attaches the matched route to req.route
    const endpoint = req.route
      ? req.baseUrl + req.route.path   // e.g. "/orders/:id"
      : req.originalUrl;               // fallback if route didn't match (404s)

    const record = {
      service: SERVICE_NAME,
      requestId: req.requestId,
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    // Write to in-memory store for Phase 6 metrics aggregation
    addRecord(record);

    // Structured log — this is what Phase 5 will build on
    // Every request produces exactly one latency log entry
    const logLevel = res.statusCode >= 500 ? 'error'
                   : res.statusCode >= 400 ? 'warn'
                   : 'info';

    logger[logLevel]('Request completed', {
      service: SERVICE_NAME,
      requestId: req.requestId,
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      latencyMs,
      timestamp: record.timestamp,
    });
  });

  next();
};

module.exports = latencyMiddleware;
