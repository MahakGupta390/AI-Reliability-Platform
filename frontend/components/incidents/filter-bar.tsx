"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/incidents/filter-bar.tsx  [NEW — Screen 4]
// Search + filter controls for the incident table.
// Status · Severity · Service dropdowns + free-text search.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Search, X, SlidersHorizontal } from "lucide-react"
import type { IncidentFilters } from "@/lib/types"

type Props = {
  filters: IncidentFilters
  onChange: (f: Partial<IncidentFilters>) => void
  total: number
  filtered: number
}

const STATUS_OPTIONS   = ["all", "open", "resolved"] as const
const SEVERITY_OPTIONS = ["all", "critical", "high", "medium", "low"] as const
const SERVICE_OPTIONS  = [
  { value: "all",              label: "All Services"    },
  { value: "auth-service",     label: "Auth"            },
  { value: "payment-service",  label: "Payment"         },
  { value: "order-service",    label: "Order"           },
] as const

function FilterChip({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly { value: string; label?: string }[] | readonly string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 whitespace-nowrap">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/[0.06] bg-zinc-900 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 cursor-pointer"
        aria-label={label}
      >
        {options.map((opt) => {
          const val = typeof opt === "string" ? opt : opt.value
          const lbl = typeof opt === "string" ? opt : (opt.label ?? opt.value)
          return (
            <option key={val} value={val} className="bg-zinc-900 capitalize">
              {lbl.charAt(0).toUpperCase() + lbl.slice(1)}
            </option>
          )
        })}
      </select>
    </div>
  )
}

export function FilterBar({ filters, onChange, total, filtered }: Props) {
  const hasActiveFilters =
    filters.status !== "all" ||
    filters.severity !== "all" ||
    filters.service !== "all" ||
    filters.search !== ""

  const clearAll = () =>
    onChange({ status: "all", severity: "all", service: "all", search: "" })

  return (
    <div
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-4"
      role="search"
      aria-label="Filter incidents"
    >
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search incident ID, service, symptom..."
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="w-full rounded-lg border border-white/[0.06] bg-zinc-900 py-1.5 pl-8 pr-3 font-mono text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
          />
          {filters.search && (
            <button
              onClick={() => onChange({ search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="flex flex-wrap items-center gap-3">
          <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-600 shrink-0" aria-hidden="true" />
          <FilterChip
            label="Status"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(v) => onChange({ status: v as IncidentFilters["status"] })}
          />
          <FilterChip
            label="Severity"
            options={SEVERITY_OPTIONS}
            value={filters.severity}
            onChange={(v) => onChange({ severity: v as IncidentFilters["severity"] })}
          />
          <FilterChip
            label="Service"
            options={SERVICE_OPTIONS}
            value={filters.service}
            onChange={(v) => onChange({ service: v as IncidentFilters["service"] })}
          />
        </div>

        {/* Result count + clear */}
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10px] text-zinc-600">
            <span className="text-zinc-300">{filtered}</span> / {total}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 font-mono text-[10px] text-zinc-500 hover:text-rose-400 transition-colors"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
