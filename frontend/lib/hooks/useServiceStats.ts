// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useServiceStats.ts  [NEW — Screen 3 backend wiring]
//
// Fetches MTTR, MTTD, severity breakdown from /api/service-stats/[id]
// Used by Screen 3 ServiceHero summary strip and IncidentTimeline header.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"

export type ServiceStats = {
  totalIncidents:    number
  openIncidents:     number
  resolvedIncidents: number
  mttrMs:            number | null
  mttrFormatted:     string
  mttdMs:            number | null
  mttdFormatted:     string
  bySeverity: {
    critical: number
    high:     number
    medium:   number
    low:      number
  }
  peakZScore: number
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useServiceStats(serviceId: string) {
  const { data, error, isLoading } = useSWR<{ success: boolean; stats: ServiceStats }>(
    serviceId ? `/api/service-stats/${serviceId}` : null,
    fetcher,
    {
      refreshInterval: 30_000,   // MTTR/MTTD doesn't change often
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
