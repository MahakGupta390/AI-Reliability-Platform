// ─────────────────────────────────────────────────────────────────────────────
// app/api/metrics/aggregate/route.ts
//
// Aggregates global metrics across all 3 microservices.
// Called by: useAggregate() hook → HealthHeader metrics strip
// Poll interval: every 3 seconds
//
// Strategy: fetch /metrics from all 3 services in parallel, compute
// weighted aggregates, compute health score from open incidents.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import type { BackendMetrics, BackendIncident, AggregateMetrics } from "@/lib/types"

const SERVICES = [
  { url: process.env.AUTH_SERVICE_URL    ?? "http://localhost:3001" },
  { url: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002" },
  { url: process.env.ORDER_SERVICE_URL   ?? "http://localhost:3003" },
]
const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

async function fetchMetrics(baseUrl: string): Promise<BackendMetrics | null> {
  try {
    const res = await fetch(`${baseUrl}/metrics`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    })
    return res.ok ? res.json() : null
  } catch {
    return null
  }
}

async function fetchOpenIncidentCount(): Promise<number> {
  try {
    const res = await fetch(`${AI_URL}/incidents?status=open&limit=50`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    })
    if (!res.ok) return 0
    const json = await res.json()
    const data: BackendIncident[] = json.data ?? []
    return data.filter((i) => i.status === "open").length
  } catch {
    return 0
  }
}

/** Parse "0.14%" → 0.14 */
function parseRate(raw: string): number {
  return parseFloat(raw.replace("%", "")) || 0
}

/** Parse "47.32 req/min" → numeric RPS */
function parseRps(raw: string): number {
  const rpm = parseFloat(raw.split(" ")[0]) || 0
  return parseFloat((rpm / 60).toFixed(2))
}

export async function GET() {
  const [metricsResults, openCount] = await Promise.all([
    Promise.allSettled(SERVICES.map((s) => fetchMetrics(s.url))),
    fetchOpenIncidentCount(),
  ])

  const live = metricsResults
    .map((r) => (r.status === "fulfilled" ? r.value : null))
    .filter(Boolean) as BackendMetrics[]

  if (live.length === 0) {
    // All services down — return degraded defaults
    const payload: AggregateMetrics = {
      cpu: 0, memory: 0, rps: 0, p99: 0, errorRate: 100, healthScore: 0,
    }
    return NextResponse.json(payload)
  }

  // Aggregate P99 — take the worst-case across services (max)
  const p99 = Math.max(...live.map((m) => m.latency.p99Ms))

  // Aggregate RPS — sum across all services
  const rps = live.reduce((acc, m) => acc + parseRps(m.summary.throughput), 0)

  // Aggregate error rate — weighted average by total requests
  const totalRequests = live.reduce((acc, m) => acc + m.summary.totalRequests, 0)
  const errorRate =
    totalRequests === 0
      ? 0
      : live.reduce(
          (acc, m) => acc + parseRate(m.summary.errorRate) * m.summary.totalRequests,
          0,
        ) / totalRequests

  // CPU — average across services (heuristic: throughput-based estimate)
  const avgCpu = Math.round(
    live.reduce((acc, m) => {
      const rpm = parseFloat(m.summary.throughput.split(" ")[0]) || 0
      return acc + Math.min(95, (rpm / 100) * 10)
    }, 0) / live.length,
  )

  // Memory — static representative value (backend doesn't expose heap in /metrics)
  // This will be replaced when backend exposes process.memoryUsage()
  const memory = 61

  // Health score: start at 100, deduct per open incident by severity
  // 1 critical = -34, 1 high = -20, 1 medium = -10 (simplified: -25 per open)
  const healthScore = Math.max(10, 100 - openCount * 25)

  const payload: AggregateMetrics = {
    cpu: avgCpu,
    memory,
    rps: Math.round(rps),
    p99,
    errorRate: parseFloat(errorRate.toFixed(2)),
    healthScore,
  }

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  })
}
