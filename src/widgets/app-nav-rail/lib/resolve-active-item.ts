/**
 * Re-export of the shared ladder in `@/shared/lib/nav-destination`, which BottomTabBar also uses.
 */
export {
  resolveActiveNavDestination as resolveActiveNavRailItem,
  type AppNavDestinationId as AppNavRailItemId,
} from "@/shared/lib/nav-destination";
