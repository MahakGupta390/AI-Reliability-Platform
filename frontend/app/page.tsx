"use client"

import { useMemo, useState } from "react"
import { HealthHeader } from "@/components/health-header"
import { DependencyMap } from "@/components/dependency-map"
import { ServiceCard } from "@/components/service-card"
import { ActivityFeed } from "@/components/activity-feed"
import { AiGuardian } from "@/components/ai-guardian"
import { SERVICES } from "@/lib/services"

const BASE_SCORE = 98
const PENALTY_PER_INCIDENT = 34

export default function Page() {
  const [downIds, setDownIds] = useState<string[]>([])

  const toggle = (id: string) =>
    setDownIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  const healthScore = useMemo(
    () => Math.max(28, BASE_SCORE - downIds.length * PENALTY_PER_INCIDENT),
    [downIds],
  )

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader score={healthScore} />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        {/*
          Outer grid: 2-col on lg+
          Left  = dependency map (flex-grows) + 3 service cards in ONE fixed row
          Right = AI Guardian (natural height) + Activity Feed (flex-1 fills remainder)
          Both columns are equal height via `items-stretch` on the outer grid.
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px] lg:items-stretch">

          {/* ── LEFT column ────────────────────────────────────────── */}
          <div className="flex flex-col gap-3">

            {/* Dependency map — grows to fill whatever the service cards don't need */}
            <div className="flex-1 min-h-0">
              <DependencyMap downIds={downIds} />
            </div>

            {/*
              Service cards — ALWAYS 3 columns on md+.
              On mobile they stack; on sm they go 2-col; md+ locks to 3.
              This prevents the orphaned single-card row.
            */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {SERVICES.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  isDown={downIds.includes(service.id)}
                  onToggle={() => toggle(service.id)}
                />
              ))}
            </div>
          </div>

          {/* ── RIGHT column ───────────────────────────────────────── */}
          {/*
            h-full on the column div + flex-col means:
              - AiGuardian: natural/auto height
              - ActivityFeed: flex-1 → stretches to consume remaining height
            Both together exactly match the left column's total height.
          */}
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
