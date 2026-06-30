// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useServiceIncidents.ts  [NEW — Screen 3]
//
// Fetches incident history for one service from /api/incidents-raw
// Used by the IncidentTimeline component on Screen 3.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import type { BackendIncident, ServiceIncident } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

// Map service UI id → backend service name
const ID_TO_SERVICE: Record<string, string> = {
  auth:     "auth-service",
  payments: "payment-service",
  orders:   "order-service",
}

function formatDuration(ms: number | null): string {
  if (!ms) return "ongoing"
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}

function enrich(raw: BackendIncident): ServiceIncident {
  return {
    incidentId:    raw.incidentId,
    severity:      raw.severity,
    symptom:       raw.symptom,
    detectedAt:    raw.detectedAt,
    resolvedAt:    raw.resolvedAt,
    durationLabel: formatDuration(raw.durationMs),
    status:        raw.status,
    peakZScore:    raw.peakZScore,
    peakP99Ms:     raw.peakP99Ms,
  }
}

export function useServiceIncidents(serviceId: string) {
  const backendName = ID_TO_SERVICE[serviceId] ?? serviceId
  const { data, error, isLoading } = useSWR<{ data: BackendIncident[] }>(
    serviceId
      ? `/api/incidents-raw?service=${encodeURIComponent(backendName)}&limit=30`
      : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  )

  const incidents: ServiceIncident[] = (data?.data ?? []).map(enrich)

  return { incidents, error, isLoading }
}
