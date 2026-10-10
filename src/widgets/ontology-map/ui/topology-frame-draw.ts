import { computeNodeAlpha } from "./frame-draw/node-alpha";
import { beginFrame } from "./frame-draw/frame-begin";
import { beginNodeLayer, paintStrataDust } from "./frame-draw/node-layer";
import type { FrameScope } from "./frame-draw/frame-scope";
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

// Order is paint order, and each pass reads the scope fields the earlier ones filled.
export function drawTopologyFrame(params: FrameDrawParams): void {
  const F = {} as FrameScope;
  beginFrame(F, params);
  paintBackdrop(F);
  if (paintDial(F)) return;
  prepareFocus(F);
  computeNodeAlpha(F);
  prepareEdges(F);
  paintDomeStage(F);
  paintEdges(F);
  beginNodeLayer(F);
  paintStrataDust(F);
  paintNodes(F);
  paintWardingRing(F);
  paintClusterChips(F);
  paintLabels(F);
  paintRelationCaptions(F);
}
