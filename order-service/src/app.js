/**
 * app.js — Express application (order-service)
 *
 * CHANGES FROM PHASE 9A:
 * Added a background interval that updates BullMQ queue depth metrics
 * in Prometheus every 15 seconds. This makes queue health visible
 * on Grafana dashboards without adding overhead to every HTTP request.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const errorHandler = require('./middleware/errorHandler');
const latencyMiddleware = require('./middleware/latency.middleware');
const requestLogger = require('./middleware/requestLogger.middleware');
const failureSimulator = require('./middleware/failureSimulator.middleware');
const orderRoutes = require('./routes/order.routes');
const metricsRoutes = require('./routes/metrics.routes');
const logger = require('./config/logger');
const {
  queueJobsWaiting,
  queueJobsActive,
  queueJobsCompleted,
  queueJobsFailed,
} = require('./config/prometheusMetrics');

const app = express();

app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
});

app.use(latencyMiddleware);
app.use(requestLogger);
app.use(failureSimulator);

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    downstreamServices: {
      authService: process.env.AUTH_SERVICE_URL,
      paymentService: process.env.PAYMENT_SERVICE_URL,
    },
    redis: process.env.REDIS_URL || 'redis://localhost:6379',
    simulation: {
      highLatency: process.env.HIGH_LATENCY === 'true',
      latencyMs: parseInt(process.env.LATENCY_MS || '0'),
      failureRate: parseFloat(process.env.FAILURE_RATE || '0'),
      timeoutMode: process.env.TIMEOUT_MODE === 'true',
    },
  });
});

app.use('/orders', orderRoutes);
app.use('/metrics', metricsRoutes);

// ── Background Queue Metrics Updater ─────────────────────────────────────────
// Updates Prometheus queue depth gauges every 15 seconds.
// We do this on a timer rather than on every HTTP request because:
// 1. Queue depth doesn't change every request
// 2. BullMQ queue count queries hit Redis — no need to do it constantly
// 3. 15s matches Prometheus scrape interval — fresh data every scrape
//
// We wrap in a function so it can be called lazily after Redis is ready.
const startQueueMetricsUpdater = () => {
  const updateQueueMetrics = async () => {
    try {
      // Lazy require to avoid circular dependency at module load time
      const { getQueueMetrics } = require('./services/queue.service');
      const metrics = await getQueueMetrics();

      queueJobsWaiting.set({ queue: metrics.queue }, metrics.waiting);
      queueJobsActive.set({ queue: metrics.queue }, metrics.active);
      queueJobsCompleted.set({ queue: metrics.queue }, metrics.completed);
      queueJobsFailed.set({ queue: metrics.queue }, metrics.failed);
    } catch (err) {
      // Don't crash app if Redis is temporarily unavailable
      logger.warn('Failed to update queue metrics', {
        service: process.env.SERVICE_NAME,
        error: err.message,
      });
    }
  };

  // Run immediately then every 15 seconds
  updateQueueMetrics();
  setInterval(updateQueueMetrics, 15000);

  logger.info('Queue metrics updater started', {
    service: process.env.SERVICE_NAME,
    intervalMs: 15000,
  });
};

// Export so server.js can call it after Redis is ready
app.startQueueMetricsUpdater = startQueueMetricsUpdater;

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

app.use(errorHandler);

module.exports = app;
