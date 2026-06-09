/**
 * services/metrics.service.js — Metrics aggregation
 *
 * Reads raw request records from metricsStore and computes:
 * - totalRequests, totalErrors, errorRate
 * - avgLatency, p95Latency, p99Latency
 * - throughput (req/min since service start)
 * - per-endpoint breakdown
 *
 * WHY pure functions here:
 * All functions take data as input and return computed values.
 * No side effects, no DB calls, no HTTP.
 * This makes them trivially testable and easy to reason about.
 *
 * WHY compute on read rather than on write:
 * Computing p95 requires sorting all latency values — expensive to do
 * on every single request. Instead we store raw records on every request
 * (cheap — just array push) and compute aggregations only when /metrics
 * is called (acceptable — dashboard polls every 15-30 seconds).
 *
 * FUTURE: In Phase 9, this gets replaced by Prometheus counters/histograms
 * which maintain running aggregations in O(1) space using bucketing.
 */

const { getStore } = require('../config/metricsStore');

const SERVICE_NAME = process.env.SERVICE_NAME || 'service';

/**
 * calculatePercentile
 * Given a sorted array of numbers, returns the value at the Nth percentile.
 *
 * @param {number[]} sortedArr  - Array sorted ascending
 * @param {number}   percentile - 0–100
 * @returns {number}
 */
const calculatePercentile = (sortedArr, percentile) => {
  if (!sortedArr.length) return 0;
  if (sortedArr.length === 1) return sortedArr[0];

  const index = Math.ceil((percentile / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, index)];
};

/**
 * computeMetrics
 * Main aggregation function. Reads metricsStore and returns
 * a complete metrics snapshot.
 *
 * Called on every GET /metrics request.
 */
const computeMetrics = () => {
  const store = getStore();
  const { requests, totalRequests, totalErrors, serviceStartTime } = store;

  // ── BASIC COUNTERS ─────────────────────────────────────────────────────────
  const errorRate = totalRequests > 0
    ? ((totalErrors / totalRequests) * 100).toFixed(2) + '%'
    : '0%';

  // ── LATENCY AGGREGATIONS ───────────────────────────────────────────────────
  // Extract all latency values and sort them for percentile calculations
  const latencies = requests.map((r) => r.latencyMs).sort((a, b) => a - b);

  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
    : 0;

  const p95Latency = calculatePercentile(latencies, 95);
  const p99Latency = calculatePercentile(latencies, 99);
  const minLatency = latencies.length ? latencies[0] : 0;
  const maxLatency = latencies.length ? latencies[latencies.length - 1] : 0;

  // ── THROUGHPUT ─────────────────────────────────────────────────────────────
  // Requests per minute since service started
  const uptimeMinutes = (Date.now() - serviceStartTime) / 1000 / 60;
  const throughput = uptimeMinutes > 0
    ? (totalRequests / uptimeMinutes).toFixed(2)
    : '0';

  // ── PER-ENDPOINT BREAKDOWN ─────────────────────────────────────────────────
  // Group requests by endpoint+method combination
  // This shows you which specific routes are slow or erroring
  const endpointMap = {};

  requests.forEach((r) => {
    const key = `${r.method} ${r.endpoint}`;

    if (!endpointMap[key]) {
      endpointMap[key] = {
        method: r.method,
        endpoint: r.endpoint,
        totalRequests: 0,
        totalErrors: 0,
        latencies: [],
      };
    }

    endpointMap[key].totalRequests++;
    if (r.statusCode >= 400) endpointMap[key].totalErrors++;
    endpointMap[key].latencies.push(r.latencyMs);
  });

  // Convert endpoint map to a clean summary array
  const endpoints = Object.values(endpointMap).map((ep) => {
    const epLatencies = ep.latencies.sort((a, b) => a - b);
    const epAvg = epLatencies.length
      ? Math.round(epLatencies.reduce((s, l) => s + l, 0) / epLatencies.length)
      : 0;

    return {
      method: ep.method,
      endpoint: ep.endpoint,
      totalRequests: ep.totalRequests,
      totalErrors: ep.totalErrors,
      errorRate: ep.totalRequests > 0
        ? ((ep.totalErrors / ep.totalRequests) * 100).toFixed(2) + '%'
        : '0%',
      avgLatencyMs: epAvg,
      p95LatencyMs: calculatePercentile(epLatencies, 95),
      p99LatencyMs: calculatePercentile(epLatencies, 99),
    };
  });

  // Sort endpoints by total requests descending (busiest first)
  endpoints.sort((a, b) => b.totalRequests - a.totalRequests);

  // ── RECENT REQUESTS ────────────────────────────────────────────────────────
  // Last 10 requests for a "live tail" view in the metrics response
  // Useful for quick debugging without opening log files
  const recentRequests = requests
    .slice(-10)
    .reverse()
    .map((r) => ({
      requestId: r.requestId,
      method: r.method,
      endpoint: r.endpoint,
      statusCode: r.statusCode,
      latencyMs: r.latencyMs,
      timestamp: r.timestamp,
    }));

  // ── UPTIME ─────────────────────────────────────────────────────────────────
  const uptimeSeconds = Math.floor((Date.now() - serviceStartTime) / 1000);
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;
  const uptimeFormatted = `${hours}h ${minutes}m ${seconds}s`;

  return {
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
    uptime: uptimeFormatted,
    summary: {
      totalRequests,
      totalErrors,
      errorRate,
      throughput: `${throughput} req/min`,
    },
    latency: {
      avgMs: avgLatency,
      p95Ms: p95Latency,
      p99Ms: p99Latency,
      minMs: minLatency,
      maxMs: maxLatency,
    },
    endpoints,
    recentRequests,
  };
};

module.exports = { computeMetrics };
