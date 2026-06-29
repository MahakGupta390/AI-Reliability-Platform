"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/chaos/experiment-forge.tsx  [NEW]
// Left column — top panel. Service knob controls + DETONATE button.
// ─────────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils"
import { Zap, RotateCw, AlertTriangle, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { KnobState, ExperimentStatus } from "@/lib/hooks/useChaos"

const SERVICES = [
  { id: "auth",     name: "Auth Service",    region: "us-east-1",    color: "cyan"   },
  { id: "payments", name: "Payment Gateway", region: "us-west-2",    color: "violet" },
  { id: "orders",   name: "Order Processor", region: "eu-central-1", color: "emerald"},
] as const

type Props = {
  knobs: Record<string, KnobState>
  onKnob: (id: string, field: keyof KnobState, val: boolean | number) => void
  onDetonate: () => void
  onRestoreAll: () => void
  status: ExperimentStatus
  error: string | null
  frontendOnly: boolean
}

export function ExperimentForge({
  knobs, onKnob, onDetonate, onRestoreAll, status, error, frontendOnly,
}: Props) {
  const isRunning   = status === "running"
  const isRestoring = status === "restoring"
  const anyActive   = Object.values(knobs).some(
    (k) => k.highLatency || k.failureRate > 0 || k.timeoutMode,
  )

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border border-white/[0.04] bg-black p-5"
      aria-label="Experiment Forge — chaos controls"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Flame className={cn("h-4 w-4", isRunning ? "text-rose-400 animate-pulse" : "text-orange-400")} />
        <h2 className="text-sm font-semibold tracking-tight">Experiment Forge</h2>
        {isRunning && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-rose-500" />
            <span className="font-mono text-[10px] font-semibold text-rose-400">EXPERIMENT RUNNING</span>
          </span>
        )}
        {!isRunning && (
          <span className="ml-auto font-mono text-[10px] text-zinc-600">configure faults below</span>
        )}
      </div>

      {/* Frontend-only warning */}
      {frontendOnly && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-500/5 px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="font-mono text-[10px] text-amber-300">
            Backend unreachable — chaos simulated on frontend only
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shrink-0" />
          <span className="font-mono text-[10px] text-rose-400">{error}</span>
        </div>
      )}

      {/* Service knob cards */}
      <div className="flex flex-col gap-3">
        {SERVICES.map((svc) => {
          const k = knobs[svc.id]
          const hasAny = k.highLatency || k.failureRate > 0 || k.timeoutMode
          return (
            <ServiceKnobCard
              key={svc.id}
              id={svc.id}
              name={svc.name}
              region={svc.region}
              color={svc.color}
              knob={k}
              active={hasAny && isRunning}
              onChange={(field, val) => onKnob(svc.id, field, val)}
            />
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 pt-1">
        <Button
          onClick={onDetonate}
          disabled={isRunning || isRestoring || !anyActive}
          className={cn(
            "chaos-btn flex-1 gap-2 font-mono text-[12px] uppercase tracking-widest transition-all duration-200",
            isRunning
              ? "bg-rose-900/40 border-rose-500/40 text-rose-300 cursor-not-allowed"
              : "bg-rose-600 hover:bg-rose-500 text-white border-transparent shadow-[0_0_24px_-4px_rgba(239,68,68,0.5)]",
          )}
        >
          {isRunning ? (
            <><span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />Running...</>
          ) : (
            <><Zap className="h-4 w-4" />Detonate</>
          )}
        </Button>
        <Button
          onClick={onRestoreAll}
          disabled={isRestoring || (!isRunning && !anyActive)}
          variant="outline"
          className="gap-2 border-zinc-700 bg-transparent font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-300"
        >
          <RotateCw className={cn("h-3.5 w-3.5", isRestoring && "animate-spin")} />
          {isRestoring ? "Restoring..." : "Restore All"}
        </Button>
      </div>
    </section>
  )
}

// ── Service knob card ─────────────────────────────────────────────────────────
function ServiceKnobCard({
  id, name, region, color, knob, active, onChange,
}: {
  id: string
  name: string
  region: string
  color: string
  knob: KnobState
  active: boolean
  onChange: (field: keyof KnobState, val: boolean | number) => void
}) {
  const borderColor =
    active
      ? "border-rose-500/40 bg-rose-500/5"
      : "border-white/[0.04] bg-white/[0.01] hover:border-white/[0.07]"

  const dotColor =
    color === "cyan"    ? "bg-cyan-400"    :
    color === "violet"  ? "bg-violet-400"  :
    "bg-emerald-400"

  return (
    <div className={cn("rounded-lg border p-3 transition-all duration-200", borderColor)}>
      {/* Service name row */}
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor)} />
        <span className="font-mono text-[11px] font-semibold text-zinc-200">{name}</span>
        <span className="ml-auto font-mono text-[9px] text-zinc-600">{region}</span>
        {active && (
          <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[9px] text-rose-400">
            INJECTING
          </span>
        )}
      </div>

      {/* Knobs grid */}
      <div className="grid grid-cols-1 gap-2.5">
        {/* High Latency toggle */}
        <KnobRow label="High Latency" sublabel="~800ms P99">
          <Toggle
            checked={knob.highLatency}
            onChange={(v) => onChange("highLatency", v)}
            color="amber"
          />
        </KnobRow>

        {/* Failure Rate slider */}
        <KnobRow label="Failure Rate" sublabel={`${knob.failureRate}%`}>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={knob.failureRate}
            onChange={(e) => onChange("failureRate", Number(e.target.value))}
            className="w-24 h-1.5 rounded-full accent-rose-500 cursor-pointer"
            aria-label={`${name} failure rate`}
          />
        </KnobRow>

        {/* Timeout Mode toggle */}
        <KnobRow label="Timeout Mode" sublabel="drop connections">
          <Toggle
            checked={knob.timeoutMode}
            onChange={(v) => onChange("timeoutMode", v)}
            color="rose"
          />
        </KnobRow>
      </div>
    </div>
  )
}

function KnobRow({
  label, sublabel, children,
}: {
  label: string; sublabel: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col">
        <span className="font-mono text-[10px] text-zinc-300">{label}</span>
        <span className="font-mono text-[9px] text-zinc-600">{sublabel}</span>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  checked, onChange, color,
}: {
  checked: boolean; onChange: (v: boolean) => void; color: "amber" | "rose"
}) {
  const track = checked
    ? color === "amber" ? "bg-amber-500" : "bg-rose-500"
    : "bg-zinc-800"

  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-4 w-8 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-white/20 shrink-0",
        track,
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-4" : "translate-x-0.5",
        )}
      />
    </button>
  )
}
