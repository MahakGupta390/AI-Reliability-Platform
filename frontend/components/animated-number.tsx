"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Animates a numeric value toward `value`, spinning the digits rapidly.
 * Respects prefers-reduced-motion by snapping instantly.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  durationMs = 600,
}: {
  value: number
  decimals?: number
  durationMs?: number
}) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    if (reduce) {
      setDisplay(value)
      return
    }

    const from = fromRef.current
    const to = value
    startRef.current = null

    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now
      const elapsed = now - startRef.current
      const t = Math.min(1, elapsed / durationMs)
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3)
      const current = from + (to - from) * eased
      setDisplay(current)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = to
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      fromRef.current = value
    }
  }, [value, durationMs])

  return <>{display.toFixed(decimals)}</>
}
