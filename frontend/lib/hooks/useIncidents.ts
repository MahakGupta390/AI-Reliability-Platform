// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useIncidents.ts
//
// Polls /api/incidents every 10 seconds.
// Used by: AiGuardian (insights mode) + ActivityFeed (activity mode)
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr"
import type { NormalisedIncident, ActivityItem } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useInsights() {
  const { data, error, isLoading } = useSWR<NormalisedIncident[]>(
    "/api/incidents?mode=insights",
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
  return { insights: data ?? [], error, isLoading }
}

export function useActivity() {
  const { data, error, isLoading } = useSWR<ActivityItem[]>(
    "/api/incidents?mode=activity",
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )
  return { activity: data ?? [], error, isLoading }
}
