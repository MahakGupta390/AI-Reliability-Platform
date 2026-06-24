// ─────────────────────────────────────────────────────────────────────────────
// components/skeletons.tsx
//
// Pulse-skeleton placeholders shown while SWR is loading.
// One skeleton per major component so the layout never jumps.
// ─────────────────────────────────────────────────────────────────────────────

export function ServiceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/[0.04] bg-black p-4 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="h-3.5 w-28 rounded bg-white/[0.06]" />
          <div className="h-2.5 w-16 rounded bg-white/[0.04]" />
        </div>
        <div className="h-5 w-12 rounded-full bg-white/[0.05]" />
      </div>
      <div className="flex gap-1">
        <div className="h-4 w-14 rounded bg-white/[0.04]" />
        <div className="h-4 w-16 rounded bg-white/[0.04]" />
        <div className="h-4 w-12 rounded bg-white/[0.04]" />
      </div>
      <div className="h-7 w-full rounded bg-white/[0.04]" />
      <div className="grid grid-cols-2 gap-0 rounded-lg border border-white/[0.04]">
        <div className="p-2.5 flex flex-col gap-1">
          <div className="h-6 w-16 rounded bg-white/[0.06]" />
          <div className="h-2 w-12 rounded bg-white/[0.03]" />
        </div>
        <div className="p-2.5 flex flex-col gap-1">
          <div className="h-6 w-12 rounded bg-white/[0.06]" />
          <div className="h-2 w-14 rounded bg-white/[0.03]" />
        </div>
      </div>
      <div className="h-8 w-full rounded-lg bg-white/[0.04]" />
    </div>
  )
}

export function InsightSkeleton() {
  return (
    <div className="flex flex-col gap-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-3"
        >
          <div className="flex items-start gap-2">
            <div className="mt-1 h-1.5 w-1.5 rounded-full bg-white/[0.08]" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex gap-2">
                <div className="h-4 w-14 rounded bg-white/[0.06]" />
                <div className="h-4 w-20 rounded bg-white/[0.04]" />
              </div>
              <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
              <div className="h-1 w-full rounded-full bg-white/[0.04]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse px-1">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-4">
          <div className="mt-1 h-2.5 w-2.5 rounded-full bg-white/[0.06]" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="h-2 w-10 rounded bg-white/[0.04]" />
            <div className="h-3 w-full rounded bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function MetricStripSkeleton() {
  return (
    <div className="flex gap-0 animate-pulse">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-1 border-r border-white/[0.05] px-4 first:pl-0"
        >
          <div className="h-2 w-14 rounded bg-white/[0.04]" />
          <div className="h-3.5 w-10 rounded bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2"
      role="alert"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
      <span className="font-mono text-[11px] text-rose-400">{message}</span>
    </div>
  )
}
