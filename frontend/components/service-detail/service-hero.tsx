"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/service-hero.tsx  [MODIFIED — Screen 3 backend]
// CHANGES: imports useServiceStats → shows MTTR, MTTD, incident counts
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Server, Globe, Clock, Layers, ArrowLeft, Zap } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { AnimatedNumber } from "@/components/animated-number"
import { useServiceStats } from "@/lib/hooks/useServiceStats"   // NEW
import type { ServiceDetail } from "@/lib/types"

// Live uptime counter — ticks every second from uptimeSeconds
function UptimeCounter({ initial }: { initial: number }) {
  const [secs, setSecs] = useState(initial)
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return (
    <span className="font-mono tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  )
}

// Mini sparkline for hero header
function HeroSparkline({ data, isDown }: { data: number[]; isDown: boolean }) {
  const W = 160
  const H = 32
  const max = Math.max(...data, 1)
  const step = W / (data.length - 1)
  const pts = data
    .map((v, i) => {
      const x = i * step
      const y = H - (v / max) * (H - 6) - 3
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
  const stroke = isDown ? "rgb(251 113 133)" : "rgb(34 211 238)"
  const fillId = `hero-spark-${isDown ? "d" : "u"}`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="h-8 w-40"
      aria-label="P99 latency trend"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${H} ${pts} ${W},${H}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

export function ServiceHero({ detail }: { detail: ServiceDetail }) {
  // CHANGED: fetch real MTTR/MTTD from ai-service MongoDB
  const { stats } = useServiceStats(detail.id)
  const isDown     = detail.status === "DOWN"
  const isDegraded = detail.status === "DEGRADED"

  const statusColor =
    isDown     ? "text-rose-400"   :
    isDegraded ? "text-amber-400"  :
    "text-emerald-400"

  const dotColor =
    isDown     ? "bg-rose-500"  :
    isDegraded ? "bg-amber-400" :
    "bg-emerald-400"

  const borderGlow =
    isDown     ? "border-rose-500/20 shadow-[0_0_60px_-12px_rgba(239,68,68,0.2)]"  :
    isDegraded ? "border-amber-400/15" :
    "border-white/[0.04]"

  return (
    <section
      className={cn(
        "rounded-xl border bg-black p-5 transition-all duration-500",
        borderGlow,
      )}
      aria-label={`${detail.name} service overview`}
    >
      {/* Back nav */}
      <Link
        href="/"
        className="mb-4 flex items-center gap-1.5 font-mono text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors w-fit"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Overview
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left — name + meta */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            {/* Status dot */}
            <span className="relative flex h-3 w-3">
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", dotColor)} />
              <span className={cn("relative inline-flex h-3 w-3 rounded-full", dotColor)} />
            </span>
            <h1 className="font-mono text-xl font-bold tracking-tight text-zinc-100">
              {detail.name}
            </h1>
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-widest",
                isDown
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  : isDegraded
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-400"
                    : "border-emerald-500/25 bg-emerald-500/8 text-emerald-400",
              )}
            >
              {detail.status}
            </span>
          </div>

          {/* Meta pills */}
          <div className="flex flex-wrap gap-2">
            <MetaPill icon={Globe}  label={detail.region} />
            <MetaPill icon={Layers} label={`${detail.instances} instances`} />
            <MetaPill icon={Clock}  label={<UptimeCounter initial={detail.uptimeSeconds} />} prefix="uptime " />
            {detail.simulation.highLatency && (
              <span className="flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1">
                <Zap className="h-3 w-3 text-rose-400" />
                <span className="font-mono text-[10px] text-rose-400">High Latency Injected</span>
              </span>
            )}
          </div>
        </div>

        {/* Right — latency stats + sparkline */}
        <div className="flex flex-col items-end gap-2">
          <HeroSparkline data={detail.sparkSeries} isDown={isDown || isDegraded} />
          <div className="flex gap-4">
            <StatCell label="P99"  value={detail.latency.p99Ms} unit="ms" color={isDown ? "text-rose-400" : "text-zinc-100"} />
            <StatCell label="P95"  value={detail.latency.p95Ms} unit="ms" color="text-zinc-300" />
            <StatCell label="AVG"  value={detail.latency.avgMs} unit="ms" color="text-zinc-400" />
            <StatCell label="ERR"  value={detail.summary.errorRate} unit="%" decimals={2}
              color={detail.summary.errorRate > 1 ? "text-rose-400" : detail.summary.errorRate > 0 ? "text-amber-400" : "text-emerald-400"}
            />
          </div>
        </div>
      </div>

      {/* Bottom summary strip — CHANGED: shows real MTTR/MTTD + incident counts */}
      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.04] pt-4 sm:grid-cols-4">
        <SummaryBox label="Total Requests" value={detail.summary.totalRequests.toLocaleString()} />
        <SummaryBox label="Total Errors"   value={detail.summary.totalErrors.toLocaleString()} highlight={detail.summary.totalErrors > 0} />
        <SummaryBox
          label="MTTR"
          value={stats?.mttrFormatted ?? "—"}
          sublabel={stats ? `${stats.resolvedIncidents} resolved` : undefined}
        />
        <SummaryBox
          label="Open Incidents"
          value={stats ? String(stats.openIncidents) : "—"}
          highlight={!!stats && stats.openIncidents > 0}
          sublabel={stats ? `${stats.totalIncidents} total` : undefined}
        />
      </div>
    </section>
  )
}

function MetaPill({
  icon: Icon,
  label,
  prefix,
}: {
  icon: React.ElementType
  label: React.ReactNode
  prefix?: string
}) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1">
      <Icon className="h-3 w-3 text-zinc-500" aria-hidden="true" />
      <span className="font-mono text-[10px] text-zinc-400">
        {prefix}{label}
      </span>
    </span>
  )
}

function StatCell({
  label, value, unit, decimals = 0, color,
}: {
  label: string; value: number; unit: string; decimals?: number; color: string
}) {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className={cn("font-mono text-sm font-bold tabular-nums", color)}>
        <AnimatedNumber value={value} decimals={decimals} />
        <span className="ml-0.5 text-[10px] font-normal opacity-60">{unit}</span>
      </span>
    </div>
  )
}

function SummaryBox({
  label, value, highlight = false, sublabel,
}: {
  label: string; value: string; highlight?: boolean; sublabel?: string
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className={cn("font-mono text-sm font-semibold", highlight ? "text-rose-400" : "text-zinc-300")}>
        {value}
      </span>
      {sublabel && (
        <span className="font-mono text-[9px] text-zinc-700">{sublabel}</span>
      )}
    </div>
  )
}
