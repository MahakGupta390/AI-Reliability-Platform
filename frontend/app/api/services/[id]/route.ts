// Copy to: services-enhanced/app/api/services/[id]/route.ts
// CHANGES: fetches /metrics/timeseries for real sparkSeries, returns uptimeSeconds

import { NextResponse } from "next/server"
import type { BackendHealth, BackendMetrics, ServiceDetail } from "@/lib/types"

const SERVICE_REGISTRY: Record<string, { name: string; region: string; baseUrl: string; mem: string; instances: number }> = {
  auth:     { name: "Auth Service",    region: "us-east-1",    baseUrl: process.env.AUTH_SERVICE_URL    ?? "http://localhost:3001", mem: "1.2GB", instances: 2 },
  payments: { name: "Payment Gateway", region: "us-west-2",    baseUrl: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002", mem: "2.1GB", instances: 2 },
  orders:   { name: "Order Processor", region: "eu-central-1", baseUrl: process.env.ORDER_SERVICE_URL   ?? "http://localhost:3003", mem: "780MB", instances: 4 },
}

function parseErrorRate(raw: string): number { return parseFloat(raw.replace("%", "")) || 0 }
function parseRpm(raw: string): number { return parseFloat(raw.split(" ")[0]) || 0 }
function formatRps(rps: number): string { if (rps >= 1000) return `${(rps/1000).toFixed(1)}k`; return rps.toFixed(0) }

function buildSparkFromTimeSeries(series: { p99Ms: number }[]): number[] {
  const values = series.map((s) => s.p99Ms)
  const max    = Math.max(...values, 1)
  return values.map((v) => parseFloat((v / max).toFixed(3)))
}

function buildSparkFromRecent(metrics: BackendMetrics): number[] {
  const raw = metrics.recentRequests.map((r) => r.latencyMs)
  while (raw.length < 20) raw.unshift(raw[0] ?? 0)
  const last20 = raw.slice(-20)
  const max    = Math.max(...last20, 1)
  return last20.map((v) => parseFloat((v / max).toFixed(3)))
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { id } = params
  const svc    = SERVICE_REGISTRY[id]
  if (!svc) return NextResponse.json({ error: `Unknown service id: ${id}` }, { status: 404 })

  try {
    const [healthRes, metricsRes, tsRes] = await Promise.all([
      fetch(`${svc.baseUrl}/health`,   { cache: "no-store", signal: AbortSignal.timeout(4000) }),
      fetch(`${svc.baseUrl}/metrics`,  { cache: "no-store", signal: AbortSignal.timeout(4000) }),
      fetch(`${svc.baseUrl}/metrics/timeseries?window=60&buckets=20`, { cache: "no-store", signal: AbortSignal.timeout(4000) }).catch(() => null),
    ])

    const health: BackendHealth   = await healthRes.json()
    const metrics: BackendMetrics = await metricsRes.json()

    let sparkSeries: number[]
    try {
      if (tsRes && tsRes.ok) {
        const tsData = await tsRes.json()
        sparkSeries  = buildSparkFromTimeSeries(tsData.series ?? [])
      } else { sparkSeries = buildSparkFromRecent(metrics) }
    } catch { sparkSeries = buildSparkFromRecent(metrics) }

    const errorRateNum = parseErrorRate(metrics.summary.errorRate)
    const rpm          = parseRpm(metrics.summary.throughput)
    const isSimulating = health.simulation.highLatency || health.simulation.failureRate > 0 || health.simulation.timeoutMode
    const status: ServiceDetail["status"] = health.status !== "ok" ? "DOWN" : isSimulating ? "DEGRADED" : "UP"
    const uptimeSeconds = (metrics as any).uptimeSeconds ?? 0

    const detail: ServiceDetail = {
      id, name: svc.name, region: svc.region, status,
      uptime: metrics.uptime ?? "0h 0m 0s", uptimeSeconds, instances: svc.instances,
      simulation: { highLatency: health.simulation.highLatency, failureRate: health.simulation.failureRate, timeoutMode: health.simulation.timeoutMode },
      latency: { avgMs: metrics.latency.avgMs, p95Ms: metrics.latency.p95Ms, p99Ms: metrics.latency.p99Ms, minMs: metrics.latency.minMs, maxMs: metrics.latency.maxMs },
      summary: { totalRequests: metrics.summary.totalRequests, totalErrors: metrics.summary.totalErrors, errorRate: errorRateNum, throughputRpm: rpm, rps: formatRps(rpm/60) },
      endpoints: metrics.endpoints.map((ep) => ({
        method: ep.method, endpoint: ep.endpoint,
        totalRequests: ep.totalRequests, totalErrors: ep.totalErrors,
        errorRate: parseErrorRate(ep.errorRate),
        avgLatencyMs: ep.avgLatencyMs, p95LatencyMs: ep.p95LatencyMs, p99LatencyMs: ep.p99LatencyMs,
      })),
      recentRequests: metrics.recentRequests,
      sparkSeries,
    }
    return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ id, name: svc.name, region: svc.region, status: "DOWN" as const, uptime: "0h 0m 0s", uptimeSeconds: 0, instances: svc.instances, simulation: { highLatency: false, failureRate: 0, timeoutMode: false }, latency: { avgMs: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0 }, summary: { totalRequests: 0, totalErrors: 0, errorRate: 0, throughputRpm: 0, rps: "0" }, endpoints: [], recentRequests: [], sparkSeries: Array(20).fill(0) } satisfies ServiceDetail)
  }
}
