require('dotenv').config();
const app = require('./src/app');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
const { createOrderWorker } = require('./src/workers/order.worker');

const PORT = process.env.PORT || 3003;
const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

let server;
let worker;

const start = async () => {
  await connectDB();

  server = app.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} running on port ${PORT}`, {
      service: SERVICE_NAME,
      port: PORT,
      env: process.env.NODE_ENV,
      authServiceUrl: process.env.AUTH_SERVICE_URL,
      paymentServiceUrl: process.env.PAYMENT_SERVICE_URL,
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    });
  });

  // Start BullMQ worker
  worker = createOrderWorker();

  // Start queue metrics background updater
  // app.startQueueMetricsUpdater();

  logger.info(`${SERVICE_NAME} fully initialized`, {
    service: SERVICE_NAME,
    components: ['express', 'mongodb', 'bullmq-worker', 'queue-metrics'],
  });
};

const shutdown = async (signal) => {
  logger.info(`${signal} received — graceful shutdown initiated`, {
    service: SERVICE_NAME,
  });

  if (server) {
    server.close(() => {
      logger.info('HTTP server closed', { service: SERVICE_NAME });
    });
  }

  if (worker) {
    await worker.close();
    logger.info('BullMQ worker closed', { service: SERVICE_NAME });
  }

  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', {
    service: SERVICE_NAME,
    reason: String(reason),
  });
});

start().catch((err) => {
  logger.error('Failed to start order-service', {
    service: SERVICE_NAME,
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});
