"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/metrics-comparison.tsx  [NEW]
// Before/after metric sparkline strip for Screen 2.
// Left half of each chart = baseline (grey), right half = live (red/amber).
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { useServices } from "@/lib/hooks/useServices"
import { BarChart2 } from "lucide-react"
import { AnimatedNumber } from "@/components/animated-number"

// Mock baseline values — would come from stored Prometheus snapshots in prod
const BASELINES: Record<string, { p99: number; rps: number; errorRate: number }> = {
  auth:     { p99: 95,  rps: 140, errorRate: 0.05 },
  payments: { p99: 180, rps: 52,  errorRate: 0.03 },
  orders:   { p99: 88,  rps: 212, errorRate: 0.07 },
}

function delta(current: number, baseline: number): number {
  if (baseline === 0) return 0
  return ((current - baseline) / baseline) * 100
}

function DeltaBadge({ pct }: { pct: number }) {
  const positive = pct > 5
  const neg = pct < -5
  if (!positive && !neg) {
    return <span className="font-mono text-[9px] text-zinc-600">≈ baseline</span>
  }
  return (
    <span className={cn("font-mono text-[9px] font-semibold", positive ? "text-rose-400" : "text-emerald-400")}>
      {positive ? "↑" : "↓"}{Math.abs(pct).toFixed(0)}%
    </span>
  )
}

function MiniSparkline({
  baseline, current, isAffected,
}: {
  baseline: number[]; current: number[]; isAffected: boolean
}) {
  const all  = [...baseline, ...current]
  const max  = Math.max(...all, 1)
  const w    = 100
  const h    = 28
  const step = w / (all.length - 1)

  const pts = all.map((v, i) => {
    const x = i * step
    const y = h - (v / max) * (h - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const splitX = ((baseline.length - 1) / (all.length - 1)) * w

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-8 w-full">
      <defs>
        <linearGradient id="grad-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(113 113 122)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="rgb(113 113 122)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="grad-live" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isAffected ? "rgb(251 113 133)" : "rgb(45 212 191)"} stopOpacity="0.35" />
          <stop offset="100%" stopColor={isAffected ? "rgb(251 113 133)" : "rgb(45 212 191)"} stopOpacity="0" />
        </linearGradient>
        <clipPath id="clip-base"><rect x="0" y="0" width={splitX} height={h} /></clipPath>
        <clipPath id="clip-live"><rect x={splitX} y="0" width={w - splitX} height={h} /></clipPath>
      </defs>
      {/* Baseline fill */}
      <polygon
        points={`0,${h} ${pts.slice(0, baseline.length).join(" ")} ${splitX},${h}`}
        fill="url(#grad-base)" clipPath="url(#clip-base)"
      />
      {/* Live fill */}
      <polygon
        points={`${splitX},${h} ${pts.slice(baseline.length - 1).join(" ")} ${w},${h}`}
        fill="url(#grad-live)" clipPath="url(#clip-live)"
      />
      {/* Baseline line */}
      <polyline
        points={pts.slice(0, baseline.length).join(" ")}
        fill="none" stroke="rgb(82 82 91)" strokeWidth="1.2"
        strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
      {/* Live line */}
      <polyline
        points={pts.slice(baseline.length - 1).join(" ")}
        fill="none"
        stroke={isAffected ? "rgb(251 113 133)" : "rgb(45 212 191)"}
        strokeWidth="1.5"
        strokeLinecap="round" vectorEffect="non-scaling-stroke"
      />
      {/* Split divider */}
      <line x1={splitX} y1="2" x2={splitX} y2={h - 2}
        stroke="rgb(63 63 70)" strokeWidth="0.6" strokeDasharray="2 2" />
    </svg>
  )
}

export function MetricsComparison({ activeIds }: { activeIds: string[] }) {
  const { services } = useServices()

  const rows = ["auth", "payments", "orders"].map((id) => {
    const svc      = services.find((s) => s.id === id)
    const base     = BASELINES[id]
    const affected = activeIds.includes(id)
    const curP99   = svc?.latency       ?? base.p99
    const curErr   = svc?.errorRate     ?? base.errorRate
    const curRps   = parseFloat(svc?.rps ?? String(base.rps))

    // Build fake 5-point baseline + 5-point current arrays for sparkline
    const baseArr  = Array(5).fill(0).map((_, i) => base.p99 + (i - 2) * 3)
    const liveArr  = Array(5).fill(0).map((_, i) =>
      affected ? curP99 + (i - 2) * 8 : curP99 + (i - 2) * 2,
    )

    return { id, name: id, affected, curP99, curErr, curRps, baseArr, liveArr, base }
  })

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Metrics comparison strip"
    >
      <div className="flex items-center gap-2">
        <BarChart2 className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Live Metrics Comparison</h2>
        <div className="ml-auto flex items-center gap-3">
          <LegendLine color="bg-zinc-500" label="baseline" />
          <LegendLine color="bg-cyan-400" label="current" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "rounded-lg border p-3 transition-colors duration-300",
              row.affected
                ? "border-rose-500/25 bg-rose-500/4"
                : "border-white/[0.04] bg-white/[0.01]",
            )}
          >
            {/* Service label */}
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] font-semibold text-zinc-300 capitalize">
                {row.id}-service
              </span>
              {row.affected && (
                <span className="font-mono text-[9px] text-rose-400 uppercase tracking-wider">fault active</span>
              )}
            </div>

            {/* 3 mini metric columns */}
            <div className="grid grid-cols-3 gap-2">
              <MetricCell
                label="P99"
                unit="ms"
                value={row.curP99}
                baseline={row.base.p99}
                baseArr={row.baseArr}
                liveArr={row.liveArr}
                affected={row.affected}
              />
              <MetricCell
                label="Error %"
                unit="%"
                value={row.curErr}
                baseline={row.base.errorRate}
                baseArr={row.baseArr.map((v) => (v / row.base.p99) * row.base.errorRate)}
                liveArr={row.liveArr.map((v) => (v / (row.affected ? 800 : row.base.p99)) * row.curErr)}
                affected={row.affected}
                decimals={2}
              />
              <MetricCell
                label="RPS"
                unit=""
                value={row.curRps}
                baseline={row.base.rps}
                baseArr={row.baseArr.map(() => row.base.rps + (Math.random() - 0.5) * 10)}
                liveArr={row.liveArr.map(() => row.curRps + (Math.random() - 0.5) * 8)}
                affected={row.affected}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MetricCell({
  label, unit, value, baseline, baseArr, liveArr, affected, decimals = 0,
}: {
  label: string; unit: string; value: number; baseline: number
  baseArr: number[]; liveArr: number[]; affected: boolean; decimals?: number
}) {
  const d = delta(value, baseline)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">{label}</span>
        <DeltaBadge pct={d} />
      </div>
      <MiniSparkline baseline={baseArr} current={liveArr} isAffected={affected} />
      <span className={cn("font-mono text-[11px] font-semibold tabular-nums", affected ? "text-rose-300" : "text-zinc-300")}>
        <AnimatedNumber value={value} decimals={decimals} />
        {unit && <span className="ml-0.5 text-[9px] opacity-60">{unit}</span>}
      </span>
    </div>
  )
}

function LegendLine({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-0.5 w-4 rounded-full", color)} />
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
    </span>
  )
}
