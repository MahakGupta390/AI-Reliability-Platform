// ─────────────────────────────────────────────────────────────────────────────
// app/api/settings/baselines/route.ts  [NEW — Screen 5]
//
// GET  /api/settings/baselines       → current baselines from ai-service
// PATCH /api/settings/baselines      → update one service's baseline
//
// Proxies to ai-service:3004/analysis/baselines (GET, already exists)
// and a new PATCH endpoint we ask the backend to expose.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

export async function GET() {
  try {
    const res = await fetch(`${AI_URL}/analysis/baselines`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      return NextResponse.json({ success: false, baselines: {} }, { status: 502 })
    }
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ success: false, baselines: {}, error: "AI service unreachable" })
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const res = await fetch(`${AI_URL}/analysis/baselines`, {
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
