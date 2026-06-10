/**
 * middleware/latency.middleware.js — Request latency measurement (order-service)
 */

const { addRecord } = require('../config/metricsStore');
const {
  httpRequestsTotal,
  httpErrorsTotal,
  httpRequestDuration,
  activeRequests,
} = require('../config/prometheusMetrics');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';
const EXCLUDED_PATHS = ['/health', '/favicon.ico'];

const latencyMiddleware = (req, res, next) => {
  if (EXCLUDED_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const startTime = Date.now();
  const method = req.method;

  activeRequests.inc({ method, endpoint: req.originalUrl });

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime;
    const statusCode = res.statusCode;

    const endpoint = req.route
      ? req.baseUrl + req.route.path
      : req.originalUrl;

    // Existing metricsStore write
    addRecord({
      service: SERVICE_NAME,
      requestId: req.requestId,
      method,
      endpoint,
      statusCode,
      latencyMs,
      timestamp: new Date().toISOString(),
    });

    // Prometheus instruments
    const statusCodeStr = String(statusCode);

    httpRequestsTotal.inc({ method, endpoint, statusCode: statusCodeStr });

    if (statusCode >= 400) {
      httpErrorsTotal.inc({ method, endpoint, statusCode: statusCodeStr });
    }

    httpRequestDuration.observe(
      { method, endpoint, statusCode: statusCodeStr },
      latencyMs / 1000
    );

    activeRequests.dec({ method, endpoint: req.originalUrl });

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
