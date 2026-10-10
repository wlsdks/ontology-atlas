import type { DomeNodeFrame } from "../../model/dome-view";
import { lerpColorHex } from "../../render/grid";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { worldToScreen } from "../topology-camera-math";
import { domeFamily } from "../frame-cache/structure";
import type { WorldEdge } from "../topology-world";
import { EMPTY_NEIGHBOR_SET, S, litSectorIdsReused, lodHoverEgoReused } from "./frame-state";
import { nodeVisualCache } from "./node-visual";
import { type FrameScope } from "./frame-scope";

const edgePointsScratch = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 },
  control: { x: 0, y: 0 },
};

let nodeVisualCacheTokens: OntologyMapTokens | null = null;

let nodeVisualCacheReducedMotion: boolean | null = null;

export function prepareFocus(F: FrameScope): void {
  const { camera, viewportWidth, viewportHeight, domeControlFor, colorFocusedNodeId, focusRampById,
    focusedNodeId, world, domeLight, hoveredNodeId, selectedEdge, colorSelectedEdge, tokens,
    reducedMotion, footprintStepColor, trailLensKeepIds, domeOn, neural, domeFrameFor } = F;
  const project = (x: number, y: number) => worldToScreen(camera, viewportWidth, viewportHeight, x, y);
  const camX = camera.x.value;
  const camY = camera.y.value;
  const camScale = camera.scale.value;
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const projectEdgePoints = (edge: WorldEdge, knownOffA?: DomeNodeFrame, knownOffB?: DomeNodeFrame): {
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
    if (!domeOn) {
      out.a.x = (edge.ax - camX) * camScale + halfW;
      out.a.y = (edge.ay - camY) * camScale + halfH;
      out.b.x = (edge.bx - camX) * camScale + halfW;
      out.b.y = (edge.by - camY) * camScale + halfH;
      out.control.x = (edge.controlX - camX) * camScale + halfW;
      out.control.y = (edge.controlY - camY) * camScale + halfH;
      return out;
    }
    const offA = knownOffA ?? domeFrameFor(edge.sourceId);
    const offB = knownOffB ?? domeFrameFor(edge.targetId);
    const flatControlX = edge.controlX + (offA.dx + offB.dx) / 2;
    const flatControlY = edge.controlY + (offA.dy + offB.dy) / 2;
    const curve = domeControlFor === null ? null : domeControlFor(edge);
    const controlX = curve?.x ?? flatControlX;
    const controlY = curve?.y ?? flatControlY;
    out.a.x = (edge.ax + offA.dx - camX) * camScale + halfW;
    out.a.y = (edge.ay + offA.dy - camY) * camScale + halfH;
    out.b.x = (edge.bx + offB.dx - camX) * camScale + halfW;
    out.b.y = (edge.by + offB.dy - camY) * camScale + halfH;
    out.control.x = (controlX - camX) * camScale + halfW;
    out.control.y = (controlY - camY) * camScale + halfH;
    return out;
  };
  const egoGlowRamp = (!domeOn || neural > 0.001) && colorFocusedNodeId !== null ? Math.min(1, Math.max(0, focusRampById.get(colorFocusedNodeId) ?? 0)) : 0;
  const neighborsOfFocusedRaw = focusedNodeId ? world.neighborMap.get(focusedNodeId) ?? EMPTY_NEIGHBOR_SET : EMPTY_NEIGHBOR_SET;
  const parentOf = (id: string) => world.nodeById.get(id)?.parentId;
  const litOn = domeOn && domeLight !== null;
  const family = domeOn && focusedNodeId !== null ? domeFamily(world, focusedNodeId, litOn) : null;
  const colorFamily = domeOn && colorFocusedNodeId !== null ? domeFamily(world, colorFocusedNodeId, litOn) : null;
  const domeAncestryOn = family !== null && family.nodes.size > 0;
  const domeAncestryEdges = family?.edges ?? EMPTY_NEIGHBOR_SET;
  const domeAncestryColorNodes = colorFamily?.nodes ?? EMPTY_NEIGHBOR_SET;
  const neighborsOfFocused = domeAncestryOn ? family.neighbors : neighborsOfFocusedRaw;
  const colorNeighborsRaw = colorFocusedNodeId
    ? world.neighborMap.get(colorFocusedNodeId) ?? EMPTY_NEIGHBOR_SET
    : EMPTY_NEIGHBOR_SET;
  const colorNeighbors = colorFamily !== null && colorFamily.nodes.size > 0 ? colorFamily.neighbors : colorNeighborsRaw;
  const litFocusId = litOn ? colorFocusedNodeId : null;
  const litFocusRamp = litFocusId !== null ? Math.min(1, Math.max(0, focusRampById.get(litFocusId) ?? 0)) : 0;
  const inLitLine = (id: string): boolean => litFocusId !== null && (id === litFocusId || domeAncestryColorNodes.has(id));
  litSectorIdsReused.clear();
  if (litFocusId !== null) {
    let cursor: string | null | undefined = litFocusId;
    for (let hop = 0; cursor && hop < 8; hop += 1) {
      const kind = world.nodeById.get(cursor)?.kind;
      if (kind === "domain" || kind === "capability")
        litSectorIdsReused.add(cursor);
      cursor = parentOf(cursor);
    }
  }
  const lod = litOn && domeLight !== null && domeLight.lod !== null && domeLight.lod.active ? domeLight.lod : null;
  if (lod !== null) {
    if (S.lodPresenceReused.length < world.nodes.length)
      S.lodPresenceReused = new Float32Array(world.nodes.length);
    lodHoverEgoReused.clear();
    if (hoveredNodeId !== null) {
      lodHoverEgoReused.add(hoveredNodeId);
      for (const id of world.neighborMap.get(hoveredNodeId) ?? EMPTY_NEIGHBOR_SET)
        lodHoverEgoReused.add(id);
    }
  }
  const egoAllNormal = focusedNodeId === null && selectedEdge === null && trailLensKeepIds === null;
  const colorAllNormal = colorFocusedNodeId === null && colorSelectedEdge === null && trailLensKeepIds === null;
  if (nodeVisualCacheTokens !== tokens || nodeVisualCacheReducedMotion !== reducedMotion) {
    nodeVisualCache.fill(undefined);
    nodeVisualCacheTokens = tokens;
    nodeVisualCacheReducedMotion = reducedMotion;
  }
  const traceTokensFrame = {
    edgeContains: lerpColorHex(tokens.edgeContains, tokens.indigo, neural * 0.12),
    edgeContainsL0: lerpColorHex(tokens.edgeContainsL0, tokens.indigoBright, neural * 0.12),
    edgeContainsL2: lerpColorHex(tokens.edgeContainsL2, tokens.indigo, neural * 0.12),
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
  F.project = project;
  F.camX = camX;
  F.camY = camY;
  F.camScale = camScale;
  F.halfW = halfW;
  F.halfH = halfH;
  F.projectEdgePoints = projectEdgePoints;
  F.egoGlowRamp = egoGlowRamp;
  F.neighborsOfFocusedRaw = neighborsOfFocusedRaw;
  F.parentOf = parentOf;
  F.litOn = litOn;
  F.domeAncestryOn = domeAncestryOn;
  F.domeAncestryEdges = domeAncestryEdges;
  F.neighborsOfFocused = neighborsOfFocused;
  F.colorNeighbors = colorNeighbors;
  F.litFocusId = litFocusId;
  F.litFocusRamp = litFocusRamp;
  F.inLitLine = inLitLine;
  F.lod = lod;
  F.egoAllNormal = egoAllNormal;
  F.colorAllNormal = colorAllNormal;
  F.traceTokensFrame = traceTokensFrame;
  F.nodeShapeTokensFrame = nodeShapeTokensFrame;
}
