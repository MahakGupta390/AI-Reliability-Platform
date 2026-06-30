// ─────────────────────────────────────────────────────────────────────────────
// lib/hooks/useChaos.ts  [NEW]
//
// Manages the entire chaos experiment state for Screen 2.
// Keeps local knob state + fires POST /api/chaos when user detonates.
// Falls back gracefully if backend is unreachable (frontend-only mode).
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import { useState, useCallback } from "react"
import type { ChaosConfig } from "@/lib/types"

export type KnobState = {
  highLatency: boolean
  failureRate: number     // 0-100
  timeoutMode: boolean
}

export type ExperimentStatus = "idle" | "running" | "restoring"

const DEFAULT_KNOBS: KnobState = {
  highLatency: false,
  failureRate: 0,
  timeoutMode: false,
}

const SERVICE_IDS = ["auth", "payments", "orders"] as const

export function useChaos() {
  // Per-service knob state — keyed by serviceId
  const [knobs, setKnobs] = useState<Record<string, KnobState>>({
    auth:     { ...DEFAULT_KNOBS },
    payments: { ...DEFAULT_KNOBS },
    orders:   { ...DEFAULT_KNOBS },
  })

  const [status, setStatus]           = useState<ExperimentStatus>("idle")
  const [error, setError]             = useState<string | null>(null)
  const [frontendOnly, setFrontendOnly] = useState(false)

  // IDs of services currently in chaos (used to drive DependencyMap)
  const activeIds = Object.entries(knobs)
    .filter(([, k]) => k.highLatency || k.failureRate > 0 || k.timeoutMode)
    .map(([id]) => id)

  // Update one knob for one service
  const setKnob = useCallback(
    (serviceId: string, field: keyof KnobState, value: boolean | number) => {
      setKnobs((prev) => ({
        ...prev,
        [serviceId]: { ...prev[serviceId], [field]: value },
      }))
    },
    [],
  )

  // Fire chaos at all configured services
  const detonate = useCallback(async () => {
    const targets = Object.entries(knobs).filter(
      ([, k]) => k.highLatency || k.failureRate > 0 || k.timeoutMode,
    )

    if (targets.length === 0) {
      setError("Configure at least one fault before detonating.")
      return
    }

    setStatus("running")
    setError(null)
    setFrontendOnly(false)

    const results = await Promise.allSettled(
      targets.map(([id, k]) =>
        fetch("/api/chaos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            serviceId: id,
            highLatency: k.highLatency,
            failureRate: k.failureRate,
            timeoutMode: k.timeoutMode,
          } satisfies ChaosConfig),
        }).then((r) => r.json()),
      ),
    )

    // If any call flagged frontendOnly, show the warning banner
    const anyFrontendOnly = results.some(
      (r) => r.status === "fulfilled" && r.value.frontendOnly,
    )
    if (anyFrontendOnly) setFrontendOnly(true)
  }, [knobs])

  // Restore everything
  const restoreAll = useCallback(async () => {
    setStatus("restoring")
    setError(null)

    await fetch("/api/chaos", { method: "DELETE" })

    // Reset all knobs to default
    setKnobs(
      Object.fromEntries(SERVICE_IDS.map((id) => [id, { ...DEFAULT_KNOBS }])),
    )
    setStatus("idle")
    setFrontendOnly(false)
  }, [])

  const isRunning  = status === "running"
  const isRestoring = status === "restoring"

  return {
    knobs,
    setKnob,
    detonate,
    restoreAll,
    isRunning,
    isRestoring,
    activeIds,
    error,
    frontendOnly,
    status,
  }
}
