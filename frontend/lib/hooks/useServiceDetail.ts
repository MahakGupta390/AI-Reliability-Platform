// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useServiceDetail.ts  [NEW — Screen 3]
//
// Polls /api/services/[id] every 5 seconds.
// Used by every component on Screen 3.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import type { ServiceDetail } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useServiceDetail(id: string) {
  const { data, error, isLoading, mutate } = useSWR<ServiceDetail>(
    id ? `/api/services/${id}` : null,
    fetcher,
    {
      refreshInterval: 5000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
    },
  )

  return { detail: data ?? null, error, isLoading, refetch: mutate }
}
