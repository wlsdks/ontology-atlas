export { GuidedTourOverlay } from "./ui/GuidedTourOverlay";
export { DestinationGuide } from "./ui/DestinationGuide";
export {
  GuideReplayProvider,
  useGuideReplay,
  useRegisterGuideReplay,
} from "./model/guide-replay-context";
export { useGuidedTour } from "./model/use-guided-tour";
export {
  type TourAnchor,
} from "./model/tour-steps";
export { readGuidedTourStatus } from "./model/tour-storage";
export {
  applyGuideOverride,
} from "./model/first-run-seen";
export { canAutoStartGuidedTour } from "./model/auto-start-guard";
export { watchGuidedTourAutoStartCancel } from "./model/auto-start-interaction";
export {
  readGuideAutoStart,
  useGuideAutoStart,
  writeGuideAutoStart,
} from "@/shared/lib/guide-auto-start";
export {
  resolveAnchorRect,
} from "./model/resolve-anchor-rect";
export { useGuidedTourAutoStartReady } from './model/use-auto-start-ready';
