/**
 * routes/simulate.routes.js  [NEW — Screen 2 backend]
 * order-service — POST /simulate and GET /simulate
 */
const express = require('express');
const router = express.Router();
const { applySimulation, getSimulationState } = require('../controllers/simulate.controller');
router.post('/', applySimulation);
router.get('/', getSimulationState);
module.exports = router;
