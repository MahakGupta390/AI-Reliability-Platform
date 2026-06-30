/**
 * ai-service/src/routes/serviceStats.routes.js  [NEW — Screen 3]
 *
 * GET /service-stats/:serviceId
 *   — Returns MTTR, MTTD, severity breakdown for one service
 *   — serviceId: auth | payments | orders
 *   — Used by Screen 3 ServiceHero and IncidentTimeline header
 */

const express = require('express');
const router  = express.Router();
const { getServiceStats } = require('../controllers/serviceStats.controller');

router.get('/:serviceId', getServiceStats);

module.exports = router;
