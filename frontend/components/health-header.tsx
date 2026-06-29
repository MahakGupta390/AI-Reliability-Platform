// ─────────────────────────────────────────────────────────────────────────────
// components/health-header.tsx   [MODIFIED — was using useTickingMetric mock]
//
// CHANGE: Replaced all useTickingMetric() fake random hooks with useAggregate()
//         which polls /api/metrics/aggregate every 3 seconds.
//         Health score now driven by real open-incident count from AI service.
//         MetricStripSkeleton shown on first load.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import { AnimatedNumber } from "@/components/animated-number"
import { MetricStripSkeleton } from "@/components/skeletons"
import { NavTabs } from "@/components/nav-tabs"
import { useAggregate } from "@/lib/hooks/useAggregate"
import { cn } from "@/lib/utils"
import { Activity, Cpu, MemoryStick, Clock, AlertTriangle } from "lucide-react"
import { useEffect, useState } from "react"

// ── MetricPill — unchanged visual, now receives live props ────────────────────
function MetricPill({
  icon: Icon,
  label,
  value,
  unit,
  decimals = 0,
  warn,
  critical,
}: {
  icon: React.ElementType
  label: string
  value: number
  unit: string
  decimals?: number
  warn?: boolean
  critical?: boolean
}) {
  const color = critical
    ? "text-rose-400"
    : warn
      ? "text-amber-400"
      : "text-emerald-400"

  return (
    <div className="flex items-center gap-2 border-r border-white/[0.05] px-4 first:pl-0 last:border-r-0">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} aria-hidden="true" />
      <div className="flex flex-col leading-none">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
          {label}
        </span>
        <span
          className={cn(
            "font-mono text-[13px] font-semibold tabular-nums leading-tight",
            color,
          )}
        >
          <AnimatedNumber value={value} decimals={decimals} durationMs={800} />
          <span className="ml-0.5 text-[10px] font-normal opacity-60">{unit}</span>
        </span>
      </div>
    </div>
  )
}

// ── HealthHeader ──────────────────────────────────────────────────────────────
export function HealthHeader() {
  // CHANGED: was `({ score }: { score: number })` receiving prop from page.
  // Now self-contained: reads score + all metrics from useAggregate().
  const { metrics, isLoading } = useAggregate()
  const { cpu, memory, rps, p99, errorRate, healthScore: score } = metrics

  const stable   = score >= 90
  const degraded = score >= 70 && score < 90

  const label = stable
    ? "System Stable"
    : degraded
      ? "Performance Degraded"
      : "Critical Incident"

  const scoreColor = stable
    ? "text-emerald-400"
    : degraded
      ? "text-amber-400"
      : "text-rose-400"

  const dotColor = stable
    ? "bg-emerald-400"
    : degraded
      ? "bg-amber-400"
      : "bg-rose-500"

  const glow = stable
    ? "shadow-emerald-500/20"
    : degraded
      ? "shadow-amber-500/20"
      : "shadow-rose-500/30"

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.04] bg-zinc-950/80 backdrop-blur-md">
      {/* ── Primary nav row ─────────────────────────────────────────────────── */}
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-3 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
        {/* Title */}
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                dotColor,
              )}
            />
            <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", dotColor)} />
          </span>
          <h1 className="font-mono text-base font-semibold tracking-tight md:text-lg">
            Aegis AI{" "}
            <span className="text-zinc-500">// Live Guardian</span>
          </h1>
        </div>

        {/* Navigation tabs */}
          <NavTabs />

          {/* Health score pill */}
        <div
          className={cn(
            "flex items-center gap-4 rounded-xl border border-white/[0.04] bg-black/80 px-4 py-2 shadow-lg transition-shadow duration-500",
            glow,
          )}
        >
          <div className="flex flex-col text-right">
            <span className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
              System Health Score
            </span>
            <span className={cn("text-xs font-medium", scoreColor)}>{label}</span>
          </div>
          <span
            className={cn(
              "font-mono text-4xl font-bold leading-none tracking-tighter tabular-nums transition-colors duration-500",
              scoreColor,
            )}
          >
            <AnimatedNumber value={score} />
          </span>
        </div>
      </div>

      {/* ── Global metrics strip ─────────────────────────────────────────────── */}
      <div
        className="mx-auto max-w-screen-2xl overflow-x-auto px-4 pb-2.5 pt-2 md:px-6"
        role="region"
        aria-label="Global infrastructure metrics"
      >
        {isLoading ? (
          <MetricStripSkeleton />
        ) : (
          <div className="flex min-w-max items-center">
            {/* CHANGED: all values now from useAggregate() — no fake random */}
            <MetricPill icon={Cpu}           label="Global CPU"    value={cpu}        unit="%" warn={cpu > 60}      critical={cpu > 85} />
            <MetricPill icon={MemoryStick}   label="Global Mem"    value={memory}     unit="%" warn={memory > 70}   critical={memory > 90} />
            <MetricPill icon={Activity}      label="Agg RPS"       value={rps}        unit=" rps" />
            <MetricPill icon={Clock}         label="P99 Latency"   value={p99}        unit=" ms" warn={p99 > 200}   critical={p99 > 400} />
            <MetricPill icon={AlertTriangle} label="Error Rate"    value={errorRate}  unit="%" decimals={2} warn={errorRate > 0.5} critical={errorRate > 2} />
            <div className="ml-auto pl-4">
              <LiveClock />
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

function LiveClock() {
  const [time, setTime] = useState("")
  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      )
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <span className="font-mono text-[10px] tabular-nums text-zinc-600">
      {time} UTC
    </span>
  )
}
