// ─────────────────────────────────────────────────────────────────────────────
// app/api/chaos/route.ts  [NEW]
//
// POST /api/chaos  — apply chaos config to a microservice
// DELETE /api/chaos — restore all services to normal
//
// Proxies to each Express microservice's simulation control endpoints.
// Your backend failureSimulator middleware reads these env/flags at runtime.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"
import type { ChaosConfig } from "@/lib/types"

const SERVICE_URLS: Record<string, string> = {
  auth:     process.env.AUTH_SERVICE_URL    ?? "http://localhost:3001",
  payments: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002",
  orders:   process.env.ORDER_SERVICE_URL   ?? "http://localhost:3003",
}

// POST /api/chaos — inject failure into one service
export async function POST(req: Request) {
  try {
    const body: ChaosConfig = await req.json()
    const { serviceId, highLatency, failureRate, timeoutMode } = body

    const baseUrl = SERVICE_URLS[serviceId]
    if (!baseUrl) {
      return NextResponse.json(
        { success: false, message: `Unknown serviceId: ${serviceId}` },
        { status: 400 },
      )
    }

    // Your backend failureSimulator middleware exposes POST /simulate
    // Payload shape matches what the middleware expects
    const res = await fetch(`${baseUrl}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        highLatency,
        latencyMs: highLatency ? 800 : 0,
        failureRate: failureRate / 100,   // backend expects 0-1
        timeoutMode,
      }),
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { success: false, message: `Backend rejected: ${text}` },
        { status: 502 },
      )
    }

    return NextResponse.json({
      success: true,
      serviceId,
      applied: body,
      message: `Chaos applied to ${serviceId}`,
    })
  } catch (err) {
    // Service unreachable — apply mock state on frontend only
    return NextResponse.json(
      {
        success: false,
        message: "Service unreachable — chaos simulated on frontend only",
        frontendOnly: true,
      },
      { status: 200 }, // 200 so UI still updates
    )
  }
}

// DELETE /api/chaos — restore all services
export async function DELETE() {
  const results = await Promise.allSettled(
    Object.entries(SERVICE_URLS).map(([id, url]) =>
      fetch(`${url}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          highLatency: false,
          latencyMs: 0,
          failureRate: 0,
          timeoutMode: false,
        }),
        signal: AbortSignal.timeout(4000),
      }),
    ),
  )

  const allOk = results.every((r) => r.status === "fulfilled")
  return NextResponse.json({
    success: true,
    allRestored: allOk,
    message: allOk ? "All services restored" : "Some services unreachable — partially restored",
  })
}
