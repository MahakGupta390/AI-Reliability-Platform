// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useTimeSeries.ts  [NEW — Screen 3 backend wiring]
//
// Fetches real bucketed time-series from /api/services/[id]/timeseries
// Used by MetricCharts component to replace mock-generated chart data
// with real P99/P95/RPS/errorRate values from the backend metricsStore.
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import type { TimeRange } from "@/lib/types"

export type TimeSeriesPoint = {
  timestamp:    string
  p99Ms:        number
  p95Ms:        number
  avgMs:        number
  rps:          number
  errorRate:    number
  requestCount: number
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

const RANGE_TO_WINDOW: Record<TimeRange, number> = {
  "15m": 15,
  "1h":  60,
  "6h":  360,
  "24h": 1440,
}

const RANGE_TO_BUCKETS: Record<TimeRange, number> = {
  "15m": 15,
  "1h":  30,
  "6h":  36,
  "24h": 48,
}

export function useTimeSeries(serviceId: string, range: TimeRange) {
  const window  = RANGE_TO_WINDOW[range]
  const buckets = RANGE_TO_BUCKETS[range]

  const { data, error, isLoading } = useSWR<{ series: TimeSeriesPoint[] }>(
    serviceId
      ? `/api/services/${serviceId}/timeseries?window=${window}&buckets=${buckets}`
      : null,
    fetcher,
    {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  )

  return {
    series:    data?.series ?? [],
    error,
    isLoading,
  }
}
