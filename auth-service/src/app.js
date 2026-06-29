/**
 * src/app.js  [MODIFIED — auth-service]
 *
 * CHANGE FOR SCREEN 2:
 * Added: const simulateRoutes = require('./routes/simulate.routes');
 * Added: app.use('/simulate', simulateRoutes);
 *
 * This mounts the /simulate endpoint which lets the Aegis AI frontend
 * apply chaos config at runtime via POST /simulate.
 *
 * IMPORTANT: /simulate is mounted AFTER failureSimulator middleware.
 * This means the /simulate endpoint itself is NOT affected by chaos
 * (you can always call it to restore normal state even if failure rate is 100%).
 * Health and metrics endpoints are already excluded by failureSimulator.
 *
 * All other code in this file is UNCHANGED from original.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const errorHandler      = require('./middleware/errorHandler');
const latencyMiddleware = require('./middleware/latency.middleware');
const requestLogger     = require('./middleware/requestLogger.middleware');
const failureSimulator  = require('./middleware/failureSimulator.middleware');
const authRoutes        = require('./routes/auth.routes');
const metricsRoutes     = require('./routes/metrics.routes');
const simulateRoutes    = require('./routes/simulate.routes');   // NEW

const app = express();
app.use(express.json({ limit: '10kb' }));

// 1. Request ID
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.requestId);
  next();
});

// 2. Latency tracking
app.use(latencyMiddleware);

// 3. Structured logging
app.use(requestLogger);

// 4. Failure simulation — AFTER logging, BEFORE routes
app.use(failureSimulator);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: process.env.SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    simulation: {
      highLatency: process.env.HIGH_LATENCY === 'true',
      latencyMs:   parseInt(process.env.LATENCY_MS || '0'),
      failureRate: parseFloat(process.env.FAILURE_RATE || '0'),
      timeoutMode: process.env.TIMEOUT_MODE === 'true',
    },
  });
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth',     authRoutes);
app.use('/metrics',  metricsRoutes);
app.use('/simulate', simulateRoutes);    // NEW — Screen 2 chaos control

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    requestId: req.requestId,
  });
});

app.use(errorHandler);
module.exports = app;
