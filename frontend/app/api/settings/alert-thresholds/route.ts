// ─────────────────────────────────────────────────────────────────────────────
// app/api/settings/alert-thresholds/route.ts  [NEW — Screen 5 backend wired]
//
// GET   /api/settings/alert-thresholds   → read persisted thresholds
// PATCH /api/settings/alert-thresholds   → save one service's thresholds
//
// Proxies to ai-service /config/alert-thresholds (new in Screen 5 backend).
// This route did not exist before — AlertThresholds component was
// previously client-state-only with no persistence at all.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

export async function GET() {
  try {
    const res = await fetch(`${AI_URL}/config/alert-thresholds`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json({ success: false, thresholds: {} }, { status: 502 })
    }
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ success: false, thresholds: {}, error: "AI service unreachable" })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${AI_URL}/config/alert-thresholds`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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
