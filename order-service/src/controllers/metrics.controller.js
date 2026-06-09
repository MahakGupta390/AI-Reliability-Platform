/**
 * controllers/metrics.controller.js
 *
 * Thin controller — calls metrics service, returns result.
 * No business logic here.
 */

const { computeMetrics } = require('../services/metrics.service');

const getMetrics = (req, res) => {
  const metrics = computeMetrics();
  res.status(200).json(metrics);
};

module.exports = { getMetrics };
