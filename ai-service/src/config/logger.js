const winston = require('winston');
const path = require('path');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_DIR = path.join(__dirname, '../../logs');

const productionFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const developmentFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const extraKeys = Object.keys(meta).filter(
      (k) => !['stack', 'splat'].includes(k) && meta[k] !== undefined
    );
    const extra = extraKeys.length
      ? ' ' + JSON.stringify(Object.fromEntries(extraKeys.map((k) => [k, meta[k]])))
      : '';
    return `${timestamp} [${service || SERVICE_NAME}] ${level}: ${message}${extra}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  defaultMeta: { service: SERVICE_NAME, environment: NODE_ENV },
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      format: productionFormat,
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log'),
      format: productionFormat,
      maxsize: 20 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({ format: developmentFormat }));
} else {
  logger.add(new winston.transports.Console({ format: productionFormat }));
}

module.exports = logger;
