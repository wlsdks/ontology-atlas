export { AppNavRail, type AppNavRailProps } from "./ui/AppNavRail";
export { resolveActiveNavRailItem, type AppNavRailItemId } from "./lib/resolve-active-item";
export {
  NavRailShellProvider,
  useNavRailShellValue,
  useNavRailSettingsSlot,
  useNavRailHidden,
} from "./model/shell-slot-context";
