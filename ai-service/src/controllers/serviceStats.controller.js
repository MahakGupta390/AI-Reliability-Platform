/**
 * ai-service/src/controllers/serviceStats.controller.js  [NEW — Screen 3]
 *
 * GET /service-stats/:serviceId
 *
 * Aggregates MTTD (Mean Time To Detect) and MTTR (Mean Time To Resolve)
 * for one service using all resolved incidents from MongoDB.
 * Also returns incident count breakdown by severity.
 *
 * These stats are displayed in:
 *   - Screen 3 ServiceHero summary strip
 *   - Screen 3 IncidentTimeline header badges
 *
 * WHY in ai-service (not the microservice itself):
 * Incident data lives in MongoDB, which only ai-service has a connection to.
 * The microservices only have in-memory metricsStore — no persistence.
 * ai-service is the single source of truth for all incident analytics.
 *
 * MTTD = average time from anomaly start to incident detection
 *   In our system MTTD ≈ POLL_INTERVAL_MS (10s) since we detect on the
 *   next poll after the anomaly appears. We compute it from timeline entries.
 *
 * MTTR = average (resolvedAt - detectedAt) across all resolved incidents.
 */

const Incident = require('../models/incident.model');
const logger   = require('../config/logger');
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

// Map frontend service ID → MongoDB affectedService name
const ID_TO_SERVICE = {
  auth:     'auth-service',
  payments: 'payment-service',
  orders:   'order-service',
};

const getServiceStats = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const backendName   = ID_TO_SERVICE[serviceId];

    if (!backendName) {
      return res.status(400).json({
        success: false,
        message: `Unknown serviceId: ${serviceId}. Valid: auth, payments, orders`,
      });
    }

    // All incidents for this service
    const all = await Incident.find({ affectedService: backendName }).lean();

    // Separate open and resolved
    const open     = all.filter((i) => i.status === 'open');
    const resolved = all.filter((i) => i.status === 'resolved' && i.durationMs);

    // MTTR — average resolution time across resolved incidents (milliseconds)
    const mttrMs = resolved.length > 0
      ? Math.round(resolved.reduce((sum, i) => sum + i.durationMs, 0) / resolved.length)
      : null;

    // MTTD — approximate from timeline: time between detectedAt and first timeline entry
    // In practice this is very close to POLL_INTERVAL_MS (10s)
    const mttdValues = all
      .filter((i) => i.timeline && i.timeline.length > 0)
      .map((i) => {
        const detected  = new Date(i.detectedAt).getTime();
        const firstLog  = new Date(i.timeline[0].at).getTime();
        return Math.abs(firstLog - detected);
      });

    const mttdMs = mttdValues.length > 0
      ? Math.round(mttdValues.reduce((s, v) => s + v, 0) / mttdValues.length)
      : null;

    // Severity breakdown
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const inc of all) {
      if (bySeverity[inc.severity] !== undefined) bySeverity[inc.severity]++;
    }

    // Peak Z-score across all incidents
    const peakZScore = all.length > 0
      ? Math.max(...all.map((i) => i.peakZScore))
      : 0;

    // Most recent incident
    const latestIncident = all.length > 0
      ? {
          incidentId:    all[0].incidentId,
          status:        all[0].status,
          severity:      all[0].severity,
          symptom:       all[0].symptom,
          detectedAt:    all[0].detectedAt,
        }
      : null;

    res.status(200).json({
      success: true,
      service: backendName,
      stats: {
        totalIncidents:    all.length,
        openIncidents:     open.length,
        resolvedIncidents: resolved.length,
        mttrMs,
        mttrFormatted:     mttrMs ? formatDuration(mttrMs) : 'N/A',
        mttdMs,
        mttdFormatted:     mttdMs ? formatDuration(mttdMs) : 'N/A',
        bySeverity,
        peakZScore:        parseFloat(peakZScore.toFixed(2)),
      },
      latestIncident,
      timestamp: new Date().toISOString(),
    });

  } catch (err) {
    logger.error('GET /service-stats/:serviceId error', {
      service: SERVICE_NAME, error: err.message,
    });
    res.status(500).json({ success: false, message: err.message });
  }
};

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

module.exports = { getServiceStats };
