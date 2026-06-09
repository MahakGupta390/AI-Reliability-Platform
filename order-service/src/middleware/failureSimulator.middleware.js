/**
 * middleware/failureSimulator.middleware.js — Failure injection engine
 *
 * Controlled via environment variables — no code changes needed
 * to toggle failure modes on/off.
 *
 * ENVIRONMENT VARIABLES:
 *
 *   HIGH_LATENCY=true       Enable artificial latency injection
 *   LATENCY_MS=2000         How many ms to add to every request
 *
 *   FAILURE_RATE=20         % of requests that randomly return 500
 *                           0 = no failures, 100 = all requests fail
 *
 *   TIMEOUT_MODE=true       Service never responds (hangs forever)
 *                           Callers will hit their timeout limit
 *
 * COMBINATION EFFECTS:
 *   HIGH_LATENCY + FAILURE_RATE = slow AND intermittently failing
 *   TIMEOUT_MODE alone          = complete hang (worst case)
 *   FAILURE_RATE alone          = intermittent failures (flapping)
 *
 * IMPORTANT — middleware order in app.js:
 * This must come AFTER requestId and requestLogger (so arrivals are logged)
 * but BEFORE route handlers (so simulation affects actual processing).
 *
 * This means: the arrival log always appears, even for simulated failures.
 * The completion log will show the injected latency and error status.
 * This is realistic — in real incidents the request DID arrive.
 */

const logger = require('../config/logger');

const SERVICE_NAME = process.env.SERVICE_NAME || 'service';

// Excluded paths — never simulate failures on health checks
// If health checks fail, Docker/load balancers mark service as down
// and stop sending traffic — we don't want that during simulation
const EXCLUDED_PATHS = ['/health', '/metrics', '/favicon.ico'];

/**
 * sleep — returns a promise that resolves after ms milliseconds
 * Used for latency injection and timeout simulation
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failureSimulator = async (req, res, next) => {
  // Never simulate on health/metrics endpoints
  if (EXCLUDED_PATHS.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const highLatency = process.env.HIGH_LATENCY === 'true';
  const latencyMs = parseInt(process.env.LATENCY_MS || '0', 10);
  const failureRate = parseFloat(process.env.FAILURE_RATE || '0');
  const timeoutMode = process.env.TIMEOUT_MODE === 'true';

  // ── MODE 1: TIMEOUT ────────────────────────────────────────────────────────
  // Check this FIRST — timeout mode overrides everything else.
  // Service receives the request but never calls next() and never responds.
  // The caller (order-service / Postman) will eventually hit their timeout.
  if (timeoutMode) {
    logger.warn('SIMULATION: Timeout mode active — request will hang', {
      service: SERVICE_NAME,
      requestId: req.requestId,
      method: req.method,
      endpoint: req.originalUrl,
      simulation: 'TIMEOUT',
    });

    // Sleep for an extremely long time — effectively infinite from caller's perspective
    // 5 minutes is long enough that any reasonable timeout will fire first
    await sleep(5 * 60 * 1000);

    // If somehow we get here (test env), just hang permanently
    return; // Never calls next() — request dies here
  }

  // ── MODE 2: HIGH LATENCY ───────────────────────────────────────────────────
  // Inject artificial delay BEFORE processing begins.
  // Service still works correctly — just slowly.
  if (highLatency && latencyMs > 0) {
    logger.warn('SIMULATION: Injecting latency', {
      service: SERVICE_NAME,
      requestId: req.requestId,
      method: req.method,
      endpoint: req.originalUrl,
      simulation: 'HIGH_LATENCY',
      injectedMs: latencyMs,
    });

    await sleep(latencyMs);
  }

  // ── MODE 3: RANDOM FAILURES ────────────────────────────────────────────────
  // After latency (if any), randomly decide to fail this request.
  // Math.random() returns 0.0–1.0. We compare against failureRate/100.
  // FAILURE_RATE=20 means 20% of requests fail.
  if (failureRate > 0) {
    const roll = Math.random() * 100;

    if (roll < failureRate) {
      logger.warn('SIMULATION: Random failure injected', {
        service: SERVICE_NAME,
        requestId: req.requestId,
        method: req.method,
        endpoint: req.originalUrl,
        simulation: 'RANDOM_FAILURE',
        failureRate: `${failureRate}%`,
        roll: roll.toFixed(2),
      });

      // Return 503 (service unavailable) — realistic for simulated failures
      // This triggers the errorHandler and gets logged properly
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable (simulated failure)',
        requestId: req.requestId,
        simulation: true,
      });
    }
  }

  // All simulation checks passed — proceed to actual route handler
  next();
};

module.exports = failureSimulator;
