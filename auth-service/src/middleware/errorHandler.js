/**
 * middleware/errorHandler.js — Centralized error handling
 *
 * CHANGES FROM PHASE 1:
 * - Now attaches error message to req._errorMessage
 *   so requestLogger can include it in the completion log entry
 * - This creates a complete picture in one log entry:
 *   { endpoint, statusCode, latencyMs, error: "Payment declined" }
 *
 * WHY attach to req instead of logging here:
 * We want ONE log entry per request (from requestLogger).
 * If errorHandler also logged, you'd get two entries for failed requests
 * with slightly different data — confusing for log analysis.
 * Instead: errorHandler sets req._errorMessage, requestLogger reads it.
 */

const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  // Attach error to req so requestLogger includes it in completion log
  req._errorMessage = err.message;

  // Log server errors (5xx) directly here — these are unexpected bugs
  // Client errors (4xx) are logged by requestLogger as warnings
  if (statusCode >= 500) {
    logger.error('Unhandled server error', {
      service: process.env.SERVICE_NAME,
      requestId: req.requestId,
      correlationId: req.correlationId,
      endpoint: req.originalUrl,
      method: req.method,
      statusCode,
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // Handle known Mongoose errors
  let message = err.message || 'Internal server error';

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field} already exists`;
    return res.status(409).json({
      success: false,
      message,
      requestId: req.requestId,
    });
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(', '),
      requestId: req.requestId,
    });
  }

  if (err.name === 'CastError') {
    message = `Invalid ${err.path}: ${err.value}`;
    return res.status(400).json({
      success: false,
      message,
      requestId: req.requestId,
    });
  }

  // In production, mask internal error details for 5xx responses
  const responseMessage =
    statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : message;

  res.status(statusCode).json({
    success: false,
    message: responseMessage,
    requestId: req.requestId,
    ...(process.env.NODE_ENV === 'development' && statusCode >= 500 && {
      stack: err.stack,
    }),
  });
};

module.exports = errorHandler;
