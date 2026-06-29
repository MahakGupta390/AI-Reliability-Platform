// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useIncidentDetail.ts  [NEW]
//
// Fetches full incident list for Screen 2 — richer than useIncidents
// because Screen 2 shows raw evidence, timelines, and cascade chains.
// Polls every 8 seconds.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import type { BackendIncident, IncidentDetail } from "@/lib/types"

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
  const rem = s % 60
  return `${m}m ${rem}s`
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function enrich(raw: BackendIncident): IncidentDetail {
  return {
    ...raw,
    durationLabel: formatDuration(raw.durationMs),
    timeAgo: timeAgo(raw.detectedAt),
  }
}

export function useIncidentDetail() {
  const { data, error, isLoading, mutate } = useSWR<{ data: BackendIncident[] }>(
    `${process.env.NEXT_PUBLIC_AI_URL ?? ""}/api/incidents-raw`,
    fetcher,
    {
      refreshInterval: 8000,
      revalidateOnFocus: true,
      dedupingInterval: 4000,
    },
  )

  const incidents: IncidentDetail[] = (data?.data ?? []).map(enrich)
  const open     = incidents.filter((i) => i.status === "open")
  const resolved = incidents.filter((i) => i.status === "resolved")

  return { incidents, open, resolved, error, isLoading, refetch: mutate }
}
