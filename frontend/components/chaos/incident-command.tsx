"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/incident-command.tsx  [NEW]
// Active incident command card — pinned top-right when incident is open.
// Shows live duration timer, Z-score, root cause, acknowledge/resolve actions.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { ShieldAlert, Clock, CheckCheck, Eye } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import type { IncidentDetail } from "@/lib/types"
import { AnimatedNumber } from "@/components/animated-number"

function useLiveDuration(detectedAt: string) {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const update = () => {
      setSecs(Math.floor((Date.now() - new Date(detectedAt).getTime()) / 1000))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [detectedAt])
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}m ${String(s).padStart(2, "0")}s`
}

const CONF_COLOR = {
  HIGH:   "text-rose-400 border-rose-500/30 bg-rose-500/10",
  MEDIUM: "text-amber-400 border-amber-400/30 bg-amber-500/10",
  LOW:    "text-zinc-400 border-zinc-600/30 bg-zinc-800/40",
}

function ZScoreGauge({ value }: { value: number }) {
  // Gauge: 0-3σ = normal, 3-5 = warn, 5+ = critical
  const pct  = Math.min(100, (value / 10) * 100)
  const color = value >= 5 ? "bg-rose-500" : value >= 3 ? "bg-amber-400" : "bg-emerald-400"

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9px] text-zinc-600">Z-Score</span>
        <span className={cn("font-mono text-[11px] font-bold tabular-nums", value >= 5 ? "text-rose-400" : value >= 3 ? "text-amber-400" : "text-emerald-400")}>
          <AnimatedNumber value={value} decimals={1} />σ
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between">
        <span className="font-mono text-[8px] text-zinc-700">0σ</span>
        <span className="font-mono text-[8px] text-zinc-700">5σ</span>
        <span className="font-mono text-[8px] text-zinc-700">10σ</span>
      </div>
    </div>
  )
}

export function IncidentCommand({
  incident,
  onAcknowledge,
  onResolve,
}: {
  incident: IncidentDetail
  onAcknowledge: (id: string) => void
  onResolve: (id: string) => void
}) {
  const duration = useLiveDuration(incident.detectedAt)
  const conf     = incident.evidence.rootCauseConfidence
  const sev      = incident.severity

  const sevColor =
    sev === "critical" ? "border-rose-500/40 bg-rose-500/8 shadow-[0_0_40px_-8px_rgba(239,68,68,0.3)]"
    : sev === "high"   ? "border-rose-400/30 bg-rose-500/5"
    : sev === "medium" ? "border-amber-400/25 bg-amber-500/5"
    : "border-white/[0.04] bg-white/[0.01]"

  return (
    <section
      className={cn("flex flex-col gap-3 rounded-xl border p-5 transition-all duration-500", sevColor)}
      aria-label="Active incident command"
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-rose-400 mt-0.5 shrink-0 animate-pulse" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-rose-400">
              Active Incident
            </span>
            <span className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase font-semibold",
              sev === "critical" || sev === "high"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                : "border-amber-400/30 bg-amber-500/10 text-amber-400",
            )}>
              {sev}
            </span>
            <span className="ml-auto font-mono text-[9px] text-zinc-600 shrink-0">
              {incident.incidentId}
            </span>
          </div>
          <p className="font-mono text-[11px] text-zinc-300 leading-snug">{incident.symptom}</p>
        </div>
      </div>

      {/* Duration + service row */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
          <Clock className="h-3 w-3 text-zinc-500 shrink-0" />
          <div className="flex flex-col">
            <span className="font-mono text-[9px] text-zinc-600">Duration</span>
            <span className="font-mono text-[12px] font-semibold text-rose-300 tabular-nums">{duration}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2">
          <div className="flex flex-col">
            <span className="font-mono text-[9px] text-zinc-600">Affected Service</span>
            <span className="font-mono text-[11px] font-semibold text-zinc-200 truncate">
              {incident.affectedService}
            </span>
          </div>
        </div>
      </div>

      {/* Z-score gauge */}
      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
        <ZScoreGauge value={incident.evidence.zScore} />
      </div>

      {/* Root cause */}
      <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Root Cause</span>
          <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold", CONF_COLOR[conf])}>
            {conf} confidence
          </span>
        </div>
        <p className="font-mono text-[11px] text-zinc-300 leading-relaxed">
          {incident.evidence.rootCause}
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t border-white/[0.04]">
          <EvidenceRow label="Baseline P99" value={`${incident.evidence.baselineMeanMs.toFixed(0)}ms`} />
          <EvidenceRow label="Current P99"  value={`${incident.evidence.currentP99Ms}ms`} />
          <EvidenceRow label="Deviation"    value={`${incident.evidence.deviationFactor.toFixed(1)}×`} />
          <EvidenceRow label="Std Dev"      value={`±${incident.evidence.baselineStdDev.toFixed(1)}ms`} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button
          onClick={() => onAcknowledge(incident.incidentId)}
          variant="outline"
          size="sm"
          className="flex-1 gap-1.5 border-zinc-700 bg-transparent font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-amber-400/40 hover:text-amber-300"
        >
          <Eye className="h-3.5 w-3.5" />
          Acknowledge
        </Button>
        <Button
          onClick={() => onResolve(incident.incidentId)}
          size="sm"
          className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 font-mono text-[11px] uppercase tracking-wider text-white border-transparent"
        >
          <CheckCheck className="h-3.5 w-3.5" />
          Mark Resolved
        </Button>
      </div>
    </section>
  )
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className="font-mono text-[9px] text-zinc-300">{value}</span>
    </>
  )
}
