// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useIncidentHistory.ts  [MODIFIED — Screen 4 backend wiring]
//
// CHANGES:
//   1. useIncidentHistory now uses /api/incidents/search (server-side filtering)
//      instead of /api/incidents-raw (client-side filtering only)
//   2. Accepts optional filters param to pass to the search endpoint
//   3. useIncidentStats uses /api/incidents/stats (real MTTR from MongoDB)
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import type { BackendIncident, IncidentRow, IncidentStats, IncidentFilters } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

function formatDuration(ms: number | null): string {
  if (!ms) return "ongoing"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function toRow(raw: BackendIncident): IncidentRow {
  return {
    id:              raw._id,
    incidentId:      raw.incidentId,
    status:          raw.status,
    severity:        raw.severity,
    affectedService: raw.affectedService,
    symptom:         raw.symptom,
    detectedAt:      raw.detectedAt,
    resolvedAt:      raw.resolvedAt,
    durationLabel:   formatDuration(raw.durationMs),
    timeAgo:         timeAgo(raw.detectedAt),
    peakZScore:      raw.peakZScore,
    peakP99Ms:       raw.peakP99Ms,
    chaosInjected:   (raw as any).evidence?.chaosInjected ?? false,
    evidence: {
      rootCause:           raw.evidence.rootCause,
      rootCauseConfidence: raw.evidence.rootCauseConfidence,
      baselineMeanMs:      raw.evidence.baselineMeanMs,
      baselineStdDev:      raw.evidence.baselineStdDev,
      currentP99Ms:        raw.evidence.currentP99Ms,
      zScore:              raw.evidence.zScore,
      deviationFactor:     raw.evidence.deviationFactor,
      allServicesSnapshot: Object.fromEntries(
        Object.entries(raw.evidence.allServicesSnapshot ?? {})
      ),
    },
    timeline: raw.timeline ?? [],
  }
}

// Build search URL from filters — passes them server-side to ai-service
function buildSearchUrl(filters?: Partial<IncidentFilters>): string {
  const params = new URLSearchParams()
  params.set("limit", "200")

  if (filters?.status   && filters.status   !== "all") params.set("status",   filters.status)
  if (filters?.severity && filters.severity !== "all") params.set("severity", filters.severity)
  if (filters?.service  && filters.service  !== "all") params.set("service",  filters.service)
  if (filters?.search?.trim())                          params.set("q",        filters.search.trim())

  return `/api/incidents/search?${params.toString()}`
}

// ── useIncidentHistory ────────────────────────────────────────────────────────
// Server-side filtered + full-text searchable incident list.
// Passes filters to /api/incidents/search → ai-service MongoDB query.
export function useIncidentHistory(filters?: Partial<IncidentFilters>) {
  const url = buildSearchUrl(filters)

  const { data, error, isLoading, mutate } = useSWR<{ data: BackendIncident[]; total: number }>(
    url,
    fetcher,
    {
      refreshInterval: 15_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )

  const incidents: IncidentRow[] = (data?.data ?? []).map(toRow)

  return {
    incidents,
    total:     data?.total ?? 0,
    error,
    isLoading,
    refetch:   mutate,
  }
}

// ── useIncidentStats ──────────────────────────────────────────────────────────
// Real MTTR, MTTD, 14-day trend from MongoDB via ai-service.
export function useIncidentStats() {
  const { data, error, isLoading } = useSWR<{ success: boolean; stats: IncidentStats }>(
    "/api/incidents/stats",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      dedupingInterval: 15_000,
    },
  )

  return {
    stats:     data?.stats ?? null,
    error,
    isLoading,
  }
}
