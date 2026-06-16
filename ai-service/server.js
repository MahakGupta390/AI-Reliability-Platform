require('dotenv').config();

const express = require('express');
const connectDB = require('./src/config/db');
const logger = require('./src/config/logger');
const { startAnomalyDetector, BASELINES } = require('./src/services/anomalyDetector');
const Incident = require('./src/models/incident.model');

const PORT = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

const app = express();
app.use(express.json({ limit: '10kb' }));

// ── HEALTH CHECK ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
    monitoredServices: Object.keys(BASELINES),
    baselines: BASELINES,
  });
});

// ── GET /incidents — all incidents (newest first) ─────────────────────────────
app.get('/incidents', async (req, res) => {
  try {
    const { status, service } = req.query;

    // ✅ Force strict, bulletproof integer parsing logic
    let limit = parseInt(req.query.limit, 10);
    let skip = parseInt(req.query.skip, 10);

    if (isNaN(limit) || limit < 1) limit = 50;
    if (isNaN(skip) || skip < 0) skip = 0;

    const filter = {};
    if (status) filter.status = status;
    if (service) filter.affectedService = service;

    // ✅ Added .lean() to instantly convert raw documents into clean JS objects
    const incidents = await Incident.find(filter)
      .sort({ detectedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Incident.countDocuments(filter);

    res.status(200).json({
      success: true,
      total,
      count: incidents.length,
      data: incidents,
    });
  } catch (err) {
    logger.error('GET /incidents error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /incidents/open — only active incidents ────────────────────────────────
app.get('/incidents/open', async (req, res) => {
  try {
    const incidents = await Incident.find({ status: 'open' })
      .sort({ detectedAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: incidents.length,
      data: incidents,
    });
  } catch (err) {
    logger.error('GET /incidents/open error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /incidents/:id — single incident ──────────────────────────────────────
app.get('/incidents/:id', async (req, res) => {
  try {
    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    }).lean();

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    res.status(200).json({ success: true, data: incident });
  } catch (err) {
    logger.error('GET /incidents/:id error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /analysis — current detector state ────────────────────────────────────
app.get('/analysis', async (req, res) => {
  try {
    const openCount = await Incident.countDocuments({ status: 'open' });
    const resolvedCount = await Incident.countDocuments({ status: 'resolved' });
    const recentIncidents = await Incident.find()
      .sort({ detectedAt: -1 })
      .limit(5)
      .select('incidentId status severity affectedService detectedAt resolvedAt durationMs peakZScore peakP99Ms')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        detector: {
          pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
          prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
          zScoreTrigger: parseFloat(process.env.Z_SCORE_TRIGGER || '3.0'),
          zScoreResolve: parseFloat(process.env.Z_SCORE_RESOLVE || '1.5'),
        },
        baselines: BASELINES,
        summary: {
          openIncidents: openCount,
          resolvedIncidents: resolvedCount,
          totalIncidents: openCount + resolvedCount,
        },
        recentIncidents,
      },
    });
  } catch (err) {
    logger.error('GET /analysis error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.method} ${req.originalUrl} not found` });
});

// ── ERROR HANDLER ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { service: SERVICE_NAME, error: err.message });
  res.status(500).json({ success: false, message: err.message });
});

// ── STARTUP ───────────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();

  app.listen(PORT, () => {
    logger.info(`${SERVICE_NAME} running on port ${PORT}`, {
      service: SERVICE_NAME,
      port: PORT,
      env: process.env.NODE_ENV,
      prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
    });
  });

  await startAnomalyDetector();
};

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down', { service: SERVICE_NAME });
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { service: SERVICE_NAME, reason: String(reason) });
});

start().catch((err) => {
  logger.error('Failed to start ai-service', { service: SERVICE_NAME, error: err.message });
  process.exit(1);
});
