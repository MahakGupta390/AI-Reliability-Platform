/**
 * benchmarking/benchmark.js
 *
 * Automated benchmark runner for the AI Reliability Platform.
 *
 * WHAT IT DOES:
 * 1. Registers a test user (or reuses existing)
 * 2. Logs in to get a JWT token
 * 3. Fires N concurrent/sequential order requests
 * 4. Measures each request's latency
 * 5. Computes p50, p95, p99, error rate, throughput
 * 6. Fetches /metrics from all 3 services
 * 7. Prints a full comparison report
 *
 * USAGE:
 *   node benchmark.js                    ← runs normal mode, 20 requests
 *   node benchmark.js --requests=50      ← custom request count
 *   node benchmark.js --concurrency=5    ← 5 concurrent requests at a time
 *
 * BEFORE RUNNING:
 * Make sure all 3 services are running:
 *   cd auth-service    && npm run dev
 *   cd payment-service && npm run dev
 *   cd order-service   && npm run dev
 */

require('dotenv').config();
const axios = require('axios');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CONFIG = {
  authUrl:    process.env.AUTH_URL    || 'http://localhost:3001',
  paymentUrl: process.env.PAYMENT_URL || 'http://localhost:3002',
  orderUrl:   process.env.ORDER_URL   || 'http://localhost:3003',
  requests:   parseInt(getArg('--requests') || '20', 10),
  concurrency: parseInt(getArg('--concurrency') || '1', 10),
  testEmail:  'benchmark@test.com',
  testPassword: 'benchmark123',
};

