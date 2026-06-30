"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/metric-charts.tsx  [MODIFIED — Screen 3 backend]
//
// CHANGES:
//   1. useTimeSeries() hook replaces mock generateSeries() function.
//      Real P99/P95/RPS/errorRate come from GET /metrics/timeseries on backend.
//   2. Falls back to mock data gracefully if backend timeseries unavailable
//      (service has no traffic yet, or endpoint not deployed).
//   3. Range selector now passes range to useTimeSeries which fetches
//      the correct window from the backend.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { TrendingUp, Activity, Clock, AlertTriangle } from "lucide-react"
import { useState, useMemo } from "react"
import { AnimatedNumber } from "@/components/animated-number"
import { useTimeSeries } from "@/lib/hooks/useTimeSeries"
import type { ServiceDetail, TimeRange } from "@/lib/types"

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: "15m", value: "15m" },
  { label: "1h",  value: "1h"  },
  { label: "6h",  value: "6h"  },
  { label: "24h", value: "24h" },
]

// Fallback mock when backend has no data yet
function mockSeries(baseline: number, count: number, noise: number): number[] {
  return Array.from({ length: count }, () =>
    Math.max(0, baseline + (Math.random() - 0.5) * noise),
  )
}

function LineChart({
  data, color, fillColor, height = 72,
}: {
  data: number[]; color: string; fillColor: string; height?: number
}) {
  const W = 300, H = height
  const max  = Math.max(...data, 1)
  const step = W / Math.max(data.length - 1, 1)

  const pts = data.map((v, i) => {
    const x = i * step
    const y = H - (v / max) * (H - 8) - 4
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const fillId = `lc-${color.replace(/[^a-z0-9]/gi, "")}-${Math.random().toString(36).slice(2,5)}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={fillColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={fillColor} stopOpacity="0"    />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((t) => (
        <line key={t} x1="0" x2={W}
          y1={H - t*(H-8)-4} y2={H - t*(H-8)-4}
          stroke="rgb(39 39 42)" strokeWidth="0.5" strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polygon points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill={`url(#${fillId})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={color}
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {pts.length > 0 && (() => {
        const last = pts[pts.length - 1].split(",")
        return <circle cx={last[0]} cy={last[1]} r="3" fill={color} opacity="0.9" vectorEffect="non-scaling-stroke" />
      })()}
    </svg>
  )
}

function ChartCard({
  title, icon: Icon, value, unit, decimals = 0,
  data, color, fillColor, warn, critical,
}: {
  title: string; icon: React.ElementType; value: number; unit: string
  decimals?: number; data: number[]; color: string; fillColor: string
  warn?: boolean; critical?: boolean
}) {
  const valColor = critical ? "text-rose-400" : warn ? "text-amber-400" : "text-zinc-100"
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/[0.04] bg-black p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-3.5 w-3.5", critical ? "text-rose-400" : warn ? "text-amber-400" : "text-cyan-400")} />
          <span className="font-mono text-[11px] text-zinc-400">{title}</span>
        </div>
        <span className={cn("font-mono text-lg font-bold tabular-nums", valColor)}>
          <AnimatedNumber value={value} decimals={decimals} />
          <span className="ml-0.5 text-[10px] font-normal opacity-50">{unit}</span>
        </span>
      </div>
      <LineChart data={data} color={color} fillColor={fillColor} height={72} />
      <div className="flex justify-between">
        <span className="font-mono text-[9px] text-zinc-700">min {Math.min(...data).toFixed(decimals)}{unit}</span>
        <span className="font-mono text-[9px] text-zinc-700">max {Math.max(...data).toFixed(decimals)}{unit}</span>
      </div>
    </div>
  )
}

export function MetricCharts({ detail }: { detail: ServiceDetail }) {
  const [range, setRange] = useState<TimeRange>("1h")

  // CHANGED: real time-series from backend
  const { series, isLoading: tsLoading } = useTimeSeries(detail.id, range)

  const hasRealData = series.length > 0 && series.some((s) => s.requestCount > 0)

  // Extract real series arrays — fall back to mock when no traffic yet
  const p99Data = useMemo(
    () => hasRealData
      ? series.map((s) => s.p99Ms)
      : mockSeries(detail.latency.p99Ms, 30, detail.latency.p99Ms * 0.15),
    [series, hasRealData, detail.latency.p99Ms],
  )

  const p95Data = useMemo(
    () => hasRealData
      ? series.map((s) => s.p95Ms)
      : mockSeries(detail.latency.p95Ms, 30, detail.latency.p95Ms * 0.12),
    [series, hasRealData, detail.latency.p95Ms],
  )

  const rpsData = useMemo(
    () => hasRealData
      ? series.map((s) => s.rps)
      : mockSeries(detail.summary.throughputRpm / 60, 30, 2),
    [series, hasRealData, detail.summary.throughputRpm],
  )

  const errData = useMemo(
    () => hasRealData
      ? series.map((s) => s.errorRate)
      : mockSeries(detail.summary.errorRate, 30, 0.02),
    [series, hasRealData, detail.summary.errorRate],
  )

  const isDown     = detail.status === "DOWN"
  const isDegraded = detail.status === "DEGRADED"

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Metric time-series charts"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-tight">Performance Metrics</h2>
          {/* CHANGED: show data source indicator */}
          {!tsLoading && (
            <span className={cn(
              "font-mono text-[9px] px-1.5 py-0.5 rounded border",
              hasRealData
                ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                : "text-zinc-600 border-zinc-700/30 bg-zinc-800/20",
            )}>
              {hasRealData ? "live data" : "mock preview"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-white/[0.04] bg-white/[0.02] p-0.5" role="group">
          {TIME_RANGES.map((r) => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={cn(
                "rounded-md px-2.5 py-1 font-mono text-[10px] transition-all duration-150",
                range === r.value ? "bg-white/[0.08] text-zinc-100" : "text-zinc-600 hover:text-zinc-300",
              )}
              aria-pressed={range === r.value}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ChartCard
          title="P99 Latency" icon={Clock}
          value={detail.latency.p99Ms} unit="ms"
          data={p99Data}
          color={isDown || isDegraded ? "rgb(251 113 133)" : "rgb(34 211 238)"}
          fillColor={isDown || isDegraded ? "rgb(251 113 133)" : "rgb(34 211 238)"}
          warn={detail.latency.p99Ms > 200} critical={detail.latency.p99Ms > 400 || isDown}
        />
        <ChartCard
          title="P95 Latency" icon={Clock}
          value={detail.latency.p95Ms} unit="ms"
          data={p95Data}
          color="rgb(139 92 246)" fillColor="rgb(139 92 246)"
          warn={detail.latency.p95Ms > 150}
        />
        <ChartCard
          title="Requests / sec" icon={Activity}
          value={parseFloat((detail.summary.throughputRpm / 60).toFixed(1))} unit=" rps" decimals={1}
          data={rpsData}
          color="rgb(52 211 153)" fillColor="rgb(52 211 153)"
        />
        <ChartCard
          title="Error Rate" icon={AlertTriangle}
          value={detail.summary.errorRate} unit="%" decimals={2}
          data={errData}
          color={detail.summary.errorRate > 1 ? "rgb(251 113 133)" : "rgb(251 191 36)"}
          fillColor={detail.summary.errorRate > 1 ? "rgb(251 113 133)" : "rgb(251 191 36)"}
          warn={detail.summary.errorRate > 0.5} critical={detail.summary.errorRate > 2}
        />
      </div>
    </section>
  )
}
