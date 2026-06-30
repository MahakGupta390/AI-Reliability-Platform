"use client"
// ─────────────────────────────────────────────────────────────────────────────
// app/settings/page.tsx  [NEW — Screen 5, final screen]
//
// System Configuration & Baseline Manager
//
// LAYOUT:
// ┌────────────────────────────────────────────────────────────┐
// │ HEALTH HEADER (shared, sticky)                              │
// ├────────────────────────────────────────────────────────────┤
// │ Page title + tab sub-nav (Baselines / Detector / Alerts /  │
// │ Registry / Audit Log)                                      │
// ├──────────────────────────────────┬───────────────────────────┤
// │ ACTIVE PANEL (left, wider)       │ CONTEXT SIDEBAR (right)  │
// │ - BaselineEditor                 │ - quick stats             │
// │ - DetectorConfigPanel            │ - help text               │
// │ - AlertThresholds                │                           │
// │ - RegistryTable                  │                           │
// │ - AuditLog                       │                           │
// └──────────────────────────────────┴───────────────────────────┘
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react"
import { HealthHeader } from "@/components/health-header"
import { BaselineEditor } from "@/components/settings/baseline-editor"
import { DetectorConfigPanel } from "@/components/settings/detector-config"
import { AlertThresholds } from "@/components/settings/alert-thresholds"
import { RegistryTable } from "@/components/settings/registry-table"
import { AuditLog } from "@/components/settings/audit-log"
import { cn } from "@/lib/utils"
import {
  Gauge, SlidersHorizontal, AlertTriangle, Server, ScrollText,
} from "lucide-react"

type TabId = "baselines" | "detector" | "alerts" | "registry" | "audit"

const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
  { id: "baselines", label: "Baselines",   icon: Gauge,             desc: "Tune per-service P99 baselines used for anomaly detection" },
  { id: "detector",  label: "Detector",     icon: SlidersHorizontal, desc: "Z-score trigger/resolve thresholds and poll interval" },
  { id: "alerts",    label: "Alerts",       icon: AlertTriangle,     desc: "Warning and critical thresholds for header metric colors" },
  { id: "registry",  label: "Registry",     icon: Server,            desc: "All monitored services, their URLs, and health" },
  { id: "audit",     label: "Audit Log",    icon: ScrollText,        desc: "Every detector decision — useful for debugging" },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("baselines")
  const activeMeta = TABS.find((t) => t.id === activeTab)!

  return (
    <div className="min-h-svh bg-black">
      <HealthHeader />

      <main className="mx-auto max-w-screen-2xl px-4 py-4 md:px-6 md:py-5">
        <div className="flex flex-col gap-4">

          {/* Page header */}
          <div className="flex flex-col gap-0.5">
            <h1 className="font-mono text-base font-bold tracking-tight text-zinc-100">
              System Configuration
            </h1>
            <p className="font-mono text-[11px] text-zinc-600">
              Tune the AI detector, manage baselines, and configure monitoring
            </p>
          </div>

          {/* Sub-nav tabs */}
          <div
            className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.04] bg-black p-1"
            role="tablist"
            aria-label="Settings sections"
          >
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-[11px] font-medium whitespace-nowrap transition-all duration-150",
                  activeTab === id
                    ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03] border border-transparent",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* 2-column content */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px] lg:items-start">

            {/* LEFT — active panel */}
            <div className="flex flex-col gap-4">
              {activeTab === "baselines" && <BaselineEditor />}
              {activeTab === "detector"  && <DetectorConfigPanel />}
              {activeTab === "alerts"    && <AlertThresholds />}
              {activeTab === "registry"  && <RegistryTable />}
              {activeTab === "audit"     && <AuditLog />}
            </div>

            {/* RIGHT — context sidebar */}
            <div className="flex flex-col gap-4 lg:sticky lg:top-[120px]">
              <section className="rounded-xl border border-white/[0.04] bg-black p-4">
                <div className="flex items-center gap-2 mb-2">
                  <activeMeta.icon className="h-3.5 w-3.5 text-cyan-400" />
                  <span className="font-mono text-[11px] font-semibold text-zinc-300">{activeMeta.label}</span>
                </div>
                <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">{activeMeta.desc}</p>
              </section>

              <section className="rounded-xl border border-white/[0.04] bg-black p-4 flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                  System Overview
                </span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">Monitored Services</span>
                    <span className="font-mono text-[10px] text-cyan-400">3</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">Detection Method</span>
                    <span className="font-mono text-[10px] text-zinc-300">Z-score</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">Data Source</span>
                    <span className="font-mono text-[10px] text-zinc-300">Prometheus</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-mono text-[10px] text-zinc-500">Storage</span>
                    <span className="font-mono text-[10px] text-zinc-300">MongoDB</span>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-amber-500/15 bg-amber-500/4 p-4">
                <p className="font-mono text-[10px] text-amber-300/80 leading-relaxed">
                  Changes to baselines and detector thresholds apply at runtime
                  via process.env mutation on the ai-service — no restart required.
                </p>
              </section>
            </div>

          </div>
        </div>
      </main>
    </div>
  )
}
