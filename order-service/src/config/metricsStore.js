/**
 * config/metricsStore.js — In-memory metrics storage
 *
 * WHY in-memory:
 * Metrics writes happen on EVERY request. If we wrote to MongoDB on every
 * request, we'd add 20-50ms of DB latency to every single endpoint — and
 * ironically make our latency metrics worse by measuring them.
 *
 * In-memory is fast (microseconds), always available, and appropriate
 * for a single-service metrics store.
 *
 * TRADEOFF:
 * Metrics reset when the service restarts. For production you'd persist
 * to Redis or push to Prometheus. That's Phase 9.
 *
 * STRUCTURE:
 * We store a flat array of request records. Each record is one HTTP request.
 * Phase 6 will read this array and compute aggregations (p95, p99, etc).
 *
 * We cap it at 10,000 records (rolling window) to prevent unbounded memory
 * growth. In production this would be a time-based window (last 24 hours).
 */

const MAX_RECORDS = 10000;

const store = {
  // Array of individual request records
  // Each entry: { endpoint, method, statusCode, latencyMs, timestamp, requestId }
  requests: [],

  // Summary counters — updated on every request for O(1) reads
  totalRequests: 0,
  totalErrors: 0,   // statusCode >= 400
  serviceStartTime: Date.now(),
};

/**
 * addRecord
 * Called by latency middleware after every request completes.
 * Appends to the rolling window and updates counters.
 */
const addRecord = (record) => {
  // Rolling window: remove oldest if at capacity
  if (store.requests.length >= MAX_RECORDS) {
    store.requests.shift(); // Remove oldest record
  }

  store.requests.push(record);
  store.totalRequests++;

  if (record.statusCode >= 400) {
    store.totalErrors++;
  }
};

/**
 * getStore
 * Returns a snapshot of current metrics data.
 * Used by Phase 6 /metrics endpoint.
 */
const getStore = () => store;

/**
 * reset
 * Clears all metrics. Useful for testing.
 */
const reset = () => {
  store.requests = [];
  store.totalRequests = 0;
  store.totalErrors = 0;
  store.serviceStartTime = Date.now();
};

module.exports = { addRecord, getStore, reset };
