/**
 * src/routes/incidentAnalytics.routes.js  [NEW — Screen 4]
 *
 * IMPORTANT — route ORDER matters. Specific sub-paths must come
 * before the generic /:id param route, otherwise Express matches
 * "stats" and "search" as :id values.
 *
 * Routes mounted at /incidents in server.js:
 *   GET    /incidents/stats          → getStats
 *   GET    /incidents/search         → searchIncidents
 *   GET    /incidents                → (existing, unchanged in server.js)
 *   GET    /incidents/open           → (existing, unchanged)
 *   PATCH  /incidents/:id/acknowledge → acknowledgeIncident
 *   PATCH  /incidents/:id/resolve    → resolveIncident
 *   GET    /incidents/:id            → (existing, unchanged)
 */

const express = require('express');
const router  = express.Router();
const {
  getStats,
  searchIncidents,
  acknowledgeIncident,
  resolveIncident,
} = require('../controllers/incidentAnalytics.controller');

// ── Screen 4 new routes ───────────────────────────────────────────────────────
// These MUST be declared before /:id to prevent Express treating them as IDs
router.get('/stats',          getStats);
router.get('/search',         searchIncidents);
router.patch('/:id/acknowledge', acknowledgeIncident);
router.patch('/:id/resolve',     resolveIncident);

module.exports = router;