function getArg(name) {
  const arg = process.argv.find((a) => a.startsWith(name + '='));
  return arg ? arg.split('=')[1] : null;
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

/**
 * sleep — async delay
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * calcPercentile — given sorted array, return value at Nth percentile
 */
const calcPercentile = (sorted, p) => {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

/**
 * stats — compute full stats from array of latency values
 */
const computeStats = (latencies) => {
  if (!latencies.length) return {};
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((s, v) => s + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: calcPercentile(sorted, 50),
    p95: calcPercentile(sorted, 95),
    p99: calcPercentile(sorted, 99),
  };
};

/**
 * printTable — formats an object as a readable table
 */
const printTable = (title, data) => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
  Object.entries(data).forEach(([key, value]) => {
    const label = key.padEnd(25);
    console.log(`  ${label} ${value}`);
  });
};

/**
 * printDivider
 */
const printDivider = (char = '─') => console.log(char.repeat(60));

// ── SETUP: Register + Login ────────────────────────────────────────────────────

/**
 * setupUser
 * Creates the benchmark user if not exists, then logs in and returns token.
 */
const setupUser = async () => {
  console.log('\n🔧 Setting up benchmark user...');

  // Try to register (may already exist — that's fine)
  try {
    await axios.post(`${CONFIG.authUrl}/auth/register`, {
      name: 'Benchmark User',
      email: CONFIG.testEmail,
      password: CONFIG.testPassword,
    });
    console.log('  ✓ User registered');
  } catch (err) {
    if (err.response?.status === 409) {
      console.log('  ✓ User already exists');
    } else {
      throw new Error(`Registration failed: ${err.message}`);
    }
  }

  // Login
  const loginRes = await axios.post(`${CONFIG.authUrl}/auth/login`, {
    email: CONFIG.testEmail,
    password: CONFIG.testPassword,
  });

  const token = loginRes.data.data.token;
  const userId = loginRes.data.data.user.id;
  console.log(`  ✓ Logged in | userId: ${userId}`);
  return { token, userId };
};

// ── SINGLE REQUEST ─────────────────────────────────────────────────────────────

/**
 * makeOrderRequest
 * Fires one POST /orders and returns result with timing.
 */
const makeOrderRequest = async (token, requestNum) => {
  const start = Date.now();

  try {
    const response = await axios.post(
      `${CONFIG.orderUrl}/orders`,
      {
        items: [
          {
            productId: `prod-${requestNum}`,
            name: `Test Product ${requestNum}`,
            quantity: 1,
            price: 99.99,
          },
        ],
        currency: 'USD',
        shippingAddress: {
          street: '123 Benchmark St',
          city: 'Test City',
          country: 'IN',
          zip: '560001',
        },
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000, // 15s timeout for benchmark requests
      }
    );

    const latencyMs = Date.now() - start;
    return {
      requestNum,
      success: true,
      statusCode: response.status,
      latencyMs,
      orderId: response.data.data?.order?._id,
      serviceLatencies: response.data.data?.order?.serviceLatencies,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    return {
      requestNum,
      success: false,
      statusCode: err.response?.status || 0,
      latencyMs,
      error: err.response?.data?.message || err.message,
    };
  }
};

// ── FETCH METRICS ─────────────────────────────────────────────────────────────

/**
 * fetchAllMetrics
 * Gets /metrics from all 3 services simultaneously.
 */
const fetchAllMetrics = async () => {
  const [authMetrics, paymentMetrics, orderMetrics] = await Promise.allSettled([
    axios.get(`${CONFIG.authUrl}/metrics`),
    axios.get(`${CONFIG.paymentUrl}/metrics`),
    axios.get(`${CONFIG.orderUrl}/metrics`),
  ]);

  return {
    auth:    authMetrics.status    === 'fulfilled' ? authMetrics.value.data    : null,
    payment: paymentMetrics.status === 'fulfilled' ? paymentMetrics.value.data : null,
    order:   orderMetrics.status   === 'fulfilled' ? orderMetrics.value.data   : null,
  };
};

// ── RUN BENCHMARK ─────────────────────────────────────────────────────────────

/**
 * runBatch
 * Runs requests in batches of `concurrency` size.
 */
const runBatch = async (token, totalRequests, concurrency) => {
  const results = [];
  let completed = 0;

  console.log(`\n🚀 Firing ${totalRequests} requests (concurrency: ${concurrency})...\n`);

  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch = [];
    const batchSize = Math.min(concurrency, totalRequests - i);

    for (let j = 0; j < batchSize; j++) {
      batch.push(makeOrderRequest(token, i + j + 1));
    }

    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    completed += batchResults.length;

    // Progress indicator
    const percent = Math.round((completed / totalRequests) * 100);
    const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    process.stdout.write(`\r  [${bar}] ${percent}% (${completed}/${totalRequests})`);

    // Small delay between batches to avoid overwhelming services
    if (i + concurrency < totalRequests) {
      await sleep(100);
    }
  }

  console.log('\n');
  return results;
};

// ── PRINT REPORT ──────────────────────────────────────────────────────────────

/**
 * printReport
 * Prints full benchmark report to console.
 */
const printReport = (results, serviceMetrics, durationMs) => {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const allLatencies = results.map((r) => r.latencyMs);
  const successLatencies = successful.map((r) => r.latencyMs);

  const stats = computeStats(allLatencies);
  const successStats = computeStats(successLatencies);

  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + '  BENCHMARK RESULTS — AI RELIABILITY PLATFORM'.padEnd(58) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');

  // ── Summary
  printTable('SUMMARY', {
    'Total Requests':      stats.count,
    'Successful':          `${successful.length} (${((successful.length/stats.count)*100).toFixed(1)}%)`,
    'Failed':              `${failed.length} (${((failed.length/stats.count)*100).toFixed(1)}%)`,
    'Total Duration':      `${(durationMs/1000).toFixed(2)}s`,
    'Throughput':          `${(stats.count / (durationMs/1000/60)).toFixed(1)} req/min`,
  });

  // ── Latency stats (all requests)
  printTable('LATENCY — ALL REQUESTS (ms)', {
    'Min':   `${stats.min}ms`,
    'Avg':   `${stats.avg}ms`,
    'P50':   `${stats.p50}ms`,
    'P95':   `${stats.p95}ms  ← 95% of users experienced ≤ this`,
    'P99':   `${stats.p99}ms  ← 99% of users experienced ≤ this`,
    'Max':   `${stats.max}ms`,
  });

  // ── Latency stats (successful only)
  if (successful.length > 0) {
    printTable('LATENCY — SUCCESSFUL REQUESTS ONLY (ms)', {
      'Avg':  `${successStats.avg}ms`,
      'P95':  `${successStats.p95}ms`,
      'P99':  `${successStats.p99}ms`,
    });
  }

  // ── Service breakdown from order responses
  const authLats = successful
    .filter((r) => r.serviceLatencies?.authService)
    .map((r) => r.serviceLatencies.authService);
  const paymentLats = successful
    .filter((r) => r.serviceLatencies?.paymentService)
    .map((r) => r.serviceLatencies.paymentService);

  if (authLats.length > 0) {
    const aStats = computeStats(authLats);
    const pStats = computeStats(paymentLats);
    printTable('SERVICE BREAKDOWN (from order responses)', {
      'auth-service avg':     `${aStats.avg}ms`,
      'auth-service p95':     `${aStats.p95}ms`,
      'payment-service avg':  `${pStats.avg}ms`,
      'payment-service p95':  `${pStats.p95}ms`,
    });
  }

  // ── Errors
  if (failed.length > 0) {
    printTable('ERRORS', {
      'Count': failed.length,
      ...Object.fromEntries(
        failed.slice(0, 5).map((f) => [
          `Request #${f.requestNum}`,
          `HTTP ${f.statusCode} — ${(f.error || '').slice(0, 40)}`,
        ])
      ),
    });
  }

  // ── Service metrics from /metrics endpoints
  ['auth', 'payment', 'order'].forEach((svc) => {
    const m = serviceMetrics[svc];
    if (!m) {
      printTable(`${svc.toUpperCase()}-SERVICE /metrics`, { 'Status': 'UNREACHABLE' });
      return;
    }
    printTable(`${svc.toUpperCase()}-SERVICE /metrics`, {
      'Total Requests':  m.summary?.totalRequests,
      'Error Rate':      m.summary?.errorRate,
      'Throughput':      m.summary?.throughput,
      'Avg Latency':     `${m.latency?.avgMs}ms`,
      'P95 Latency':     `${m.latency?.p95Ms}ms`,
      'P99 Latency':     `${m.latency?.p99Ms}ms`,
    });
  });

  console.log('\n' + '═'.repeat(60) + '\n');
};

// ── MAIN ──────────────────────────────────────────────────────────────────────

const main = async () => {
  console.log('═'.repeat(60));
  console.log('  AI RELIABILITY PLATFORM — BENCHMARK RUNNER');
  console.log('═'.repeat(60));
  console.log(`  Requests:    ${CONFIG.requests}`);
  console.log(`  Concurrency: ${CONFIG.concurrency}`);
  console.log(`  Order URL:   ${CONFIG.orderUrl}`);

  try {
    // 1. Setup user
    const { token } = await setupUser();

    // 2. Run benchmark
    const benchStart = Date.now();
    const results = await runBatch(token, CONFIG.requests, CONFIG.concurrency);
    const benchDuration = Date.now() - benchStart;

    // 3. Fetch metrics from all services
    console.log('📊 Fetching metrics from all services...');
    const serviceMetrics = await fetchAllMetrics();

    // 4. Print report
    printReport(results, serviceMetrics, benchDuration);

  } catch (err) {
    console.error('\n❌ Benchmark failed:', err.message);
    console.error('   Make sure all 3 services are running.');
    process.exit(1);
  }
};

main();
