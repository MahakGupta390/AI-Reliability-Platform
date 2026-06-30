"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/incidents/postmortem-drawer.tsx  [NEW — Screen 4]
// Right-side panel: full incident detail + AI postmortem generator.
// Calls Claude API (claude-sonnet-4-6) to generate structured postmortem.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import {
  FileText, Brain, CheckCheck, Eye,
  AlertTriangle, Clock, ArrowRight, X,
  Loader2, Copy, Check,
} from "lucide-react"
import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { AnimatedNumber } from "@/components/animated-number"
import type { IncidentRow } from "@/lib/types"

const CONF_STYLE: Record<string, string> = {
  HIGH:   "text-rose-400   border-rose-500/30  bg-rose-500/10",
  MEDIUM: "text-amber-400  border-amber-400/30 bg-amber-500/10",
  LOW:    "text-zinc-400   border-zinc-600/20  bg-zinc-800/20",
}

const SEV_STYLE: Record<string, string> = {
  critical: "text-rose-400  border-rose-500/30 bg-rose-500/10",
  high:     "text-rose-300  border-rose-400/25 bg-rose-400/10",
  medium:   "text-amber-400 border-amber-400/30 bg-amber-500/10",
  low:      "text-zinc-400  border-zinc-600/20  bg-zinc-800/20",
}

// ── Postmortem Generator using Claude API ─────────────────────────────────────
async function generatePostmortem(incident: IncidentRow): Promise<string> {
  const prompt = `You are an expert SRE writing a postmortem for a production incident.

Generate a structured postmortem for this incident:

Incident ID: ${incident.incidentId}
Service: ${incident.affectedService}
Severity: ${incident.severity}
Symptom: ${incident.symptom}
Peak Z-Score: ${incident.peakZScore.toFixed(2)}σ
Peak P99 Latency: ${incident.peakP99Ms}ms
Baseline P99: ${incident.evidence.baselineMeanMs}ms
Duration: ${incident.durationLabel}
Root Cause: ${incident.evidence.rootCause}
Root Cause Confidence: ${incident.evidence.rootCauseConfidence}
Detected At: ${new Date(incident.detectedAt).toISOString()}
${incident.chaosInjected ? "Note: This incident was created during a chaos engineering experiment." : ""}

Generate a concise professional postmortem with these exact sections:
## Summary
## Timeline
## Root Cause Analysis
## Impact
## What Went Well
## Action Items

Keep each section brief and technical. Use bullet points for action items. Be specific about the latency numbers.`

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  if (!response.ok) throw new Error(`API error: ${response.status}`)
  const data = await response.json()
  return data.content?.[0]?.text ?? "Failed to generate postmortem."
}

