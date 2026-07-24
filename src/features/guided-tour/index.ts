export { GuidedTourOverlay } from "./ui/GuidedTourOverlay";
export { useGuidedTour } from "./model/use-guided-tour";
export type { UseGuidedTourArgs, UseGuidedTourResult } from "./model/use-guided-tour";
export {
  TOUR_STEPS,
  computeVisibleSteps,
  type TourAnchor,
  type TourPersona,
  type TourStep,
} from "./model/tour-steps";
export {
  GUIDED_TOUR_STATUS_KEY,
  writeGuidedTourStatus,
  type GuidedTourStatus,
} from "./model/tour-storage";
export {
  resolveAnchorRect,
  computeCardPlacement,
  type AnchorBox,
  type CardPlacement,
  type CardPlacementSide,
} from "./model/resolve-anchor-rect";
