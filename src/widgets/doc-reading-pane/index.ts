/**
 * The public API is only what another slice actually opens with.
 *
 * Everything else — the rail and the button themselves, the fit verdict, the two pane
 * floors, the scroll threshold — is this widget's own business, and an export with no
 * consumer is misinformation rather than a spec (the discipline `dead-code` enforces and
 * three retired components paid for). Tests reach the files directly.
 */
export { DocReadingPane } from "./ui/DocReadingPane";
export { shouldShowOutlineRail } from "./lib/outline-rail";
export { useBackToTop } from "./lib/use-back-to-top";
export { useDocReadingScrollSpy } from "./lib/use-scroll-spy";
