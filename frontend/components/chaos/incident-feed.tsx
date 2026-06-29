"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/incident-feed.tsx  [NEW]
// Scrollable list of all incidents from MongoDB — expand any row for evidence.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react"
import { useState } from "react"
import type { IncidentDetail } from "@/lib/types"
import { ActivitySkeleton, ErrorBanner } from "@/components/skeletons"

const SEV_DOT: Record<string, string> = {
  critical: "bg-rose-500 ring-rose-500/25",
  high:     "bg-rose-400 ring-rose-400/20",
  medium:   "bg-amber-400 ring-amber-400/20",
  low:      "bg-zinc-500  ring-zinc-500/10",
}

const SEV_BADGE: Record<string, string> = {
  critical: "text-rose-400 bg-rose-500/10 border-rose-500/30",
  high:     "text-rose-300 bg-rose-400/10 border-rose-400/25",
  medium:   "text-amber-400 bg-amber-500/10 border-amber-400/30",
  low:      "text-zinc-400 bg-zinc-800/40 border-zinc-600/20",
}

export function IncidentFeed({
  incidents,
  isLoading,
  error,
  onSelect,
}: {
  incidents: IncidentDetail[]
  isLoading: boolean
  error: unknown
  onSelect: (inc: IncidentDetail) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <section
      className="flex h-full flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5 overflow-hidden"
      aria-label="Incident feed"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2">
        <AlertCircle className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Incident Feed</h2>
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          {incidents.filter((i) => i.status === "open").length} open
          {" · "}
          {incidents.length} total
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <ActivitySkeleton />
      ) : error ? (
        <ErrorBanner message="AI service unreachable — incident feed unavailable" />
      ) : incidents.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center">
            <CheckCircle2 className="h-6 w-6 text-emerald-400/40" />
            <span className="font-mono text-[11px] text-zinc-600">No incidents recorded</span>
            <span className="font-mono text-[10px] text-zinc-700">Inject a fault to generate one</span>
          </div>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5 overflow-y-auto min-h-0 flex-1 pr-1">
          {incidents.map((inc) => {
            const isOpen     = inc.status === "open"
            const isExpanded = expandedId === inc.id || expandedId === inc.incidentId

            return (
              <li key={inc.incidentId}>
                <button
                  className={cn(
                    "w-full rounded-lg border p-3 text-left transition-all duration-200",
                    isOpen
                      ? "border-rose-500/20 bg-rose-500/4 hover:bg-rose-500/7"
                      : "border-white/[0.04] bg-white/[0.01] hover:bg-white/[0.03]",
                  )}
                  onClick={() => {
                    setExpandedId(isExpanded ? null : inc.incidentId)
                    onSelect(inc)
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-start gap-2">
                    {/* Status dot */}
                    <span className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full ring-4",
                      SEV_DOT[inc.severity] ?? SEV_DOT.low,
                    )} />

                    <div className="flex-1 min-w-0">
                      {/* Top row */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold",
                          SEV_BADGE[inc.severity] ?? SEV_BADGE.low,
                        )}>
                          {inc.severity.toUpperCase()}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-500 truncate">
                          {inc.affectedService}
                        </span>
                        <span className="ml-auto shrink-0 flex items-center gap-1">
                          {isOpen ? (
                            <span className="flex items-center gap-1">
                              <span className="h-1 w-1 rounded-full bg-rose-500 animate-ping" />
                              <span className="font-mono text-[9px] text-rose-400">OPEN</span>
                            </span>
                          ) : (
                            <span className="font-mono text-[9px] text-emerald-400">RESOLVED</span>
                          )}
                        </span>
                      </div>

                      {/* Symptom */}
                      <p className="font-mono text-[11px] text-zinc-300 leading-snug mb-1.5">
                        {inc.symptom}
                      </p>

                      {/* Meta row */}
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 font-mono text-[9px] text-zinc-600">
                          <Clock className="h-2.5 w-2.5" />
                          {inc.timeAgo}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-700">
                          {inc.durationLabel}
                        </span>
                        <span className="font-mono text-[9px] text-zinc-700">
                          {inc.evidence.zScore.toFixed(1)}σ
                        </span>
                      </div>

                      {/* Expanded evidence */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-col gap-2">
                          <CascadeChain chain={
                            [inc.evidence.rootCause,
                             ...Object.entries(inc.evidence.allServicesSnapshot)
                               .filter(([k, v]) => v.status === "anomalous" && k !== inc.evidence.rootCause)
                               .map(([k]) => k)]
                          } />
                          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
                            <EvidRow label="Root cause"  value={inc.evidence.rootCause} />
                            <EvidRow label="Confidence"  value={inc.evidence.rootCauseConfidence} />
                            <EvidRow label="Baseline"    value={`${inc.evidence.baselineMeanMs.toFixed(0)}ms`} />
                            <EvidRow label="Peak P99"    value={`${inc.peakP99Ms}ms`} />
                          </div>
                        </div>
                      )}
                    </div>

                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200 mt-0.5",
                        isExpanded ? "rotate-90" : "",
                      )}
                    />
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function CascadeChain({ chain }: { chain: string[] }) {
  if (chain.length === 0) return null
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="font-mono text-[9px] text-zinc-600 mr-1">cascade:</span>
      {chain.map((svc, i) => (
        <span key={svc} className="flex items-center gap-1">
          <span className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">{svc}</span>
          {i < chain.length - 1 && <span className="text-zinc-700 text-[9px]">→</span>}
        </span>
      ))}
    </div>
  )
}

function EvidRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className="font-mono text-[9px] text-zinc-400">{value}</span>
    </>
  )
}
