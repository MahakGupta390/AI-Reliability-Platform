// ─────────────────────────────────────────────────────────────────────────────
// app/api/services/route.ts
//
// Next.js API Route — proxies to all 3 microservices and returns a unified
// array of ServiceData objects. Components never talk directly to :3001/:3002/:3003.
//
// Pattern: call all 3 backends in parallel (Promise.allSettled so one failure
// doesn't kill the whole response), normalise each into ServiceData, return array.
//
// Called by: useServices() hook → ServiceCard, DependencyMap, page.tsx
// Poll interval: every 5 seconds (set in the hook)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import type { BackendHealth, BackendMetrics, ServiceData } from "@/lib/types"

// Service registry — maps frontend ID to backend URL + display metadata
const SERVICE_REGISTRY = [
  {
    id: "auth",
    name: "Auth Service",
    region: "us-east-1",
    baseUrl: process.env.AUTH_SERVICE_URL ?? "http://localhost:3001",
    mem: "1.2GB",   // static label — your backend doesn't expose heap in /metrics JSON
  },
  {
    id: "payments",
    name: "Payment Gateway",
    region: "us-west-2",
    baseUrl: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002",
    mem: "2.1GB",
  },
  {
    id: "orders",
    name: "Order Processor",
    region: "eu-central-1",
    baseUrl: process.env.ORDER_SERVICE_URL ?? "http://localhost:3003",
    mem: "780MB",
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "0.14%" → 0.14 */
function parseErrorRate(raw: string): number {
  return parseFloat(raw.replace("%", "")) || 0
}

/** Parse "47.32 req/min" → approximate RPS string e.g. "0.79k" */
function throughputToRps(raw: string): string {
  const rpm = parseFloat(raw.split(" ")[0]) || 0
  const rps = rpm / 60
  if (rps >= 1000) return `${(rps / 1000).toFixed(1)}k`
  return rps.toFixed(0)
}

/**
 * Build a normalised 0-1 sparkline from the last 10 recentRequests latencies.
 * Falls back to a flat line if no data yet.
 */
function buildSeries(metrics: BackendMetrics): number[] {
  const raw = metrics.recentRequests.map((r) => r.latencyMs)
  if (raw.length === 0) return Array(10).fill(0.3)

  // Pad to 10 if fewer entries
  while (raw.length < 10) raw.unshift(raw[0])
  const last10 = raw.slice(-10)

  const max = Math.max(...last10, 1)
  return last10.map((v) => parseFloat((v / max).toFixed(3)))
}

/** Determine latency trend by comparing last half of requests to first half */
function detectTrend(metrics: BackendMetrics): "up" | "down" {
  const lats = metrics.recentRequests.map((r) => r.latencyMs)
  if (lats.length < 4) return "down"
  const mid = Math.floor(lats.length / 2)
  const first = lats.slice(0, mid).reduce((a, b) => a + b, 0) / mid
  const last = lats.slice(mid).reduce((a, b) => a + b, 0) / (lats.length - mid)
  return last > first * 1.05 ? "up" : "down"
}

/** Approximate CPU% from throughput (heuristic — backend doesn't expose CPU in JSON metrics) */
function estimateCpu(throughput: string): number {
  const rpm = parseFloat(throughput.split(" ")[0]) || 0
  // Rough model: 100 rpm ≈ 10% cpu, capped at 95
  return Math.min(95, Math.round((rpm / 100) * 10))
}

// ── Fetch one service ─────────────────────────────────────────────────────────

async function fetchService(svc: typeof SERVICE_REGISTRY[0]): Promise<ServiceData> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)

  try {
    const [healthRes, metricsRes] = await Promise.all([
      fetch(`${svc.baseUrl}/health`, { signal: controller.signal, cache: "no-store" }),
      fetch(`${svc.baseUrl}/metrics`, { signal: controller.signal, cache: "no-store" }),
    ])

    const health: BackendHealth = await healthRes.json()
    const metrics: BackendMetrics = await metricsRes.json()

    const errorRatePct = parseErrorRate(metrics.summary.errorRate)
    const isSimulatingFailure =
      health.simulation.highLatency ||
      health.simulation.failureRate > 0 ||
      health.simulation.timeoutMode

    const status: ServiceData["status"] =
      health.status !== "ok"
        ? "DOWN"
        : isSimulatingFailure
          ? "DEGRADED"
          : "UP"

    return {
      id: svc.id,
      name: svc.name,
      region: svc.region,
      status,
      latency: metrics.latency.p99Ms,
      latencyTrend: detectTrend(metrics),
      errorRate: errorRatePct,
      series: buildSeries(metrics),
      cpu: estimateCpu(metrics.summary.throughput),
      mem: svc.mem,
      rps: throughputToRps(metrics.summary.throughput),
      simulation: {
        highLatency: health.simulation.highLatency,
        failureRate: health.simulation.failureRate,
      },
      rawLatencyHistory: metrics.recentRequests.slice(-10).map((r) => r.latencyMs),
    }
  } catch {
    // Service unreachable — return a DOWN stub so the UI can show the card
    return {
      id: svc.id,
      name: svc.name,
      region: svc.region,
      status: "DOWN",
      latency: 0,
      latencyTrend: "up",
      errorRate: 100,
      series: Array(10).fill(0),
      cpu: 0,
      mem: svc.mem,
      rps: "0",
      simulation: { highLatency: false, failureRate: 0 },
      rawLatencyHistory: [],
    }
  } finally {
    clearTimeout(timeout)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET() {
  const results = await Promise.allSettled(SERVICE_REGISTRY.map(fetchService))

  const services: ServiceData[] = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value
    // Shouldn't happen (fetchService never throws), but TypeScript wants this
    return {
      id: SERVICE_REGISTRY[i].id,
      name: SERVICE_REGISTRY[i].name,
      region: SERVICE_REGISTRY[i].region,
      status: "DOWN" as const,
      latency: 0,
      latencyTrend: "up" as const,
      errorRate: 100,
      series: Array(10).fill(0),
      cpu: 0,
      mem: SERVICE_REGISTRY[i].mem,
      rps: "0",
      simulation: { highLatency: false, failureRate: 0 },
      rawLatencyHistory: [],
    }
  })

  return NextResponse.json(services, {
    headers: {
      // Allow browsers to cache for 4s — slightly under the 5s poll interval
      "Cache-Control": "no-store",
    },
  })
}
