import { computeNodeAlpha } from "./node-alpha";
import { beginFrame } from "./frame-begin";
import { beginNodeLayer, paintStrataDust } from "./node-layer";
import { paintBackdrop } from "./paint-backdrop";
import { paintClusterChips } from "./paint-chips";
import { paintBranchContext, paintDial, prepareBranchContext } from "./paint-dial";
import { paintDomeStage } from "./paint-dome-stage";
import { paintEdges } from "./paint-edges";
import { paintLabels } from "./paint-labels";
import { buildNeuralFrame } from "./neural-frame";
import { paintNeuralNames } from "./neural-names";
import { strokeNeural, type NeuralLabels } from "./paint-neural";
import { paintNodes } from "./paint-nodes";
import { paintRelationCaptions } from "./paint-captions";
import { paintWardingRing } from "./paint-warding";
import { prepareEdges } from "./edge-prep";
import { prepareFocus } from "./frame-focus";
import type { FrameDrawParams } from "./frame-draw-params";
import type { FrameInputs } from "./frame-begin";
import type { FrameFocus } from "./frame-focus";
import type { NodeLayer } from "./node-layer";

export type { FrameDrawParams } from "./frame-draw-params";
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
} from "./frame-state";

/** From here Neural paints alone; below it the flat marks fade out under Neural's. */
const NEURAL_SOLE_RAMP = 0.999;

/** Lays the ground over what the flat passes drew, by Neural's ramp, so the two crossfade. */
function crossfadeToNeural(frame: FrameInputs, layer: NodeLayer): void {
  const { ctx } = layer;
  ctx.globalAlpha = frame.neural;
  ctx.fillStyle = frame.tokens.canvasBgNear;
  ctx.fillRect(0, 0, frame.viewportWidth, frame.viewportHeight);
  ctx.globalAlpha = 1;
}

/**
 * Neural: builds this frame's `NeuralFrame`, lets `neuralSurface` paint it when it can and strokes it
 * on canvas 2D otherwise, then draws the names on the context the painter returns.
 */
function paintNeural(frame: FrameInputs, focus: FrameFocus, layer: NodeLayer, labels: NeuralLabels | null): void {
  const nf = buildNeuralFrame(frame, focus);
  let namesCtx = frame.neuralSurface?.paint(nf) ?? null;
  if (namesCtx === null) {
    strokeNeural(layer.ctx, nf);
    namesCtx = layer.ctx;
  }
  paintNeuralNames(namesCtx, frame, nf, labels);
  namesCtx.globalAlpha = 1;
}

// Order is paint order; each pass takes the stage results it reads.
export function drawTopologyFrame(params: FrameDrawParams): void {
  const frame = beginFrame(params);
  paintBackdrop(frame);
  if (paintDial(frame)) return;
  const focus = prepareFocus(frame);
  const alpha = computeNodeAlpha(frame, focus);
  const branch = prepareBranchContext(frame, alpha.effectiveAlphaById);
  if (branch) {
    // Branch disclosure is the final node presence; edges must read the same presence.
    frame.world.nodes.forEach((node, index) => {
      alpha.effectiveAlphaByIndex[index] = branch.alphas.get(node.id) ?? 0;
    });
  }
  if (frame.neural >= NEURAL_SOLE_RAMP) {
    paintNeural(frame, focus, beginNodeLayer(frame), frame.neuralLabels ?? null);
    return;
  }
  const edges = prepareEdges(frame, focus, alpha);
  const stage = paintDomeStage(frame, focus, edges);
  paintEdges(frame, focus, alpha, edges, stage);
  const layer = beginNodeLayer(frame);
  if (branch) {
    const context = paintBranchContext(frame, branch);
    paintRelationCaptions(frame, edges, layer, context.reservations, context.safe);
    return;
  }
  if (frame.neural > 0) {
    paintNodes(frame, focus, alpha, stage, layer);
    crossfadeToNeural(frame, layer);
    paintNeural(frame, focus, layer, frame.neuralLabels ?? null);
    return;
  }
  paintStrataDust(frame, focus, layer);
  paintNodes(frame, focus, alpha, stage, layer);
  paintWardingRing(frame, focus, layer);
  const chipReservations = paintClusterChips(frame, focus, alpha, layer);
  const safeRect = paintLabels(frame, focus, alpha, layer, chipReservations);
  paintRelationCaptions(frame, edges, layer, chipReservations, safeRect);
}
