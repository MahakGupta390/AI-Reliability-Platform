"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/blast-radius.tsx  [NEW]
// Larger, more dramatic dependency map for Screen 2.
// Reuses the same node/edge topology but with bigger canvas + detonation FX.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Waypoints, Radiation } from "lucide-react"
import { useEffect, useRef, useState } from "react"

type Node = { id: string; label: string; x: number; y: number; tier: string }
type Edge = { from: string; to: string; weight: "heavy" | "normal" | "light" }

const NODES: Node[] = [
  { id: "gateway",  label: "api-gateway",    x: 50, y: 12, tier: "ingress"  },
  { id: "auth",     label: "auth-service",   x: 18, y: 45, tier: "core"     },
  { id: "payments", label: "payment-gateway",x: 82, y: 45, tier: "core"     },
  { id: "orders",   label: "order-processor",x: 35, y: 80, tier: "core"     },
  { id: "cache",    label: "redis-cluster",  x: 65, y: 80, tier: "infra"    },
]

const EDGES: Edge[] = [
  { from: "gateway",  to: "auth",     weight: "heavy"  },
  { from: "gateway",  to: "payments", weight: "normal" },
  { from: "gateway",  to: "orders",   weight: "heavy"  },
  { from: "auth",     to: "cache",    weight: "normal" },
  { from: "orders",   to: "cache",    weight: "heavy"  },
  { from: "payments", to: "orders",   weight: "light"  },
]

function downstream(downIds: string[]): Set<string> {
  const aff = new Set(downIds)
  let changed = true
  while (changed) {
    changed = false
    for (const e of EDGES) {
      if (aff.has(e.from) && !aff.has(e.to)) { aff.add(e.to); changed = true }
    }
  }
  return aff
}

function pct(v: number, size: number) { return (v / 100) * size }

