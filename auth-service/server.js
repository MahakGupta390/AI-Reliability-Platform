require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
 
const PORT = process.env.PORT || 3001;
const SERVICE_NAME = process.env.SERVICE_NAME || 'auth-service';
 
// Connect to MongoDB first, then start HTTP server.
// If DB is unavailable at startup, we fail loudly and immediately rather
// than serving requests that will all fail anyway.
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
    process.exit(1); // Non-zero exit → Docker/k8s knows to restart
  });
 
// Graceful shutdown handling.
// In production, containers receive SIGTERM before being killed.
// We finish in-flight requests before closing.
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Graceful shutdown initiated.', {
    service: SERVICE_NAME,
  });
  process.exit(0);
});
 
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    service: SERVICE_NAME,
    reason: String(reason),
  });
});