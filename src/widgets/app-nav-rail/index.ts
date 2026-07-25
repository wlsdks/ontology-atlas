export { AppNavRail, type AppNavRailProps } from "./ui/AppNavRail";
export { GitStatusTile, type GitStatusTileProps } from "./ui/GitStatusTile";
export { resolveActiveNavRailItem, type AppNavRailItemId } from "./lib/resolve-active-item";
export {
  NavRailShellProvider,
  useNavRailShellValue,
  useNavRailSettingsSlot,
  useNavRailContextHrefs,
  type NavRailContextHrefs,
} from "./model/shell-slot-context";