// ── Postmortem viewer ─────────────────────────────────────────────────────────
function PostmortemContent({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Parse markdown sections into structured blocks
  const sections = text.split(/\n## /).filter(Boolean).map((s) => {
    const [title, ...body] = s.split("\n")
    return { title: title.replace("## ", "").trim(), body: body.join("\n").trim() }
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Brain className="h-3.5 w-3.5 text-cyan-400" />
          <span className="font-mono text-[11px] font-semibold text-zinc-300">
            AI-Generated Postmortem
          </span>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-1 font-mono text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="flex flex-col gap-3 max-h-[420px] overflow-y-auto pr-1">
        {sections.map((sec) => (
          <div key={sec.title} className="rounded-lg border border-white/[0.05] bg-white/[0.01] p-3">
            <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-2">
              {sec.title}
            </h4>
            <div className="font-mono text-[11px] leading-relaxed text-zinc-400 whitespace-pre-line">
              {sec.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────
type Props = {
  incident: IncidentRow | null
  onResolve: (id: string) => void
  onAcknowledge: (id: string) => void
  onClose: () => void
}

export function PostmortemDrawer({ incident, onResolve, onAcknowledge, onClose }: Props) {
  const [postmortem, setPostmortem]   = useState<string | null>(null)
  const [generating, setGenerating]   = useState(false)
  const [genError, setGenError]       = useState<string | null>(null)

  const handleGenerate = useCallback(async () => {
    if (!incident) return
    setGenerating(true)
    setGenError(null)
    setPostmortem(null)
    try {
      const text = await generatePostmortem(incident)
      setPostmortem(text)
    } catch (err: any) {
      setGenError(err.message ?? "Generation failed")
    } finally {
      setGenerating(false)
    }
  }, [incident])

  // Reset postmortem when incident changes
  const prevId = incident?.incidentId
  if (postmortem && incident?.incidentId !== prevId) {
    setPostmortem(null)
    setGenError(null)
  }

  if (!incident) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.04] bg-black p-6">
        <FileText className="h-8 w-8 text-zinc-700" />
        <p className="font-mono text-[11px] text-zinc-600 text-center">
          Select an incident from the table<br />to view details and generate a postmortem
        </p>
      </div>
    )
  }

  const ev     = incident.evidence
  const isOpen = incident.status === "open"
  const snaps  = Object.entries(ev.allServicesSnapshot ?? {})

  return (
    <div className="flex flex-col gap-4 h-full">

      {/* Header card */}
      <section className={cn(
        "rounded-xl border p-5 transition-all duration-300",
        isOpen
          ? "border-rose-500/20 bg-black shadow-[0_0_40px_-12px_rgba(239,68,68,0.15)]"
          : "border-white/[0.04] bg-black",
      )}>
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn(
                "rounded border px-2 py-0.5 font-mono text-[9px] font-bold uppercase",
                SEV_STYLE[incident.severity],
              )}>
                {incident.severity}
              </span>
              {isOpen && (
                <span className="flex items-center gap-1 font-mono text-[9px] text-rose-400">
                  <span className="h-1 w-1 animate-ping rounded-full bg-rose-500" />
                  LIVE
                </span>
              )}
              {incident.chaosInjected && (
                <span className="rounded border border-violet-500/25 bg-violet-500/8 px-1.5 py-0.5 font-mono text-[9px] text-violet-400">
                  CHAOS
                </span>
              )}
            </div>
            <p className="font-mono text-[11px] text-zinc-300 leading-snug">{incident.symptom}</p>
            <span className="font-mono text-[9px] text-zinc-600">{incident.incidentId}</span>
          </div>
          <button onClick={onClose} className="shrink-0 text-zinc-600 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <MetaCell label="Service"   value={incident.affectedService} />
          <MetaCell label="Detected"  value={incident.timeAgo} />
          <MetaCell label="Duration"  value={incident.durationLabel} />
          <MetaCell label="Peak P99"  value={`${incident.peakP99Ms}ms`} highlight />
        </div>

        {/* Z-score bar */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="flex justify-between">
            <span className="font-mono text-[9px] text-zinc-600">Peak Z-Score</span>
            <span className={cn(
              "font-mono text-[11px] font-bold tabular-nums",
              incident.peakZScore >= 6 ? "text-rose-400" : "text-amber-400",
            )}>
              <AnimatedNumber value={incident.peakZScore} decimals={1} />σ
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                incident.peakZScore >= 6 ? "bg-rose-500" :
                incident.peakZScore >= 3 ? "bg-amber-400" : "bg-emerald-400",
              )}
              style={{ width: `${Math.min(100, (incident.peakZScore / 10) * 100)}%` }}
            />
          </div>
        </div>

        {/* Action buttons */}
        {isOpen && (
          <div className="flex gap-2">
            <Button
              onClick={() => onAcknowledge(incident.incidentId)}
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 border-zinc-700 bg-transparent font-mono text-[10px] uppercase tracking-wider text-zinc-400 hover:border-amber-400/40 hover:text-amber-300"
            >
              <Eye className="h-3.5 w-3.5" />
              Acknowledge
            </Button>
            <Button
              onClick={() => onResolve(incident.incidentId)}
              size="sm"
              className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 font-mono text-[10px] uppercase tracking-wider text-white border-transparent"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark Resolved
            </Button>
          </div>
        )}
      </section>

      {/* Root cause + evidence */}
      <section className="rounded-xl border border-white/[0.04] bg-black p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Root Cause Analysis
          </span>
          <span className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold",
            CONF_STYLE[ev.rootCauseConfidence],
          )}>
            {ev.rootCauseConfidence} CONFIDENCE
          </span>
        </div>
        <p className="font-mono text-[11px] font-semibold text-zinc-200">{ev.rootCause}</p>

        {/* Services snapshot */}
        {snaps.length > 0 && (
          <div className="flex flex-col gap-1">
            {snaps.map(([svc, snap]) => (
              <div key={svc} className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-1.5",
                snap.status === "anomalous"
                  ? "border-rose-500/20 bg-rose-500/5 text-rose-400"
                  : snap.status === "normal"
                    ? "border-emerald-500/15 bg-emerald-500/4 text-emerald-400"
                    : "border-zinc-700/20 text-zinc-600",
              )}>
                <span className="font-mono text-[10px]">{svc}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[9px] opacity-70">{snap.currentP99Ms}ms</span>
                  <span className="font-mono text-[9px] opacity-70">{snap.zScore.toFixed(1)}σ</span>
                  <span className={cn(
                    "rounded border px-1 py-0.5 font-mono text-[8px] uppercase font-semibold",
                    snap.status === "anomalous"
                      ? "border-rose-500/30 text-rose-400"
                      : "border-emerald-500/20 text-emerald-400",
                  )}>
                    {snap.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* AI Postmortem Generator */}
      <section className="rounded-xl border border-white/[0.04] bg-black p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold tracking-tight">Postmortem Generator</h3>
          <span className="ml-auto font-mono text-[9px] text-zinc-600">powered by Claude</span>
        </div>

        {!postmortem && !generating && !genError && (
          <div className="flex flex-col items-center gap-3 py-6">
            <FileText className="h-8 w-8 text-zinc-700" />
            <p className="font-mono text-[10px] text-zinc-600 text-center">
              Generate a structured postmortem document<br />with root cause, timeline, and action items
            </p>
            <Button
              onClick={handleGenerate}
              className="gap-2 bg-cyan-600 hover:bg-cyan-500 font-mono text-[11px] uppercase tracking-wider text-white border-transparent"
            >
              <Brain className="h-3.5 w-3.5" />
              Generate Postmortem
            </Button>
          </div>
        )}

        {generating && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
            <span className="font-mono text-[11px] text-zinc-500">
              Analyzing incident data...
            </span>
          </div>
        )}

        {genError && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
              <span className="font-mono text-[10px] text-rose-400">{genError}</span>
            </div>
            <Button
              onClick={handleGenerate}
              variant="outline"
              size="sm"
              className="gap-1.5 border-zinc-700 font-mono text-[10px] text-zinc-400"
            >
              Retry
            </Button>
          </div>
        )}

        {postmortem && <PostmortemContent text={postmortem} />}
      </section>
    </div>
  )
}

function MetaCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/[0.04] bg-white/[0.01] px-2.5 py-2">
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <span className={cn("font-mono text-[11px] font-semibold", highlight ? "text-rose-300" : "text-zinc-300")}>
        {value}
      </span>
    </div>
  )
}
