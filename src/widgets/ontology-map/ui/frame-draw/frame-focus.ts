import { lerpColorHex } from "../../render/grid";
import { worldToScreen } from "../camera/topology-camera-math";
import type { WorldEdge } from "../world/topology-world";
import { EMPTY_NEIGHBOR_SET } from "./frame-state";
import { resetNodeVisualCacheFor } from "./node-visual";
import type { FrameInputs } from "./frame-begin";
import { lastDialFrame } from "../../dial/frame/frame";
import { clipBranchRelation } from "../../dial/branches/relation-ports";

// Shared scratch: use the result before the next call and never keep it.
const edgePointsScratch = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 },
  control: { x: 0, y: 0 },
};

export function prepareFocus(frame: FrameInputs) {
  const { camera, viewportWidth, viewportHeight, colorFocusedNodeId, focusRampById,
    focusedNodeId, world, selectedEdge, colorSelectedEdge, tokens,
    reducedMotion, footprintStepColor, trailLensKeepIds } = frame;
  const project = (x: number, y: number) => worldToScreen(camera, viewportWidth, viewportHeight, x, y);
  const camX = camera.x.value;
  const camY = camera.y.value;
  const camScale = camera.scale.value;
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const projectEdgePoints = (edge: WorldEdge): {
    a: {
      x: number;
      y: number;
    };
    b: {
      x: number;
      y: number;
    };
    control: {
      x: number;
      y: number;
    };
  } => {
    const out = edgePointsScratch;
    out.a.x = (edge.ax - camX) * camScale + halfW;
    out.a.y = (edge.ay - camY) * camScale + halfH;
    out.b.x = (edge.bx - camX) * camScale + halfW;
    out.b.y = (edge.by - camY) * camScale + halfH;
    out.control.x = (edge.controlX - camX) * camScale + halfW;
    out.control.y = (edge.controlY - camY) * camScale + halfH;
    return clipBranchRelation(lastDialFrame(), edge.sourceId, edge.targetId, out);
  };
  const egoGlowRamp = colorFocusedNodeId !== null ? Math.min(1, Math.max(0, focusRampById.get(colorFocusedNodeId) ?? 0)) : 0;
  const neighborsOfFocused = focusedNodeId ? world.neighborMap.get(focusedNodeId) ?? EMPTY_NEIGHBOR_SET : EMPTY_NEIGHBOR_SET;
  const colorNeighbors = colorFocusedNodeId
    ? world.neighborMap.get(colorFocusedNodeId) ?? EMPTY_NEIGHBOR_SET
    : EMPTY_NEIGHBOR_SET;
  const egoAllNormal = focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  const colorAllNormal = colorFocusedNodeId === null && colorSelectedEdge === null && trailLensKeepIds === null;
  resetNodeVisualCacheFor(tokens, reducedMotion);
  // `rgb()` form keeps the contains inks a hard cut in the trace's ink mix,
  // which only blends `#rrggbb`; feeding the hex tokens would change transitions.
  const traceTokensFrame = {
    edgeContains: lerpColorHex(tokens.edgeContains, tokens.edgeContains, 0),
    edgeContainsL0: lerpColorHex(tokens.edgeContainsL0, tokens.edgeContainsL0, 0),
    edgeContainsL2: lerpColorHex(tokens.edgeContainsL2, tokens.edgeContainsL2, 0),
    edgeDepends: tokens.edgeDepends,
    edgeDim: tokens.edgeDim,
    indigo: tokens.indigo,
    indigoBright: tokens.indigoBright,
    edgeSelected: tokens.edgeSelected,
    edgeTrail: footprintStepColor,
  };
  const nodeShapeTokensFrame = {
    amberHub: tokens.amberHub,
    recentChange: tokens.recentChange,
    numeralShadow: tokens.numeralShadow,
    numeralFace: tokens.numeralFace,
    holeFill: tokens.nodeHoleFill,
    projectHairlineInner: tokens.projectHairlineInner,
    projectPinTick: tokens.projectPinTick,
    selectionIndigo: tokens.selectionRingIndigo,
    selectionHairline: tokens.selectionRingHairline,
    neighborRing: tokens.edgeSelected,
    hoverRing: tokens.hoverRing,
    hoverShimmerSeg: tokens.hoverShimmerSeg,
    hoverShimmerPeriodMs: tokens.hoverShimmerPeriodMs,
    hoverShimmerColor: tokens.indigoBright,
  };
  return {
    project, camX, camY, camScale, halfW, halfH, projectEdgePoints, egoGlowRamp,
    neighborsOfFocused, colorNeighbors, egoAllNormal, colorAllNormal, traceTokensFrame, nodeShapeTokensFrame,
  };
}

export type FrameFocus = Readonly<ReturnType<typeof prepareFocus>>;
