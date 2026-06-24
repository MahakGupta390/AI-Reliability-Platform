"use client"

// ─────────────────────────────────────────────────────────────────────────────
// components/dependency-map.tsx   [MODIFIED]
//
// CHANGES:
//   1. Accepts optional `serviceMap` prop (Record<id, ServiceData>) so hover
//      tooltips show live p99/rps/errorRate from real backend data.
//   2. When serviceMap is provided, NODES static latency/rps are overridden.
//   3. downIds still accepted from parent (now derived from real service health).
//   4. All visual/animation logic unchanged.
// ─────────────────────────────────────────────────────────────────────────────

import { Waypoints } from "lucide-react"
import { cn } from "@/lib/utils"
import { useEffect, useRef, useState, useId } from "react"
import type { ServiceData } from "@/lib/types"

// ── topology ──────────────────────────────────────────────────────
type Node = {
  id: string
  label: string
  sublabel: string
  x: number
  y: number
  rps: string
  latency: number
  instances: number
}

type Edge = {
  from: string
  to: string
  rpsLabel: string
  weight: "normal" | "heavy" | "light"
}

const NODES: Node[] = [
  { id: "gateway",  label: "api-gateway",      sublabel: "nginx/envoy",     x: 50, y: 18, rps: "24.2k", latency: 12,  instances: 3 },
  { id: "auth",     label: "auth-service",      sublabel: "us-east-1",       x: 18, y: 48, rps: "8.4k",  latency: 124, instances: 2 },
  { id: "payments", label: "payment-gateway",   sublabel: "us-west-2",       x: 82, y: 48, rps: "3.1k",  latency: 212, instances: 2 },
  { id: "orders",   label: "order-processor",   sublabel: "eu-central-1",    x: 35, y: 82, rps: "12.7k", latency: 96,  instances: 4 },
  { id: "cache",    label: "redis-cluster",     sublabel: "in-memory",       x: 65, y: 82, rps: "31.5k", latency: 2,   instances: 6 },
]

const EDGES: Edge[] = [
  { from: "gateway",  to: "auth",     rpsLabel: "8.4k/s",  weight: "heavy"  },
  { from: "gateway",  to: "payments", rpsLabel: "3.1k/s",  weight: "normal" },
  { from: "gateway",  to: "orders",   rpsLabel: "12.7k/s", weight: "heavy"  },
  { from: "auth",     to: "cache",    rpsLabel: "6.2k/s",  weight: "normal" },
  { from: "orders",   to: "cache",    rpsLabel: "9.4k/s",  weight: "heavy"  },
  { from: "payments", to: "orders",   rpsLabel: "1.8k/s",  weight: "light"  },
]

// derive which nodes are downstream of a downed node
function getAffectedNodes(downIds: string[]): Set<string> {
  const affected = new Set<string>(downIds)
  let changed = true
  while (changed) {
    changed = false
    for (const edge of EDGES) {
      if (affected.has(edge.from) && !affected.has(edge.to)) {
        affected.add(edge.to)
        changed = true
      }
    }
  }
  return affected
}

// SVG coords helper
function pct(val: number, size: number) {
  return (val / 100) * size
}

// Animated traffic particle along an SVG line
function TrafficParticle({
  x1, y1, x2, y2,
  color,
  delay,
  critical,
}: {
  x1: number; y1: number; x2: number; y2: number
  color: string; delay: number; critical: boolean
}) {
  // FIX: Replace the random string generator with a safe, stable React ID
  const stableId = useId()
  const pathId = `p-${stableId.replace(/:/g, "")}` 

  const cls = critical
    ? "traffic-particle-critical"
    : "traffic-particle"

  return (
    <g>
      <defs>
        <path
          id={pathId}
          d={`M${x1},${y1} L${x2},${y2}`}
        />
      </defs>
      <circle r="2" fill={color} style={{ animationDelay: `${delay}s` }}>
        <animateMotion
          dur={critical ? "0.7s" : "2s"}
          repeatCount="indefinite"
          begin={`${delay}s`}
        >
          <mpath href={`#${pathId}`} />
        </animateMotion>
        <animate
          attributeName="opacity"
          values="0;1;1;0"
          dur={critical ? "0.7s" : "2s"}
          repeatCount="indefinite"
          begin={`${delay}s`}
        />
      </circle>
    </g>
  )
}

// Anomaly ripple ring emanating from a downed node
function AnomalyRing({ cx, cy, delay }: { cx: number; cy: number; delay: number }) {
  return (
    <circle
      cx={cx} cy={cy}
      fill="none"
      stroke="rgb(244 63 94 / 0.6)"
      strokeWidth="0.8"
    >
      <animate
        attributeName="r"
        values="4;20"
        dur="1.8s"
        repeatCount="indefinite"
        begin={`${delay}s`}
      />
      <animate
        attributeName="opacity"
        values="0.7;0"
        dur="1.8s"
        repeatCount="indefinite"
        begin={`${delay}s`}
      />
    </circle>
  )
}

