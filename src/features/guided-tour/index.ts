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
export { canAutoStartGuidedTour } from "./model/auto-start-guard";
export {
  resolveAnchorRect,
  computeCardPlacement,
  type AnchorBox,
  type CardPlacement,
  type CardPlacementSide,
} from "./model/resolve-anchor-rect";
