"use client"

import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { ACTIVITY } from "@/lib/services"
import { useEffect, useState } from "react"

const DOT: Record<string, string> = {
  ok:    "bg-emerald-400 ring-emerald-400/20",
  warn:  "bg-amber-400  ring-amber-400/20",
  error: "bg-rose-500   ring-rose-500/20",
}

// Mock streaming — new event appears every ~18s
const STREAM_EVENTS = [
  { id: "s1", time: "just now", message: "AI auto-scaled order-processor to 5 replicas", level: "ok"   as const },
  { id: "s2", time: "just now", message: "Anomaly in payments P99 — threshold breach imminent", level: "warn" as const },
]

export function ActivityFeed() {
  const [extra, setExtra] = useState<typeof STREAM_EVENTS>([])
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      if (i >= STREAM_EVENTS.length) { clearInterval(id); return }
      setExtra((prev) => [STREAM_EVENTS[i], ...prev])
      setPulse(true)
      setTimeout(() => setPulse(false), 1200)
      i++
    }, 18_000)
    return () => clearInterval(id)
  }, [])

  const items = [...extra, ...ACTIVITY]

  return (
    /*
      h-full so this section stretches to fill the flex-1 wrapper in page.tsx.
      overflow-hidden on the section + overflow-y-auto on the list = scroll
      inside a fixed-height container — no bleed.
    */
    <section className="flex h-full flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5 overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2">
        <Activity
          className={cn(
            "h-4 w-4 transition-colors duration-300",
            pulse ? "text-cyan-300" : "text-cyan-400",
          )}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold tracking-tight">
          Recent System Activity
        </h2>
        {pulse && (
          <span className="ml-auto flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400" />
            <span className="font-mono text-[9px] text-cyan-400/70">new event</span>
          </span>
        )}
      </div>

      {/* Timeline list — scrolls independently */}
      <ol className="relative flex flex-col overflow-y-auto scrollbar-thin pr-1 min-h-0 flex-1">
        {/* vertical axis */}
        <span
          className="pointer-events-none absolute bottom-2 left-[5px] top-2 w-px bg-white/[0.05]"
          aria-hidden="true"
        />

        {items.map((item, idx) => (
          <li
            key={item.id}
            className={cn(
              "relative flex gap-4 pb-4 last:pb-0 transition-opacity duration-700",
              idx === 0 && extra.length > 0 && extra[0]?.id === item.id
                ? "animate-pulse-once"
                : "",
            )}
          >
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
              <p className="text-[12px] leading-snug text-zinc-300">
                {item.message}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Footer — live indicator */}
      <div className="shrink-0 flex items-center gap-1.5 border-t border-white/[0.04] pt-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
        </span>
        <span className="font-mono text-[9px] text-zinc-600">
          streaming live · {items.length} events
        </span>
      </div>
    </section>
  )
}
