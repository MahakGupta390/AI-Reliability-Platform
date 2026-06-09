require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');

const PORT = process.env.PORT || 3002;
const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`${SERVICE_NAME} running on port ${PORT}`, {
        service: SERVICE_NAME,
        port: PORT,
        env: process.env.NODE_ENV,
      });
    });
  })
  .catch((err) => {
    logger.error('Failed to connect to MongoDB. Shutting down.', {
      service: SERVICE_NAME,
      error: err.message,
    });
    process.exit(1);
  });

process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Graceful shutdown initiated.', { service: SERVICE_NAME });
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    service: SERVICE_NAME,
    reason: String(reason),
  });
});
