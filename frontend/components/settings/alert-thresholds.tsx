"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/settings/alert-thresholds.tsx  [MODIFIED — Screen 5 backend wired]
//
// CHANGE: previously pure client useState with zero persistence — values
// reset to defaults on every page reload. Now reads/writes through
// useAlertThresholds() → /api/settings/alert-thresholds → ai-service
// /config/alert-thresholds → MongoDB. Per-row Save button with loading state.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { AlertTriangle, Save, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useAlertThresholds } from "@/lib/hooks/useSettings"

const SERVICE_LABELS: Record<string, string> = {
  auth:     "Auth Service",
  payments: "Payment Gateway",
  orders:   "Order Processor",
}

function ThresholdInput({
  label, value, onChange, unit, color,
}: {
  label: string; value: number; onChange: (v: number) => void; unit: string; color: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] text-zinc-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className={cn(
            "w-16 rounded-md border bg-zinc-900 px-1.5 py-1 text-right font-mono text-[11px] focus:outline-none focus:ring-1",
            color,
          )}
        />
        <span className="font-mono text-[9px] text-zinc-600">{unit}</span>
      </div>
    </div>
  )
}

type RowState = {
  p99WarnMs: number
  p99CriticalMs: number
  errorWarnPct: number
  errorCriticalPct: number
}

function ThresholdRow({
  serviceId, initial, saving, onSave,
}: {
  serviceId: string
  initial: RowState
  saving: boolean
  onSave: (v: RowState) => void
}) {
  const [draft, setDraft] = useState<RowState>(initial)
  const [dirty, setDirty] = useState(false)

  // Re-sync if backend value changes underneath us (e.g. after save)
  useEffect(() => {
    setDraft(initial)
    setDirty(false)
  }, [initial.p99WarnMs, initial.p99CriticalMs, initial.errorWarnPct, initial.errorCriticalPct])

  const update = (field: keyof RowState, value: number) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
    setDirty(true)
  }

  return (
    <div className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[11px] font-semibold text-zinc-300">
          {SERVICE_LABELS[serviceId] ?? serviceId}
        </span>
        <button
          onClick={() => onSave(draft)}
          disabled={!dirty || saving}
          className={cn(
            "flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-[9px] uppercase transition-colors",
            dirty && !saving
              ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
              : "border-zinc-800 text-zinc-700 cursor-not-allowed",
          )}
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {saving ? "Saving" : dirty ? "Save" : "Saved"}
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ThresholdInput
          label="P99 Warn" value={draft.p99WarnMs}
          onChange={(v) => update("p99WarnMs", v)} unit="ms"
          color="border-amber-400/30 text-amber-300 focus:ring-amber-400/40"
        />
        <ThresholdInput
          label="P99 Critical" value={draft.p99CriticalMs}
          onChange={(v) => update("p99CriticalMs", v)} unit="ms"
          color="border-rose-500/30 text-rose-300 focus:ring-rose-500/40"
        />
        <ThresholdInput
          label="Error Warn" value={draft.errorWarnPct}
          onChange={(v) => update("errorWarnPct", v)} unit="%"
          color="border-amber-400/30 text-amber-300 focus:ring-amber-400/40"
        />
        <ThresholdInput
          label="Error Critical" value={draft.errorCriticalPct}
          onChange={(v) => update("errorCriticalPct", v)} unit="%"
          color="border-rose-500/30 text-rose-300 focus:ring-rose-500/40"
        />
      </div>
    </div>
  )
}

const DEFAULTS: Record<string, RowState> = {
  auth:     { p99WarnMs: 200, p99CriticalMs: 400, errorWarnPct: 0.5, errorCriticalPct: 2 },
  payments: { p99WarnMs: 250, p99CriticalMs: 500, errorWarnPct: 0.5, errorCriticalPct: 2 },
  orders:   { p99WarnMs: 180, p99CriticalMs: 350, errorWarnPct: 0.5, errorCriticalPct: 2 },
}

export function AlertThresholds() {
  // CHANGED: real persisted thresholds from MongoDB instead of useState
  const { thresholds, isLoading, saving, updateThreshold } = useAlertThresholds()

  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-black p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-white/[0.06] mb-4" />
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-white/[0.02] mb-2" />)}
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Alert thresholds"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <h2 className="text-sm font-semibold tracking-tight">Alert Thresholds</h2>
        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          persisted in MongoDB
        </span>
      </div>

      <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
        Controls the color-coding thresholds for P99 latency and error rate metrics
        shown in the header strip and service cards.
      </p>

      <div className="flex flex-col gap-2">
        {Object.keys(DEFAULTS).map((serviceId) => (
          <ThresholdRow
            key={serviceId}
            serviceId={serviceId}
            initial={thresholds[serviceId] ?? DEFAULTS[serviceId]}
            saving={saving === serviceId}
            onSave={(v) => updateThreshold(serviceId, v)}
          />
        ))}
      </div>
    </section>
  )
}
