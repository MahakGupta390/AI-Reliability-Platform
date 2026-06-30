"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/incidents/mttr-chart.tsx  [NEW — Screen 4]
// 14-day MTTR trend bar chart — shows whether resolution time is improving.
// Each bar = one calendar day. Height proportional to avg MTTR that day.
// Days with no incidents = empty (transparent bar with dashed outline).
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { TrendingDown, TrendingUp } from "lucide-react"
import { useMemo } from "react"
import type { IncidentStats } from "@/lib/types"

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function MttrChart({ stats }: { stats: IncidentStats | null }) {
  const trend = stats?.mttrTrend ?? []

  const maxMttr = useMemo(
    () => Math.max(...trend.map((t) => t.mttrMs), 1),
    [trend],
  )

  // Detect if trend is improving (last 3 days avg < first 3 days avg)
  const improving = useMemo(() => {
    const nonZero = trend.filter((t) => t.mttrMs > 0)
    if (nonZero.length < 4) return null
    const first3 = nonZero.slice(0, 3).reduce((s, t) => s + t.mttrMs, 0) / 3
    const last3  = nonZero.slice(-3).reduce((s, t) => s + t.mttrMs, 0) / 3
    return last3 < first3
  }, [trend])

  if (!stats) {
    return (
      <div className="animate-pulse rounded-xl border border-white/[0.04] bg-black p-5">
        <div className="h-4 w-32 rounded bg-white/[0.06] mb-4" />
        <div className="h-32 w-full rounded bg-white/[0.03]" />
      </div>
    )
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="14-day MTTR trend"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {improving === true  && <TrendingDown className="h-4 w-4 text-emerald-400" />}
          {improving === false && <TrendingUp   className="h-4 w-4 text-rose-400" />}
          {improving === null  && <TrendingDown className="h-4 w-4 text-cyan-400" />}
          <h2 className="text-sm font-semibold tracking-tight">MTTR Trend</h2>
          <span className="font-mono text-[10px] text-zinc-600">last 14 days</span>
        </div>
        {improving !== null && (
          <span className={cn(
            "font-mono text-[10px] font-semibold rounded-full border px-2 py-0.5",
            improving
              ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8"
              : "text-rose-400 border-rose-500/25 bg-rose-500/8",
          )}>
            {improving ? "↓ improving" : "↑ degrading"}
          </span>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1 h-32" role="img" aria-label="MTTR bar chart">
        {trend.map((day, i) => {
          const hasData = day.mttrMs > 0
          const pct     = hasData ? (day.mttrMs / maxMttr) * 100 : 0
          const isToday = i === trend.length - 1

          return (
            <div
              key={day.date}
              className="group relative flex flex-1 flex-col items-center justify-end h-full"
              title={hasData ? `${shortDate(day.date)}: ${formatMs(day.mttrMs)}` : `${shortDate(day.date)}: no incidents`}
            >
              {/* Bar */}
              <div
                className={cn(
                  "w-full rounded-t-sm transition-all duration-500",
                  hasData
                    ? isToday
                      ? "bg-cyan-400"
                      : "bg-violet-500/60 group-hover:bg-violet-400"
                    : "border border-dashed border-white/[0.06]",
                )}
                style={{ height: hasData ? `${Math.max(pct, 4)}%` : "8%" }}
              />

              {/* Tooltip on hover */}
              {hasData && (
                <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 z-10 hidden group-hover:flex flex-col items-center pointer-events-none">
                  <div className="rounded-md border border-white/[0.08] bg-zinc-900 px-2 py-1 shadow-xl">
                    <p className="font-mono text-[9px] text-zinc-400 whitespace-nowrap">{shortDate(day.date)}</p>
                    <p className="font-mono text-[10px] font-semibold text-cyan-300">{formatMs(day.mttrMs)}</p>
                  </div>
                  <div className="h-1.5 w-px bg-white/10" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* X-axis labels — show every 7th */}
      <div className="flex justify-between">
        {trend.filter((_, i) => i === 0 || i === 6 || i === 13).map((day) => (
          <span key={day.date} className="font-mono text-[9px] text-zinc-700">
            {shortDate(day.date)}
          </span>
        ))}
      </div>
    </section>
  )
}
