/**
 * middleware/requestLogger.middleware.js — Structured request/response logging
 *
 * RESPONSIBILITIES:
 * 1. Log every incoming request with full context (arrival event)
 * 2. Log every completed response with status + latency (completion event)
 * 3. Log errors with full error details when requests fail
 * 4. Ensure consistent field names across ALL services
 *
 * WHY a dedicated middleware instead of logging inside controllers:
 * If you log inside controllers, you have to add logging to every single
 * controller function. Miss one and you have blind spots.
 * A middleware applies ONCE and covers every route automatically —
 * including routes added in the future.
 *
 * FIELD NAMING CONVENTION (consistent across all 3 services):
 * - service       : which microservice (auth-service, payment-service, order-service)
 * - requestId     : unique ID for this request (UUID)
 * - correlationId : same as requestId now; will diverge in Phase 9 async flows
 * - method        : HTTP method (GET, POST, etc.)
 * - endpoint      : normalized route pattern (/orders/:id not /orders/65abc...)
 * - statusCode    : HTTP response status
 * - latencyMs     : total request duration in milliseconds
 * - timestamp     : ISO 8601 with ms precision
 * - ip            : client IP (useful for rate limiting and abuse detection)
 * - userAgent     : client identifier (Postman, browser, service name)
 * - error         : error message if request failed
 */

const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'service';
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

const requestLogger = (req, res, next) => {
  // Skip health checks — they're internal probes, not real traffic
  if (EXCLUDED_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();
  const correlationId = req.headers['x-correlation-id'] || req.requestId;

  // Attach correlationId to request for downstream use
  req.correlationId = correlationId;

  // ── EVENT 1: REQUEST ARRIVAL ───────────────────────────────────────────────
  // Logged immediately when request hits this middleware.
  // Gives you a record of requests that started but never finished.
  logger.info('→ Incoming', {
    service: SERVICE_NAME,
    requestId: req.requestId,
    correlationId,
    method: req.method,
    endpoint: req.originalUrl,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'] || 'unknown',
    contentLength: req.headers['content-length'] || 0,
    timestamp: new Date().toISOString(),
  });

  // ── EVENT 2: RESPONSE COMPLETION ──────────────────────────────────────────
  // Hooks into Node's response 'finish' event.
  // Fires AFTER response bytes are fully sent to the client.
  // This is where we know: status code, latency, and whether it errored.
  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;

    // Normalize endpoint: use matched route pattern if available
    // /orders/65abc123 → /orders/:id
    const endpoint = req.route
      ? req.baseUrl + req.route.path
      : req.originalUrl;

    const isError = res.statusCode >= 400;
    const isServerError = res.statusCode >= 500;

    const logData = {
      service: SERVICE_NAME,
      requestId: req.requestId,
      correlationId,
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    // Attach error context if request failed
    // req._errorMessage is set by the errorHandler middleware (see below)
    if (isError && req._errorMessage) {
      logData.error = req._errorMessage;
    }

    // Choose log level based on response status:
    // 2xx/3xx → info  (normal operation)
    // 4xx     → warn  (client did something wrong, worth noting)
    // 5xx     → error (something broke on our side)
    if (isServerError) {
      logger.error('← Completed', logData);
    } else if (isError) {
      logger.warn('← Completed', logData);
    } else {
      logger.info('← Completed', logData);
    }
  });

  next();
};

module.exports = requestLogger;
