// app/services/page.tsx  [NEW — Screen 3]
// /services → show cards for all 3 services, each linking to its detail page.
"use client"

import { HealthHeader }       from "@/components/health-header"
import { ServiceCard }        from "@/components/service-card"
import { ServiceCardSkeleton} from "@/components/skeletons"
import { useServices }        from "@/lib/hooks/useServices"
import { Server }             from "lucide-react"

export default function ServicesIndexPage() {
  const { services, isLoading } = useServices()

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader />
      <main className="mx-auto max-w-screen-2xl px-4 py-6 md:px-6">
        <div className="flex items-center gap-2 mb-5">
          <Server className="h-4 w-4 text-cyan-400" />
          <h1 className="text-sm font-semibold tracking-tight">All Services</h1>
          <span className="font-mono text-[10px] text-zinc-600 ml-2">
            click any card to open deep dive
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {isLoading
            ? [1,2,3].map(i => <ServiceCardSkeleton key={i} />)
            : services.map(svc => (
                <ServiceCard
                  key={svc.id}
                  service={svc}
                  href={`/services/${svc.id}`}
                  onToggle={undefined}
                />
              ))
          }
        </div>
      </main>
    </div>
  )
}
