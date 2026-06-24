// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useAggregate.ts
//
// Polls /api/metrics/aggregate every 3 seconds.
// Used by: HealthHeader (metrics strip + health score)
//
// Falls back to sane defaults while loading so the header renders
// immediately with placeholder values rather than blank.
// ─────────────────────────────────────────────────────────────────────────────

import useSWR from "swr"
import type { AggregateMetrics } from "@/lib/types"

const FALLBACK: AggregateMetrics = {
  cpu: 0,
  memory: 0,
  rps: 0,
  p99: 0,
  errorRate: 0,
  healthScore: 98,
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

export function useAggregate() {
  const { data, error, isLoading } = useSWR<AggregateMetrics>(
    "/api/metrics/aggregate",
    fetcher,
    {
      refreshInterval: 3000,
      revalidateOnFocus: true,
      dedupingInterval: 2000,
      fallbackData: FALLBACK,
    },
  )

  return {
    metrics: data ?? FALLBACK,
    error,
    isLoading,
  }
}
