/**
 * Thin re-export — the actual ladder now lives in `@/shared/lib/nav-destination`
 * (feat/rail-rollout) so `BottomTabBar` can share the exact same active-item
 * rule instead of duplicating it one layer up. Kept as a local re-export so
 * existing imports/tests in this widget don't need to change paths.
 */
export {
  resolveActiveNavDestination as resolveActiveNavRailItem,
  type AppNavDestinationId as AppNavRailItemId,
} from "@/shared/lib/nav-destination";
