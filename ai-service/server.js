/**
 * ai-service/server.js  [MODIFIED — Screen 2 backend]
 *
 * NEW ENDPOINTS ADDED:
 *
 * PATCH /incidents/:id
 *   — Acknowledge or resolve a specific incident by incidentId or MongoDB _id.
 *   — Body: { status: "resolved" | "open", acknowledgedBy?: string }
 *   — Used by: IncidentCommand "Acknowledge" and "Mark Resolved" buttons.
 *
 * GET /incidents/open
 *   — Already existed. Now also returns enriched timeline for Screen 2.
 *   — UNCHANGED.
 *
 * GET /chaos/state
 *   — Aggregates simulation state from all 3 microservices.
 *   — Returns a unified view of what's currently injected.
 *   — Used by: Screen 2 ExperimentForge status strip.
 *
 * GET /analysis/baselines
 *   — Returns the static BASELINES object for the MetricsComparison
 *     component to use as the "before" baseline values.
 *
 * All existing endpoints are UNCHANGED.
 */

require('dotenv').config();

const express = require('express');
const axios   = require('axios');
const connectDB = require('./src/config/db');
const logger    = require('./src/config/logger');
const { startAnomalyDetector, BASELINES } = require('./src/services/anomalyDetector');
const Incident = require('./src/models/incident.model');

const PORT         = process.env.PORT || 3004;
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

// URLs for the 3 microservices — used by /chaos/state aggregator
const MICROSERVICE_URLS = {
  'auth-service':    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
  'payment-service': process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  'order-service':   process.env.ORDER_SERVICE_URL   || 'http://localhost:3003',
};

const app = express();
app.use(express.json({ limit: '10kb' }));

// ── CORS — allow Next.js dev server ──────────────────────────────────────────
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

// ── GET /incidents — all incidents (newest first) ─────────────────────────────
// UNCHANGED from original
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

