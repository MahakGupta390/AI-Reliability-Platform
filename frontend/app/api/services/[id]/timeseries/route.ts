// Copy to: services-enhanced/app/api/services/[id]/timeseries/route.ts  [NEW]
// Proxies /metrics/timeseries from microservice for MetricCharts real data

import { NextResponse } from "next/server"
const SERVICE_URLS: Record<string, string> = {
  auth:     process.env.AUTH_SERVICE_URL    ?? "http://localhost:3001",
  payments: process.env.PAYMENT_SERVICE_URL ?? "http://localhost:3002",
  orders:   process.env.ORDER_SERVICE_URL   ?? "http://localhost:3003",
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id }           = params
  const baseUrl          = SERVICE_URLS[id]
  const { searchParams } = new URL(req.url)
  if (!baseUrl) return NextResponse.json({ error: `Unknown service: ${id}` }, { status: 404 })
  const window  = searchParams.get("window")  ?? "60"
  const buckets = searchParams.get("buckets") ?? "30"
  try {
    const res = await fetch(`${baseUrl}/metrics/timeseries?window=${window}&buckets=${buckets}`, {
      cache: "no-store", signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return NextResponse.json({ series: [] }, { status: 502 })
    return NextResponse.json(await res.json(), { headers: { "Cache-Control": "no-store" } })
  } catch {
    return NextResponse.json({ series: [] })
  }
}
