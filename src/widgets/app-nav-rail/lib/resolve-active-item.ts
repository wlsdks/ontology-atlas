/**
 * Re-export of the shared ladder in `@/shared/lib/navigation/nav-destination`, which BottomTabBar also uses.
 */
export {
  resolveActiveNavDestination as resolveActiveNavRailItem,
  type AppNavDestinationId as AppNavRailItemId,
} from "@/shared/lib/navigation/nav-destination";
