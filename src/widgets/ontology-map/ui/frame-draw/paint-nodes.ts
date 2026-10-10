import { trailNodeInkStrength } from "../../model/focus-state";
import { computeSelectionPulse, type SelectionPulseVisual } from "../../model/selection-pulse";
import { drawFootprintSteps } from "@/shared/lib/footprint-glyph";
import {
  DOME_HALO_ALPHA_CAP,
  DOME_HALO_ALPHA_GAIN,
  domeDetailFactor,
  domeFogAlpha,
  DOME_RIM_FOG_FLOOR,
  domeHaloPx,
} from "../../model/dome-view";
import {
  drawEmissiveHalo,
  drawEvidenceRing,
  EVIDENCE_EMISSION,
  focusFogFactor,
  type EvidenceLight,
} from "../../render/dome-light";
import { realmDepthClarityAlpha, realmDepthClarityScale } from "../../model/realm-transition";
import { HITTABLE_MIN_TIER_ALPHA } from "../../model/tier-visibility";
import { lerpColorHex } from "../../render/grid";
import { NODE_DISC_LABEL_PRIORITY } from "../../render/label-layout";
import {
  draw as nodeShapesDraw,
  drawNodeStar,
  SPOTLIGHT_RING_OFFSET,
} from "../../render/node-shapes";
import { drawDiffractionSpike } from "../../render/starfield";
import { isNodeCulled } from "../../render/viewport-cull";
import { isPreviewEndpoint, isPreviewEndpointHidden } from "../../render/preview-edge";
import { isSpineNode, radiusForKind, type WorldNode } from "../topology-world";
import { pressResponse } from "../../expressive/mass-spring";
import { drawNodeBloom } from "../../expressive/ego-light";
import { drawNeuralBloom } from "../../expressive/neural-bloom";
import {
  BACKGROUND_DIM_WHEN_EXPANDED,
  EMPTY_NEIGHBOR_SET,
  passState,
  ZERO_DOME_FRAME,
  domeNodeFrameReused,
  litDrawnStateCounts,
} from "./frame-state";
import {
  KIND_CACHE_INDEX,
  LIT_KIND_STRENGTH,
  type NodeVisual,
  litBodyInk,
  neuralPaletteCache,
  nodeVisualCache,
  phaseForId,
  resolveNodeVisual,
} from "./node-visual";
import {
  TRAIL_IGNITE_MS,
  TRAIL_STAR_SWELL,
  TRAIL_STAR_TWINKLE,
  TRAIL_STAR_TWINKLE_MS,
  TRAIL_STAR_TWINKLE_SPREAD_MS,
  starAttackCurve,
  starSwellCurve,
  trailIgniteStartMs,
} from "./trail-curves";
import { type FrameScope } from "./frame-scope";

// Spike arms reach 2.6 times the radius.
const NODE_CULL_SLACK = 3;
const EXPANDED_AURA_RING_OFFSET = 6;
const EXPANDED_AURA_DASH: readonly number[] = [3, 3];
const REALM_ROOT_ANCHOR_ALPHA = 0.7;
const EXPANDED_AURA_ALPHA = 0.55;
const EXPANDED_COHORT_ALPHA = 0.42;
const domeNodeOrderReused: WorldNode[] = [];
const domeNodeDepthReused: number[] = [];
const domeNodeIndexReused: number[] = [];
const nodeScreenScratch = { x: 0, y: 0 };
const sheenTopCache = new Map<string, string>();

let sheenTopCacheTint = "";

let sheenTopCacheBlend = -1;