export function BlastRadius({
  downIds,
  isRunning,
}: {
  downIds: string[]
  isRunning: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims]   = useState({ w: 700, h: 340 })
  const [hovered, setHov] = useState<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(([e]) => {
      setDims({ w: e.contentRect.width || 700, h: e.contentRect.height || 340 })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const affected = downstream(downIds)
  const { w, h }  = dims

  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-5 transition-all duration-700",
        isRunning
          ? "border-rose-500/25 bg-black shadow-[0_0_80px_-20px_rgba(239,68,68,0.25)]"
          : "border-white/[0.04] bg-black",
      )}
      aria-label="Blast radius visualiser"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Waypoints className={cn("h-4 w-4", isRunning ? "text-rose-400" : "text-cyan-400")} />
        <h2 className="text-sm font-semibold tracking-tight">Blast Radius Visualiser</h2>
        {isRunning && downIds.length > 0 && (
          <span className="ml-2 flex items-center gap-1.5">
            <Radiation className="h-3 w-3 text-rose-400 animate-pulse" />
            <span className="font-mono text-[10px] text-rose-400">
              {downIds.length} service{downIds.length > 1 ? "s" : ""} injected · {affected.size - downIds.length} downstream affected
            </span>
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-zinc-600">live topology</span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative min-h-64 flex-1 overflow-hidden rounded-lg border border-white/[0.04] bg-black"
        style={{ minHeight: 280 }}
      >
        {/* Ambient glow shifts red during experiment */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/3 h-72 w-72 -translate-x-1/2 rounded-full blur-[130px] transition-colors duration-1000",
            isRunning && downIds.length > 0
              ? "bg-rose-600/25"
              : "bg-cyan-600/10",
          )}
        />

        {/* Grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(to_right,#1e1e24_1px,transparent_1px),linear-gradient(to_bottom,#1e1e24_1px,transparent_1px)] [background-size:24px_24px]"
        />

        {/* SVG edges */}
        <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
          {EDGES.map((edge) => {
            const fn  = NODES.find((n) => n.id === edge.from)!
            const tn  = NODES.find((n) => n.id === edge.to)!
            const x1  = pct(fn.x, w), y1 = pct(fn.y, h)
            const x2  = pct(tn.x, w), y2 = pct(tn.y, h)
            const hit = affected.has(edge.from) || affected.has(edge.to)
            const sw  = edge.weight === "heavy" ? 0.7 : edge.weight === "light" ? 0.25 : 0.45

            return (
              <g key={`${edge.from}-${edge.to}`}>
                {/* Track */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={hit ? "rgb(244 63 94 / 0.25)" : "rgb(34 211 238 / 0.15)"}
                  strokeWidth={sw * 3} vectorEffect="non-scaling-stroke"
                />
                {/* Animated dash */}
                <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={hit ? "rgb(251 113 133)" : "rgb(34 211 238)"}
                  strokeWidth={sw}
                  strokeDasharray="4 6"
                  vectorEffect="non-scaling-stroke"
                  className={hit ? "edge-flow-critical" : "edge-flow"}
                />
                {/* Particles */}
                {[0, 0.7, 1.4].map((delay) => (
                  <Particle key={delay} x1={x1} y1={y1} x2={x2} y2={y2}
                    color={hit ? "rgb(251 113 133)" : "rgb(34 211 238)"}
                    delay={delay} fast={hit}
                  />
                ))}
              </g>
            )
          })}

          {/* Anomaly rings from downed nodes */}
          {downIds.map((id) => {
            const node = NODES.find((n) => n.id === id)
            if (!node) return null
            const cx = pct(node.x, w), cy = pct(node.y, h)
            return [0, 0.5, 1.0].map((d) => (
              <circle key={`${id}-${d}`} cx={cx} cy={cy} fill="none"
                stroke="rgb(239 68 68 / 0.55)" strokeWidth="0.8">
                <animate attributeName="r" values="5;26" dur="2s" repeatCount="indefinite" begin={`${d}s`} />
                <animate attributeName="opacity" values="0.7;0" dur="2s" repeatCount="indefinite" begin={`${d}s`} />
              </circle>
            ))
          })}

          {/* Downstream (amber) rings */}
          {NODES.filter((n) => affected.has(n.id) && !downIds.includes(n.id)).map((node) => {
            const cx = pct(node.x, w), cy = pct(node.y, h)
            return (
              <circle key={`aff-${node.id}`} cx={cx} cy={cy} fill="none"
                stroke="rgb(251 191 36 / 0.45)" strokeWidth="0.6">
                <animate attributeName="r" values="4;18" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0" dur="3s" repeatCount="indefinite" />
              </circle>
            )
          })}
        </svg>

        {/* Node HTML layer */}
        {NODES.map((node) => {
          const isDown   = downIds.includes(node.id)
          const isDeg    = !isDown && affected.has(node.id)
          const isHov    = hovered === node.id
          const dimmed   = isRunning && !isDown && !isDeg && downIds.length > 0

          const dotColor = isDown ? "bg-rose-500 ring-rose-500/25"
            : isDeg ? "bg-amber-400 ring-amber-400/20"
            : "bg-cyan-400 ring-cyan-400/15"
          const pingColor = isDown ? "bg-rose-500" : isDeg ? "bg-amber-400" : "bg-cyan-400"
          const chipStyle = isDown
            ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
            : isDeg
              ? "border-amber-400/40 bg-amber-500/8 text-amber-300"
              : isHov
                ? "border-cyan-400/50 bg-cyan-500/8 text-cyan-300"
                : "border-cyan-400/15 bg-black/60 text-zinc-400"

          return (
            <div
              key={node.id}
              className={cn(
                "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 cursor-pointer transition-opacity duration-500",
                dimmed && "opacity-30",
              )}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onMouseEnter={() => setHov(node.id)}
              onMouseLeave={() => setHov(null)}
            >
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", pingColor)} />
                <span className={cn("absolute h-8 w-8 rounded-full border opacity-25 node-breathe", isDown ? "border-rose-500/50" : "border-cyan-400/25")} />
                <span className={cn("relative h-3 w-3 rounded-full ring-4 transition-transform duration-200", isHov ? "scale-125" : "", dotColor)} />
              </span>
              <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[10px] backdrop-blur-sm transition-all duration-200", chipStyle, isHov ? "scale-105" : "")}>
                {node.label}
              </span>
              {/* Status label */}
              {(isDown || isDeg) && (
                <span className={cn("font-mono text-[8px] uppercase tracking-widest", isDown ? "text-rose-400" : "text-amber-400")}>
                  {isDown ? "injected" : "cascade"}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Particle({ x1, y1, x2, y2, color, delay, fast }: {
  x1: number; y1: number; x2: number; y2: number
  color: string; delay: number; fast: boolean
}) {
  const dur = fast ? "0.8s" : "2.2s"
  return (
    <circle r="2.5" fill={color}>
      <animateMotion dur={dur} repeatCount="indefinite" begin={`${delay}s`}>
        <mpath href="#" />
      </animateMotion>
      <animateMotion dur={dur} repeatCount="indefinite" begin={`${delay}s`}
        path={`M${x1},${y1} L${x2},${y2}`}
      />
      <animate attributeName="opacity" values="0;1;1;0" dur={dur} repeatCount="indefinite" begin={`${delay}s`} />
    </circle>
  )
}
