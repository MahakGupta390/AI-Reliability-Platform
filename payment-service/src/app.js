const express = require('express');
const { v4: uuidv4 } = require('uuid');
const errorHandler = require('./middleware/errorHandler');
const latencyMiddleware = require('./middleware/latency.middleware');
const requestLogger = require('./middleware/requestLogger.middleware');
const failureSimulator = require('./middleware/failureSimulator.middleware');
const paymentRoutes = require('./routes/payment.routes');
const metricsRoutes = require('./routes/metrics.routes');

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
    simulation: {
      highLatency: process.env.HIGH_LATENCY === 'true',
      latencyMs: parseInt(process.env.LATENCY_MS || '0'),
      failureRate: parseFloat(process.env.FAILURE_RATE || '0'),
      timeoutMode: process.env.TIMEOUT_MODE === 'true',
    },
  });
});

app.use('/payment', paymentRoutes);
app.use('/metrics', metricsRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

app.use(errorHandler);
module.exports = app;
