// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useSettings.ts  [NEW — Screen 5]
//
// Four hooks powering the Settings screen:
//   useBaselines()  — baseline mean/stdDev per service + mutate
//   useDetector()    — Z-score thresholds + poll interval + mutate
//   useRegistry()    — service registry with live health
//   useAuditLog()    — mock detector decision history (client-generated)
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import useSWR from "swr"
import { useCallback, useState } from "react"
import type { DetectorConfig, RegistryEntry, AuditLogEntry } from "@/lib/types"

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })

// ── Baselines ──────────────────────────────────────────────────────────────────
export type Baselines = Record<string, { meanP99: number; stdDev: number }>

export function useBaselines() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; baselines: Baselines }>(
    "/api/settings/baselines",
    fetcher,
    { revalidateOnFocus: false },
  )

  const [saving, setSaving] = useState<string | null>(null)

  const updateBaseline = useCallback(
    async (service: string, meanP99: number, stdDev: number) => {
      setSaving(service)
      try {
        await fetch("/api/settings/baselines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service, meanP99, stdDev }),
        })
        await mutate()
      } finally {
        setSaving(null)
      }
    },
    [mutate],
  )

  return {
    baselines: data?.baselines ?? {},
    error,
    isLoading,
    saving,
    updateBaseline,
  }
}

// ── Detector config ───────────────────────────────────────────────────────────
export function useDetector() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; detector: DetectorConfig }>(
    "/api/settings/detector",
    fetcher,
    { revalidateOnFocus: false },
  )

  const [saving, setSaving] = useState(false)

  const updateDetector = useCallback(
    async (patch: Partial<DetectorConfig>) => {
      setSaving(true)
      try {
        await fetch("/api/settings/detector", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        })
        await mutate()
      } finally {
        setSaving(false)
      }
    },
    [mutate],
  )

  return {
    detector: data?.detector ?? null,
    error,
    isLoading,
    saving,
    updateDetector,
  }
}

// ── Service registry ──────────────────────────────────────────────────────────
// CHANGED — Screen 5 backend wired: toggleMonitored now PATCHes the backend
// and persists via configStore/MongoDB instead of being client-state only.
export function useRegistry() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; services: RegistryEntry[] }>(
    "/api/settings/registry",
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: true },
  )

  const [toggling, setToggling] = useState<string | null>(null)

  const toggleMonitored = useCallback(
    async (id: string, monitored: boolean) => {
      setToggling(id)
      try {
        await fetch("/api/settings/registry", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, monitored }),
        })
        await mutate()
      } finally {
        setToggling(null)
      }
    },
    [mutate],
  )

  return {
    services: data?.services ?? [],
    error,
    isLoading,
    toggling,
    toggleMonitored,
  }
}

// ── Alert thresholds ──────────────────────────────────────────────────────────
// NEW — Screen 5 backend wired: AlertThresholds component was previously
// pure client-state with zero persistence. Now reads/writes via the new
// /config/alert-thresholds endpoints which persist to MongoDB.
export type AlertThresholdMap = Record<string, {
  p99WarnMs: number
  p99CriticalMs: number
  errorWarnPct: number
  errorCriticalPct: number
}>

export function useAlertThresholds() {
  const { data, error, isLoading, mutate } = useSWR<{ success: boolean; thresholds: AlertThresholdMap }>(
    "/api/settings/alert-thresholds",
    fetcher,
    { revalidateOnFocus: false },
  )

  const [saving, setSaving] = useState<string | null>(null)

  const updateThreshold = useCallback(
    async (
      service: string,
      threshold: { p99WarnMs: number; p99CriticalMs: number; errorWarnPct: number; errorCriticalPct: number },
    ) => {
      setSaving(service)
      try {
        await fetch("/api/settings/alert-thresholds", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service, ...threshold }),
        })
        await mutate()
      } finally {
        setSaving(null)
      }
    },
    [mutate],
  )

  return {
    thresholds: data?.thresholds ?? {},
    error,
    isLoading,
    saving,
    updateThreshold,
  }
}

// ── Audit log (client-side mock — no backend persistence yet) ────────────────
// Generates a realistic-looking decision log based on current Z-score config.
// In a future iteration this would read from a real detector decision log
// table that anomalyDetector.js writes to on every poll cycle.
export function useAuditLog(zScoreTrigger: number, zScoreResolve: number) {
  const services = ["auth-service", "payment-service", "order-service"]
  const decisions: AuditLogEntry["decision"][] = ["normal", "normal", "normal", "elevated", "anomalous", "recovered"]

  const entries: AuditLogEntry[] = Array.from({ length: 12 }, (_, i) => {
    const svc = services[i % services.length]
    const decision = decisions[Math.floor(Math.random() * decisions.length)]
    const zScore = decision === "anomalous" ? zScoreTrigger + Math.random() * 4
      : decision === "elevated" ? zScoreResolve + Math.random() * (zScoreTrigger - zScoreResolve)
      : Math.random() * zScoreResolve

    const baseP99 = svc === "payment-service" ? 250 : svc === "order-service" ? 400 : 150
    const p99Ms = Math.round(baseP99 + zScore * 30)

    const actionMap: Record<string, string> = {
      normal:    "Within baseline — no action",
      elevated:  "Z-score elevated but below trigger threshold — monitoring",
      anomalous: "Threshold exceeded — incident created",
      recovered: "Z-score returned below resolve threshold — incident closed",
    }

    return {
      id: `audit-${i}`,
      timestamp: new Date(Date.now() - i * 10_000).toISOString(),
      service: svc,
      p99Ms,
      zScore: parseFloat(zScore.toFixed(2)),
      decision,
      action: actionMap[decision],
    }
  })

  return { entries }
}
