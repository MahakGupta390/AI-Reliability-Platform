"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/settings/audit-log.tsx  [NEW — Screen 5]
//
// Shows every detector decision — what it saw, what it decided.
// Currently client-generated mock based on real threshold config
// (no backend decision-log table exists yet — see useAuditLog hook note).
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { ScrollText, RefreshCw } from "lucide-react"
import { useState } from "react"
import { useAuditLog } from "@/lib/hooks/useSettings"
import { useDetector } from "@/lib/hooks/useSettings"

const DECISION_CONFIG = {
  normal:    { color: "text-zinc-500",   dot: "bg-zinc-600" },
  elevated:  { color: "text-amber-400",  dot: "bg-amber-400" },
  anomalous: { color: "text-rose-400",   dot: "bg-rose-500" },
  recovered: { color: "text-emerald-400",dot: "bg-emerald-400" },
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false })
}

export function AuditLog() {
  const { detector } = useDetector()
  const [refreshKey, setRefreshKey] = useState(0)

  const { entries } = useAuditLog(
    detector?.zScoreTrigger ?? 3.0,
    detector?.zScoreResolve ?? 1.5,
  )

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Monitoring audit log"
      key={refreshKey}
    >
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Monitoring Audit Log</h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="ml-auto flex items-center gap-1 font-mono text-[9px] text-zinc-600 hover:text-cyan-300 transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh
        </button>
      </div>

      <p className="font-mono text-[10px] text-zinc-600">
        Every detector poll cycle decision — useful for debugging why an incident
        wasn't (or was) detected.
      </p>

      <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
        {entries.map((e) => {
          const cfg = DECISION_CONFIG[e.decision]
          return (
            <div
              key={e.id}
              className="grid grid-cols-[60px_110px_60px_60px_1fr] items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.02] transition-colors"
            >
              <span className="font-mono text-[9px] text-zinc-700">{timeLabel(e.timestamp)}</span>
              <span className="font-mono text-[10px] text-zinc-400 truncate">{e.service}</span>
              <span className="font-mono text-[10px] text-zinc-500">{e.p99Ms}ms</span>
              <span className={cn("font-mono text-[10px] font-semibold", cfg.color)}>
                {e.zScore.toFixed(1)}σ
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", cfg.dot)} />
                <span className="font-mono text-[10px] text-zinc-500 truncate">{e.action}</span>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
