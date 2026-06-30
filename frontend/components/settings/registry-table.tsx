"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/settings/registry-table.tsx  [MODIFIED — Screen 5 backend wired]
//
// CHANGE: the monitored toggle now persists via toggleMonitored() →
// PATCH /api/settings/registry → ai-service /config/registry/:id →
// MongoDB. Previously this was useState client-only and reset on refresh.
// The anomalyDetector now actually SKIPS unmonitored services on its
// next detection cycle — this toggle has real effect, not just UI.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Server, Plus, CheckCircle2, XCircle, AlertCircle, HelpCircle, Loader2 } from "lucide-react"
import { useRegistry } from "@/lib/hooks/useSettings"

const STATUS_CONFIG = {
  UP:       { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/8 border-emerald-500/20" },
  DOWN:     { icon: XCircle,      color: "text-rose-400",    bg: "bg-rose-500/8 border-rose-500/20" },
  DEGRADED: { icon: AlertCircle,  color: "text-amber-400",   bg: "bg-amber-500/8 border-amber-400/20" },
  UNKNOWN:  { icon: HelpCircle,   color: "text-zinc-500",    bg: "bg-zinc-800/30 border-zinc-700/20" },
}

function Toggle({
  checked, onChange, loading,
}: {
  checked: boolean; onChange: (v: boolean) => void; loading: boolean
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={loading}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-4 w-8 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-60",
        checked ? "bg-emerald-500" : "bg-zinc-800",
      )}
    >
      {loading ? (
        <Loader2 className="absolute inset-0 m-auto h-2.5 w-2.5 animate-spin text-white" />
      ) : (
        <span className={cn(
          "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0.5",
        )} />
      )}
    </button>
  )
}

export function RegistryTable() {
  // CHANGED: toggleMonitored persists via real backend mutation now
  const { services, isLoading, toggling, toggleMonitored } = useRegistry()

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Service registry"
    >
      <div className="flex items-center gap-2">
        <Server className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Service Registry</h2>
        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          {services.length} service{services.length !== 1 ? "s" : ""} registered
        </span>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-lg bg-white/[0.02]" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {services.map((svc) => {
            const cfg = STATUS_CONFIG[svc.status] ?? STATUS_CONFIG.UNKNOWN
            const Icon = cfg.icon
            const isToggling = toggling === svc.id

            return (
              <div
                key={svc.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3 transition-opacity duration-200",
                  svc.monitored ? "border-white/[0.04] bg-white/[0.01]" : "border-white/[0.03] bg-white/[0.005] opacity-50",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", cfg.color)} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[12px] font-semibold text-zinc-200">{svc.name}</span>
                    <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase font-semibold", cfg.bg, cfg.color)}>
                      {svc.status}
                    </span>
                    {!svc.monitored && (
                      <span className="rounded border border-zinc-700/30 bg-zinc-800/30 px-1.5 py-0.5 font-mono text-[8px] uppercase text-zinc-500">
                        excluded from detection
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-[9px] text-zinc-600 truncate">{svc.url}</span>
                    <span className="font-mono text-[9px] text-zinc-700">·</span>
                    <span className="font-mono text-[9px] text-zinc-600">{svc.region}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-[9px] text-zinc-600">monitored</span>
                  {/* CHANGED: real persisted toggle — affects anomalyDetector next cycle */}
                  <Toggle
                    checked={svc.monitored}
                    loading={isToggling}
                    onChange={(v) => toggleMonitored(svc.id, v)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add service — disabled, foundation for future expansion */}
      <button
        disabled
        title="Adding services requires backend registry support — coming in a future iteration"
        className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-800 px-4 py-2.5 font-mono text-[11px] text-zinc-600 cursor-not-allowed"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Service
      </button>
    </section>
  )
}
