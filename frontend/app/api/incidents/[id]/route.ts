// ─────────────────────────────────────────────────────────────────────────────
// Copy to: services-enhanced/app/api/incidents/[id]/route.ts
//
// PATCH /api/incidents/[id]?action=acknowledge
// PATCH /api/incidents/[id]?action=resolve
// GET   /api/incidents/[id]
//
// Action router — forwards to the correct ai-service sub-endpoint:
//   ?action=acknowledge  → PATCH ai-service/incidents/:id/acknowledge
//   ?action=resolve      → PATCH ai-service/incidents/:id/resolve
//   (no action)          → PATCH ai-service/incidents/:id  (legacy generic)
//
// Used by: PostmortemDrawer "Acknowledge" + "Mark Resolved" buttons
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

// GET single incident
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const res = await fetch(
      `${AI_URL}/incidents/${params.id}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok)
      return NextResponse.json({ error: "Not found" }, { status: res.status })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ error: "AI service unreachable" }, { status: 503 })
  }
}

// PATCH — acknowledge or resolve
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get("action")  // "acknowledge" | "resolve" | null

    const body = await req.json().catch(() => ({}))

    // Determine the target endpoint
    let endpoint: string
    if (action === "acknowledge") {
      endpoint = `${AI_URL}/incidents/${params.id}/acknowledge`
    } else if (action === "resolve") {
      endpoint = `${AI_URL}/incidents/${params.id}/resolve`
    } else {
      // Legacy: generic PATCH with status in body (Screen 2 compat)
      endpoint = `${AI_URL}/incidents/${params.id}`
    }

    const res = await fetch(endpoint, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ ...body, acknowledgedBy: "aegis-dashboard", resolvedBy: "aegis-dashboard" }),
      signal:  AbortSignal.timeout(5000),
    })

    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: data.message ?? "Action failed" },
        { status: res.status }
      )
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "AI service unreachable" }, { status: 503 })
  }
}
