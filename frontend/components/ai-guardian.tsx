// ─────────────────────────────────────────────────────────────────────────────
// components/ai-guardian.tsx   [MODIFIED]
//
// CHANGES:
//   1. Removed hardcoded INSIGHTS array
//   2. Now uses useInsights() hook → polls /api/incidents?mode=insights every 10s
//   3. criticalCount, warnCount derived from live data
//   4. InsightSkeleton shown on first load
//   5. ErrorBanner shown if AI service is unreachable
//   6. downIds prop kept — used to re-trigger scan animation on real incidents
// ─────────────────────────────────────────────────────────────────────────────

"use client"

import { cn } from "@/lib/utils"
import { Brain, TrendingUp, ShieldAlert, Lightbulb, ChevronRight, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { useInsights } from "@/lib/hooks/useIncidents"    // CHANGED: new hook
import { InsightSkeleton, ErrorBanner } from "@/components/skeletons"
import type { NormalisedIncident } from "@/lib/types"

type InsightSeverity = NormalisedIncident["type"]

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
    type === "critical"    ? "bg-rose-500"    :
    type === "warn"        ? "bg-amber-400"   :
    type === "opportunity" ? "bg-emerald-400" :
    "bg-cyan-400"
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
        <div className={cn("h-full rounded-full bar-fill", color)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right font-mono text-[9px] text-zinc-500">{value}%</span>
    </div>
  )
}

function InsightCard({
  insight,
  expanded,
  onToggle,
}: {
  insight: NormalisedIncident
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
            <span className="font-mono text-[9px] text-zinc-600 truncate">{insight.service}</span>
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
            <p className="text-[10px] leading-relaxed text-zinc-400 mb-2">{insight.body}</p>
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [scanLine, setScanLine] = useState(false)
  const [analysisTs, setAnalysisTs] = useState("")

  // CHANGED: real data from hook instead of hardcoded INSIGHTS array
  const { insights, isLoading, error } = useInsights()

  // Set first insight expanded once data arrives
  useEffect(() => {
    if (insights.length > 0 && expandedId === null) {
      setExpandedId(insights[0].id)
    }
  }, [insights, expandedId])

  // Re-trigger scan animation when downIds or insights change
  useEffect(() => {
    setScanLine(true)
    const t = setTimeout(() => setScanLine(false), 3000)
    setAnalysisTs(new Date().toLocaleTimeString("en-US", { hour12: false }))
    return () => clearTimeout(t)
  }, [downIds, insights.length])

  // CHANGED: counts derived from live data
  const criticalCount = insights.filter((i) => i.type === "critical").length
  const warnCount     = insights.filter((i) => i.type === "warn").length
  const optimizeCount = insights.filter((i) => i.type === "opportunity").length

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="AI Guardian Insights"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Brain className="h-4 w-4 text-cyan-400" aria-hidden="true" />
          {scanLine && <span className="absolute inset-0 animate-ping rounded-full bg-cyan-400/20" />}
        </div>
        <h2 className="text-sm font-semibold tracking-tight">AI Guardian Insights</h2>
        <div className="ml-auto flex items-center gap-2">
          {analysisTs && (
            <span className="font-mono text-[9px] text-zinc-600">last scan {analysisTs}</span>
          )}
        </div>
      </div>

      {/* Summary chips — CHANGED: all counts from live data */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryChip icon={ShieldAlert} label="Critical" value={criticalCount} color="text-rose-400"    bg="bg-rose-500/8 border-rose-500/20" />
        <SummaryChip icon={TrendingUp}  label="Warnings" value={warnCount}     color="text-amber-400"   bg="bg-amber-500/8 border-amber-400/20" />
        <SummaryChip icon={Lightbulb}   label="Optimize" value={optimizeCount} color="text-emerald-400" bg="bg-emerald-500/8 border-emerald-400/20" />
      </div>

      {/* Scan line status bar */}
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
            {/* CHANGED: live signal count */}
            <span className="text-cyan-400">{insights.length} active signals</span>
          </span>
        </div>
      </div>

      {/* Insight cards — CHANGED: renders live insights with skeleton/error states */}
      {isLoading ? (
        <InsightSkeleton />
      ) : error ? (
        <ErrorBanner message="AI service unreachable — showing cached insights" />
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight) => (
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
      )}
    </section>
  )
}

function SummaryChip({
  icon: Icon, label, value, color, bg,
}: {
  icon: React.ElementType; label: string; value: number; color: string; bg: string
}) {
  return (
    <div className={cn("flex flex-col items-center gap-1 rounded-lg border px-2 py-2", bg)}>
      <Icon className={cn("h-3.5 w-3.5", color)} aria-hidden="true" />
      <span className={cn("font-mono text-base font-bold leading-none tabular-nums", color)}>
        {value}
      </span>
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
    </div>
  )
}
