"use client"
// ─────────────────────────────────────────────────────────────────────────────
// app/page.tsx  [MODIFIED — Screen 3]
//
// CHANGES:
//   1. useRouter added — "Simulate Anomaly" navigates to /chaos?target=id
//   2. Service cards get an onClick on the card title linking to /services/[id]
// ─────────────────────────────────────────────────────────────────────────────

import { useRouter } from "next/navigation"
import { HealthHeader }      from "@/components/health-header"
import { DependencyMap }     from "@/components/dependency-map"
import { ServiceCard }       from "@/components/service-card"
import { ActivityFeed }      from "@/components/activity-feed"
import { AiGuardian }        from "@/components/ai-guardian"
import { ServiceCardSkeleton } from "@/components/skeletons"
import { useServices }       from "@/lib/hooks/useServices"

export default function Page() {
  const router = useRouter()
  const { services, downIds, isLoading } = useServices()
  const serviceMap = Object.fromEntries(services.map((s) => [s.id, s]))

  // "Simulate Anomaly" → Chaos Lab with service pre-targeted
  const handleSimulate = (serviceId: string) => {
    router.push(`/chaos?target=${serviceId}`)
  }

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-stretch">

          {/* ── LEFT column ─────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">
            <div className="flex-1 min-h-0">
              <DependencyMap downIds={downIds} serviceMap={serviceMap} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {isLoading
                ? [1, 2, 3].map((i) => <ServiceCardSkeleton key={i} />)
                : services.map((service) => (
                    <ServiceCard
                      key={service.id}
                      service={service}
                      // "Simulate Anomaly" → /chaos?target=id
                      onToggle={() => handleSimulate(service.id)}
                      // Card title click → /services/[id]  (handled inside ServiceCard)
                      href={`/services/${service.id}`}
                    />
                  ))}
            </div>
          </div>

          {/* ── RIGHT column ────────────────────────────────────────────────── */}
          <div className="flex h-full flex-col gap-3">
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
