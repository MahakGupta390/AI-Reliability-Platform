"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/incident-timeline.tsx  [NEW — Screen 3]
//
// All incidents for this service from MongoDB as a visual swimlane timeline.
// Each incident is a horizontal bar with severity color, symptom, and duration.
// Clicking one opens a details accordion with evidence + Z-score.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { History, ChevronRight, AlertCircle } from "lucide-react"
import { useState } from "react"
import { useServiceIncidents } from "@/lib/hooks/useServiceIncidents"
import { ActivitySkeleton, ErrorBanner } from "@/components/skeletons"
import type { ServiceIncident } from "@/lib/types"

const SEV_CONFIG: Record<string, {
  bar: string; dot: string; badge: string; label: string
}> = {
  critical: {
    bar:   "bg-rose-500/80",
    dot:   "bg-rose-500 ring-rose-500/25",
    badge: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    label: "CRITICAL",
  },
  high: {
    bar:   "bg-rose-400/60",
    dot:   "bg-rose-400 ring-rose-400/20",
    badge: "text-rose-300 bg-rose-400/10 border-rose-400/25",
    label: "HIGH",
  },
  medium: {
    bar:   "bg-amber-400/60",
    dot:   "bg-amber-400 ring-amber-400/20",
    badge: "text-amber-300 bg-amber-500/10 border-amber-400/30",
    label: "MEDIUM",
  },
  low: {
    bar:   "bg-zinc-500/40",
    dot:   "bg-zinc-500 ring-zinc-500/10",
    badge: "text-zinc-400 bg-zinc-800/40 border-zinc-600/20",
    label: "LOW",
  },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  })
}

function IncidentRow({ incident }: { incident: ServiceIncident }) {
  const [open, setOpen] = useState(false)
  const cfg = SEV_CONFIG[incident.severity] ?? SEV_CONFIG.low

  return (
    <li>
      <button
        className="w-full rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-left transition-all duration-150 hover:bg-white/[0.03]"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className="flex items-start gap-3">
          {/* Severity dot + vertical line */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-4", cfg.dot)} />
          </div>

          <div className="flex-1 min-w-0">
            {/* Top row */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold", cfg.badge)}>
                {cfg.label}
              </span>
              <span className={cn(
                "font-mono text-[9px] uppercase font-semibold",
                incident.status === "open" ? "text-rose-400" : "text-emerald-400",
              )}>
                {incident.status}
              </span>
              <span className="ml-auto font-mono text-[9px] text-zinc-600 shrink-0">
                {formatDate(incident.detectedAt)}
              </span>
            </div>

            {/* Symptom */}
            <p className="font-mono text-[11px] text-zinc-300 leading-snug mb-2">
              {incident.symptom}
            </p>

            {/* Stat bar */}
            <div className="flex items-center gap-3 mb-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                <div
                  className={cn("h-full rounded-full", cfg.bar)}
                  style={{ width: `${Math.min(100, (incident.peakZScore / 10) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[9px] text-zinc-500 shrink-0">
                peak {incident.peakZScore.toFixed(1)}σ
              </span>
            </div>

            {/* Meta */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-[9px] text-zinc-600">
                duration <span className="text-zinc-400">{incident.durationLabel}</span>
              </span>
              <span className="font-mono text-[9px] text-zinc-600">
                peak P99 <span className="text-zinc-400">{incident.peakP99Ms}ms</span>
              </span>
            </div>

            {/* Expanded detail */}
            {open && (
              <div className="mt-3 pt-3 border-t border-white/[0.05] grid grid-cols-2 gap-x-4 gap-y-1">
                <DetailRow label="Incident ID" value={incident.incidentId} />
                <DetailRow label="Detected"    value={formatDate(incident.detectedAt)} />
                {incident.resolvedAt && (
                  <DetailRow label="Resolved" value={formatDate(incident.resolvedAt)} />
                )}
                <DetailRow label="Peak Z-Score" value={`${incident.peakZScore.toFixed(2)}σ`} />
                <DetailRow label="Peak P99"     value={`${incident.peakP99Ms}ms`} />
              </div>
            )}
          </div>

          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 text-zinc-600 transition-transform duration-200 shrink-0 mt-1",
              open ? "rotate-90" : "",
            )}
          />
        </div>
      </button>
    </li>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className="font-mono text-[9px] text-zinc-400">{value}</span>
    </>
  )
}

export function IncidentTimeline({ serviceId }: { serviceId: string }) {
  const { incidents, isLoading, error } = useServiceIncidents(serviceId)
  const open     = incidents.filter((i) => i.status === "open")
  const resolved = incidents.filter((i) => i.status === "resolved")

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Incident history timeline"
    >
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Incident History</h2>
        <div className="ml-auto flex items-center gap-2">
          {open.length > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-rose-500/20 bg-rose-500/8 px-2 py-0.5">
              <span className="h-1 w-1 animate-ping rounded-full bg-rose-500" />
              <span className="font-mono text-[9px] text-rose-400">{open.length} open</span>
            </span>
          )}
          <span className="font-mono text-[10px] text-zinc-600">{incidents.length} total</span>
        </div>
      </div>

      {isLoading ? (
        <ActivitySkeleton />
      ) : error ? (
        <ErrorBanner message="Could not load incident history" />
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8">
          <AlertCircle className="h-6 w-6 text-emerald-400/30" />
          <span className="font-mono text-[11px] text-zinc-600">No incidents for this service</span>
        </div>
      ) : (
        <ol className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
          {incidents.map((inc) => (
            <IncidentRow key={inc.incidentId} incident={inc} />
          ))}
        </ol>
      )}
    </section>
  )
}
