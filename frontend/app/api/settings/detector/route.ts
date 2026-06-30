// ─────────────────────────────────────────────────────────────────────────────
// app/api/settings/detector/route.ts  [NEW — Screen 5]
//
// GET   /api/settings/detector  → current Z-score thresholds + poll interval
// PATCH /api/settings/detector  → update thresholds (writes to process.env at runtime)
//
// Proxies to ai-service /analysis (GET, reads detector config block)
// and a new PATCH /analysis/detector endpoint.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

export async function GET() {
  try {
    const res = await fetch(`${AI_URL}/analysis`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ success: false }, { status: 502 })
    const json = await res.json()
    return NextResponse.json({
      success: true,
      detector: json.data?.detector ?? null,
    })
  } catch {
    return NextResponse.json({ success: false, detector: null, error: "AI service unreachable" })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${AI_URL}/analysis/detector`, {
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