export function paintNodes(F: FrameScope): void {
  const { chipRevealById, world, clusteredIds, previewEdge, focusedNodeId, selectedEdge,
    colorFocusedNodeId, colorSelectedEdge, focusRampById, emphasisById, emphasizedNeighborId,
    tokens, reducedMotion, footprintStepColor, appearById, batchAppearById, expandRevealById, now,
    hoverReleasedNodeId, hoveredNodeId, hoverStartedAt, realmDepthById, camera, viewportWidth,
    viewportHeight, spotlightIds, domeLight, selectionPulse, canvasDpr, farT, agentFocusNodeId,
    spotlightRamp, spotlightDashOffset, glyphStyle, footprintStepsById, footprintPref, trailStarInk,
    trailLensOpenedAtMs, footprintNewestStep, footprintNewestId, footprintAppear, footprintInk,
    wardingRing, ctx, spotlightLensActive, recentSpotlightActive, spotlightSink, trailLensActive,
    trailRamp, isTrailKept, lensNodeEgoState, realmDepthOf, realmParallaxOffsetFor, domeOn, neural,
    footprintScale, camX, camY, camScale, halfW, halfH, egoGlowRamp, litOn, neighborsOfFocused,
    colorNeighbors, litFocusRamp, inLitLine, egoAllNormal, colorAllNormal, nodeShapeTokensFrame,
    effectiveAlphaById, effectiveAlphaByIndex, expandedParentIds, expandedDiscIds, expandedChildIds,
    anyExpanded, domeHaloColor, drawnScreenRadiusById, nodeDiscReservations } = F;
  const nearestExpandedRevealMul = (nodeId: string): number => {
    if (!chipRevealById || expandedParentIds.size === 0)
      return 1;
    let cursor = world.nodeById.get(nodeId)?.parentId ?? null;
    let guard = 0;
    while (cursor && guard < 64) {
      if (expandedParentIds.has(cursor))
        return chipRevealById.get(cursor) ?? 1;
      cursor = world.nodeById.get(cursor)?.parentId ?? null;
      guard += 1;
    }
    return 1;
  };
  let nodeDrawOrder: readonly WorldNode[] = world.nodes;
  if (domeOn) {
    domeNodeDepthReused.length = 0;
    domeNodeIndexReused.length = 0;
    for (let i = 0; i < world.nodes.length; i += 1) {
      domeNodeDepthReused.push(domeNodeFrameReused[i].u);
      if (effectiveAlphaByIndex[i] <= HITTABLE_MIN_TIER_ALPHA)
        continue;
      const id = world.nodes[i].id;
      if (isPreviewEndpointHidden(clusteredIds.has(id), previewEdge, id))
        continue;
      domeNodeIndexReused.push(i);
    }
    domeNodeIndexReused.sort((x, y) => domeNodeDepthReused[y] - domeNodeDepthReused[x]);
    domeNodeOrderReused.length = 0;
    for (let i = 0; i < domeNodeIndexReused.length; i += 1)
      domeNodeOrderReused.push(world.nodes[domeNodeIndexReused[i]]);
    nodeDrawOrder = domeNodeOrderReused;
  }
  passState.drawnNodeCount = 0;
  litDrawnStateCounts.current = 0;
  litDrawnStateCounts.stale = 0;
  litDrawnStateCounts.unknown = 0;
  for (let drawPos = 0; drawPos < nodeDrawOrder.length; drawPos += 1) {
    const node = nodeDrawOrder[drawPos];
    const previewEndpoint = isPreviewEndpoint(previewEdge, node.id);
    const previewTarget = node.id === previewEdge?.targetId;
    if (isPreviewEndpointHidden(clusteredIds.has(node.id), previewEdge, node.id))
      continue;
    const tierAlpha = effectiveAlphaById.get(node.id) ?? 1;
    if (tierAlpha <= HITTABLE_MIN_TIER_ALPHA)
      continue;
    passState.drawnNodeCount += 1;
    const egoState = previewTarget
      ? "neighbor"
      : egoAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, focusedNodeId, neighborsOfFocused, selectedEdge);
    const colorEgoState = previewTarget
      ? "neighbor"
      : colorAllNormal
        ? "normal"
        : lensNodeEgoState(node.id, colorFocusedNodeId, colorNeighbors, colorSelectedEdge);
    const focusRamp = trailLensActive ? trailRamp : (focusRampById.get(node.id) ?? 0);
    const emphasis = emphasisById.get(node.id) ?? 0;
    const isEmphasizedNeighbor = emphasizedNeighborId !== null && node.id === emphasizedNeighborId && egoState === "neighbor";
    let visual: NodeVisual;
    const visualCacheable = colorEgoState === "normal" &&
      colorFocusedNodeId === null &&
      !trailLensActive &&
      emphasis <= 0.02 &&
      focusRamp <= 0.001 &&
      !isEmphasizedNeighbor;
    if (visualCacheable) {
      const cacheKey = KIND_CACHE_INDEX[node.kind] * 4 + (node.fresh && !node.stale ? 2 : 0) + (node.stale ? 1 : 0);
      const cached = nodeVisualCache[cacheKey];
      if (cached !== undefined) {
        visual = cached;
      }
      else {
        visual = resolveNodeVisual(node, colorEgoState, emphasis, colorFocusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion, focusRamp);
        nodeVisualCache[cacheKey] = visual;
      }
    }
    else {
      visual = resolveNodeVisual(node, colorEgoState, emphasis, colorFocusedNodeId, isEmphasizedNeighbor, tokens, reducedMotion, focusRamp);
    }
    const trailInk = trailLensActive
      ? trailNodeInkStrength({
        kept: isTrailKept(node.id),
        ramp: trailRamp,
        colorEgoState,
      })
      : 0;
    // Safe to mutate: trail-lens frames never use a cached NodeVisual.
    if (trailInk > 0.001) {
      visual.stroke = lerpColorHex(visual.stroke, footprintStepColor, trailInk);
    }
    const baseRadius = radiusForKind(node.kind, tokens) * node.magnitudeScale;
    const appear = Math.min(1, Math.max(0, appearById?.get(node.id) ?? 1));
    const batchAppear = batchAppearById?.get(node.id);
    const chipExpandReveal = expandRevealById?.get(node.id);
    const revealMul = batchAppear !== undefined
      ? Math.min(1, Math.max(0, batchAppear))
      : chipExpandReveal !== undefined
        ? 1
        : Math.min(1, Math.max(0, nearestExpandedRevealMul(node.id)));
    const scaleDriver = batchAppear !== undefined ? Math.min(1, Math.max(0, batchAppear)) : appear;
    const appearScale = 0.6 + 0.4 * scaleDriver;
    const appearRevealAlpha = appear * revealMul;
    let breathe = 1;
    if (visual.breatheEnabled) {
      breathe = 1 + tokens.breatheAmplitude * Math.sin((now / 1000) * tokens.breatheFreqRad + phaseForId(node.id));
    }
    let effRadius = baseRadius * breathe * appearScale;
    if (colorEgoState === "center")
      effRadius *= 1 + 0.12 * Math.min(1, Math.max(0, focusRamp));
    // A released node keeps the 0.16 press coefficient until its emphasis decays; 0.08 at once is a hard cut.
    const releasedPress = node.id === hoverReleasedNodeId &&
      node.id !== hoveredNodeId &&
      !(hoveredNodeId !== null && (world.neighborMap.get(hoveredNodeId) ?? EMPTY_NEIGHBOR_SET).has(node.id));
    if (!focusedNodeId) {
      if (node.id === hoveredNodeId && !reducedMotion && hoverStartedAt !== null) {
        const press = pressResponse((now - hoverStartedAt) / 1000, { omega: tokens.pressAngFreq, zeta: tokens.pressZeta });
        effRadius += Math.max(0, press) * baseRadius * 0.16;
      }
      else {
        effRadius +=
          emphasis * (node.id === hoveredNodeId || releasedPress ? baseRadius * 0.16 : baseRadius * 0.08);
      }
    }
    else if (isEmphasizedNeighbor) {
      effRadius += emphasis * baseRadius * 0.12;
    }
    const isHoveredNode = node.id === hoveredNodeId;
    let realmClarityAlpha = 1;
    if (realmDepthById !== null && !isHoveredNode && !previewEndpoint && !isTrailKept(node.id) && egoState === "normal") {
      const depth = realmDepthOf(node.id);
      if (depth !== undefined) {
        realmClarityAlpha = realmDepthClarityAlpha(depth);
        effRadius *= realmDepthClarityScale(depth);
      }
    }
    const nodeDome = domeOn ? domeNodeFrameReused[domeNodeIndexReused[drawPos]] : ZERO_DOME_FRAME;
    let domeDetail = 1;
    let domeRimAlphaScale = 1;
    if (domeOn) {
      effRadius *= nodeDome.s;
      if (!isHoveredNode && !previewEndpoint && !isTrailKept(node.id) && egoState === "normal") {
        const fog = Math.max(domeFogAlpha(nodeDome.u), neural * DOME_RIM_FOG_FLOOR);
        const domeFog = 1 + (fog - 1) * nodeDome.a;
        realmClarityAlpha *= domeFog;
        domeDetail = 1 + (domeDetailFactor(nodeDome.u) - 1) * nodeDome.a;
        domeRimAlphaScale = domeFog > 1e-4 ? Math.max(1, DOME_RIM_FOG_FLOOR / domeFog) : 1;
      }
      if (litOn && litFocusRamp > 0.001 && !isHoveredNode && egoState !== "center" && egoState !== "neighbor" && !inLitLine(node.id)) {
        realmClarityAlpha *= focusFogFactor(nodeDome.u, litFocusRamp);
      }
    }
    const pOff = realmParallaxOffsetFor(node.id);
    const screen = nodeScreenScratch;
    screen.x = (node.x + pOff.x + nodeDome.dx - camX) * camScale + halfW;
    screen.y = (node.y + pOff.y + nodeDome.dy - camY) * camScale + halfH;
    const screenRadius = effRadius * camera.scale.value;
    if (isNodeCulled(screen, screenRadius * NODE_CULL_SLACK, viewportWidth, viewportHeight))
      continue;
    drawnScreenRadiusById.set(node.id, screenRadius);
    const attended = egoState === "center" || egoState === "neighbor" || node.id === hoveredNodeId;
    const wearsSpotlightRing = recentSpotlightActive && spotlightIds !== null && spotlightIds.has(node.id);
    const reservedHalf = attended
      ? screenRadius + EXPANDED_AURA_RING_OFFSET
      : screenRadius + (wearsSpotlightRing ? SPOTLIGHT_RING_OFFSET + 1 : 1);
    nodeDiscReservations.push({
      ownerId: node.id,
      priority: NODE_DISC_LABEL_PRIORITY,
      bbox: {
        minX: screen.x - reservedHalf,
        maxX: screen.x + reservedHalf,
        minY: screen.y - reservedHalf,
        maxY: screen.y + reservedHalf,
      },
    });
    const backgroundDim = anyExpanded && !previewEndpoint && egoState === "normal" && !isTrailKept(node.id) && !expandedDiscIds.has(node.id) && !isSpineNode(node)
      ? BACKGROUND_DIM_WHEN_EXPANDED
      : 1;
    const nodeSpotlightSink = spotlightSink((spotlightIds !== null && spotlightIds.has(node.id)) || isHoveredNode || previewEndpoint);
    const nodeLayerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha * nodeSpotlightSink;
    const bodyAlpha = nodeLayerAlpha;
    ctx.globalAlpha = bodyAlpha;
    if (sheenTopCacheTint !== tokens.nodeSheenTint || sheenTopCacheBlend !== tokens.nodeSheenBlend) {
      sheenTopCache.clear();
      sheenTopCacheTint = tokens.nodeSheenTint;
      sheenTopCacheBlend = tokens.nodeSheenBlend;
    }
    let bodyFill = visual.fill;
    let bodyStroke = visual.stroke;
    let litState: EvidenceLight | null = null;
    let litRgb: readonly [
      number,
      number,
      number
    ] | null = null;
    if (litOn && domeLight !== null && nodeDome.a > 0.01) {
      litRgb = domeLight.kindRgb[node.kind] ?? null;
      litState = domeLight.evidence?.get(node.id) ?? "unknown";
      if (litRgb !== null && colorEgoState !== "dim" && litState !== "unknown") {
        const body = litBodyInk(visual.fill, visual.stroke, litRgb, litState, nodeDome.a);
        bodyFill = body.fill;
        bodyStroke = body.stroke;
      }
    }
    if (neural > 0.001 && colorEgoState !== "dim" && !litOn) {
      const ink = node.kind === "project" ? tokens.amberHub : tokens.indigoBright;
      let palette = neuralPaletteCache.get(visual);
      if (!palette || palette.ramp !== neural || palette.ink !== ink) {
        const fill = lerpColorHex(visual.fill, ink, neural * 0.85);
        palette = { ramp: neural, ink, fill, stroke: lerpColorHex(visual.stroke, fill, neural * 0.85) };
        neuralPaletteCache.set(visual, palette);
      }
      bodyFill = palette.fill;
      if (colorEgoState === "normal")
        bodyStroke = palette.stroke;
    }
    let sheenTop = sheenTopCache.get(bodyFill);
    if (sheenTop === undefined) {
      sheenTop = lerpColorHex(bodyFill, tokens.nodeSheenTint, tokens.nodeSheenBlend);
      if (sheenTopCache.size > 256)
        sheenTopCache.clear();
      sheenTopCache.set(bodyFill, sheenTop);
    }
    if (domeDetail < 1) {
      sheenTop =
        domeDetail <= 0.01
          ? visual.fill
          : lerpColorHex(visual.fill, tokens.nodeSheenTint, tokens.nodeSheenBlend * domeDetail);
    }
    const showCount = (node.kind === "project" || node.kind === "domain") && node.count > 0 && !(domeOn && nodeDome.a > 0.5);
    const isHovered = node.id === hoveredNodeId;
    let selectionPulseVisual: SelectionPulseVisual | null = null;
    if (!reducedMotion && selectionPulse !== null && selectionPulse.nodeId === node.id) {
      selectionPulseVisual = computeSelectionPulse(now - selectionPulse.startAtMs, tokens.selectPulseDurationMs, tokens.selectPulseScaleDelta);
    }
    if (domeOn && !litOn && nodeDome.a > 0.01) {
      const haloPx = domeHaloPx(nodeDome.u) * nodeDome.a * domeDetail;
      if (haloPx > 0.05) {
        const prevAlpha = ctx.globalAlpha;
        ctx.globalAlpha = Math.min(DOME_HALO_ALPHA_CAP, prevAlpha * DOME_HALO_ALPHA_GAIN);
        ctx.fillStyle = domeHaloColor;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, screenRadius + haloPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = prevAlpha;
      }
    }
    if (!domeOn) {
      const bloomRamp =
        colorEgoState === "center"
          ? egoGlowRamp
          : !focusedNodeId && (node.id === hoveredNodeId || releasedPress)
            ? Math.min(1, Math.max(0, emphasis))
            : 0;
      drawNodeBloom(ctx, { x: screen.x, y: screen.y, r: screenRadius }, bloomRamp, tokens);
    }
    if (litRgb !== null && litState !== null) {
      const lineBoost = litFocusRamp > 0.001 ? (inLitLine(node.id) ? 1 : 1 - 0.85 * litFocusRamp) : 1;
      const strength =
        EVIDENCE_EMISSION[litState] * LIT_KIND_STRENGTH[node.kind] * lineBoost * nodeDome.a * (colorEgoState === "dim" ? 0.3 : 1);
      drawEmissiveHalo(ctx, screen.x, screen.y, screenRadius, litRgb, strength);
    }
    if (neural > 0.001 && colorEgoState !== "dim" && !litOn) {
      const strength = attended ? 1 : node.kind === "element" ? 0.35 : 0.6;
      drawNeuralBloom(ctx, { x: screen.x, y: screen.y, r: screenRadius }, neural, strength, tokens, canvasDpr,
        node.kind === "project" ? { core: tokens.amberHub, halo: tokens.amberHub } : undefined);
    }
    if (bodyAlpha > 0 || showCount) nodeShapesDraw(
      ctx,
      {
        depthShade: domeOn ? nodeDome.a * domeDetail : 0,
        detail: domeDetail,
        rimAlphaScale: domeRimAlphaScale,
        kind: node.kind,
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        farT: domeOn ? Math.max(farT, nodeDome.a) : farT,
        egoState: colorEgoState,
        fill: bodyFill,
        stroke: bodyStroke,
        lineWidth: visual.lineWidth,
        dash: visual.dash,
        hub: node.isHub,
        sheenTop,
        countLabel: showCount ? String(node.count) : null,
        isHovered,
        hoverEmphasis: isHovered && trailLensActive ? 1 : emphasis,
        selectionPulse: selectionPulseVisual,
        agentFocus: agentFocusNodeId !== null && node.id === agentFocusNodeId,
        spotlightRing:
          recentSpotlightActive && spotlightIds !== null && spotlightIds.has(node.id)
            ? {
              alpha: spotlightRamp,
              dashOffset: reducedMotion ? 0 : spotlightDashOffset,
            }
            : null,
        now,
        reducedMotion,
        glyphStyle,
      },
      nodeShapeTokensFrame);
    if (litRgb !== null && litState !== null && litState !== "current" && domeLight !== null) {
      drawEvidenceRing(
        ctx,
        screen.x,
        screen.y,
        screenRadius,
        litState,
        litRgb,
        domeLight.warningRgb,
        nodeLayerAlpha * nodeDome.a * (colorEgoState === "dim" ? 0.45 : 1));
    }
    if (litState !== null)
      litDrawnStateCounts[litState] += 1;
    if (farT > 0.02 && (world.brightStarIds.has(node.id) || node.kind === "project")) {
      drawDiffractionSpike(ctx, {
        screenX: screen.x,
        screenY: screen.y,
        screenRadius,
        color: egoState === "dim"
          ? tokens.nodeStrokeDim
          : visual.stroke,
        alpha: farT * tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha,
      });
    }

    const footprintSteps = footprintStepsById.get(node.id);
    if (footprintSteps !== undefined && footprintPref !== null && trailStarInk !== null) {
      const layerAlpha = tierAlpha * realmClarityAlpha * backgroundDim * appearRevealAlpha;
      const newest = Math.max(...footprintSteps);
      let sweepT = 1;
      if (!reducedMotion && trailLensOpenedAtMs > 0 && footprintNewestStep > 0) {
        const startAt = trailIgniteStartMs(newest, footprintNewestStep);
        sweepT = (now - trailLensOpenedAtMs - startAt) / TRAIL_IGNITE_MS;
        sweepT = sweepT < 0 ? 0 : sweepT > 1 ? 1 : sweepT;
      }
      const ignite = (node.id === footprintNewestId ? footprintAppear : 1) * starAttackCurve(sweepT);
      let twinkle = 1;
      if (!reducedMotion) {
        let h = 0;
        for (let i = 0; i < node.id.length; i += 1) h = (h * 31 + node.id.charCodeAt(i)) % 6283;
        const periodMs = TRAIL_STAR_TWINKLE_MS + (h % TRAIL_STAR_TWINKLE_SPREAD_MS);
        twinkle = 1 + TRAIL_STAR_TWINKLE * Math.sin((now / periodMs) * Math.PI * 2 + h / 1000);
      }
      const lit = layerAlpha * footprintPref.opacity * trailRamp * ignite * twinkle;
      const starInk = node.id === focusedNodeId ? tokens.selectionRingIndigo : trailStarInk;
      {
        drawNodeStar(
          ctx,
          node.kind,
          screen.x,
          screen.y,
          screenRadius,
          farT,
          starInk,
          lit,
          1 + TRAIL_STAR_SWELL * starSwellCurve(sweepT));
      }
      if (trailRamp > 0.001) drawFootprintSteps(
        { ctx, pref: footprintPref, ink: footprintInk, scale: footprintScale },
        screen.x,
        screen.y,
        screenRadius,
        layerAlpha,
        footprintSteps,
        footprintStepColor);
      ctx.globalAlpha = 1;
    }

    if (
      expandedParentIds.has(node.id) &&
      !(spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id))
    ) {
      ctx.save();
      ctx.setLineDash([...EXPANDED_AURA_DASH]);
      ctx.globalAlpha = tierAlpha * EXPANDED_AURA_ALPHA;
      ctx.strokeStyle = tokens.indigo;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (
      expandedChildIds.has(node.id) &&
      !expandedParentIds.has(node.id) &&
      node.id !== focusedNodeId &&
      node.id !== hoveredNodeId &&
      !(spotlightLensActive && spotlightIds !== null && spotlightIds.has(node.id))
    ) {
      ctx.save();
      ctx.setLineDash([...EXPANDED_AURA_DASH]);
      ctx.globalAlpha = tierAlpha * EXPANDED_COHORT_ALPHA;
      ctx.strokeStyle = tokens.expandedCohort;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    if (realmDepthById !== null && realmDepthById.get(node.id) === 0 && wardingRing !== null) {
      ctx.save();
      ctx.globalAlpha = tierAlpha * REALM_ROOT_ANCHOR_ALPHA * wardingRing.drawProgress;
      ctx.strokeStyle = tokens.indigo;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, screenRadius + EXPANDED_AURA_RING_OFFSET, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
