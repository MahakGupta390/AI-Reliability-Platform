// ─────────────────────────────────────────────────────────────────────────────
// components/activity-feed.tsx   [MODIFIED]
//
// CHANGES:
//   1. Removed hardcoded ACTIVITY import from lib/services
//   2. Removed fake STREAM_EVENTS and 18s setInterval mock
//   3. Now uses useActivity() hook → polls /api/incidents?mode=activity every 10s
//   4. ActivitySkeleton shown on first load
//   5. Live event count shown in footer from real data length
//   6. Pulse animation fires when SWR brings new data (via data dependency)
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState } from "react"
import { useActivity } from "@/lib/hooks/useIncidents"    // CHANGED: new hook
import { ActivitySkeleton, ErrorBanner } from "@/components/skeletons"

const DOT: Record<string, string> = {
  ok:    "bg-emerald-400 ring-emerald-400/20",
  warn:  "bg-amber-400  ring-amber-400/20",
  error: "bg-rose-500   ring-rose-500/20",
}

export function ActivityFeed() {
  // CHANGED: real data from hook; no more ACTIVITY constant or fake streaming
  const { activity, isLoading, error } = useActivity()
  const [pulse, setPulse] = useState(false)
  const prevCountRef = useRef(0)

  // Pulse the header icon whenever new events arrive from SWR
  useEffect(() => {
    if (activity.length > 0 && activity.length !== prevCountRef.current) {
      prevCountRef.current = activity.length
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 1500)
      return () => clearTimeout(t)
    }
  }, [activity.length])

  return (
   <section
  className="flex max-h-[380px] flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5 overflow-hidden"
  aria-label="Recent system activity"
>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2">
        <Activity
          className={cn(
            "h-4 w-4 transition-colors duration-300",
            pulse ? "text-cyan-300" : "text-cyan-400",
          )}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold tracking-tight">Recent System Activity</h2>
        {pulse && (
          <span className="ml-auto flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400" />
            <span className="font-mono text-[9px] text-cyan-400/70">new event</span>
          </span>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <ActivitySkeleton />
      ) : error ? (
        <ErrorBanner message="Activity feed unavailable — AI service unreachable" />
      ) : (
        /* Timeline list — scrolls independently inside flex-1 wrapper */
        <ol className="relative flex flex-col overflow-y-auto pr-1 min-h-0 flex-1" aria-label="Activity timeline">
          {/* vertical axis line */}
          <span
            className="pointer-events-none absolute bottom-2 left-[5px] top-2 w-px bg-white/[0.05]"
            aria-hidden="true"
          />

          {/* CHANGED: renders activity items from live API data */}
          {activity.map((item) => (
            <li key={item.id} className="relative flex gap-4 pb-4 last:pb-0">
              <span
                className={cn(
                  "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4",
                  DOT[item.level],
                )}
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                  {item.time}
                </span>
                <p className="text-[12px] leading-snug text-zinc-300">{item.message}</p>
              </div>
            </li>
          ))}

          {/* Empty state */}
          {activity.length === 0 && (
            <li className="flex items-center justify-center py-8">
              <span className="font-mono text-[11px] text-zinc-600">No incidents recorded yet</span>
            </li>
          )}
        </ol>
      )}

      {/* Footer — live indicator */}
      <div className="shrink-0 flex items-center gap-1.5 border-t border-white/[0.04] pt-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        {/* CHANGED: live event count from real data */}
        <span className="font-mono text-[9px] text-zinc-600">
          streaming live · {activity.length} events
        </span>
      </div>
    </section>
  )
}
