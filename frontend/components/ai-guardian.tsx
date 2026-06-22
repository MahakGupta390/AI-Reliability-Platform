"use client"

import { cn } from "@/lib/utils"
import {
  Brain,
  TrendingUp,
  ShieldAlert,
  Lightbulb,
  ChevronRight,
  Zap,
} from "lucide-react"
import { useEffect, useState } from "react"

type InsightSeverity = "critical" | "warn" | "info" | "opportunity"

type Insight = {
  id: string
  type: InsightSeverity
  title: string
  body: string
  confidence: number   // 0-100
  service: string
  eta?: string
}

const INSIGHTS: Insight[] = [
  {
    id: "i1",
    type: "critical",
    title: "Cascade Risk: Payment → Order",
    body: "Payment Gateway P99 trending +38% over 15 min. If latency exceeds 350ms threshold, Order Processor queue depth will saturate within ~8 min.",
    confidence: 91,
    service: "payment-gateway",
    eta: "~8 min",
  },
  {
    id: "i2",
    type: "warn",
    title: "Auth Service Memory Leak Pattern",
    body: "Heap usage growing at 14MB/hr — matches signature of JWT cache eviction bug (CVE-internal-2024-041). Recommend rolling restart within 2h.",
    confidence: 76,
    service: "auth-service",
    eta: "~2h",
  },
  {
    id: "i3",
    type: "opportunity",
    title: "Redis Cluster Over-provisioned",
    body: "Cache hit rate at 98.4% with avg utilization 23%. Scaling from 6→4 replicas would save ~$340/mo with no latency impact at current RPS.",
    confidence: 88,
    service: "redis-cluster",
  },
  {
    id: "i4",
    type: "info",
    title: "Traffic Spike Predicted — 14:00 UTC",
    body: "Historical pattern + current order ingestion rate suggests 1.8× RPS peak in ~35 min. Auto-scaling headroom is sufficient; no action required.",
    confidence: 83,
    service: "order-processor",
    eta: "~35 min",
  },
]

const TYPE_CONFIG: Record<
  InsightSeverity,
  { border: string; bg: string; dot: string; badge: string; label: string }
> = {
  critical: {
    border: "border-rose-500/30",
    bg: "bg-rose-500/5 hover:bg-rose-500/8",
    dot: "bg-rose-500",
    badge: "text-rose-400 bg-rose-500/10 border-rose-500/30",
    label: "CRITICAL",
  },
  warn: {
    border: "border-amber-400/25",
    bg: "bg-amber-500/5 hover:bg-amber-500/8",
    dot: "bg-amber-400",
    badge: "text-amber-300 bg-amber-500/10 border-amber-400/30",
    label: "WARN",
  },
  opportunity: {
    border: "border-emerald-400/25",
    bg: "bg-emerald-500/5 hover:bg-emerald-500/8",
    dot: "bg-emerald-400",
    badge: "text-emerald-300 bg-emerald-500/10 border-emerald-400/30",
    label: "OPTIMIZE",
  },
  info: {
    border: "border-cyan-400/20",
    bg: "bg-cyan-500/4 hover:bg-cyan-500/7",
    dot: "bg-cyan-400",
    badge: "text-cyan-300 bg-cyan-500/10 border-cyan-400/25",
    label: "PREDICT",
  },
}

function ConfidenceBar({ value, type }: { value: number; type: InsightSeverity }) {
  const color =
    type === "critical" ? "bg-rose-500" :
    type === "warn"     ? "bg-amber-400" :
    type === "opportunity" ? "bg-emerald-400" :
    "bg-cyan-400"

  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
        <div
          className={cn("h-full rounded-full bar-fill", color)}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-6 text-right font-mono text-[9px] text-zinc-500">
        {value}%
      </span>
    </div>
  )
}

