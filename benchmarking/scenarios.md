# Phase 7 + 8 — Failure Scenarios & Testing Guide

## How to run each scenario

### SCENARIO 1 — Normal Mode (Baseline)
All services healthy. Run this FIRST to establish baseline numbers.

**Setup:**
All .env files have:
  HIGH_LATENCY=false
  FAILURE_RATE=0
  TIMEOUT_MODE=false

**Run:**
  cd benchmarking && npm install && node benchmark.js --requests=20

**Expected results:**
  Avg latency:   150–500ms
  P95 latency:   400–800ms
  Error rate:    0%
  Throughput:    varies by machine

**Save these numbers** — they are your baseline for comparison.

---

### SCENARIO 2 — High Latency on Payment Service
Simulates a slow payment gateway.

**Setup:**
payment-service .env:
  HIGH_LATENCY=true
  LATENCY_MS=2000

Restart payment-service only.

**Run:**
  node benchmark.js --requests=20

**Expected results:**
  order-service avg latency:     ~2400ms (was ~400ms)
  payment-service p95:           ~2300ms (was ~300ms)
  auth-service metrics:          UNCHANGED (not affected)
  order-service error rate:      0% (service still works, just slow)

**What to look for in logs:**
  payment-service terminal:
    warn: SIMULATION: Injecting latency { injectedMs: 2000 }

  order-service terminal:
    info: ← Completed { latencyMs: 2387, statusCode: 201 }

**Reset:** Set HIGH_LATENCY=false, LATENCY_MS=0, restart payment-service.

---

### SCENARIO 3 — Random Failures on Payment Service
Simulates intermittent payment gateway rejections.

**Setup:**
payment-service .env:
  FAILURE_RATE=30

Restart payment-service only.

**Run:**
  node benchmark.js --requests=30

**Expected results:**
  payment-service error rate:    ~30%
  order-service error rate:      ~30% (cascades up)
  order-service failed orders:   visible in MongoDB with status: "failed"
  Successful orders:             still work normally

**What to look for in logs:**
  payment-service terminal:
    warn: SIMULATION: Random failure injected { failureRate: "30%", roll: "14.23" }

  order-service terminal:
    error: Step 4/4 — Payment failed { failureReason: "Service temporarily unavailable" }
    warn: ← Completed { statusCode: 503, latencyMs: 45 }

**Reset:** Set FAILURE_RATE=0, restart payment-service.

---

### SCENARIO 4 — Timeout Mode on Payment Service
Simulates a completely hung payment service.

**Setup:**
payment-service .env:
  TIMEOUT_MODE=true

order-service .env:
  SERVICE_TIMEOUT_MS=5000   (verify this is set)

Restart payment-service only.

**Run:**
  node benchmark.js --requests=5   (use fewer — each takes 5s to timeout)

**Expected results:**
  Each order request:  takes exactly SERVICE_TIMEOUT_MS (5000ms) then fails
  order-service p99:   ~5000ms
  error rate:          100%
  order-service logs:  shows TIMEOUT error from payment-service

**What to look for in logs:**
  order-service terminal:
    error: TIMEOUT ← payment-service { timeoutMs: 5000 }
    error: Step 4/4 — Payment failed { failureReason: "payment-service timed out" }

  payment-service terminal:
    warn: SIMULATION: Timeout mode active — request will hang

**Reset:** Set TIMEOUT_MODE=false, restart payment-service.

---

### SCENARIO 5 — Cascading Failure (Most Important)
payment-service slow → order-service slow → visible in metrics

**Setup:**
payment-service .env:
  HIGH_LATENCY=true
  LATENCY_MS=3000

auth-service .env:   everything off
order-service .env:  everything off

Restart payment-service only.

**Run:**
  node benchmark.js --requests=15

**After running, open report:**
  node report.js

**Expected report output:**
  AUTH-SERVICE
    Avg Latency:   ~40ms    ← healthy, unaffected
    Error Rate:    0%

  PAYMENT-SERVICE
    Avg Latency:   ~3200ms  ← slow, has the injected delay
    Error Rate:    0%

  ORDER-SERVICE
    Avg Latency:   ~3400ms  ← ALSO slow, even though order-service itself is fine
    Error Rate:    0%

**The AI Insight:**
  order-service is slow (3400ms avg)
  auth-service is fine (40ms avg)
  payment-service is slow (3200ms avg)
  ROOT CAUSE = payment-service
  order-service is a VICTIM not the source

**This is root cause analysis from metrics alone.**

**Reset:** Set HIGH_LATENCY=false, LATENCY_MS=0, restart payment-service.

---

### SCENARIO 6 — Auth Service Down
Simulates complete authentication outage.

**Setup:**
Stop auth-service terminal (Ctrl+C).

**Run:**
  node benchmark.js --requests=5

**Expected results:**
  All requests fail with 503
  Error message: "auth-service is unavailable"
  payment-service metrics: UNCHANGED (payment never called)
  order-service shows retry attempts in logs

**What to look for in order-service logs:**
  error: UNREACHABLE ← auth-service { errorCode: "ECONNREFUSED" }
  warn:  Retrying call (attempt 1/2)
  error: UNREACHABLE ← auth-service
  warn:  Retrying call (attempt 2/2)
  error: UNREACHABLE ← auth-service
  error: Step 1/4 — Auth verification failed

**Reset:** Restart auth-service.

---

### SCENARIO 7 — Combined: High Latency + Random Failures
Most realistic incident simulation.

**Setup:**
payment-service .env:
  HIGH_LATENCY=true
  LATENCY_MS=1500
  FAILURE_RATE=20

Restart payment-service.

**Run:**
  node benchmark.js --requests=30

**Expected results:**
  ~80% requests succeed but each takes ~1700ms
  ~20% requests fail with 503
  p95 latency: very high (~2000ms+)
  Error rate: ~20%

This looks exactly like a real degraded production incident —
service is partially working but slow and unreliable.

**Reset:** Set all back to false/0, restart payment-service.

---

## Postman Manual Tests for Phase 7

### TEST 1 — Verify Simulation is Active
After setting HIGH_LATENCY=true in payment-service .env and restarting:

  GET http://localhost:3002/health

Expected response includes:
  "simulation": {
    "highLatency": true,
    "latencyMs": 2000,
    "failureRate": 0,
    "timeoutMode": false
  }

Health check always works — simulation is excluded from it.

### TEST 2 — Manual Latency Test
With payment-service HIGH_LATENCY=true LATENCY_MS=2000:

  POST http://localhost:3003/orders
  (normal order request with valid token)

Watch Postman's response time indicator (bottom right).
Should show ~2300ms instead of normal ~400ms.

### TEST 3 — Manual Failure Rate Test
With payment-service FAILURE_RATE=50:

Send POST /orders 10 times manually.
~5 should succeed (201) and ~5 should fail (503).
Not exactly 5 each time — it's random — but approximately.

### TEST 4 — Compare Metrics Before/After
1. Start all services with everything off
2. Run 10 orders — note /metrics numbers
3. Set payment FAILURE_RATE=40, restart payment-service
4. Run 10 more orders
5. Check /metrics again — error rate should have jumped

This is exactly what Phase 9 AI will do automatically.
