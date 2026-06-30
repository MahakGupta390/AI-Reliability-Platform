"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/incidents/incident-table.tsx  [NEW — Screen 4]
// Sortable, expandable incident table.
// Each row expands to show evidence + cascade chain + timeline inline.
// Clicking a row also populates the PostmortemDrawer on the right.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import {
  ChevronRight, ArrowRight, Clock,
  ChevronUp, ChevronDown, ChevronsUpDown,
  AlertTriangle, Radiation,
} from "lucide-react"
import { useState } from "react"
import type { IncidentRow } from "@/lib/types"
import { ActivitySkeleton, ErrorBanner, TableSkeleton } from "@/components/skeletons"

const SEV_DOT: Record<string, string> = {
  critical: "bg-rose-500  ring-rose-500/25",
  high:     "bg-rose-400  ring-rose-400/20",
  medium:   "bg-amber-400 ring-amber-400/20",
  low:      "bg-zinc-500  ring-zinc-500/10",
}

const SEV_BADGE: Record<string, string> = {
  critical: "text-rose-400  bg-rose-500/10  border-rose-500/30",
  high:     "text-rose-300  bg-rose-400/10  border-rose-400/25",
  medium:   "text-amber-400 bg-amber-500/10 border-amber-400/30",
  low:      "text-zinc-400  bg-zinc-800/40  border-zinc-600/20",
}

type SortKey = "detectedAt" | "severity" | "peakZScore" | "durationLabel"
type SortDir = "asc" | "desc"

const SEV_ORDER = { critical: 4, high: 3, medium: 2, low: 1 }

function sortIncidents(
  rows: IncidentRow[],
  key: SortKey,
  dir: SortDir,
): IncidentRow[] {
  return [...rows].sort((a, b) => {
    let diff = 0
    if (key === "detectedAt") {
      diff = new Date(a.detectedAt).getTime() - new Date(b.detectedAt).getTime()
    } else if (key === "severity") {
      diff = (SEV_ORDER[a.severity] ?? 0) - (SEV_ORDER[b.severity] ?? 0)
    } else if (key === "peakZScore") {
      diff = a.peakZScore - b.peakZScore
    } else if (key === "durationLabel") {
      diff = (a.durationLabel === "ongoing" ? 999999 : 0) -
             (b.durationLabel === "ongoing" ? 999999 : 0)
    }
    return dir === "asc" ? diff : -diff
  })
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-zinc-700" />
  return dir === "asc"
    ? <ChevronUp   className="h-3 w-3 text-cyan-400" />
    : <ChevronDown className="h-3 w-3 text-cyan-400" />
}

