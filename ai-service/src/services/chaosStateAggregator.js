/**
 * src/services/chaosStateAggregator.js  [NEW — Screen 2 backend]
 *
 * Fetches the current simulation state from all 3 microservices.
 * Called by GET /chaos/state in server.js.
 *
 * WHY a separate service file:
 * Keeps server.js clean. This logic can also be imported
 * into the anomaly detector to correlate "was this a real incident
 * or a known chaos injection?" — useful for future incident tagging.
 *
 * Returns: Array of per-service chaos state objects.
 */

const axios  = require('axios');
const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'ai-service';

const MICROSERVICE_URLS = {
  'auth-service':    process.env.AUTH_SERVICE_URL    || 'http://localhost:3001',
  'payment-service': process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  'order-service':   process.env.ORDER_SERVICE_URL   || 'http://localhost:3003',
};

/**
 * fetchServiceChaosState
 * Calls GET /simulate on a single microservice.
 * Returns the simulation object or a "unreachable" stub.
 */
const fetchServiceChaosState = async (serviceName, baseUrl) => {
  try {
    const response = await axios.get(`${baseUrl}/simulate`, { timeout: 3000 });
    const { simulation } = response.data;
    return {
      service:   serviceName,
      reachable: true,
      highLatency:  simulation.highLatency,
      latencyMs:    simulation.latencyMs,
      failureRate:  simulation.failureRate,   // 0–1
      timeoutMode:  simulation.timeoutMode,
      active: simulation.highLatency || simulation.failureRate > 0 || simulation.timeoutMode,
    };
  } catch (err) {
    logger.warn('Could not reach service for chaos state', {
      service: SERVICE_NAME,
      target: serviceName,
      error: err.message,
    });
    return {
      service:   serviceName,
      reachable: false,
      active:    false,
    };
  }
};

/**
 * aggregateChaosState
 * Fetches chaos state from all services in parallel.
 * Returns array + summary booleans.
 */
const aggregateChaosState = async () => {
  const results = await Promise.allSettled(
    Object.entries(MICROSERVICE_URLS).map(([name, url]) =>
      fetchServiceChaosState(name, url),
    ),
  );

  const services = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { service: 'unknown', reachable: false, active: false },
  );

  const experimentRunning = services.some((s) => s.active);
  const affectedServices  = services.filter((s) => s.active).map((s) => s.service);

  return { services, experimentRunning, affectedServices };
};

module.exports = { aggregateChaosState };
