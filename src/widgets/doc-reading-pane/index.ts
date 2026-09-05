export { DocReadingPane, type DocReadingPaneProps } from "./ui/DocReadingPane";
export {
  DocReadingOutlineRail,
  type DocReadingOutlineRailProps,
  type OutlineHeading,
} from "./ui/DocReadingOutlineRail";
export { BackToTopButton } from "./ui/BackToTopButton";
export {
  OUTLINE_RAIL_MIN_HEADINGS,
  OUTLINE_RAIL_NARROW_PANE_MIN,
  OUTLINE_RAIL_WIDE_PANE_MIN,
  resolveOutlineRailFit,
  shouldShowOutlineRail,
  type OutlineRailFit,
} from "./lib/outline-rail";
export { useOutlineRailFit } from "./lib/use-outline-rail-fit";
export {
  BACK_TO_TOP_SCROLL_THRESHOLD,
  shouldShowBackToTop,
  useBackToTop,
} from "./lib/use-back-to-top";
export { useDocsVaultScrollSpy } from "./lib/use-scroll-spy";