// ── GET /incidents/open — only active ────────────────────────────────────────
// UNCHANGED from original
app.get('/incidents/open', async (req, res) => {
  try {
    const incidents = await Incident.find({ status: 'open' })
      .sort({ detectedAt: -1 })
      .lean();

    res.status(200).json({ success: true, count: incidents.length, data: incidents });
  } catch (err) {
    logger.error('GET /incidents/open error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /incidents/:id — single incident ──────────────────────────────────────
// UNCHANGED from original
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

// ── PATCH /incidents/:id  [NEW — Screen 2] ────────────────────────────────────
/**
 * Acknowledge or resolve an incident from the Aegis AI frontend.
 *
 * Body: { status: "resolved" | "open", acknowledgedBy?: string }
 *
 * When status = "resolved":
 *   - Sets resolvedAt to now
 *   - Computes durationMs
 *   - Adds a timeline entry "Manually resolved via Aegis AI dashboard"
 *   - Removes from openIncidentMap in anomalyDetector (via re-sync)
 *
 * When status = "acknowledged":
 *   - Adds a timeline entry only (does NOT change status to resolved)
 *   - Useful for on-call engineers to mark they have seen it
 */
app.patch('/incidents/:id', async (req, res) => {
  try {
    const { status, acknowledgedBy = 'aegis-dashboard' } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'status field is required' });
    }

    const validStatuses = ['resolved', 'open', 'acknowledged'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    // Find by incidentId string OR MongoDB _id
    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    });

    if (!incident) {
      return res.status(404).json({ success: false, message: 'Incident not found' });
    }

    if (status === 'resolved') {
      // Use the existing resolve() method on the Incident model
      // It sets resolvedAt, computes durationMs, adds timeline entry
      if (incident.status === 'resolved') {
        return res.status(400).json({ success: false, message: 'Incident is already resolved' });
      }

      // Manual resolve: use finalZScore = 0 (manually confirmed resolved)
      await incident.resolve(0, 0);

      // Add manual resolution note to timeline
      incident.timeline.push({
        at: new Date(),
        event: `Manually resolved via Aegis AI dashboard by ${acknowledgedBy}`,
        zScore: 0,
        p99Ms: 0,
      });
      await incident.save();

      logger.info('INCIDENT MANUALLY RESOLVED', {
        service: SERVICE_NAME,
        incidentId: incident.incidentId,
        affectedService: incident.affectedService,
        resolvedBy: acknowledgedBy,
        durationMs: incident.durationMs,
      });

    } else if (status === 'acknowledged') {
      // Add acknowledgement timeline entry without changing status
      incident.timeline.push({
        at: new Date(),
        event: `Acknowledged by ${acknowledgedBy} via Aegis AI dashboard`,
      });
      await incident.save();

      logger.info('INCIDENT ACKNOWLEDGED', {
        service: SERVICE_NAME,
        incidentId: incident.incidentId,
        acknowledgedBy,
      });

    } else if (status === 'open') {
      // Re-open a resolved incident (edge case — useful for testing)
      incident.status = 'open';
      incident.resolvedAt = null;
      incident.durationMs = null;
      incident.timeline.push({
        at: new Date(),
        event: `Re-opened via Aegis AI dashboard by ${acknowledgedBy}`,
      });
      await incident.save();
    }

    const updated = await Incident.findById(incident._id).lean();
    return res.status(200).json({ success: true, data: updated });

  } catch (err) {
    logger.error('PATCH /incidents/:id error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /analysis  [UNCHANGED from original] ──────────────────────────────────
app.get('/analysis', async (req, res) => {
  try {
    const openCount     = await Incident.countDocuments({ status: 'open' });
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
          pollIntervalMs:  parseInt(process.env.POLL_INTERVAL_MS || '10000', 10),
          prometheusUrl:   process.env.PROMETHEUS_URL || 'http://prometheus:9090',
          zScoreTrigger:   parseFloat(process.env.Z_SCORE_TRIGGER || '3.0'),
          zScoreResolve:   parseFloat(process.env.Z_SCORE_RESOLVE || '1.5'),
        },
        baselines: BASELINES,
        summary: { openIncidents: openCount, resolvedIncidents: resolvedCount, totalIncidents: openCount + resolvedCount },
        recentIncidents,
      },
    });
  } catch (err) {
    logger.error('GET /analysis error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /analysis/baselines  [NEW — Screen 2] ─────────────────────────────────
/**
 * Returns static BASELINES for MetricsComparison sparklines.
 * Frontend uses these as the "before chaos" baseline values.
 */
app.get('/analysis/baselines', (req, res) => {
  res.status(200).json({
    success: true,
    baselines: BASELINES,
    description: 'Static P99 latency baselines (mean ± stdDev in ms)',
  });
});

// ── GET /chaos/state  [NEW — Screen 2] ───────────────────────────────────────
/**
 * Aggregates current simulation state from all 3 microservices.
 * Calls GET /simulate on each service in parallel.
 * Returns unified view for ExperimentForge status bar.
 *
 * If a service is unreachable, returns { reachable: false } for that service.
 */
app.get('/chaos/state', async (req, res) => {
  const results = await Promise.allSettled(
    Object.entries(MICROSERVICE_URLS).map(async ([name, url]) => {
      try {
        const response = await axios.get(`${url}/simulate`, { timeout: 3000 });
        return { service: name, reachable: true, ...response.data.simulation };
      } catch {
        return { service: name, reachable: false };
      }
    }),
  );

  const state = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { service: 'unknown', reachable: false },
  );

  const anyActive = state.some(
    (s) => s.reachable && (s.highLatency || s.failureRate > 0 || s.timeoutMode),
  );

  res.status(200).json({
    success: true,
    experimentRunning: anyActive,
    services: state,
    timestamp: new Date().toISOString(),
  });
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
      service: SERVICE_NAME, port: PORT, env: process.env.NODE_ENV,
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
