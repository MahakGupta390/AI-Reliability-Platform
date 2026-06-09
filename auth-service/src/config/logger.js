/**
 * config/logger.js — Winston structured logger
 *
 * CHANGES FROM PHASE 1:
 * - Added consistent base format with guaranteed fields
 * - Separated dev format (readable) from prod format (machine JSON)
 * - Added log level coloring based on severity
 * - Added error stack trace handling
 * - Log files now separated: error.log (errors only) + combined.log (all)
 *
 * WHY JSON logs in production:
 * Log aggregators (Datadog, CloudWatch, ELK stack) ingest JSON.
 * They index every field. You can then query:
 *   service:payment-service AND statusCode:500
 *   requestId:abc-123
 *   latencyMs:>1000 AND endpoint:/payment
 *
 * Plain text logs cannot be queried this way. You're stuck with grep.
 *
 * WHY separate error.log:
 * In an incident, you want to see ONLY errors fast.
 * Scanning combined.log with thousands of info entries is slow.
 * error.log has only what matters during an outage.
 */

const winston = require('winston');
const path = require('path');

const SERVICE_NAME = process.env.SERVICE_NAME || 'service';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// ── FORMATS ───────────────────────────────────────────────────────────────────

/**
 * Production format: pure JSON, one object per line.
 * Every field is at the top level — no nesting — for easy indexing.
 * Timestamp is ISO 8601 with milliseconds for precise ordering.
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Development format: human-readable with color.
 * Shows: TIME [SERVICE] [requestId] LEVEL: message {extra fields}
 * Example: 10:40:00 [auth-service] [abc-12345] info: User registered
 */
const developmentFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, requestId, latencyMs, statusCode, ...meta }) => {
    const rid = requestId ? ` [${String(requestId).slice(0, 8)}]` : '';
    const lat = latencyMs !== undefined ? ` ${latencyMs}ms` : '';
    const status = statusCode ? ` HTTP${statusCode}` : '';

    // Only show extra metadata if it has meaningful content
    const extraKeys = Object.keys(meta).filter(
      k => !['stack', 'splat'].includes(k) && meta[k] !== undefined
    );
    const extra = extraKeys.length
      ? ' ' + JSON.stringify(Object.fromEntries(extraKeys.map(k => [k, meta[k]])))
      : '';

    return `${timestamp} [${service || SERVICE_NAME}]${rid}${status}${lat} ${level}: ${message}${extra}`;
  })
);

// ── LOGGER INSTANCE ───────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: LOG_LEVEL,

  // Default fields added to EVERY log entry automatically
  // This is how every log entry knows which service it came from
  defaultMeta: {
    service: SERVICE_NAME,
    environment: NODE_ENV,
  },

  transports: [
    // Error log: only error-level entries
    // Kept separate so you can tail just errors during incidents
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: productionFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),

    // Combined log: all levels
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: productionFormat,
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Console output — format depends on environment
if (NODE_ENV !== 'production') {
  // Development: colored, human-readable
  logger.add(new winston.transports.Console({
    format: developmentFormat,
  }));
} else {
  // Production: JSON to stdout (captured by Docker/k8s log drivers)
  logger.add(new winston.transports.Console({
    format: productionFormat,
  }));
}

module.exports = logger;
