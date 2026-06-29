import { NextResponse } from "next/server"

const AI_URL = process.env.AI_SERVICE_URL ?? "http://localhost:3004"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit = searchParams.get("limit") ?? "50"
  const status = searchParams.get("status") ?? ""
  try {
    const params = new URLSearchParams({ limit })
    if (status) params.set("status", status)
    const res = await fetch(`${AI_URL}/incidents?${params}`, {
      cache: "no-store", signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return NextResponse.json({ data: [] }, { status: 502 })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ data: [] })
  }
}

export async function PATCH(req: Request) {
  try {
    const { incidentId, status } = await req.json()
    const res = await fetch(`${AI_URL}/incidents/${incidentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
      signal: AbortSignal.timeout(5000),
    })
    return NextResponse.json(await res.json())
  } catch {
    return NextResponse.json({ success: false, error: "unreachable" }, { status: 502 })
  }
}
