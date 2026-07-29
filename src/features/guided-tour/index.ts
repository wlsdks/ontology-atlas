export { GuidedTourOverlay } from "./ui/GuidedTourOverlay";
export { DestinationGuide } from "./ui/DestinationGuide";
export {
  GuideReplayProvider,
  useGuideReplay,
  useRegisterGuideReplay,
} from "./model/guide-replay-context";
export { useGuidedTour } from "./model/use-guided-tour";
export type { UseGuidedTourArgs, UseGuidedTourResult } from "./model/use-guided-tour";
export {
  TOUR_STEPS,
  DESTINATION_TOURS,
  computeVisibleSteps,
  type DestinationTourId,
  type TourAnchor,
  type TourPersona,
  type TourStep,
} from "./model/tour-steps";
export {
  GUIDED_TOUR_STATUS_KEY,
  destinationTourStatusKey,
  readGuidedTourStatus,
  writeGuidedTourStatus,
  type GuidedTourStatus,
} from "./model/tour-storage";
export {
  FIRST_RUN_SEEN_ENTRIES,
  applyFirstRunSeen,
  applyGuideOverride,
  clearFirstRunSeen,
  resolveGuideOverride,
  type GuideOverride,
} from "./model/first-run-seen";
export { canAutoStartGuidedTour } from "./model/auto-start-guard";
export { watchGuidedTourAutoStartCancel } from "./model/auto-start-interaction";
export {
  DEFAULT_GUIDE_AUTO_START,
  readGuideAutoStart,
  resolveGuideAutoStart,
  useGuideAutoStart,
  writeGuideAutoStart,
} from "./model/guide-auto-start";
export {
  resolveAnchorRect,
  computeCardPlacement,
  type AnchorBox,
  type CardPlacement,
  type CardPlacementSide,
} from "./model/resolve-anchor-rect";
export { useGuidedTourAutoStartReady } from './model/use-auto-start-ready';
