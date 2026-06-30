"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/settings/baseline-editor.tsx  [NEW — Screen 5]
//
// Editable table of per-service baselines (meanP99, stdDev).
// Each row has live preview: "X% of recent samples would trigger at this value"
// Inline edit with Save/Cancel — optimistic update + revert on failure.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Gauge, Pencil, Check, X, Loader2, TrendingUp } from "lucide-react"
import { useState } from "react"
import { useBaselines } from "@/lib/hooks/useSettings"
import { useServices } from "@/lib/hooks/useServices"

const SERVICE_LABELS: Record<string, string> = {
  "auth-service":    "Auth Service",
  "payment-service": "Payment Gateway",
  "order-service":   "Order Processor",
}

function EditableField({
  label, value, onChange, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-lg border border-cyan-500/30 bg-zinc-900 px-2 py-1 font-mono text-[12px] text-cyan-300 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
        />
        <span className="font-mono text-[10px] text-zinc-600">{suffix}</span>
      </div>
    </div>
  )
}

function StatPreview({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      <span className="font-mono text-sm font-bold text-zinc-200">
        {value}<span className="ml-0.5 text-[10px] font-normal text-zinc-500">{suffix}</span>
      </span>
    </div>
  )
}

function BaselineRow({
  service, meanP99, stdDev, onSave, saving,
}: {
  service: string
  meanP99: number
  stdDev: number
  onSave: (mean: number, std: number) => void
  saving: boolean
}) {
  const [editing, setEditing]   = useState(false)
  const [draftMean, setMean]    = useState(meanP99)
  const [draftStd, setStd]      = useState(stdDev)

  const { services } = useServices()
  const liveService   = services.find((s) =>
    service.includes(s.id) || s.id === service.replace("-service", "").replace("payment", "payments").replace("order", "orders"),
  )
  const currentP99 = liveService?.latency ?? meanP99

  // Live preview: how many sigma away is the CURRENT p99 from this baseline?
  const currentZ = (currentP99 - draftMean) / Math.max(draftStd, 1)
  const wouldTrigger = currentZ > 3.0

  const startEdit = () => {
    setMean(meanP99)
    setStd(stdDev)
    setEditing(true)
  }

  const cancel = () => {
    setMean(meanP99)
    setStd(stdDev)
    setEditing(false)
  }

  const save = () => {
    onSave(draftMean, draftStd)
    setEditing(false)
  }

  return (
    <div className={cn(
      "rounded-lg border p-4 transition-all duration-200",
      editing ? "border-cyan-500/30 bg-cyan-500/4" : "border-white/[0.04] bg-white/[0.01]",
    )}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[12px] font-semibold text-zinc-200">
          {SERVICE_LABELS[service] ?? service}
        </span>
        {!editing ? (
          <button
            onClick={startEdit}
            className="flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 font-mono text-[10px] text-zinc-400 hover:border-cyan-500/40 hover:text-cyan-300 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        ) : (
          <div className="flex gap-1.5">
            <button
              onClick={cancel}
              className="rounded-md border border-zinc-700 p-1.5 text-zinc-500 hover:text-rose-400 hover:border-rose-500/30 transition-colors"
              aria-label="Cancel"
            >
              <X className="h-3 w-3" />
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1.5 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              aria-label="Save"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {editing ? (
          <>
            <EditableField label="Baseline Mean" value={draftMean} onChange={setMean} suffix="ms" />
            <EditableField label="Std Deviation"  value={draftStd}  onChange={setStd}  suffix="ms" />
          </>
        ) : (
          <>
            <StatPreview label="Baseline Mean" value={meanP99} suffix="ms" />
            <StatPreview label="Std Deviation"  value={stdDev}  suffix="ms" />
          </>
        )}
        <StatPreview label="Current P99" value={Math.round(currentP99)} suffix="ms" />

        {/* Live preview of trigger state */}
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Would Trigger?</span>
          <span className={cn(
            "flex items-center gap-1 font-mono text-sm font-bold",
            wouldTrigger ? "text-rose-400" : "text-emerald-400",
          )}>
            {wouldTrigger ? (
              <><TrendingUp className="h-3.5 w-3.5" /> Yes</>
            ) : (
              <>No</>
            )}
            <span className="ml-1 text-[9px] font-normal text-zinc-500">
              ({currentZ.toFixed(1)}σ)
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}

export function BaselineEditor() {
  const { baselines, isLoading, saving, updateBaseline } = useBaselines()

  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-black p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-white/[0.06] mb-4" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-white/[0.02] mb-2" />
        ))}
      </section>
    )
  }

  const entries = Object.entries(baselines)

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Baseline editor"
    >
      <div className="flex items-center gap-2">
        <Gauge className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Baseline Manager</h2>
        <span className="ml-auto font-mono text-[9px] text-zinc-600">
          updates take effect on next detection cycle
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="font-mono text-[11px] text-zinc-600 text-center py-6">
          No baseline data available — AI service unreachable
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([service, { meanP99, stdDev }]) => (
            <BaselineRow
              key={service}
              service={service}
              meanP99={meanP99}
              stdDev={stdDev}
              saving={saving === service}
              onSave={(mean, std) => updateBaseline(service, mean, std)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
