"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/settings/detector-config.tsx  [NEW — Screen 5]
//
// Sliders for Z_SCORE_TRIGGER and Z_SCORE_RESOLVE with a visual gauge
// explaining what changes at each threshold value, plus poll interval.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { SlidersHorizontal, Save, Loader2, Info } from "lucide-react"
import { useEffect, useState } from "react"
import { useDetector } from "@/lib/hooks/useSettings"

function ThresholdSlider({
  label, value, onChange, min, max, step, color, description,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  color: string
  description: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-zinc-300">{label}</span>
        <span className={cn("font-mono text-sm font-bold tabular-nums", color)}>
          {value.toFixed(1)}σ
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full cursor-pointer accent-cyan-500"
      />
      <div className="flex justify-between">
        <span className="font-mono text-[9px] text-zinc-700">{min}σ</span>
        <span className="font-mono text-[9px] text-zinc-700">{max}σ</span>
      </div>
      <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">{description}</p>
    </div>
  )
}

// Visual gauge showing the normal/elevated/anomalous zones
function ZoneGauge({ trigger, resolve }: { trigger: number; resolve: number }) {
  const max = 10
  const resolvePct = (resolve / max) * 100
  const triggerPct = (trigger / max) * 100

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
        Detection Zones
      </span>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-zinc-900">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500/40"
          style={{ width: `${resolvePct}%` }}
        />
        <div
          className="absolute inset-y-0 bg-amber-400/40"
          style={{ left: `${resolvePct}%`, width: `${triggerPct - resolvePct}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-rose-500/50"
          style={{ left: `${triggerPct}%`, width: `${100 - triggerPct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px]">
        <span className="text-emerald-400">Normal (0–{resolve.toFixed(1)}σ)</span>
        <span className="text-amber-400">Elevated</span>
        <span className="text-rose-400">Anomalous ({trigger.toFixed(1)}σ+)</span>
      </div>
    </div>
  )
}

export function DetectorConfigPanel() {
  const { detector, isLoading, saving, updateDetector } = useDetector()

  const [trigger, setTrigger] = useState(3.0)
  const [resolveAt, setResolveAt] = useState(1.5)
  const [pollMs, setPollMs] = useState(10000)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (detector) {
      setTrigger(detector.zScoreTrigger)
      setResolveAt(detector.zScoreResolve)
      setPollMs(detector.pollIntervalMs)
      setDirty(false)
    }
  }, [detector])

  const handleChange = (setter: (v: number) => void) => (v: number) => {
    setter(v)
    setDirty(true)
  }

  const handleSave = async () => {
    await updateDetector({
      zScoreTrigger:  trigger,
      zScoreResolve:  resolveAt,
      pollIntervalMs: pollMs,
    })
    setDirty(false)
  }

  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/[0.04] bg-black p-5 animate-pulse">
        <div className="h-4 w-48 rounded bg-white/[0.06] mb-4" />
        <div className="h-24 rounded-lg bg-white/[0.02]" />
      </section>
    )
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Detector configuration"
    >
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-tight">Detector Configuration</h2>
      </div>

      {/* Zone visualization */}
      <ZoneGauge trigger={trigger} resolve={resolveAt} />

      {/* Sliders */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ThresholdSlider
          label="Z-Score Trigger"
          value={trigger}
          onChange={handleChange(setTrigger)}
          min={2} max={8} step={0.5}
          color="text-rose-400"
          description="Above this Z-score, an incident is created and shown in the Incident Feed."
        />
        <ThresholdSlider
          label="Z-Score Resolve"
          value={resolveAt}
          onChange={handleChange(setResolveAt)}
          min={0.5} max={trigger - 0.5} step={0.5}
          color="text-emerald-400"
          description="Below this Z-score, an open incident is automatically marked resolved."
        />
      </div>

      {/* Poll interval */}
      <div className="flex items-center justify-between rounded-lg border border-white/[0.04] bg-white/[0.01] px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11px] text-zinc-300">Poll Interval</span>
          <span className="font-mono text-[9px] text-zinc-600">how often the detector checks Prometheus</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={pollMs / 1000}
            onChange={(e) => handleChange(setPollMs)(Number(e.target.value) * 1000)}
            min={5} max={60}
            className="w-16 rounded-lg border border-white/[0.06] bg-zinc-900 px-2 py-1.5 text-right font-mono text-[12px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-cyan-500/40"
          />
          <span className="font-mono text-[10px] text-zinc-500">seconds</span>
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 rounded-lg border border-cyan-500/15 bg-cyan-500/4 px-3 py-2">
        <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
        <p className="font-mono text-[10px] text-zinc-500 leading-relaxed">
          Changes apply at runtime via process.env mutation — no service restart needed.
          The next detection cycle will use the new thresholds.
        </p>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider transition-all duration-200",
          dirty && !saving
            ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
            : "border-zinc-800 text-zinc-600 cursor-not-allowed",
        )}
      >
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        {saving ? "Saving..." : dirty ? "Save Changes" : "No Changes"}
      </button>
    </section>
  )
}
