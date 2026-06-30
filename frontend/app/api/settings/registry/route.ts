// ─────────────────────────────────────────────────────────────────────────────
// app/api/settings/registry/route.ts  [MODIFIED — Screen 5 backend wired]
//
// GET /api/settings/registry
// Returns the static service registry merged with:
//   - live health status from each microservice's /health endpoint
//   - PERSISTED monitored status from ai-service /config/registry
//     (was hardcoded `monitored: true` before — now reflects real DB state)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import type { RegistryEntry } from "@/lib/types"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

const REGISTRY = [
  { id: "auth",     name: "Auth Service",    region: "us-east-1",    url: process.env.AUTH_SERVICE_URL    ?? "http://localhost:3001" },
  { id: "payments", name: "Payment Gateway", region: "us-west-2",    url: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002" },
  { id: "orders",   name: "Order Processor", region: "eu-central-1",url: process.env.ORDER_SERVICE_URL   ?? "http://localhost:3003" },
]

async function checkHealth(url: string): Promise<RegistryEntry["status"]> {
  try {
    const res = await fetch(`${url}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return "DOWN"
    const data = await res.json()
    const sim = data.simulation ?? {}
    if (data.status !== "ok") return "DOWN"
    if (sim.highLatency || sim.failureRate > 0 || sim.timeoutMode) return "DEGRADED"
    return "UP"
  } catch {
    return "DOWN"
  }
}

// CHANGED: fetch real persisted monitored-status map from ai-service
async function fetchMonitoredMap(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${AI_URL}/config/registry`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return {}
    const data = await res.json()
    return data.monitored ?? {}
  } catch {
    return {}
  }
}

export async function GET() {
  const [monitoredMap, entries] = await Promise.all([
    fetchMonitoredMap(),
    Promise.all(
      REGISTRY.map(async (svc) => ({
        id: svc.id,
        name: svc.name,
        url: svc.url,
        region: svc.region,
        status: await checkHealth(svc.url),
      })),
    ),
  ])

  const merged: RegistryEntry[] = entries.map((e) => ({
    ...e,
    // CHANGED: real persisted value — defaults to true if not yet set
    monitored: monitoredMap[e.id] ?? true,
  }))

  return NextResponse.json({ success: true, services: merged }, {
    headers: { "Cache-Control": "no-store" },
  })
}

// NEW — PATCH /api/settings/registry  { id, monitored }
// Persists the monitored toggle via ai-service /config/registry/:id
export async function PATCH(req: Request) {
  try {
    const { id, monitored } = await req.json()

    if (!id || typeof monitored !== "boolean") {
      return NextResponse.json(
        { success: false, message: "id and monitored (boolean) are required" },
        { status: 400 },
      )
    }

    const res = await fetch(`${AI_URL}/config/registry/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monitored }),
      signal: AbortSignal.timeout(5000),
    })

    const data = await res.json()
    if (!res.ok) {
      return NextResponse.json({ success: false, message: data.message ?? "Update failed" }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ success: false, message: "AI service unreachable" }, { status: 503 })
  }
}
