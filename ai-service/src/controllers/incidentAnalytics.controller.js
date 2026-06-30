/**
 * src/controllers/incidentAnalytics.controller.js  [NEW — Screen 4]
 *
 * All analytics consumed by Screen 4 components:
 *
 * getStats            → StatsBar KPIs + MttrChart 14-day trend
 * searchIncidents     → IncidentTable full-text filter + sort
 * acknowledgeIncident → PostmortemDrawer "Acknowledge" button
 * resolveIncident     → PostmortemDrawer "Mark Resolved" button
 */

const Incident = require('../models/incident.model');
const logger   = require('../config/logger');
const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

function formatMs(ms) {
  if (!ms || ms <= 0) return 'N/A';
  const s = Math.floor(ms / 1000);
  if (s < 60)  return s + 's';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ' + (s % 60) + 's';
  const h = Math.floor(m / 60);
  return h + 'h ' + (m % 60) + 'm';
}

// ── GET /incidents/stats ──────────────────────────────────────────────────────
// Powers: StatsBar (total/open/resolved/MTTR/MTTD/severity) + MttrChart (14-day trend)
const getStats = async (req, res) => {
  try {
    const all      = await Incident.find({}).sort({ detectedAt: -1 }).limit(2000).lean();
    const open     = all.filter(i => i.status === 'open');
    const resolved = all.filter(i => i.status === 'resolved' && i.durationMs != null);

    // MTTR — mean resolution time across all resolved incidents
    const mttrMs = resolved.length > 0
      ? Math.round(resolved.reduce((s, i) => s + i.durationMs, 0) / resolved.length)
      : null;

    // MTTD — approximate from poll interval (how quickly anomalyDetector fires)
    const mttdMs = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);

    // Severity breakdown
    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const inc of all) {
      if (bySeverity[inc.severity] !== undefined) bySeverity[inc.severity]++;
    }

    // 14-day MTTR trend — group resolved by calendar day
    const trendMap = new Map();
    for (let d = 13; d >= 0; d--) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      trendMap.set(dt.toISOString().slice(0, 10), []);
    }
    for (const inc of resolved) {
      const key = new Date(inc.detectedAt).toISOString().slice(0, 10);
      if (trendMap.has(key)) trendMap.get(key).push(inc.durationMs);
    }
    const mttrTrend = Array.from(trendMap.entries()).map(([date, durations]) => ({
      date,
      mttrMs: durations.length > 0
        ? Math.round(durations.reduce((s, v) => s + v, 0) / durations.length)
        : 0,
      count: durations.length,
    }));

    res.status(200).json({
      success: true,
      stats: {
        total: all.length,
        open:  open.length,
        resolved: resolved.length,
        mttrMs,
        mttrFormatted: formatMs(mttrMs),
        mttdMs,
        mttdFormatted: formatMs(mttdMs),
        bySeverity,
        mttrTrend,
        recentOpen: open.slice(0, 5).map(i => ({
          incidentId:      i.incidentId,
          affectedService: i.affectedService,
          severity:        i.severity,
          detectedAt:      i.detectedAt,
        })),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('getStats error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /incidents/search ─────────────────────────────────────────────────────
// Powers: IncidentTable — server-side filter + full-text search + sort
// Query params: status, severity, service, q (text), limit, skip, sortBy, sortDir
const searchIncidents = async (req, res) => {
  try {
    const {
      status, severity, service, q,
      limit   = '200',
      skip    = '0',
      sortBy  = 'detectedAt',
      sortDir = 'desc',
    } = req.query;

    const filter = {};
    if (status   && status   !== 'all') filter.status = status;
    if (severity && severity !== 'all') filter.severity = severity;
    if (service  && service  !== 'all') filter.affectedService = service;

    if (q && q.trim()) {
      const regex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { symptom:         { $regex: regex } },
        { incidentId:      { $regex: regex } },
        { affectedService: { $regex: regex } },
      ];
    }

    const VALID_SORT = ['detectedAt', 'peakZScore', 'severity', 'resolvedAt', 'durationMs'];
    const safeSortBy  = VALID_SORT.includes(sortBy) ? sortBy : 'detectedAt';
    const safeSortDir = sortDir === 'asc' ? 1 : -1;
    const safeLimit   = Math.min(parseInt(limit, 10) || 200, 500);
    const safeSkip    = Math.max(parseInt(skip,  10) || 0,   0);

    const [incidents, total] = await Promise.all([
      Incident.find(filter)
        .sort({ [safeSortBy]: safeSortDir })
        .limit(safeLimit)
        .skip(safeSkip)
        .lean(),
      Incident.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      count:  incidents.length,
      data:   incidents,
    });
  } catch (err) {
    logger.error('searchIncidents error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /incidents/:id/acknowledge ─────────────────────────────────────────
// Powers: PostmortemDrawer "Acknowledge" button
// Sets acknowledgedAt/By + timeline entry. Does NOT change status to resolved.
const acknowledgeIncident = async (req, res) => {
  try {
    const { acknowledgedBy = 'aegis-dashboard' } = req.body;

    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    });

    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    if (incident.status === 'resolved') {
      return res.status(400).json({ success: false, message: 'Cannot acknowledge a resolved incident' });
    }

    incident.acknowledgedAt = new Date();
    incident.acknowledgedBy = acknowledgedBy;
    incident.timeline.push({
      at:    new Date(),
      event: 'Acknowledged by ' + acknowledgedBy + ' via Aegis AI Incident Center',
    });
    await incident.save();

    logger.info('INCIDENT ACKNOWLEDGED', {
      service: SERVICE_NAME,
      incidentId: incident.incidentId,
      affectedService: incident.affectedService,
      acknowledgedBy,
    });

    return res.status(200).json({ success: true, data: await Incident.findById(incident._id).lean() });
  } catch (err) {
    logger.error('acknowledgeIncident error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /incidents/:id/resolve ─────────────────────────────────────────────
// Powers: PostmortemDrawer "Mark Resolved" button
// Uses model .resolve() method so durationMs is correctly computed.
const resolveIncident = async (req, res) => {
  try {
    const { resolvedBy = 'aegis-dashboard' } = req.body;

    const incident = await Incident.findOne({
      $or: [
        { incidentId: req.params.id },
        { _id: req.params.id.match(/^[a-f\d]{24}$/i) ? req.params.id : null },
      ],
    });

    if (!incident) return res.status(404).json({ success: false, message: 'Incident not found' });
    if (incident.status === 'resolved') {
      return res.status(400).json({ success: false, message: 'Incident already resolved' });
    }

    await incident.resolve(0, 0);
    incident.timeline.push({
      at:    new Date(),
      event: 'Manually resolved via Aegis AI Incident Center by ' + resolvedBy,
      zScore: 0,
      p99Ms:  0,
    });
    await incident.save();

    logger.info('INCIDENT MANUALLY RESOLVED', {
      service:    SERVICE_NAME,
      incidentId: incident.incidentId,
      affectedService: incident.affectedService,
      resolvedBy,
      durationMs: incident.durationMs,
    });

    return res.status(200).json({
      success: true,
      data:    await Incident.findById(incident._id).lean(),
      message: 'Incident ' + incident.incidentId + ' resolved. Duration: ' + formatMs(incident.durationMs),
    });
  } catch (err) {
    logger.error('resolveIncident error', { service: SERVICE_NAME, error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getStats, searchIncidents, acknowledgeIncident, resolveIncident };
