"use client"
// ─────────────────────────────────────────────────────────────────────────────
// app/services/[id]/page.tsx  [NEW — Screen 3]
//
// Service Deep Dive page. Accessed via:
//   /services/auth
//   /services/payments
//   /services/orders
//
// Layout:
//   Full-width: ServiceHero (always at top)
//
//   2-column below:
//   LEFT (wider):
//     MetricCharts   — 4 time-series panels
//     EndpointTable  — sortable route breakdown
//     RequestLog     — live request tail
//
//   RIGHT (narrower):
//     DependencyHealth  — upstream/downstream service cards
//     IncidentTimeline  — historical incidents for this service
// ─────────────────────────────────────────────────────────────────────────────

import { use } from "react"
import { HealthHeader }      from "@/components/health-header"
import { ServiceHero }       from "@/components/service-detail/service-hero"
import { MetricCharts }      from "@/components/service-detail/metric-charts"
import { EndpointTable }     from "@/components/service-detail/endpoint-table"
import { RequestLog }        from "@/components/service-detail/request-log"
import { DependencyHealth }  from "@/components/service-detail/dependency-health"
import { IncidentTimeline }  from "@/components/service-detail/incident-timeline"
import { useServiceDetail }  from "@/lib/hooks/useServiceDetail"
import { ErrorBanner }       from "@/components/skeletons"
import { Server }            from "lucide-react"

// Skeleton for the hero section while loading
function HeroSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/[0.04] bg-black p-5">
      <div className="h-3 w-20 rounded bg-white/[0.04] mb-4" />
      <div className="flex justify-between">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-white/[0.06]" />
            <div className="h-6 w-36 rounded bg-white/[0.06]" />
            <div className="h-5 w-14 rounded-full bg-white/[0.04]" />
          </div>
          <div className="flex gap-2">
            {[1,2,3].map(i => <div key={i} className="h-6 w-24 rounded-full bg-white/[0.04]" />)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-8 w-40 rounded bg-white/[0.04]" />
          <div className="flex gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-8 w-12 rounded bg-white/[0.04]" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-white/[0.04] bg-black p-5">
      <div className="flex justify-between mb-4">
        <div className="h-4 w-40 rounded bg-white/[0.06]" />
        <div className="h-7 w-36 rounded-lg bg-white/[0.04]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[1,2,3,4].map(i => (
          <div key={i} className="rounded-xl border border-white/[0.04] bg-white/[0.01] p-4">
            <div className="h-3 w-24 rounded bg-white/[0.05] mb-3" />
            <div className="h-18 w-full rounded bg-white/[0.03]" style={{height:72}} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Valid service IDs
const VALID_IDS = new Set(["auth", "payments", "orders"])

export default function ServiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const { detail, error, isLoading } = useServiceDetail(id)

  // Invalid service ID
  if (!VALID_IDS.has(id)) {
    return (
      <div className="min-h-svh bg-black">
        <HealthHeader />
        <main className="mx-auto max-w-screen-2xl px-4 py-8 md:px-6">
          <div className="flex flex-col items-center gap-3 py-20">
            <Server className="h-10 w-10 text-zinc-700" />
            <p className="font-mono text-sm text-zinc-500">
              Unknown service: <span className="text-zinc-300">{id}</span>
            </p>
            <p className="font-mono text-[11px] text-zinc-700">
              Valid IDs: auth · payments · orders
            </p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4">

          {/* ── Full-width hero ──────────────────────────────────────────────── */}
          {isLoading ? (
            <HeroSkeleton />
          ) : error ? (
            <ErrorBanner message={`Could not load ${id} — backend unreachable`} />
          ) : detail ? (
            <ServiceHero detail={detail} />
          ) : null}

          {/* ── 2-column content ─────────────────────────────────────────────── */}
          {detail && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">

              {/* LEFT — charts + table + log */}
              <div className="flex flex-col gap-4">
                <MetricCharts detail={detail} />
                <EndpointTable endpoints={detail.endpoints} />
                <RequestLog requests={detail.recentRequests} />
              </div>

              {/* RIGHT — dependency health + incident history */}
              <div className="flex flex-col gap-4">
                <DependencyHealth serviceId={id} />
                <IncidentTimeline serviceId={id} />
              </div>

            </div>
          )}

          {/* Loading skeleton for content below hero */}
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
              <div className="flex flex-col gap-4">
                <ChartSkeleton />
                <div className="animate-pulse h-48 rounded-xl border border-white/[0.04] bg-black" />
              </div>
              <div className="flex flex-col gap-4">
                <div className="animate-pulse h-36 rounded-xl border border-white/[0.04] bg-black" />
                <div className="animate-pulse h-64 rounded-xl border border-white/[0.04] bg-black" />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
