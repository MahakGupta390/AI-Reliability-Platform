// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useServices.ts
//
// Polls /api/services every 5 seconds and returns normalised ServiceData[].
// Used by: page.tsx (for downIds), ServiceCard, DependencyMap
//
// Returns THREE states every component must handle:
//   isLoading  → first fetch in-flight, show skeleton
//   error      → backend unreachable, show error banner
//   services   → live data, render normally
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr"
import type { ServiceData } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useServices() {
  const { data, error, isLoading, mutate } = useSWR<ServiceData[]>(
    "/api/services",
    fetcher,
    {
      refreshInterval: 5000,        // poll every 5s
      revalidateOnFocus: true,      // refresh when tab regains focus
      revalidateOnReconnect: true,  // refresh after network reconnect
      dedupingInterval: 2000,       // ignore duplicate calls within 2s
      onError: (err) => {
        console.warn("[useServices] fetch failed:", err.message)
      },
    },
  )

  // Derive which service IDs are currently down/degraded
  const downIds =
    data
      ?.filter((s) => s.status === "DOWN" || s.status === "DEGRADED")
      .map((s) => s.id) ?? []

  return {
    services: data ?? [],
    downIds,
    error,
    isLoading,
    refetch: mutate,
  }
}