function InsightCard({ insight, expanded, onToggle }: {
  insight: Insight
  expanded: boolean
  onToggle: () => void
}) {
  const cfg = TYPE_CONFIG[insight.type]
  return (
    <button
      className={cn(
        "group w-full rounded-lg border p-3 text-left transition-all duration-200",
        cfg.border,
        cfg.bg,
      )}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", cfg.dot)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn("rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold", cfg.badge)}>
              {cfg.label}
            </span>
            <span className="font-mono text-[9px] text-zinc-600 truncate">
              {insight.service}
            </span>
            {insight.eta && (
              <span className="ml-auto font-mono text-[9px] text-zinc-600 shrink-0">
                ETA {insight.eta}
              </span>
            )}
          </div>
          <p className="text-[11px] font-semibold leading-snug text-zinc-200 mb-1.5">
            {insight.title}
          </p>
          {expanded && (
            <p className="text-[10px] leading-relaxed text-zinc-400 mb-2">
              {insight.body}
            </p>
          )}
          <ConfidenceBar value={insight.confidence} type={insight.type} />
        </div>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform duration-200 mt-0.5",
            expanded ? "rotate-90" : "",
          )}
          aria-hidden="true"
        />
      </div>
    </button>
  )
}

export function AiGuardian({ downIds }: { downIds: string[] }) {
  const [expandedId, setExpandedId] = useState<string | null>("i1")
  const [scanLine, setScanLine] = useState(false)
  const [analysisTs, setAnalysisTs] = useState("")

  // re-trigger scan animation when incidents change
  useEffect(() => {
    setScanLine(true)
    const t = setTimeout(() => setScanLine(false), 3000)
    setAnalysisTs(new Date().toLocaleTimeString("en-US", { hour12: false }))
    return () => clearTimeout(t)
  }, [downIds])

  const criticalCount = INSIGHTS.filter((i) => i.type === "critical").length
  const warnCount     = INSIGHTS.filter((i) => i.type === "warn").length

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="AI Guardian Insights"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Brain className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          {scanLine && (
            <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" />
          )}
        </div>
        <h2 className="text-sm font-semibold tracking-tight">
          AI Guardian Insights
        </h2>
        <div className="ml-auto flex items-center gap-2">
          {analysisTs && (
            <span className="font-mono text-[9px] text-zinc-600">
              last scan {analysisTs}
            </span>
          )}
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryChip
          icon={ShieldAlert}
          label="Critical"
          value={criticalCount}
          color="text-rose-400"
          bg="bg-rose-500/8 border-rose-500/20"
        />
        <SummaryChip
          icon={TrendingUp}
          label="Warnings"
          value={warnCount}
          color="text-amber-400"
          bg="bg-amber-500/8 border-amber-400/20"
        />
        <SummaryChip
          icon={Lightbulb}
          label="Optimize"
          value={1}
          color="text-emerald-400"
          bg="bg-emerald-500/8 border-emerald-400/20"
        />
      </div>

      {/* Scan line effect */}
      <div className="relative overflow-hidden rounded-lg border border-white/[0.04] bg-white/[0.01] px-3 py-2">
        {scanLine && (
          <div
            className="scan-line pointer-events-none absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
            aria-hidden="true"
          />
        )}
        <div className="flex items-center gap-2">
          <Zap className="h-3 w-3 text-cyan-400/60" aria-hidden="true" />
          <span className="font-mono text-[10px] text-zinc-500">
            Model confidence threshold:{" "}
            <span className="text-zinc-300">≥ 70%</span>
            {" "}· Analyzing{" "}
            <span className="text-cyan-400">
              {INSIGHTS.length} active signals
            </span>
          </span>
        </div>
      </div>

      {/* Insight cards */}
      <div className="flex flex-col gap-2">
        {INSIGHTS.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            expanded={expandedId === insight.id}
            onToggle={() =>
              setExpandedId(expandedId === insight.id ? null : insight.id)
            }
          />
        ))}
      </div>
    </section>
  )
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  color,
  bg,
}: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-lg border px-2 py-2",
        bg,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", color)} aria-hidden="true" />
      <span className={cn("font-mono text-base font-bold leading-none tabular-nums", color)}>
        {value}
      </span>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
    </div>
  )
}
