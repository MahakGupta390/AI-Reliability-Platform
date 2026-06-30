"use client"
// ─────────────────────────────────────────────────────────────────────────────
// components/nav-tabs.tsx  [MODIFIED — Screen 4]
// Added Incidents tab for Screen 4.
// ─────────────────────────────────────────────────────────────────────────────

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { LayoutDashboard, FlaskConical, Server, History } from "lucide-react"

const TABS = [
  { href: "/",          label: "Overview",   icon: LayoutDashboard, exact: true  },
  { href: "/chaos",     label: "Chaos Lab",  icon: FlaskConical,    exact: false },
  { href: "/services",  label: "Services",   icon: Server,          exact: false },
  { href: "/incidents", label: "Incidents",  icon: History,         exact: false },
]

export function NavTabs() {
  const path = usePathname()

  return (
    <nav
      className="flex items-center gap-1 rounded-lg border border-white/[0.04] bg-white/[0.02] p-0.5"
      aria-label="Main navigation"
    >
      {TABS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? path === href : path.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-[11px] font-medium transition-all duration-150",
              active
                ? "bg-white/[0.08] text-zinc-100 shadow-sm"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
