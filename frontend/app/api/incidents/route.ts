// ─────────────────────────────────────────────────────────────────────────────
// app/api/incidents/route.ts
//
// Proxies to ai-service:3004/incidents and ai-service:3004/analysis.
// Returns normalised data consumed by AiGuardian and ActivityFeed.
//
// Two query params:
//   ?mode=insights  → returns NormalisedIncident[] for AiGuardian panel
//   ?mode=activity  → returns ActivityItem[] for ActivityFeed
//   (default: both)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import type { BackendIncident, NormalisedIncident, ActivityItem } from "@/lib/types"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Map backend severity + zScore into frontend insight type */
function incidentToInsightType(inc: BackendIncident): NormalisedIncident["type"] {
  if (inc.status === "open") {
    if (inc.severity === "critical" || inc.severity === "high") return "critical"
    if (inc.severity === "medium") return "warn"
    return "info"
  }
  return "info"
}

/** Map rootCauseConfidence string to 0-100 numeric */
function confidenceToNumber(conf: "LOW" | "MEDIUM" | "HIGH"): number {
  return conf === "HIGH" ? 91 : conf === "MEDIUM" ? 72 : 54
}

/** Format ISO date as "Xm ago" / "Xh ago" / "Xd ago" */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Strip "-service" suffix for display: "auth-service" → "auth-service" (keep as-is) */
function fmtService(s: string): string {
  return s
}

/** Map incident severity to activity level */
function severityToLevel(inc: BackendIncident): ActivityItem["level"] {
  if (inc.status === "resolved") return "ok"
  if (inc.severity === "critical" || inc.severity === "high") return "error"
  return "warn"
}

/** Build a one-line activity message from an incident */
function incidentToMessage(inc: BackendIncident): string {
  if (inc.status === "resolved") {
    return `${fmtService(inc.affectedService)} incident auto-resolved — ${inc.symptom}`
  }
  return inc.symptom
}

// ── Fetch and normalise ───────────────────────────────────────────────────────

async function fetchIncidents(): Promise<BackendIncident[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(`${AI_URL}/incidents?limit=30`, {
      signal: controller.signal,
      cache: "no-store",
    })
    const json = await res.json()
    return (json.data ?? []) as BackendIncident[]
  } catch {
    return []
  } finally {
    clearTimeout(timeout)
  }
}

function normaliseInsights(incidents: BackendIncident[]): NormalisedIncident[] {
  // Open incidents → critical/warn cards
  const open = incidents.filter((i) => i.status === "open")

  const cards: NormalisedIncident[] = open.map((inc) => ({
    id: inc.incidentId,
    type: incidentToInsightType(inc),
    title: `${fmtService(inc.affectedService)} — ${inc.severity.toUpperCase()} anomaly`,
    body: `${inc.symptom}. Root cause: ${inc.evidence.rootCause} (${inc.evidence.rootCauseConfidence} confidence). Z-score: ${inc.evidence.zScore.toFixed(2)}σ, ${inc.evidence.deviationFactor.toFixed(1)}× baseline.`,
    confidence: confidenceToNumber(inc.evidence.rootCauseConfidence),
    service: fmtService(inc.affectedService),
    detectedAt: inc.detectedAt,
    status: inc.status,
  }))

  // If no open incidents, show most recent resolved ones as info cards
  if (cards.length === 0) {
    const recent = incidents.slice(0, 3)
    recent.forEach((inc) => {
      cards.push({
        id: inc.incidentId,
        type: "info",
        title: `${fmtService(inc.affectedService)} — resolved`,
        body: inc.symptom,
        confidence: confidenceToNumber(inc.evidence.rootCauseConfidence),
        service: fmtService(inc.affectedService),
        detectedAt: inc.detectedAt,
        status: "resolved",
      })
    })
  }

  // Always add the static "opportunity" card (no real backend source yet)
  cards.push({
    id: "static-optimize-1",
    type: "opportunity",
    title: "Redis Cluster Over-provisioned",
    body: "Cache hit rate at 98.4% with avg utilisation 23%. Scaling from 6→4 replicas would save ~$340/mo with no latency impact at current RPS.",
    confidence: 88,
    service: "redis-cluster",
    detectedAt: new Date().toISOString(),
    status: "open",
  })

  return cards
}

function normaliseActivity(incidents: BackendIncident[]): ActivityItem[] {
  return incidents.slice(0, 20).map((inc) => ({
    id: inc.incidentId,
    time: timeAgo(inc.detectedAt),
    message: incidentToMessage(inc),
    level: severityToLevel(inc),
  }))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get("mode")

  const incidents = await fetchIncidents()

  if (mode === "insights") {
    return NextResponse.json(normaliseInsights(incidents))
  }
  if (mode === "activity") {
    return NextResponse.json(normaliseActivity(incidents))
  }

  // Default: return both
  return NextResponse.json({
    insights: normaliseInsights(incidents),
    activity: normaliseActivity(incidents),
  })
}
