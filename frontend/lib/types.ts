// ─────────────────────────────────────────────────────────────────────────────
// lib/types.ts
// Single source of truth for all data shapes used by frontend components.
// These mirror the exact JSON your backend returns — if backend changes a
// field name, change it here and TypeScript will flag every broken usage.
// ─────────────────────────────────────────────────────────────────────────────

// ── Raw backend shapes (what the API actually returns) ────────────────────────

/** Shape of GET :port/health on each microservice */
export type BackendHealth = {
  status: "ok" | "error"
  service: string
  timestamp: string
  uptime: number
  simulation: {
    highLatency: boolean
    latencyMs: number
    failureRate: number
    timeoutMode: boolean
  }
}

/** Shape of GET :port/metrics on each microservice */
export type BackendMetrics = {
  service: string
  timestamp: string
  uptime: string
  summary: {
    totalRequests: number
    totalErrors: number
    errorRate: string      // e.g. "0.14%"
    throughput: string     // e.g. "47.32 req/min"
  }
  latency: {
    avgMs: number
    p95Ms: number
    p99Ms: number
    minMs: number
    maxMs: number
  }
  endpoints: {
    method: string
    endpoint: string
    totalRequests: number
    totalErrors: number
    errorRate: string
    avgLatencyMs: number
    p95LatencyMs: number
    p99LatencyMs: number
  }[]
  recentRequests: {
    requestId: string
    method: string
    endpoint: string
    statusCode: number
    latencyMs: number
    timestamp: string
  }[]
}

/** Shape of GET ai-service:3004/incidents */
export type BackendIncident = {
  _id: string
  incidentId: string
  status: "open" | "resolved"
  severity: "low" | "medium" | "high" | "critical"
  affectedService: string
  symptom: string
  detectedAt: string       // ISO date string
  resolvedAt: string | null
  durationMs: number | null
  peakZScore: number
  peakP99Ms: number
  evidence: {
    affectedService: string
    currentP99Ms: number
    baselineMeanMs: number
    baselineStdDev: number
    zScore: number
    deviationFactor: number
    rootCause: string
    rootCauseConfidence: "LOW" | "MEDIUM" | "HIGH"
    allServicesSnapshot: Record<string, {
      currentP99Ms: number
      zScore: number
      status: "normal" | "anomalous" | "no_data"
    }>
  }
  timeline: {
    at: string
    event: string
    zScore?: number
    p99Ms?: number
  }[]
}

// ── Normalised frontend shapes (what components consume) ─────────────────────

/** What ServiceCard and DependencyMap receive */
export type ServiceData = {
  id: string               // "auth" | "payments" | "orders"
  name: string
  region: string
  status: "UP" | "DOWN" | "DEGRADED"
  latency: number          // p99 in ms
  latencyTrend: "up" | "down"
  errorRate: number        // numeric %, e.g. 0.14
  series: number[]         // last-10 p99 samples normalised 0-1 for sparkline
  cpu: number              // approximate from throughput
  mem: string              // from uptime context or static fallback
  rps: string              // formatted throughput
  simulation: {
    highLatency: boolean
    failureRate: number
  }
  rawLatencyHistory: number[]  // last 10 p99Ms values (unnormalised), for DependencyMap tooltip
}

/** What HealthHeader metrics strip receives */
export type AggregateMetrics = {
  cpu: number
  memory: number
  rps: number
  p99: number
  errorRate: number
  healthScore: number
}

/** What AiGuardian and ActivityFeed receive */
export type NormalisedIncident = {
  id: string
  type: "critical" | "warn" | "info" | "opportunity"
  title: string
  body: string
  confidence: number
  service: string
  eta?: string
  detectedAt: string
  status: "open" | "resolved"
}

export type ActivityItem = {
  id: string
  time: string
  message: string
  level: "ok" | "warn" | "error"
}
