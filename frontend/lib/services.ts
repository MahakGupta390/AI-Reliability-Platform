// ─────────────────────────────────────────────────────────────────────────────
// lib/services.ts   [MODIFIED — mock data removed, types preserved]
//
// CHANGES:
//   - Removed: SERVICES array (was hardcoded mock)
//   - Removed: ACTIVITY array (was hardcoded mock)
//   - Removed: ANOMALY object (no longer needed — live data drives card states)
//   - Removed: CRITICAL_SERIES (no longer needed — live series from backend)
//   - Kept: Service type alias (points to ServiceData for backward compat)
//   - Kept: ActivityItem type alias (points to lib/types ActivityItem)
//
// All live data now flows from:
//   services  → /api/services  → useServices()
//   incidents → /api/incidents → useInsights() / useActivity()
//   metrics   → /api/metrics/aggregate → useAggregate()
// ─────────────────────────────────────────────────────────────────────────────

// Re-export from types so any legacy import of `Service` still resolves
export type { ServiceData as Service, ActivityItem } from "@/lib/types"