function ExpandedEvidence({ row }: { row: IncidentRow }) {
  const snaps   = Object.entries(row.evidence.allServicesSnapshot ?? {})
  const cascade = snaps
    .filter(([, v]) => v.status === "anomalous")
    .map(([k]) => k)

  return (
    <div className="px-4 pb-4 pt-0">
      <div className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-4 flex flex-col gap-4">

        {/* Evidence stats grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { l: "Root Cause",      v: row.evidence.rootCause },
            { l: "Confidence",      v: row.evidence.rootCauseConfidence },
            { l: "Baseline P99",    v: `${row.evidence.baselineMeanMs.toFixed(0)}ms` },
            { l: "Peak P99",        v: `${row.peakP99Ms}ms` },
            { l: "Z-Score",         v: `${row.evidence.zScore.toFixed(2)}σ` },
            { l: "Deviation",       v: `${row.evidence.deviationFactor.toFixed(1)}×` },
            { l: "Std Dev",         v: `±${row.evidence.baselineStdDev.toFixed(1)}ms` },
            { l: "Duration",        v: row.durationLabel },
          ].map(({ l, v }) => (
            <div key={l} className="flex flex-col gap-0.5">
              <span className="font-mono text-[9px] text-zinc-600">{l}</span>
              <span className="font-mono text-[11px] font-semibold text-zinc-300">{v}</span>
            </div>
          ))}
        </div>

        {/* Cascade chain */}
        {cascade.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              Cascade Chain
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {[row.evidence.rootCause, ...cascade.filter(s => s !== row.evidence.rootCause)].map((svc, i, arr) => (
                <span key={svc} className="flex items-center gap-1.5">
                  <span className={cn(
                    "rounded border px-2 py-1 font-mono text-[10px] font-semibold",
                    i === 0
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
                      : "border-amber-400/25 bg-amber-500/8 text-amber-300",
                  )}>
                    {i === 0 && <span className="mr-1 text-[8px] opacity-60">ROOT</span>}
                    {svc}
                  </span>
                  {i < arr.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-zinc-600 shrink-0" />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Timeline — last 5 events */}
        {row.timeline.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              Timeline
            </span>
            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
              {row.timeline.slice(-5).reverse().map((e, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Clock className="h-3 w-3 text-zinc-600 mt-0.5 shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-mono text-[9px] text-zinc-600">
                      {new Date(e.at).toLocaleTimeString("en-US", { hour12: false })}
                      {e.zScore !== undefined && ` · ${e.zScore.toFixed(1)}σ`}
                    </span>
                    <span className="font-mono text-[10px] text-zinc-400">{e.event}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

type Props = {
  incidents: IncidentRow[]
  isLoading: boolean
  error: unknown
  selectedId: string | null
  onSelect: (row: IncidentRow) => void
}

export function IncidentTable({ incidents, isLoading, error, selectedId, onSelect }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("detectedAt")
  const [sortDir, setSortDir] = useState<SortDir>("desc")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else { setSortKey(key); setSortDir("desc") }
  }

  const sorted = sortIncidents(incidents, sortKey, sortDir)

  if (isLoading) return <TableSkeleton />

  if (error) return (
    <div className="rounded-xl border border-white/[0.04] bg-black p-5">
      <ErrorBanner message="Could not load incident history — AI service unreachable" />
    </div>
  )

  if (sorted.length === 0) return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.04] bg-black py-16">
      <AlertTriangle className="h-8 w-8 text-zinc-700" />
      <span className="font-mono text-sm text-zinc-500">No incidents match the current filters</span>
    </div>
  )

  return (
    <div className="rounded-xl border border-white/[0.04] bg-black overflow-hidden">
      {/* Table header */}
      <div className="grid grid-cols-[16px_140px_1fr_100px_80px_80px_90px] items-center gap-3 border-b border-white/[0.04] bg-white/[0.01] px-4 py-2.5">
        <span />
        <ColHeader label="Service"   sortKey="severity"    current={sortKey} dir={sortDir} onSort={() => toggle("severity")} />
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Symptom</span>
        <ColHeader label="Detected"  sortKey="detectedAt"  current={sortKey} dir={sortDir} onSort={() => toggle("detectedAt")} />
        <ColHeader label="Z-Score"   sortKey="peakZScore"  current={sortKey} dir={sortDir} onSort={() => toggle("peakZScore")} />
        <ColHeader label="Duration"  sortKey="durationLabel" current={sortKey} dir={sortDir} onSort={() => toggle("durationLabel")} />
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 text-right">Status</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-white/[0.03]">
        {sorted.map((row) => {
          const isSelected = selectedId === row.incidentId
          const isExpanded = expandedId === row.incidentId
          const isOpen     = row.status === "open"

          return (
            <div key={row.incidentId}>
              {/* Main row */}
              <div
                className={cn(
                  "grid grid-cols-[16px_140px_1fr_100px_80px_80px_90px] items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150",
                  isSelected
                    ? "bg-cyan-500/5 border-l-2 border-cyan-500/50"
                    : "hover:bg-white/[0.02]",
                  isOpen && !isSelected ? "bg-rose-500/3" : "",
                )}
                onClick={() => {
                  onSelect(row)
                  setExpandedId(isExpanded ? null : row.incidentId)
                }}
                role="row"
                aria-expanded={isExpanded}
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSelect(row)}
              >
                {/* Severity dot */}
                <span className={cn("h-2 w-2 rounded-full ring-4 shrink-0", SEV_DOT[row.severity])} />

                {/* Service + severity badge */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[8px] font-semibold",
                      SEV_BADGE[row.severity],
                    )}>
                      {row.severity.toUpperCase()}
                    </span>
                    {row.chaosInjected && (
                      <Radiation className="h-3 w-3 text-violet-400" title="Chaos experiment" />
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 truncate">
                    {row.affectedService}
                  </span>
                </div>

                {/* Symptom */}
                <span className="font-mono text-[11px] text-zinc-300 leading-snug truncate">
                  {row.symptom}
                </span>

                {/* Detected */}
                <span className="font-mono text-[10px] text-zinc-600">{row.timeAgo}</span>

                {/* Z-score */}
                <span className={cn(
                  "font-mono text-[11px] font-semibold tabular-nums",
                  row.peakZScore >= 6 ? "text-rose-400" :
                  row.peakZScore >= 3 ? "text-amber-400" :
                  "text-zinc-400",
                )}>
                  {row.peakZScore.toFixed(1)}σ
                </span>

                {/* Duration */}
                <span className="font-mono text-[10px] text-zinc-500">
                  {row.durationLabel}
                </span>

                {/* Status */}
                <div className="flex items-center justify-end gap-1.5">
                  {isOpen ? (
                    <span className="flex items-center gap-1 font-mono text-[9px] font-semibold text-rose-400">
                      <span className="h-1 w-1 animate-ping rounded-full bg-rose-500" />
                      OPEN
                    </span>
                  ) : (
                    <span className="font-mono text-[9px] font-semibold text-emerald-400">
                      RESOLVED
                    </span>
                  )}
                  <ChevronRight className={cn(
                    "h-3.5 w-3.5 text-zinc-600 transition-transform duration-150",
                    isExpanded ? "rotate-90" : "",
                  )} />
                </div>
              </div>

              {/* Expanded evidence panel */}
              {isExpanded && <ExpandedEvidence row={row} />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ColHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir; onSort: () => void
}) {
  const active = current === sortKey
  return (
    <button
      onClick={onSort}
      className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors w-fit"
    >
      {label}
      <SortIcon active={active} dir={dir} />
    </button>
  )
}
