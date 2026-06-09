/**
 * benchmarking/report.js
 *
 * Fetches live metrics from all 3 services and prints
 * a formatted snapshot report. Run this anytime to see
 * current system state without firing new requests.
 *
 * USAGE:
 *   node report.js
 */

const axios = require('axios');

const SERVICES = {
  'auth-service':    'http://localhost:3001',
  'payment-service': 'http://localhost:3002',
  'order-service':   'http://localhost:3003',
};

const printTable = (title, rows) => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
  rows.forEach(([label, value]) => {
    console.log(`  ${label.padEnd(28)} ${value}`);
  });
};

const main = async () => {
  console.log('\n╔' + '═'.repeat(58) + '╗');
  console.log('║' + '  LIVE METRICS SNAPSHOT — AI RELIABILITY PLATFORM'.padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const res = await axios.get(`${url}/metrics`, { timeout: 3000 });
      const m = res.data;

      printTable(`${name.toUpperCase()}`, [
        ['Uptime',              m.uptime],
        ['Total Requests',      String(m.summary.totalRequests)],
        ['Total Errors',        String(m.summary.totalErrors)],
        ['Error Rate',          m.summary.errorRate],
        ['Throughput',          m.summary.throughput],
        ['Avg Latency',         `${m.latency.avgMs}ms`],
        ['P95 Latency',         `${m.latency.p95Ms}ms`],
        ['P99 Latency',         `${m.latency.p99Ms}ms`],
        ['Min Latency',         `${m.latency.minMs}ms`],
        ['Max Latency',         `${m.latency.maxMs}ms`],
      ]);

      if (m.endpoints.length > 0) {
        console.log(`\n  Endpoint Breakdown:`);
        m.endpoints.forEach((ep) => {
          console.log(`    ${ep.method} ${ep.endpoint}`);
          console.log(`      requests: ${ep.totalRequests}  errors: ${ep.totalErrors}  errorRate: ${ep.errorRate}  avgMs: ${ep.avgLatencyMs}  p95Ms: ${ep.p95LatencyMs}`);
        });
      }

      if (m.recentRequests.length > 0) {
        console.log(`\n  Last 5 Requests:`);
        m.recentRequests.slice(0, 5).forEach((r) => {
          const status = r.statusCode >= 400 ? `❌ ${r.statusCode}` : `✓  ${r.statusCode}`;
          console.log(`    ${status}  ${r.method} ${r.endpoint}  ${r.latencyMs}ms  ${r.timestamp}`);
        });
      }

    } catch (err) {
      console.log(`\n  ${name.toUpperCase()} — UNREACHABLE (${err.message})`);
    }
  }

  console.log('\n' + '═'.repeat(60) + '\n');
};

main();
