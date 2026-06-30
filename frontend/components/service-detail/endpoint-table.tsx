"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/service-detail/endpoint-table.tsx  [NEW — Screen 3]
//
// Sortable table of every endpoint on the service.
// Columns: Method · Endpoint · Requests · Errors · Error% · Avg · P95 · P99
// Sort by any column. Rows highlight critical P99 in red.
// Data comes directly from your backend /metrics JSON endpoints array.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Table2, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react"
import { useState } from "react"
import type { EndpointRow } from "@/lib/types"

type SortKey = keyof Pick<
  EndpointRow,
  "totalRequests" | "errorRate" | "avgLatencyMs" | "p95LatencyMs" | "p99LatencyMs"
>

const METHOD_COLOR: Record<string, string> = {
  GET:    "text-emerald-400 border-emerald-500/30 bg-emerald-500/8",
  POST:   "text-cyan-400    border-cyan-500/30    bg-cyan-500/8",
  PUT:    "text-violet-400  border-violet-500/30  bg-violet-500/8",
  PATCH:  "text-amber-400   border-amber-400/30   bg-amber-500/8",
  DELETE: "text-rose-400    border-rose-500/30    bg-rose-500/8",
}

function LatencyCell({ value, warn = 200, critical = 400 }: { value: number; warn?: number; critical?: number }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value >= critical ? "text-rose-400" : value >= warn ? "text-amber-400" : "text-zinc-300",
      )}
    >
      {value}ms
    </span>
  )
}

function SortIcon({ col, active, dir }: { col: string; active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 text-zinc-700" />
  return dir === "asc"
    ? <ChevronUp className="h-3 w-3 text-cyan-400" />
    : <ChevronDown className="h-3 w-3 text-cyan-400" />
}

export function EndpointTable({ endpoints }: { endpoints: EndpointRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("p99LatencyMs")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("desc")
    }
  }

  const sorted = [...endpoints].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortDir === "asc" ? diff : -diff
  })

  if (endpoints.length === 0) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-black p-5">
        <div className="flex items-center gap-2 mb-4">
          <Table2 className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-tight">Endpoint Breakdown</h2>
        </div>
        <p className="font-mono text-[11px] text-zinc-600 text-center py-8">
          No requests recorded yet
        </p>
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Endpoint performance breakdown"
    >
      <div className="flex items-center gap-2">
        <Table2 className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Endpoint Breakdown</h2>
        <span className="ml-auto font-mono text-[10px] text-zinc-600">
          {endpoints.length} route{endpoints.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
        <table className="w-full text-left" role="grid">
          <thead>
            <tr className="border-b border-white/[0.04] bg-white/[0.01]">
              <Th>Method</Th>
              <Th>Endpoint</Th>
              <SortableTh label="Requests" col="totalRequests"   active={sortKey === "totalRequests"}   dir={sortDir} onSort={() => toggleSort("totalRequests")} />
              <SortableTh label="Errors"   col="errorRate"       active={sortKey === "errorRate"}       dir={sortDir} onSort={() => toggleSort("errorRate")} />
              <SortableTh label="Avg"      col="avgLatencyMs"    active={sortKey === "avgLatencyMs"}    dir={sortDir} onSort={() => toggleSort("avgLatencyMs")} />
              <SortableTh label="P95"      col="p95LatencyMs"    active={sortKey === "p95LatencyMs"}    dir={sortDir} onSort={() => toggleSort("p95LatencyMs")} />
              <SortableTh label="P99"      col="p99LatencyMs"    active={sortKey === "p99LatencyMs"}    dir={sortDir} onSort={() => toggleSort("p99LatencyMs")} />
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.03]">
            {sorted.map((ep, i) => {
              const isCritical = ep.p99LatencyMs >= 400 || ep.errorRate >= 5
              return (
                <tr
                  key={`${ep.method}-${ep.endpoint}-${i}`}
                  className={cn(
                    "transition-colors duration-150 hover:bg-white/[0.02]",
                    isCritical && "bg-rose-500/4",
                  )}
                >
                  {/* Method badge */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase",
                        METHOD_COLOR[ep.method] ?? "text-zinc-400 border-zinc-700/30 bg-zinc-800/20",
                      )}
                    >
                      {ep.method}
                    </span>
                  </td>

                  {/* Endpoint path */}
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="font-mono text-[11px] text-zinc-300 truncate block">
                      {ep.endpoint}
                    </span>
                  </td>

                  {/* Requests */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span className="font-mono text-[11px] text-zinc-400 tabular-nums">
                      {ep.totalRequests.toLocaleString()}
                    </span>
                  </td>

                  {/* Error rate */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <span
                      className={cn(
                        "font-mono text-[11px] tabular-nums",
                        ep.errorRate > 5  ? "text-rose-400"   :
                        ep.errorRate > 1  ? "text-amber-400"  :
                        ep.errorRate > 0  ? "text-yellow-500" :
                        "text-emerald-400",
                      )}
                    >
                      {ep.errorRate.toFixed(2)}%
                    </span>
                  </td>

                  {/* Avg / P95 / P99 */}
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <LatencyCell value={ep.avgLatencyMs} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <LatencyCell value={ep.p95LatencyMs} />
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <LatencyCell value={ep.p99LatencyMs} warn={200} critical={400} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 font-mono text-[9px] uppercase tracking-wider text-zinc-600 whitespace-nowrap">
      {children}
    </th>
  )
}

function SortableTh({
  label, col, active, dir, onSort,
}: {
  label: string; col: string; active: boolean; dir: "asc" | "desc"; onSort: () => void
}) {
  return (
    <th className="px-3 py-2 text-right whitespace-nowrap">
      <button
        onClick={onSort}
        className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600 hover:text-zinc-300 transition-colors ml-auto"
        aria-label={`Sort by ${label}`}
      >
        {label}
        <SortIcon col={col} active={active} dir={dir} />
      </button>
    </th>
  )
}
