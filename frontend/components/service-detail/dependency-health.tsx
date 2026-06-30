"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/dependency-health.tsx  [NEW — Screen 3]
//
// Shows which upstream services this service calls and their health.
// Static dependency map mirroring rootCause.js SERVICE_DEPENDENCIES.
// Uses useServices() so data stays live.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { GitBranch, ArrowRight, CheckCircle2, AlertCircle, XCircle } from "lucide-react"
import Link from "next/link"
import { useServices } from "@/lib/hooks/useServices"
import { AnimatedNumber } from "@/components/animated-number"

// Mirrors rootCause.js SERVICE_DEPENDENCIES
const DEPS: Record<string, string[]> = {
  auth:     [],
  payments: [],
  orders:   ["auth", "payments"],
}

// Which services call THIS service (reverse map)
const CALLERS: Record<string, string[]> = {
  auth:     ["orders"],
  payments: ["orders"],
  orders:   [],
}

const SERVICE_LABELS: Record<string, string> = {
  auth:     "Auth Service",
  payments: "Payment Gateway",
  orders:   "Order Processor",
}

function ServiceDependencyCard({
  id,
  relation,
}: {
  id: string
  relation: "calls" | "called-by"
}) {
  const { services } = useServices()
  const svc = services.find((s) => s.id === id)

  const status   = svc?.status ?? "DOWN"
  const latency  = svc?.latency ?? 0
  const errRate  = svc?.errorRate ?? 0
  const isDown   = status === "DOWN"
  const isDeg    = status === "DEGRADED"

  const StatusIcon =
    isDown ? XCircle :
    isDeg  ? AlertCircle :
    CheckCircle2

  const statusColor =
    isDown ? "text-rose-400"   :
    isDeg  ? "text-amber-400"  :
    "text-emerald-400"

  const borderColor =
    isDown ? "border-rose-500/20 bg-rose-500/4"   :
    isDeg  ? "border-amber-400/15 bg-amber-500/3" :
    "border-white/[0.04] bg-white/[0.01]"

  return (
    <Link
      href={`/services/${id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-all duration-200 hover:border-white/[0.1] hover:bg-white/[0.03]",
        borderColor,
      )}
    >
      <StatusIcon className={cn("h-4 w-4 shrink-0", statusColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-semibold text-zinc-200 truncate">
            {SERVICE_LABELS[id]}
          </span>
          <span className={cn("font-mono text-[9px] uppercase font-semibold shrink-0", statusColor)}>
            {status}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="font-mono text-[9px] text-zinc-600">
            p99 <span className="text-zinc-400"><AnimatedNumber value={latency} />ms</span>
          </span>
          <span className="font-mono text-[9px] text-zinc-600">
            err <span className={errRate > 0 ? "text-amber-400" : "text-zinc-400"}>
              <AnimatedNumber value={errRate} decimals={2} />%
            </span>
          </span>
          <span className="font-mono text-[9px] text-zinc-700">{relation}</span>
        </div>
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-zinc-700 shrink-0" />
    </Link>
  )
}

export function DependencyHealth({ serviceId }: { serviceId: string }) {
  const deps    = DEPS[serviceId]    ?? []
  const callers = CALLERS[serviceId] ?? []

  if (deps.length === 0 && callers.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-black p-5">
        <div className="flex items-center gap-2 mb-4">
          <GitBranch className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-tight">Service Dependencies</h2>
        </div>
        <p className="font-mono text-[11px] text-zinc-600 text-center py-4">
          No upstream dependencies defined
        </p>
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Service dependency health"
    >
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Service Dependencies</h2>
      </div>

      {/* Calls (downstream dependencies) */}
      {deps.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            This service calls
          </span>
          {deps.map((id) => (
            <ServiceDependencyCard key={id} id={id} relation="calls" />
          ))}
        </div>
      )}

      {/* Called by (upstream callers) */}
      {callers.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
            Called by
          </span>
          {callers.map((id) => (
            <ServiceDependencyCard key={id} id={id} relation="called-by" />
          ))}
        </div>
      )}
    </section>
  )
}