export function DependencyMap({
  downIds,
  serviceMap = {},
}: {
  downIds: string[]
  // CHANGED: optional live service data keyed by service id (auth/payments/orders)
  serviceMap?: Record<string, ServiceData>
}) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [dims, setDims] = useState({ w: 800, h: 320 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setDims({ w: Math.max(width, 300), h: Math.max(height, 220) })
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const pos = (id: string) => NODES.find((n) => n.id === id)!
  const affected = getAffectedNodes(downIds)
  const hasIncident = downIds.length > 0

  const { w, h } = dims

  return (
    <section
      className="flex h-full flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Service dependency topology"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Waypoints className="h-4 w-4 text-cyan-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-tight">
          Service Dependency Topography
        </h2>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          live telemetry
        </span>
        {/* edge legend */}
        <div className="hidden items-center gap-3 sm:flex" aria-hidden="true">
          <LegendDot color="bg-cyan-400" label="healthy" />
          <LegendDot color="bg-amber-400" label="degraded" />
          <LegendDot color="bg-rose-500" label="critical" />
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative min-h-56 flex-1 overflow-hidden rounded-lg border border-white/[0.04] bg-black"
      >
        {/* Ambient glows */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full blur-[120px] transition-colors duration-700",
            hasIncident ? "bg-rose-600/20" : "bg-cyan-600/12",
          )}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-1/4 h-40 w-40 rounded-full bg-emerald-600/8 blur-[90px]"
        />

        {/* Blueprint grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(to_right,#1e1e24_1px,transparent_1px),linear-gradient(to_bottom,#1e1e24_1px,transparent_1px)] [background-size:24px_24px]"
          aria-hidden="true"
        />

        {/* SVG layer — edges + particles + rings */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          role="img"
        >
          {EDGES.map((edge) => {
            const from = pos(edge.from)
            const to   = pos(edge.to)
            const x1 = pct(from.x, w)
            const y1 = pct(from.y, h)
            const x2 = pct(to.x, w)
            const y2 = pct(to.y, h)

            const fromDown = affected.has(edge.from)
            const toDown   = affected.has(edge.to)
            const edgeDown = fromDown || toDown

            const trackColor = edgeDown
              ? "rgb(244 63 94 / 0.2)"
              : edge.weight === "heavy"
                ? "rgb(34 211 238 / 0.25)"
                : "rgb(82 82 91 / 0.3)"

            const particleColor = edgeDown
              ? "rgb(251 113 133)"
              : "rgb(34 211 238)"

            const flowClass = edgeDown
              ? "edge-flow-critical"
              : "edge-flow"

            const strokeW = edge.weight === "heavy" ? 0.6 : edge.weight === "light" ? 0.25 : 0.4

            return (
              <g key={`${edge.from}-${edge.to}`}>
                {/* base track */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={trackColor}
                  strokeWidth={strokeW * 2}
                  vectorEffect="non-scaling-stroke"
                />
                {/* animated dash */}
                <line
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={particleColor}
                  strokeWidth={strokeW}
                  strokeDasharray="3 5"
                  vectorEffect="non-scaling-stroke"
                  className={flowClass}
                />
                {/* traffic particles */}
                {[0, 0.6, 1.2].map((delay) => (
                  <TrafficParticle
                    key={delay}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    color={particleColor}
                    delay={delay}
                    critical={edgeDown}
                  />
                ))}
                {/* RPS label at midpoint */}
                {!edgeDown && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fontSize="6"
                    fill="rgb(82 82 91)"
                    fontFamily="monospace"
                  >
                    {edge.rpsLabel}
                  </text>
                )}
                {edgeDown && (
                  <text
                    x={(x1 + x2) / 2}
                    y={(y1 + y2) / 2 - 4}
                    textAnchor="middle"
                    fontSize="6"
                    fill="rgb(244 63 94 / 0.7)"
                    fontFamily="monospace"
                  >
                    DISRUPTED
                  </text>
                )}
              </g>
            )
          })}

          {/* anomaly propagation rings from each downed node */}
          {downIds.map((id, i) => {
            const node = pos(id)
            if (!node) return null
            const cx = pct(node.x, w)
            const cy = pct(node.y, h)
            return (
              <g key={id}>
                <AnomalyRing cx={cx} cy={cy} delay={0} />
                <AnomalyRing cx={cx} cy={cy} delay={0.6} />
                <AnomalyRing cx={cx} cy={cy} delay={1.2} />
              </g>
            )
          })}

          {/* degraded (downstream) rings — amber, single */}
          {NODES.filter(
            (n) => affected.has(n.id) && !downIds.includes(n.id),
          ).map((node) => {
            const cx = pct(node.x, w)
            const cy = pct(node.y, h)
            return (
              <circle key={`deg-${node.id}`} cx={cx} cy={cy} fill="none" stroke="rgb(251 191 36 / 0.5)" strokeWidth="0.6">
                <animate attributeName="r" values="4;16" dur="2.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0" dur="2.4s" repeatCount="indefinite" />
              </circle>
            )
          })}
        </svg>

        {/* Nodes — HTML layer for hover states */}
        {NODES.map((node) => {
          const down      = downIds.includes(node.id)
          const degraded  = !down && affected.has(node.id)
          const hovered   = hoveredNode === node.id

          const ringColor = down
            ? "border-rose-500/60 bg-rose-500/10"
            : degraded
              ? "border-amber-400/50 bg-amber-500/8"
              : hovered
                ? "border-cyan-400/60 bg-cyan-500/8"
                : "border-cyan-400/20 bg-black/70"

          const dotColor = down
            ? "bg-rose-500 ring-rose-500/25"
            : degraded
              ? "bg-amber-400 ring-amber-400/20"
              : "bg-cyan-400 ring-cyan-400/15"

          const pingColor = down
            ? "bg-rose-500"
            : degraded
              ? "bg-amber-400/70"
              : "bg-cyan-400/70"

          const labelColor = down
            ? "text-rose-300"
            : degraded
              ? "text-amber-300"
              : hovered
                ? "text-cyan-300"
                : "text-zinc-300"

          return (
            <div
              key={node.id}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 cursor-pointer"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              role="button"
              tabIndex={0}
              aria-label={`${node.label}: ${down ? "critical" : degraded ? "degraded" : "healthy"}`}
              onKeyDown={(e) => e.key === "Enter" && setHoveredNode(hoveredNode === node.id ? null : node.id)}
            >
              {/* node glyph */}
              <span className="relative flex h-5 w-5 items-center justify-center">
                <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", pingColor)} />
                <span className={cn("absolute inline-flex h-8 w-8 rounded-full border opacity-30 transition-all duration-300", hovered ? "h-10 w-10 opacity-50" : "", down ? "border-rose-500/50" : degraded ? "border-amber-400/40" : "border-cyan-400/30")} />
                <span className={cn("absolute inline-flex h-12 w-12 rounded-full border opacity-15 node-breathe", down ? "border-rose-500/40" : "border-cyan-400/20")} />
                <span className={cn("relative inline-flex h-3 w-3 rounded-full ring-4 transition-transform duration-200", hovered ? "scale-125" : "", dotColor)} />
              </span>

              {/* label chip */}
              <span className={cn("rounded-md border px-2 py-0.5 font-mono text-[10px] backdrop-blur-sm transition-all duration-200", ringColor, labelColor, hovered ? "scale-105 shadow-lg" : "")}>
                {node.label}
              </span>

              {/* hover tooltip card */}
              {hovered && (() => {
                // CHANGED: prefer live serviceMap data over static node data
                const live = getLiveNodeData(node, serviceMap)
                return (
                  <div className="absolute bottom-full mb-2 z-20 w-44 rounded-lg border border-white/[0.08] bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-md pointer-events-none">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-semibold text-zinc-200">{node.label}</span>
                      <span className={cn("font-mono text-[9px] uppercase", down ? "text-rose-400" : degraded ? "text-amber-400" : "text-emerald-400")}>
                        {down ? "CRITICAL" : degraded ? "DEGRADED" : "HEALTHY"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <TooltipRow label="RPS"       value={live.rps} />
                      <TooltipRow label="P99"       value={`${live.latency}ms`} />
                      <TooltipRow label="Instances" value={`${live.instances}x`} />
                      <TooltipRow label="Region"    value={live.region} />
                    </div>
                  </div>
                )
              })()}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TooltipRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className="font-mono text-[9px] text-zinc-300">{value}</span>
    </>
  )
}

// Helper used inside DependencyMap render to get live values for a node
// Falls back to static NODES data when serviceMap not provided
function getLiveNodeData(
  node: { id: string; rps: string; latency: number; instances: number; sublabel: string },
  serviceMap: Record<string, ServiceData>,
) {
  const live = serviceMap[node.id]
  if (!live) return { rps: node.rps, latency: node.latency, instances: node.instances, region: node.sublabel }
  return {
    rps: live.rps,
    latency: live.latency,
    instances: node.instances,
    region: live.region,
  }
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn("h-1.5 w-1.5 rounded-full", color)} />
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
    </span>
  )
}
