"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/incidents/stats-bar.tsx  [NEW — Screen 4]
// Top KPI strip: Total · Open · Resolved · MTTR · MTTD · Severity breakdown
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { ShieldAlert, CheckCircle2, Clock, Zap, TrendingDown } from "lucide-react"
import { AnimatedNumber } from "@/components/animated-number"
import type { IncidentStats } from "@/lib/types"

const SEV_COLOR: Record<string, string> = {
  critical: "bg-rose-500",
  high:     "bg-rose-400",
  medium:   "bg-amber-400",
  low:      "bg-zinc-500",
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-zinc-100",
  border = "border-white/[0.04]",
}: {
  icon: React.ElementType
  label: string
  value: string | number
  sub?: string
  color?: string
  border?: string
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-xl border bg-black px-4 py-3",
      border,
    )}>
      <Icon className={cn("h-4 w-4 shrink-0", color)} aria-hidden="true" />
      <div className="flex flex-col">
        <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-600">{label}</span>
        <span className={cn("font-mono text-lg font-bold leading-tight tabular-nums", color)}>
          {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
        </span>
        {sub && <span className="font-mono text-[9px] text-zinc-700">{sub}</span>}
      </div>
    </div>
  )
}

export function StatsBar({ stats }: { stats: IncidentStats | null }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 animate-pulse">
        {Array(6).fill(0).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border border-white/[0.04] bg-black" />
        ))}
      </div>
    )
  }

  const total = stats.bySeverity.critical + stats.bySeverity.high +
                stats.bySeverity.medium + stats.bySeverity.low

  return (
    <div className="flex flex-col gap-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          icon={ShieldAlert}
          label="Total Incidents"
          value={stats.total}
          sub="all time"
        />
        <KpiCard
          icon={ShieldAlert}
          label="Open"
          value={stats.open}
          color={stats.open > 0 ? "text-rose-400" : "text-zinc-100"}
          border={stats.open > 0 ? "border-rose-500/20" : "border-white/[0.04]"}
          sub="active now"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Resolved"
          value={stats.resolved}
          color="text-emerald-400"
          sub="historical"
        />
        <KpiCard
          icon={Clock}
          label="MTTR"
          value={stats.mttrFormatted}
          color="text-cyan-400"
          sub="mean time to resolve"
        />
        <KpiCard
          icon={TrendingDown}
          label="MTTD"
          value={stats.mttdFormatted}
          color="text-violet-400"
          sub="mean time to detect"
        />
      </div>

      {/* Severity breakdown bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/[0.04] bg-black px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
            Severity Breakdown
          </span>
          <span className="font-mono text-[10px] text-zinc-600">{total} incidents</span>
        </div>

        {/* Stacked bar */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
          {(["critical", "high", "medium", "low"] as const).map((sev) => {
            const pct = total > 0 ? (stats.bySeverity[sev] / total) * 100 : 0
            return pct > 0 ? (
              <div
                key={sev}
                className={cn("h-full transition-all duration-700", SEV_COLOR[sev])}
                style={{ width: `${pct}%` }}
                title={`${sev}: ${stats.bySeverity[sev]}`}
              />
            ) : null
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4">
          {(["critical", "high", "medium", "low"] as const).map((sev) => (
            <span key={sev} className="flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", SEV_COLOR[sev])} />
              <span className="font-mono text-[10px] capitalize text-zinc-500">
                {sev} <span className="text-zinc-300">{stats.bySeverity[sev]}</span>
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
