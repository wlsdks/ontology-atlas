import { computeNodeAlpha } from "./frame-draw/node-alpha";
import { beginFrame } from "./frame-draw/frame-begin";
import { beginNodeLayer, paintStrataDust } from "./frame-draw/node-layer";
import { paintBackdrop } from "./frame-draw/paint-backdrop";
import { paintClusterChips } from "./frame-draw/paint-chips";
import { paintDial } from "./frame-draw/paint-dial";
import { paintDomeStage } from "./frame-draw/paint-dome-stage";
import { paintEdges } from "./frame-draw/paint-edges";
import { paintLabels } from "./frame-draw/paint-labels";
import { paintNodes } from "./frame-draw/paint-nodes";
import { paintRelationCaptions } from "./frame-draw/paint-captions";
import { paintWardingRing } from "./frame-draw/paint-warding";
import { prepareEdges } from "./frame-draw/edge-prep";
import { prepareFocus } from "./frame-draw/frame-focus";
import type { FrameDrawParams } from "./frame-draw/frame-draw-params";

export type { FrameDrawParams } from "./frame-draw/frame-draw-params";
export {
  lastDrawnLabelBoxes,
  lastDrawnLod,
  lastDrawnNodeAlphas,
  lastDrawnNodeCount,
  lastDrawnRelationCaptions,
  lastDrawnSkyTimeMs,
  lastHiddenDependencies,
  lastLitStateCounts,
  setMapComets,
} from "./frame-draw/frame-state";

// Order is paint order; each pass takes the stage results it reads.
export function drawTopologyFrame(params: FrameDrawParams): void {
  const frame = beginFrame(params);
  paintBackdrop(frame);
  if (paintDial(frame)) return;
  const focus = prepareFocus(frame);
  const alpha = computeNodeAlpha(frame, focus);
  const edges = prepareEdges(frame, focus, alpha);
  const stage = paintDomeStage(frame, focus, edges);
  paintEdges(frame, focus, alpha, edges, stage);
  const layer = beginNodeLayer(frame);
  paintStrataDust(frame, focus, layer);
  paintNodes(frame, focus, alpha, stage, layer);
  paintWardingRing(frame, focus, layer);
  const chipReservations = paintClusterChips(frame, focus, alpha, layer);
  const safeRect = paintLabels(frame, focus, alpha, layer, chipReservations);
  paintRelationCaptions(frame, edges, layer, chipReservations, safeRect);
}
