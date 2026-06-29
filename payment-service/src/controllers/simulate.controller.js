/**
 * controllers/simulate.controller.js  [NEW — Screen 2 backend]
 * payment-service — identical pattern to auth-service simulate controller.
 * Writes chaos params to process.env; failureSimulator reads on next request.
 */
const logger = require('../config/logger');
const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

const applySimulation = (req, res) => {
  try {
    const { highLatency = false, latencyMs = 800, failureRate = 0, timeoutMode = false } = req.body;

    if (typeof highLatency !== 'boolean' || typeof timeoutMode !== 'boolean') {
      return res.status(400).json({ success: false, message: 'highLatency and timeoutMode must be booleans' });
    }
    if (typeof failureRate !== 'number' || failureRate < 0 || failureRate > 1) {
      return res.status(400).json({ success: false, message: 'failureRate must be 0.0–1.0' });
    }

    process.env.HIGH_LATENCY = String(highLatency);
    process.env.LATENCY_MS   = String(highLatency ? latencyMs : 0);
    process.env.FAILURE_RATE = String(failureRate * 100);
    process.env.TIMEOUT_MODE = String(timeoutMode);

    logger.warn('CHAOS APPLIED via /simulate', {
      service: SERVICE_NAME, highLatency,
      latencyMs: highLatency ? latencyMs : 0,
      failureRate: `${(failureRate * 100).toFixed(0)}%`,
      timeoutMode,
    });

    return res.status(200).json({
      success: true,
      service: SERVICE_NAME,
      applied: { highLatency, latencyMs: highLatency ? latencyMs : 0, failureRate, timeoutMode },
      message: `Chaos applied to ${SERVICE_NAME}. Takes effect on next request.`,
      appliedAt: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('applySimulation error', { service: SERVICE_NAME, error: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
};

const getSimulationState = (req, res) => {
  return res.status(200).json({
    success: true,
    service: SERVICE_NAME,
    simulation: {
      highLatency: process.env.HIGH_LATENCY === 'true',
      latencyMs:   parseInt(process.env.LATENCY_MS  || '0', 10),
      failureRate: parseFloat(process.env.FAILURE_RATE || '0') / 100,
      timeoutMode: process.env.TIMEOUT_MODE === 'true',
    },
    timestamp: new Date().toISOString(),
  });
};

module.exports = { applySimulation, getSimulationState };
