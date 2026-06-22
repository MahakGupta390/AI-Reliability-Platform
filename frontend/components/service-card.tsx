"use client"

import { ArrowDownRight, ArrowUpRight, RotateCw, Zap } from "lucide-react"
import { motion } from "motion/react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AnimatedNumber } from "@/components/animated-number"
import { ANOMALY, CRITICAL_SERIES, type Service } from "@/lib/services"

function errorRateColor(rate: number, isDown: boolean) {
  if (isDown) return "text-rose-400"
  if (rate === 0) return "text-emerald-400"
  if (rate < 1) return "text-amber-400"
  return "text-orange-400"
}

export function ServiceCard({
  service,
  isDown,
  onToggle,
}: {
  service: Service
  isDown: boolean
  onToggle: () => void
}) {
  const latency   = isDown ? ANOMALY.latency    : service.latency
  const errorRate = isDown ? ANOMALY.errorRate  : service.errorRate
  const series    = isDown ? CRITICAL_SERIES    : service.series
  const trend     = isDown ? "up"               : service.latencyTrend
  const cpu       = isDown ? ANOMALY.cpu        : service.cpu
  const mem       = isDown ? ANOMALY.mem        : service.mem
  const rps       = isDown ? ANOMALY.rps        : service.rps

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        // Reduced padding p-4 (was p-5), gap-3 (was gap-4) — tighter for 3-col row
        "group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-black p-4 transition-all duration-300 hover:scale-[1.01]",
        isDown
          ? "border-red-500/30 shadow-[0_0_50px_-12px_rgba(239,68,68,0.35)]"
          : "border-white/[0.04] hover:border-white/[0.08]",
      )}
    >
      {/* Contextual radial glow */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 -z-0 bg-gradient-to-b transition-opacity duration-500",
          isDown
            ? "from-red-950/40 via-transparent to-transparent opacity-100"
            : "from-emerald-950/10 via-transparent to-transparent opacity-0 group-hover:opacity-100",
        )}
      />

      <div className="relative z-10 flex flex-col gap-3">
        {/* Header — name + badge inline, region below */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1 min-w-0">
            <h3 className="truncate text-sm font-semibold leading-none tracking-tight">
              {service.name}
            </h3>
            <span className="font-mono text-[10px] text-zinc-500">
              {service.region}
            </span>
          </div>
          <StatusBadge isDown={isDown} />
        </div>

        {/* Infra tags — compact row */}
        <div className="flex flex-wrap gap-1">
          <InfraTag label="cpu" value={`${cpu}%`}  critical={isDown} />
          <InfraTag label="mem" value={mem}         critical={isDown} />
          <InfraTag label="rps" value={rps}         critical={isDown} />
        </div>

        {/* Sparkline — slightly shorter */}
        <Sparkline data={series} isDown={isDown} />

        {/* Metrics — 2 col, smaller font */}
        <div className="grid grid-cols-2 divide-x divide-white/[0.04] rounded-lg border border-white/[0.04] bg-white/[0.015]">
          <div className="flex flex-col gap-0.5 p-2.5">
            <span
              className={cn(
                "flex items-baseline gap-1 font-mono text-xl font-bold tracking-tighter tabular-nums",
                isDown
                  ? "text-rose-400"
                  : "bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent",
              )}
            >
              <AnimatedNumber value={latency} />
              <span className={cn("text-xs font-medium", isDown ? "text-rose-400/60" : "text-zinc-500")}>
                ms
              </span>
              {trend === "up" ? (
                <ArrowUpRight className={cn("h-3.5 w-3.5 self-center", isDown ? "text-rose-400" : "text-amber-400")} />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 self-center text-emerald-400" />
              )}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
              P99 Latency
            </span>
          </div>
          <div className="flex flex-col gap-0.5 p-2.5">
            <span
              className={cn(
                "flex items-baseline gap-0.5 font-mono text-xl font-bold tracking-tighter tabular-nums",
                errorRateColor(errorRate, isDown),
              )}
            >
              <AnimatedNumber value={errorRate} decimals={2} />
              <span className="text-xs font-medium opacity-60">%</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider text-zinc-600">
              Error Rate
            </span>
          </div>
        </div>

        {/* Action button */}
        <Button
          onClick={onToggle}
          variant="outline"
          size="sm"
          className={cn(
            "chaos-btn w-full gap-1.5 border-dashed bg-transparent font-mono text-[11px] uppercase tracking-wider transition-colors duration-200",
            isDown
              ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100"
              : "border-zinc-700/70 text-zinc-400 hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-300",
          )}
        >
          {isDown ? (
            <RotateCw className="h-3.5 w-3.5" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {isDown ? "Restore Service" : "Simulate Anomaly"}
        </Button>
      </div>
    </motion.div>
  )
}

function InfraTag({
  label, value, critical,
}: {
  label: string; value: string; critical: boolean
}) {
  return (
    <span
      className={cn(
        "flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px]",
        critical
          ? "border-rose-500/20 bg-rose-500/5 text-rose-300/80"
          : "border-white/[0.04] bg-white/[0.02] text-zinc-500",
      )}
    >
      <span className="opacity-60">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  )
}

function StatusBadge({ isDown }: { isDown: boolean }) {
  if (isDown) {
    return (
      <Badge className="shrink-0 gap-1 border-transparent bg-rose-600 text-xs text-white shadow-[0_0_16px_-2px] shadow-rose-500/70 hover:bg-rose-600">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
        </span>
        CRITICAL
      </Badge>
    )
  }
  return (
    <Badge className="shrink-0 gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300 hover:bg-emerald-500/10">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
      </span>
      UP
    </Badge>
  )
}

function Sparkline({ data, isDown }: { data: number[]; isDown: boolean }) {
  const width  = 100
  const height = 24
  const max    = Math.max(...data, 1)
  const step   = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * step
    const y = height - (v / max) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const stroke = isDown ? "rgb(251 113 133)" : "rgb(45 212 191)"
  const fillId = `spark-${isDown ? "down" : "up"}-${Math.random().toString(36).slice(2, 6)}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-7 w-full"
      role="img"
      aria-label="P99 latency trend sparkline"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.3" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0"   />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points.join(" ")} ${width},${height}`}
        fill={`url(#${fillId})`}
      />
      <polyline
        points={points.join(" ")}
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
