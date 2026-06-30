// ─────────────────────────────────────────────────────────────────────────────
// Copy to: services-enhanced/app/api/incidents/search/route.ts
//
// GET /api/incidents/search?status=open&severity=critical&service=auth-service&q=latency
// Proxies to ai-service:3004/incidents/search with all query params forwarded
// Used by: IncidentTable for server-side filtering + full-text search
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // Forward all query params to ai-service
    const params = new URLSearchParams()
    for (const [key, val] of searchParams.entries()) {
      params.set(key, val)
    }

    // Default limit if not provided
    if (!params.has("limit")) params.set("limit", "200")

    const res = await fetch(
      `${AI_URL}/incidents/search?${params.toString()}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      }
    )

    if (!res.ok) {
      return NextResponse.json(
        { error: `AI service returned ${res.status}` },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json(
      { error: "AI service unreachable", data: [], total: 0 },
      { status: 503 }
    )
  }
}
