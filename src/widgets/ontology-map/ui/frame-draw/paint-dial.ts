import { computeSelectionPulse } from "../../model/selection-pulse";
import { dialConceptTotal } from "../../dial/dial-model";
import { clearDialFrame, dialOwnsFlatPaint, paintDialFrame } from "../../dial/frame/frame";
import { readDialTokens } from "../../dial/tokens";
import { tierAssemblyAppear } from "../../morph/tier-assembly";
import type { FlatDialFrameProps } from "../topology-loop-contract";
import { S, effectiveAlphaByIdReused } from "./frame-state";
import { type FrameDrawParams } from "./frame-draw-params";
import { type FrameScope } from "./frame-scope";

function paintOwnedDial(params: FrameDrawParams, ctx: CanvasRenderingContext2D, labelScale: number, dialProps: Pick<FlatDialFrameProps, "labels" | "evidence" | "impactLens"> | null): boolean {
    const { world, camera, viewportWidth, viewportHeight, tokens, now, reducedMotion, appearById, selectionPulse } = params;
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
    const insets = params.panelInsets ?? { left: 0, right: 0 };
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
        toScreen, scale, labelScale, zoomRatio: params.zoomRatio,
        viewportWidth, viewportHeight,
        freeRect: {
            minX: Math.max(0, insets.left),
            minY: tokens.safeInsetTop,
            maxX: viewportWidth - Math.max(0, insets.right),
            maxY: viewportHeight - tokens.safeInsetBottom,
        },
        mapTokens: tokens, dialTokens, labels: dialProps?.labels ?? null, evidence: dialProps?.evidence ?? null,
        hoveredNodeId: params.hoveredNodeId, focusedNodeId: params.focusedNodeId, agentFocusNodeId: params.agentFocusNodeId,
        selectionPulse: pulse && selectionPulse ? { nodeId: selectionPulse.nodeId, ...pulse } : null,
        appearOf: (id) => Math.min(1, Math.max(0, appearById?.get(id) ?? 1)),
        hubCount: hub ? String(dialConceptTotal(dial.model)) : null,
        elementLabel: (id) => world.nodeById.get(id)?.label ?? null,
        now, reducedMotion,
        domainAppear: tierAssemblyAppear(world, "domain", now) ?? 1,
    });
    effectiveAlphaByIdReused.clear();
    S.effectiveAlphaWorld = new WeakRef(world);
    for (const node of world.nodes)
        effectiveAlphaByIdReused.set(node.id, result.alphas.get(node.id) ?? 0);
    S.drawnLabelBoxes = result.labelBoxes;
    S.drawnRelationCaptions = [];
    S.drawnNodeCount = result.drawnCount;
    return true;
}

// True when the dial owned the whole frame, so the map passes must not run.
export function paintDial(F: FrameScope): boolean {
  const { params, world, realmDepthById, wardingRing, selectedEdge, previewEdge, spotlightIds,
    pathEdgeIds, dialProps, focusedNodeId, relationCaptions, hoveredNodeId, ctx, trailLensKeepIds,
    domeOn, labelScale } = F;
    const dialOwns = world.dial != null && dialOwnsFlatPaint({
        hasDial: !domeOn,
        realmActive: realmDepthById !== null || wardingRing !== null,
        edgeSelected: selectedEdge !== null,
        edgePreviewed: previewEdge !== null,
        trailLensOpen: trailLensKeepIds !== null,
        spotlightActive: spotlightIds !== null && spotlightIds.size > 0,
        pathLensActive: pathEdgeIds !== null && pathEdgeIds.size > 0,
        impactLensActive: dialProps?.impactLens === true,
        focusedIsElement: focusedNodeId !== null && world.nodeById.get(focusedNodeId)?.kind === "element",
        focusedRelationsCaptioned: focusedNodeId !== null && (relationCaptions?.size ?? 0) > 0,
        brushedIsElement: focusedNodeId !== null && hoveredNodeId !== null && world.nodeById.get(hoveredNodeId)?.kind === "element",
    });
    if (!dialOwns)
        clearDialFrame();
    else if (paintOwnedDial(params, ctx, labelScale, dialProps))
        return true;
  return false;
}
