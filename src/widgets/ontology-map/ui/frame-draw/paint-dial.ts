import { computeSelectionPulse } from "../../model/selection-pulse";
import { dialConceptTotal } from "../../dial/dial-model";
import { clearDialFrame, dialOwnsFlatPaint, paintDialFrame } from "../../dial/frame/frame";
import { readDialTokens } from "../../dial/tokens";
import { tierAssemblyAppear } from "../../morph/tier-assembly";
import { passState, effectiveAlphaByIdReused } from "./frame-state";
import type { FrameInputs } from "./frame-begin";

function paintOwnedDial(frame: FrameInputs): boolean {
  const { world, camera, viewportWidth, viewportHeight, tokens, now, reducedMotion, appearById, selectionPulse, ctx, labelScale } = frame;
  const dial = world.dial;
  if (!dial)
    return false;
  let dialTokens;
  try {
    dialTokens = readDialTokens();
  }
  catch {
    clearDialFrame();
    return false;
  }
  const camX = camera.x.value;
  const camY = camera.y.value;
  const scale = camera.scale.value;
  const halfW = viewportWidth / 2;
  const halfH = viewportHeight / 2;
  const toScreen = (x: number, y: number) => ({ x: (x - camX) * scale + halfW, y: (y - camY) * scale + halfH });
  const insets = frame.panelInsets ?? { left: 0, right: 0 };
  const hub = dial.model.projectId === null ? undefined : world.nodeById.get(dial.model.projectId);
  const pulse = !reducedMotion && selectionPulse !== null
    ? computeSelectionPulse(now - selectionPulse.startAtMs, tokens.selectPulseDurationMs, tokens.selectPulseScaleDelta)
    : null;
  const result = paintDialFrame({
    ctx, dial, worldKey: world,
    nodeScreen: (id) => {
      const node = world.nodeById.get(id);
      return node ? toScreen(node.x, node.y) : null;
    },
    toScreen, scale, labelScale, zoomRatio: frame.zoomRatio,
    viewportWidth, viewportHeight,
    freeRect: {
      minX: Math.max(0, insets.left),
      minY: tokens.safeInsetTop,
      maxX: viewportWidth - Math.max(0, insets.right),
      maxY: viewportHeight - tokens.safeInsetBottom,
    },
    mapTokens: tokens, dialTokens, labels: frame.dial?.labels ?? null, evidence: frame.dial?.evidence ?? null,
    hoveredNodeId: frame.hoveredNodeId, focusedNodeId: frame.focusedNodeId, agentFocusNodeId: frame.agentFocusNodeId,
    selectionPulse: pulse && selectionPulse ? { nodeId: selectionPulse.nodeId, ...pulse } : null,
    appearOf: (id) => Math.min(1, Math.max(0, appearById?.get(id) ?? 1)),
    hubCount: hub ? String(dialConceptTotal(dial.model)) : null,
    elementLabel: (id) => world.nodeById.get(id)?.label ?? null,
    now, reducedMotion,
    domainAppear: tierAssemblyAppear(world, "domain", now) ?? 1,
  });
  effectiveAlphaByIdReused.clear();
  passState.effectiveAlphaWorld = new WeakRef(world);
  for (const node of world.nodes)
    effectiveAlphaByIdReused.set(node.id, result.alphas.get(node.id) ?? 0);
  passState.drawnLabelBoxes = result.labelBoxes;
  passState.drawnRelationCaptions = [];
  passState.drawnNodeCount = result.drawnCount;
  return true;
}

// True when the dial owned the whole frame, so the map passes must not run.
export function paintDial(frame: FrameInputs): boolean {
  const { world, realmDepthById, wardingRing, selectedEdge, previewEdge, spotlightIds, pathEdgeIds, dial,
    focusedNodeId, relationCaptions, hoveredNodeId, trailLensKeepIds, domeOn } = frame;
  const dialOwns = world.dial != null && dialOwnsFlatPaint({
    hasDial: !domeOn,
    realmActive: realmDepthById !== null || wardingRing !== null,
    edgeSelected: selectedEdge !== null,
    edgePreviewed: previewEdge !== null,
    trailLensOpen: trailLensKeepIds !== null,
    spotlightActive: spotlightIds !== null && spotlightIds.size > 0,
    pathLensActive: pathEdgeIds !== null && pathEdgeIds.size > 0,
    impactLensActive: dial?.impactLens === true,
    focusedIsElement: focusedNodeId !== null && world.nodeById.get(focusedNodeId)?.kind === "element",
    focusedRelationsCaptioned: focusedNodeId !== null && (relationCaptions?.size ?? 0) > 0,
    brushedIsElement: focusedNodeId !== null && hoveredNodeId !== null && world.nodeById.get(hoveredNodeId)?.kind === "element",
  });
  if (!dialOwns)
    clearDialFrame();
  else if (paintOwnedDial(frame))
    return true;
  return false;
}
