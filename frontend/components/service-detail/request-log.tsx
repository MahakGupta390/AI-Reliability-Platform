"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/request-log.tsx  [NEW — Screen 3]
//
// Live tail of the last 20 requests from your backend /metrics recentRequests.
// Status code color coded. Latency bar shows relative speed.
// Auto-scrolls to newest. Refetches every 5s via parent hook.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Terminal, Circle } from "lucide-react"
import { useEffect, useRef } from "react"
import type { RecentRequest } from "@/lib/types"

function statusColor(code: number): string {
  if (code >= 500) return "text-rose-400"
  if (code >= 400) return "text-amber-400"
  if (code >= 300) return "text-cyan-400"
  return "text-emerald-400"
}

function statusDot(code: number): string {
  if (code >= 500) return "bg-rose-500"
  if (code >= 400) return "bg-amber-400"
  return "bg-emerald-400"
}

function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET:    "text-emerald-400",
    POST:   "text-cyan-400",
    PUT:    "text-violet-400",
    PATCH:  "text-amber-400",
    DELETE: "text-rose-400",
  }
  return map[method] ?? "text-zinc-400"
}

function LatencyBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100)
  const color =
    value >= 400 ? "bg-rose-500"   :
    value >= 200 ? "bg-amber-400"  :
    "bg-emerald-400"

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.04]">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn(
        "font-mono text-[10px] tabular-nums w-12 text-right",
        value >= 400 ? "text-rose-400" : value >= 200 ? "text-amber-400" : "text-zinc-400",
      )}>
        {value}ms
      </span>
    </div>
  )
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function RequestLog({ requests }: { requests: RecentRequest[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const maxLatency = Math.max(...requests.map((r) => r.latencyMs), 1)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [requests.length])

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Recent request log"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Recent Request Log</h2>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-mono text-[9px] text-zinc-600">live tail · {requests.length} entries</span>
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="font-mono text-[11px] text-zinc-600 text-center py-6">No requests yet</p>
      ) : (
        /* Scrollable log */
        <div className="max-h-72 overflow-y-auto rounded-lg border border-white/[0.04] bg-zinc-950/50">
          {/* Column headers */}
          <div className="sticky top-0 grid grid-cols-[60px_60px_1fr_100px_80px] gap-2 border-b border-white/[0.04] bg-zinc-950 px-3 py-1.5">
            {["Time", "Method", "Endpoint", "Status", "Latency"].map((h) => (
              <span key={h} className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{h}</span>
            ))}
          </div>

          {/* Request rows */}
          <div className="divide-y divide-white/[0.03]">
            {[...requests].reverse().map((req, i) => (
              <div
                key={req.requestId}
                className={cn(
                  "grid grid-cols-[60px_60px_1fr_100px_80px] gap-2 items-center px-3 py-1.5 transition-colors hover:bg-white/[0.02]",
                  i === 0 && "bg-white/[0.01]",
                )}
              >
                {/* Time */}
                <span className="font-mono text-[9px] text-zinc-700 tabular-nums truncate">
                  {timeLabel(req.timestamp)}
                </span>

                {/* Method */}
                <span className={cn("font-mono text-[10px] font-semibold", methodColor(req.method))}>
                  {req.method}
                </span>

                {/* Endpoint */}
                <span className="font-mono text-[10px] text-zinc-400 truncate" title={req.endpoint}>
                  {req.endpoint}
                </span>

                {/* Status */}
                <span className="flex items-center gap-1.5">
                  <Circle className={cn("h-1.5 w-1.5 fill-current", statusDot(req.statusCode))} />
                  <span className={cn("font-mono text-[10px] font-semibold tabular-nums", statusColor(req.statusCode))}>
                    {req.statusCode}
                  </span>
                </span>

                {/* Latency bar */}
                <LatencyBar value={req.latencyMs} max={maxLatency} />
              </div>
            ))}
          </div>
          <div ref={bottomRef} />
        </div>
      )}
    </section>
  )
}
