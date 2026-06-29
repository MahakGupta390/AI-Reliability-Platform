"use client"
// ─────────────────────────────────────────────────────────────────────────────
// app/chaos/page.tsx  [NEW]  — Screen 2: Chaos Lab & Incident Command Center
//
// Layout (2-column, same grid as Screen 1):
//
// LEFT  (flex-col):
//   1. ExperimentForge   — knobs + detonate button
//   2. BlastRadius       — animated topology, flex-1 grows
//   3. MetricsComparison — before/after sparklines
//
// RIGHT (flex-col):
//   1. IncidentCommand   — pinned command card (only when open incidents exist)
//   2. IncidentFeed      — scrollable list, flex-1
//   3. RootCausePanel    — evidence for selected incident
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from "react"
import { HealthHeader } from "@/components/health-header"
import { ExperimentForge } from "@/components/chaos/experiment-forge"
import { BlastRadius } from "@/components/chaos/blast-radius"
import { MetricsComparison } from "@/components/chaos/metrics-comparison"
import { IncidentCommand } from "@/components/chaos/incident-command"
import { IncidentFeed } from "@/components/chaos/incident-feed"
import { RootCausePanel } from "@/components/chaos/root-cause-panel"
import { useChaos } from "@/lib/hooks/useChaos"
import { useIncidentDetail } from "@/lib/hooks/useIncidentDetail"
import type { IncidentDetail } from "@/lib/types"

export default function ChaosPage() {
  const chaos   = useChaos()
  const detail  = useIncidentDetail()
  const [selectedIncident, setSelectedIncident] = useState<IncidentDetail | null>(null)

  // When a new open incident arrives and nothing is selected, auto-select it
  const firstOpen = detail.open[0] ?? null

  const handleResolve = useCallback(async (incidentId: string) => {
    await fetch("/api/incidents-raw", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incidentId, status: "resolved" }),
    })
    detail.refetch()
    setSelectedIncident(null)
  }, [detail])

  const handleAcknowledge = useCallback(async (incidentId: string) => {
    // Acknowledge = keep open but mark seen (backend may not support this yet)
    // For now just trigger a refetch to show fresh state
    detail.refetch()
  }, [detail])

  // Merge chaos activeIds with real downIds from incidents
  const combinedDownIds = Array.from(
    new Set([
      ...chaos.activeIds,
      ...detail.open.map((i) => {
        // Map affectedService name → serviceId
        const svc = i.affectedService
        if (svc.includes("auth"))    return "auth"
        if (svc.includes("payment")) return "payments"
        if (svc.includes("order"))   return "orders"
        return svc
      }),
    ]),
  )

  const commandIncident = selectedIncident ?? firstOpen

  return (
    <div
      className={
        chaos.isRunning && chaos.activeIds.length > 0
          ? "min-h-svh bg-black transition-all duration-1000 [background-image:radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(220,38,38,0.07),transparent)]"
          : "min-h-svh bg-black"
      }
    >
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">

          {/* ── LEFT column ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* 1 — Experiment Forge */}
            <ExperimentForge
              knobs={chaos.knobs}
              onKnob={chaos.setKnob}
              onDetonate={chaos.detonate}
              onRestoreAll={chaos.restoreAll}
              status={chaos.status}
              error={chaos.error}
              frontendOnly={chaos.frontendOnly}
            />

            {/* 2 — Blast Radius visualiser */}
            <BlastRadius
              downIds={combinedDownIds}
              isRunning={chaos.isRunning}
            />

            {/* 3 — Metrics comparison strip */}
            <MetricsComparison activeIds={chaos.activeIds} />
          </div>

          {/* ── RIGHT column ────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* 1 — Active incident command card (only when open incident exists) */}
            {commandIncident && (
              <IncidentCommand
                incident={commandIncident}
                onAcknowledge={handleAcknowledge}
                onResolve={handleResolve}
              />
            )}

            {/* 2 — Incident feed (flex-1 when no command card) */}
            <div className={commandIncident ? "" : "flex-1"}>
              <IncidentFeed
                incidents={detail.incidents}
                isLoading={detail.isLoading}
                error={detail.error}
                onSelect={(inc) => setSelectedIncident(inc)}
              />
            </div>

            {/* 3 — Root cause panel for selected incident */}
            <RootCausePanel incident={selectedIncident ?? firstOpen} />
          </div>

        </div>
      </main>
    </div>
  )
}
