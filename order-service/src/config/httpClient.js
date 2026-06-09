/**
 * config/httpClient.js — Axios instance for service-to-service calls
 *
 * WHY a shared Axios instance rather than raw axios.get() everywhere:
 * A configured instance lets us set base defaults ONCE:
 * - timeouts (prevent hanging requests from cascading)
 * - common headers (request ID propagation)
 * - response interceptors (uniform error handling)
 *
 * This is foundational for Phase 2 and critical for Phase 7 failure simulation.
 * When payment-service hangs, the timeout here is what prevents order-service
 * from hanging too — stopping a cascading failure.
 *
 * WHY we propagate x-request-id:
 * Distributed tracing. A single user action that touches 3 services should
 * produce logs with the SAME requestId in all three. Without this, debugging
 * cross-service issues means correlating timestamps — extremely painful.
 */

const axios = require('axios');
const logger = require('./logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'order-service';

/**
 * createServiceClient
 * Factory function: creates a configured Axios instance for a target service.
 *
 * @param {string} baseURL - The target service base URL
 * @param {string} serviceName - Name of target (for logging)
 * @param {number} timeout - Request timeout in ms (default from env or 5000)
 */
const createServiceClient = (baseURL, serviceName, timeout) => {
  const instance = axios.create({
    baseURL,
    timeout: timeout || parseInt(process.env.SERVICE_TIMEOUT_MS || '5000', 10),
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: inject tracing headers before every call
  instance.interceptors.request.use((config) => {
    // requestId is attached to the axios call via config.headers in the service
    logger.info(`Calling ${serviceName}`, {
      service: SERVICE_NAME,
      target: serviceName,
      method: config.method?.toUpperCase(),
      url: `${baseURL}${config.url}`,
    });
    return config;
  });

  // Response interceptor: log outcome and timing
  instance.interceptors.response.use(
    (response) => {
      logger.info(`${serviceName} responded OK`, {
        service: SERVICE_NAME,
        target: serviceName,
        status: response.status,
        url: response.config.url,
      });
      return response;
    },
    (error) => {
      // Axios wraps all non-2xx and network errors here
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (error.code === 'ECONNABORTED') {
        logger.error(`${serviceName} TIMEOUT`, {
          service: SERVICE_NAME,
          target: serviceName,
          timeout: instance.defaults.timeout,
        });
      } else if (!error.response) {
        // No response at all — service is down / unreachable
        logger.error(`${serviceName} UNREACHABLE`, {
          service: SERVICE_NAME,
          target: serviceName,
          error: error.message,
        });
      } else {
        logger.warn(`${serviceName} returned error`, {
          service: SERVICE_NAME,
          target: serviceName,
          status,
          message,
        });
      }

      // Re-throw so the calling service layer handles it
      return Promise.reject(error);
    }
  );

  return instance;
};

// Pre-configured clients — used in order.service.js
const authClient = createServiceClient(
  process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  'auth-service'
);

const paymentClient = createServiceClient(
  process.env.PAYMENT_SERVICE_URL || 'http://localhost:3002',
  'payment-service'
);

module.exports = { authClient, paymentClient };
