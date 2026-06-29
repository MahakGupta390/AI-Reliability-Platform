"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/root-cause-panel.tsx  [NEW]
// Structured display of rootCause.js output for the selected incident.
// Shows cascade chain flow, evidence table, all-services snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { GitBranch, ArrowRight } from "lucide-react"
import type { IncidentDetail } from "@/lib/types"
import { AnimatedNumber } from "@/components/animated-number"

const SNAP_COLOR: Record<string, string> = {
  anomalous: "text-rose-400 border-rose-500/30 bg-rose-500/8",
  normal:    "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
  no_data:   "text-zinc-500 border-zinc-700/30 bg-zinc-800/20",
}

const CONF_COLOR: Record<string, string> = {
  HIGH:   "text-rose-400 border-rose-500/30 bg-rose-500/10",
  MEDIUM: "text-amber-400 border-amber-400/30 bg-amber-500/10",
  LOW:    "text-zinc-500 border-zinc-600/20 bg-zinc-800/20",
}

export function RootCausePanel({ incident }: { incident: IncidentDetail | null }) {
  if (!incident) {
    return (
      <section
        className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
        aria-label="Root cause analysis"
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-tight">Root Cause Analysis</h2>
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <span className="font-mono text-[11px] text-zinc-600 text-center">
            Select an incident from the feed<br />to view root cause analysis
          </span>
        </div>
      </section>
    )
  }

  const ev    = incident.evidence
  const conf  = ev.rootCauseConfidence
  const snaps = Object.entries(ev.allServicesSnapshot)

  // Build cascade chain: root → anomalous others
  const cascadeChain = [
    ev.rootCause,
    ...snaps
      .filter(([k, v]) => v.status === "anomalous" && k !== ev.rootCause)
      .map(([k]) => k),
  ]

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Root cause analysis"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Root Cause Analysis</h2>
        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          {incident.incidentId}
        </span>
      </div>

      {/* Root cause statement */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Primary Root Cause</span>
          <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold", CONF_COLOR[conf])}>
            {conf}
          </span>
        </div>
        <p className="font-mono text-[12px] font-semibold text-zinc-200">{ev.rootCause}</p>
      </div>

      {/* Cascade chain flow */}
      {cascadeChain.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Cascade Chain</span>
          <div className="flex items-center gap-1.5 flex-wrap rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2.5">
            {cascadeChain.map((svc, i) => (
              <span key={svc} className="flex items-center gap-1.5">
                <span className={cn(
                  "rounded border px-2 py-1 font-mono text-[10px] font-semibold",
                  i === 0
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : "border-amber-400/30 bg-amber-500/8 text-amber-300",
                )}>
                  {i === 0 && <span className="mr-1 text-[8px] opacity-70">ROOT</span>}
                  {svc}
                </span>
                {i < cascadeChain.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evidence table */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Statistical Evidence</span>
        <div className="grid grid-cols-2 gap-1.5">
          <EvidenceCard label="Baseline Mean"  value={`${ev.baselineMeanMs.toFixed(1)}ms`} />
          <EvidenceCard label="Current P99"    value={`${ev.currentP99Ms}ms`}  highlight />
          <EvidenceCard label="Std Deviation"  value={`±${ev.baselineStdDev.toFixed(1)}ms`} />
          <EvidenceCard label="Deviation"      value={`${ev.deviationFactor.toFixed(1)}× baseline`} highlight />
        </div>
      </div>

      {/* All services snapshot */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] text-zinc-600 uppercase tracking-wider">Services Snapshot</span>
        <div className="flex flex-col gap-1">
          {snaps.map(([svc, snap]) => (
            <div
              key={svc}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                SNAP_COLOR[snap.status],
              )}
            >
              <span className="font-mono text-[10px] font-medium">{svc}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[9px] opacity-70">
                  <AnimatedNumber value={snap.currentP99Ms} />ms
                </span>
                <span className="font-mono text-[9px] opacity-70">
                  <AnimatedNumber value={snap.zScore} decimals={1} />σ
                </span>
                <span className={cn(
                  "rounded border px-1 py-0.5 font-mono text-[8px] uppercase font-semibold",
                  snap.status === "anomalous"
                    ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                    : snap.status === "normal"
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                      : "border-zinc-600/20 text-zinc-500",
                )}>
                  {snap.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function EvidenceCard({
  label, value, highlight = false,
}: {
  label: string; value: string; highlight?: boolean
}) {
  return (
    <div className={cn(
      "flex flex-col gap-0.5 rounded-lg border p-2.5",
      highlight
        ? "border-rose-500/20 bg-rose-500/5"
        : "border-white/[0.04] bg-white/[0.01]",
    )}>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className={cn("font-mono text-[12px] font-semibold", highlight ? "text-rose-300" : "text-zinc-300")}>
        {value}
      </span>
    </div>
  )
}
