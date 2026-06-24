// ─────────────────────────────────────────────────────────────────────────────
// app/page.tsx   [MODIFIED]
//
// CHANGES:
//   1. Removed useState for downIds — now derived from useServices() hook
//   2. Removed SERVICES import from lib/services — live data from hook
//   3. Removed healthScore useMemo + PENALTY calculation — HealthHeader is now
//      self-contained (reads from useAggregate which includes healthScore)
//   4. HealthHeader no longer receives a `score` prop
//   5. ServiceCard no longer receives isDown prop — derived from service.status
//   6. ServiceCardSkeleton shown while services are loading
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import { HealthHeader } from "@/components/health-header"
import { DependencyMap } from "@/components/dependency-map"
import { ServiceCard } from "@/components/service-card"
import { ActivityFeed } from "@/components/activity-feed"
import { AiGuardian } from "@/components/ai-guardian"
import { ServiceCardSkeleton } from "@/components/skeletons"
import { useServices } from "@/lib/hooks/useServices"   // CHANGED: new hook

export default function Page() {
  // CHANGED: live services from backend, downIds auto-derived from status
  const { services, downIds, isLoading } = useServices()

  // Build a lookup map for DependencyMap tooltips
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s]))

  return (
    <div className="min-h-svh bg-black">
      {/* CHANGED: no score prop — HealthHeader reads from useAggregate() itself */}
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-stretch">

          {/* ── LEFT column ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">

            {/* DependencyMap — CHANGED: downIds now from real service health */}
            <div className="flex-1 min-h-0">
              {/* CHANGED: serviceMap passes live latency/rps to node tooltips */}
              <DependencyMap downIds={downIds} serviceMap={serviceMap} />
            </div>

            {/* Service cards grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {isLoading
                ? // CHANGED: skeleton cards during first load instead of blank
                  [1, 2, 3].map((i) => <ServiceCardSkeleton key={i} />)
                : services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      // onToggle kept for optional demo chaos — will wire to
                      // real /api/chaos POST in Screen 2
                      onToggle={undefined}
                    />
                  ))}
            </div>
          </div>

          {/* ── RIGHT column ────────────────────────────────────────────────── */}
          <div className="flex h-full flex-col gap-3">
            {/* CHANGED: downIds from real data so AI panel reacts to real incidents */}
            <AiGuardian downIds={downIds} />
            <div className="flex-1 min-h-0">
              <ActivityFeed />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
