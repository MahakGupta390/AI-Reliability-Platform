"use client"
// ─────────────────────────────────────────────────────────────────────────────
// app/incidents/page.tsx  [MODIFIED — Screen 4 backend wiring]
//
// CHANGES:
//   1. Filters now passed to useIncidentHistory() — server-side via MongoDB
//      (was client-side Array.filter on all 200 incidents in memory)
//   2. Debounce on search input so we don't fire a request on every keystroke
//   3. Resolve/acknowledge now use ?action= param on /api/incidents/[id]
//      which routes to the correct dedicated backend endpoint
//   4. FilterBar total/filtered counts now come from server response
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState, useEffect, useRef } from "react"
import { HealthHeader }         from "@/components/health-header"
import { StatsBar }             from "@/components/incidents/stats-bar"
import { MttrChart }            from "@/components/incidents/mttr-chart"
import { FilterBar }            from "@/components/incidents/filter-bar"
import { IncidentTable }        from "@/components/incidents/incident-table"
import { PostmortemDrawer }     from "@/components/incidents/postmortem-drawer"
import { useIncidentHistory, useIncidentStats } from "@/lib/hooks/useIncidentHistory"
import type { IncidentFilters, IncidentRow } from "@/lib/types"

const DEFAULT_FILTERS: IncidentFilters = {
  status:   "all",
  severity: "all",
  service:  "all",
  search:   "",
}

export default function IncidentsPage() {
  const [filters, setFilters]     = useState<IncidentFilters>(DEFAULT_FILTERS)
  const [debouncedFilters, setDebouncedFilters] = useState<IncidentFilters>(DEFAULT_FILTERS)
  const [selected, setSelected]   = useState<IncidentRow | null>(null)
  const debounceRef               = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce text search — wait 400ms after typing stops before fetching
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedFilters(filters)
    }, 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [filters])

  // CHANGED: pass debouncedFilters to hook — server-side MongoDB filtering
  const { incidents, total, error, isLoading, refetch } = useIncidentHistory(debouncedFilters)
  const { stats } = useIncidentStats()

  const updateFilters = useCallback((partial: Partial<IncidentFilters>) => {
    setFilters(prev => ({ ...prev, ...partial }))
  }, [])

  // CHANGED: uses ?action=resolve → PATCH /api/incidents/[id]?action=resolve
  // → ai-service PATCH /incidents/:id/resolve (dedicated endpoint)
  const handleResolve = useCallback(async (incidentId: string) => {
    await fetch(`/api/incidents/${encodeURIComponent(incidentId)}?action=resolve`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ resolvedBy: "aegis-dashboard" }),
    })
    refetch()
    setSelected(null)
  }, [refetch])

  // CHANGED: uses ?action=acknowledge → dedicated endpoint
  const handleAcknowledge = useCallback(async (incidentId: string) => {
    await fetch(`/api/incidents/${encodeURIComponent(incidentId)}?action=acknowledge`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ acknowledgedBy: "aegis-dashboard" }),
    })
    refetch()
  }, [refetch])

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <h1 className="font-mono text-base font-bold tracking-tight text-zinc-100">
                Incident History
              </h1>
              <p className="font-mono text-[11px] text-zinc-600">
                All incidents · MTTR analytics · AI postmortem generation
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-white/[0.04] bg-black px-3 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              <span className="font-mono text-[10px] text-zinc-500">live · syncs every 15s</span>
            </div>
          </div>

          {/* KPI stats bar */}
          <StatsBar stats={stats} />

          {/* 2-column content */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-start">

            {/* LEFT */}
            <div className="flex flex-col gap-4">
              <MttrChart stats={stats} />

              {/* CHANGED: filtered count from server response, not client filter */}
              <FilterBar
                filters={filters}
                onChange={updateFilters}
                total={total}
                filtered={incidents.length}
              />

              <IncidentTable
                incidents={incidents}
                isLoading={isLoading}
                error={error}
                selectedId={selected?.incidentId ?? null}
                onSelect={setSelected}
              />
            </div>

            {/* RIGHT — sticky postmortem drawer */}
            <div className="lg:sticky lg:top-[120px] flex flex-col">
              <PostmortemDrawer
                incident={selected}
                onResolve={handleResolve}
                onAcknowledge={handleAcknowledge}
                onClose={() => setSelected(null)}
              />
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
