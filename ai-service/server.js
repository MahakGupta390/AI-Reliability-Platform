/**
 * ai-service/server.js  [MODIFIED — Screen 3]
 *
 * NEW ADDITIONS:
 *
 * 1. GET /service-stats/:serviceId
 *    Returns MTTR, MTTD, severity breakdown, peak Z-score for one service.
 *    Computed from MongoDB incident history.
 *    Used by: Screen 3 ServiceHero and IncidentTimeline.
 *
 * All Screen 2 endpoints (PATCH /incidents/:id, GET /chaos/state,
 * GET /analysis/baselines) are PRESERVED UNCHANGED.
 * All original endpoints are PRESERVED UNCHANGED.
 */

require('dotenv').config();

const express = require('express');
const axios   = require('axios');
const connectDB    = require('./src/config/db');
const logger       = require('./src/config/logger');
const { startAnomalyDetector, BASELINES } = require('./src/services/anomalyDetector');
const Incident     = require('./src/models/incident.model');

// NEW — Screen 3
const serviceStatsRoutes = require('./src/routes/serviceStats.routes');

const PORT         = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

const MICROSERVICE_URLS = {
  'auth-service':    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
  'payment-service': process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  'order-service':   process.env.ORDER_SERVICE_URL   || 'http://localhost:3003',
};

const app = express();
app.use(express.json({ limit: '10kb' }));

// CORS — allow Next.js dev server
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || 'http://localhost:3000');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok', service: SERVICE_NAME,
    timestamp: new Date().toISOString(), uptime: process.uptime(),
    prometheusUrl: process.env.PROMETHEUS_URL || 'http://prometheus:9090',
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
    monitoredServices: Object.keys(BASELINES),
    baselines: BASELINES,
  });
});

// ── NEW — Screen 3: service stats ─────────────────────────────────────────────
// Mounted BEFORE /incidents to avoid route conflicts
app.use('/service-stats', serviceStatsRoutes);

// ── INCIDENTS (all original + Screen 2 PATCH — UNCHANGED) ────────────────────
app.get('/incidents', async (req, res) => {
  try {
    const { status, service, limit = 50, skip = 0 } = req.query;
    const filter = {};
    if (status)  filter.status = status;
    if (service) filter.affectedService = service;
    const incidents = await Incident.find(filter)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit, 10))
      .skip(parseInt(skip, 10))
      .lean();
    const total = await Incident.countDocuments(filter);
    res.status(200).json({ success: true, total, count: incidents.length, data: incidents });
  } catch (err) {
    logger.error('GET /incidents error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/incidents/open', async (req, res) => {
  try {
    const incidents = await Incident.find({ status: 'open' })
      .sort({ detectedAt: -1 }).lean();
    res.status(200).json({ success: true, count: incidents.length, data: incidents });
  } catch (err) {
    logger.error('GET /incidents/open error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/incidents/:id', async (req, res) => {
  try {
    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    }).lean();
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    res.status(200).json({ success: true, data: incident });
  } catch (err) {
    logger.error('GET /incidents/:id error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Screen 2 PATCH — UNCHANGED
app.patch('/incidents/:id', async (req, res) => {
  try {
    const { status, acknowledgedBy = 'aegis-dashboard' } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status field required' });
    const validStatuses = ['resolved', 'open', 'acknowledged'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    });
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    if (status === 'resolved') {
      if (incident.status === 'resolved') {
        return res.status(400).json({ success: false, message: 'Already resolved' });
      }
      await incident.resolve(0, 0);
      incident.timeline.push({
        at: new Date(),
        event: 'Manually resolved via Aegis AI dashboard by ' + acknowledgedBy,
        zScore: 0, p99Ms: 0,
      });
      await incident.save();
    } else if (status === 'acknowledged') {
      incident.timeline.push({
        at: new Date(),
        event: 'Acknowledged by ' + acknowledgedBy + ' via Aegis AI dashboard',
      });
      await incident.save();
    } else if (status === 'open') {
      incident.status = 'open';
      incident.resolvedAt = null;
      incident.durationMs = null;
      incident.timeline.push({ at: new Date(), event: 'Re-opened via Aegis AI dashboard' });
      await incident.save();
    }

    const updated = await Incident.findById(incident._id).lean();
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error('PATCH /incidents/:id error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ANALYSIS (UNCHANGED from Screen 2)
app.get('/analysis', async (req, res) => {
  try {
    const openCount     = await Incident.countDocuments({ status: 'open' });
    const resolvedCount = await Incident.countDocuments({ status: 'resolved' });
    const recentIncidents = await Incident.find()
      .sort({ detectedAt: -1 }).limit(5)
      .select('incidentId status severity affectedService detectedAt resolvedAt durationMs peakZScore peakP99Ms')
      .lean();
    res.status(200).json({
      success: true,
      data: {
        detector: {
          pollIntervalMs:  parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
          prometheusUrl:   process.env.PROMETHEUS_URL || 'http://prometheus:9090',
          zScoreTrigger:   parseFloat(process.env.Z_SCORE_TRIGGER || '3.0'),
          zScoreResolve:   parseFloat(process.env.Z_SCORE_RESOLVE || '1.5'),
        },
        baselines: BASELINES,
        summary: { openIncidents: openCount, resolvedIncidents: resolvedCount },
        recentIncidents,
      },
    });
  } catch (err) {
    logger.error('GET /analysis error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Screen 2 — UNCHANGED
app.get('/analysis/baselines', (req, res) => {
  res.status(200).json({ success: true, baselines: BASELINES });
});

// Screen 2 — UNCHANGED
app.get('/chaos/state', async (req, res) => {
  const results = await Promise.allSettled(
    Object.entries(MICROSERVICE_URLS).map(async ([name, url]) => {
      try {
        const response = await axios.get(url + '/simulate', { timeout: 3000 });
        return { service: name, reachable: true, ...response.data.simulation };
      } catch {
        return { service: name, reachable: false };
      }
    }),
  );
  const state     = results.map((r) => r.status === 'fulfilled' ? r.value : { service: 'unknown', reachable: false });
  const anyActive = state.some((s) => s.reachable && (s.highLatency || s.failureRate > 0 || s.timeoutMode));
  res.status(200).json({
    success: true, experimentRunning: anyActive,
    services: state, timestamp: new Date().toISOString(),
  });
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route ' + req.method + ' ' + req.originalUrl + ' not found' });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { service: SERVICE_NAME, error: err.message });
  res.status(500).json({ success: false, message: err.message });
});

// Startup
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(SERVICE_NAME + ' running on port ' + PORT, { service: SERVICE_NAME, port: PORT });
  });
  await startAnomalyDetector();
};

process.on('SIGTERM', () => { logger.info('SIGTERM received', { service: SERVICE_NAME }); process.exit(0); });
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { service: SERVICE_NAME, reason: String(reason) });
});

start().catch((err) => {
  logger.error('Failed to start', { service: SERVICE_NAME, error: err.message });
  process.exit(1);
});
