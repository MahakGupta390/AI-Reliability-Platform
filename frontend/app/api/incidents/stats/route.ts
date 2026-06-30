/**
 * ai-service/server.js  [MODIFIED — Screen 4]
 *
 * CHANGES from Screen 3 version:
 *
 * 1. incidentAnalyticsRoutes mounted — provides Screen 4 specific endpoints:
 *      GET    /incidents/stats          → StatsBar + MttrChart
 *      GET    /incidents/search         → IncidentTable filtering
 *      PATCH  /incidents/:id/acknowledge → PostmortemDrawer acknowledge
 *      PATCH  /incidents/:id/resolve     → PostmortemDrawer resolve
 *
 * 2. Route mounting ORDER is critical — Screen 4 analytics routes are
 *    mounted BEFORE the existing catch-all GET /incidents/:id route
 *    so that /stats and /search don't get swallowed as :id params.
 *
 * 3. All Screen 2 endpoints preserved (PATCH /incidents/:id, GET /chaos/state)
 * 4. All Screen 3 endpoints preserved (GET /service-stats/:serviceId)
 * 5. All original endpoints preserved (GET /incidents, GET /analysis, etc.)
 */

require('dotenv').config();

const express = require('express');
const axios   = require('axios');

const connectDB    = require('./src/config/db');
const logger       = require('./src/config/logger');
const { startAnomalyDetector, BASELINES } = require('./src/services/anomalyDetector');
const Incident     = require('./src/models/incident.model');

// Screen 3 routes
const serviceStatsRoutes      = require('./src/routes/serviceStats.routes');
// Screen 4 routes — NEW
const incidentAnalyticsRoutes = require('./src/routes/incidentAnalytics.routes');

const PORT         = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

const MICROSERVICE_URLS = {
  'auth-service':    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
  'payment-service': process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  'order-service':   process.env.ORDER_SERVICE_URL   || 'http://localhost:3003',
};

const app = express();
app.use(express.json({ limit: '10kb' }));

// ── CORS ──────────────────────────────────────────────────────────────────────
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

// ── Screen 3: service stats ───────────────────────────────────────────────────
app.use('/service-stats', serviceStatsRoutes);

// ── Screen 4: incident analytics ─────────────────────────────────────────────
// MUST be mounted BEFORE the individual GET /incidents + GET /incidents/:id
// handlers below, so that /stats and /search are not swallowed as :id values.
app.use('/incidents', incidentAnalyticsRoutes);

// ── INCIDENTS: original list endpoints (Screens 1 + 2) ───────────────────────
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

// Screen 2: generic PATCH (status field in body — kept for backward compat)
app.patch('/incidents/:id', async (req, res) => {
  try {
    const { status, acknowledgedBy = 'aegis-dashboard' } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status field required' });

    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    });
    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });

    if (status === 'resolved') {
      if (incident.status === 'resolved')
        return res.status(400).json({ success: false, message: 'Already resolved' });
      await incident.resolve(0, 0);
      incident.timeline.push({ at: new Date(), event: 'Manually resolved by ' + acknowledgedBy, zScore: 0, p99Ms: 0 });
      await incident.save();
    } else if (status === 'acknowledged') {
      incident.acknowledgedAt = new Date();
      incident.acknowledgedBy = acknowledgedBy;
      incident.timeline.push({ at: new Date(), event: 'Acknowledged by ' + acknowledgedBy });
      await incident.save();
    } else if (status === 'open') {
      incident.status     = 'open';
      incident.resolvedAt = null;
      incident.durationMs = null;
      incident.timeline.push({ at: new Date(), event: 'Re-opened by ' + acknowledgedBy });
      await incident.save();
    }

    const updated = await Incident.findById(incident._id).lean();
    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    logger.error('PATCH /incidents/:id error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single incident by id — must come AFTER /open, /stats, /search
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

// ── ANALYSIS (Screen 1 + 2 — UNCHANGED) ──────────────────────────────────────
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

app.get('/analysis/baselines', (req, res) => {
  res.status(200).json({ success: true, baselines: BASELINES });
});

// Screen 2: chaos state aggregator
app.get('/chaos/state', async (req, res) => {
  const results = await Promise.allSettled(
    Object.entries(MICROSERVICE_URLS).map(async ([name, url]) => {
      try {
        const r = await axios.get(url + '/simulate', { timeout: 3000 });
        return { service: name, reachable: true, ...r.data.simulation };
      } catch {
        return { service: name, reachable: false };
      }
    }),
  );
  const state     = results.map(r => r.status === 'fulfilled' ? r.value : { service: 'unknown', reachable: false });
  const anyActive = state.some(s => s.reachable && (s.highLatency || s.failureRate > 0 || s.timeoutMode));
  res.status(200).json({ success: true, experimentRunning: anyActive, services: state, timestamp: new Date().toISOString() });
});

// ── 404 + error handler ───────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route ' + req.method + ' ' + req.originalUrl + ' not found' });
});
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { service: SERVICE_NAME, error: err.message });
  res.status(500).json({ success: false, message: err.message });
});

// ── STARTUP ───────────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(SERVICE_NAME + ' running on port ' + PORT, { service: SERVICE_NAME, port: PORT });
  });
  await startAnomalyDetector();
};

process.on('SIGTERM', () => { logger.info('SIGTERM received', { service: SERVICE_NAME }); process.exit(0); });
process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection', { service: SERVICE_NAME, reason: String(reason) });
});

start().catch(err => {
  logger.error('Failed to start', { service: SERVICE_NAME, error: err.message });
  process.exit(1);
});
