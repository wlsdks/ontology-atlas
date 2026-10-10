import { domeAncestryEdgeKey } from "../../model/dome-ancestry";
import { trailGlintLocalPhase } from "../../model/footprint-steps";
import { resolveEdgeEgoStateWithPair, type EdgeEgoState } from "../../model/focus-state";
import { isPathLensEdge } from "../../model/path-lens";
import { isDirectionalRelation } from "@/entities/knowledge-graph";
import {
  DOME_HALO_ALPHA_CAP,
  DOME_HALO_ALPHA_GAIN,
  domeDetailFactor,
  domeEdgeFogAlpha,
  domeEdgeMinWidthPx,
  domeEdgeWidthFactor,
  domeHaloPx,
} from "../../model/dome-view";
import { focusFogFactor } from "../../render/dome-light";
import {
  captionNormal,
  captionWithinFlatBudget,
  relationCaptionText,
} from "../../render/relation-captions";
import { isEdgeCulled, isPassthroughEdge } from "../../render/viewport-cull";
import { draw as tracesDraw } from "../../render/traces";
import { drawPreviewEdge } from "../../render/preview-edge";
import { drawPulses, edgePairMeta } from "../../render/edge-fireflies";
import { indexedPulseEdges } from "../frame-cache/structure";
import { radiusForKind } from "../topology-world";
import { beginEdgeGlow, endEdgeGlow } from "../../expressive/ego-light";
import {
  S,
  ZERO_DOME_FRAME,
  domeEdgeFrameAReused,
  domeEdgeFrameBReused,
  domeEdgeIndexReused,
} from "./frame-state";
import {
  TRAIL_HALO_ALPHA,
  TRAIL_HALO_PX,
  TRAIL_IGNITE_MS,
  igniteCurve,
  trailIgniteStartMs,
} from "./trail-curves";
import { type FrameScope } from "./frame-scope";

const EDGE_CULL_MARGIN_PX = 24;
const edgeHaloScratch = { color: "", px: 0, alpha: 0 };
const EDGE_KIND_PASSES = ["contains", "depends"] as const;
const HOVER_RECEDE_ALPHA_STEP = 0.3;

export function paintEdges(F: FrameScope): void {
  const { walkedEdgeKeys, walkedEdgeDirections, walkedEdgeArrivalStep, canvasDpr, viewportWidth,
    viewportHeight, focusedNodeId, selectedEdge, mapLensKind, pathEdgeIds, hoveredEdge,
    emphasizedNeighborId, spotlightIds, trailLensOpenedAtMs, footprintNewestStep, now,
    hoveredNodeId, emphasisById, appearById, tokens, trailStarInk, farT, reducedMotion,
    relationCaptions, captionFoldedIds, previewEdge, world, camera, pulses, ctx, pathLensActive,
    spotlightSink, trailLensActive, trailRamp, trailGlint, trailGlintLegs, domeOn, domeFrameFor,
    project, projectEdgePoints, egoGlowRamp, litOn, domeAncestryOn, domeAncestryEdges, litFocusRamp,
    traceTokensFrame, anyExpanded, egoCometEdges, edgeAlphaReused, edgeLiftReused,
    edgeRestDimReused, edgeFocusRamp, edgeRevealAt, captionCandidates, isSpineEndpoint,
    ambientDependsComets, domeHaloColor, edgeDrawOrder } = F;
  const trailKeysLive =
    (walkedEdgeKeys?.size ?? 0) > 0 ||
    (walkedEdgeDirections?.size ?? 0) > 0 ||
    (walkedEdgeArrivalStep?.size ?? 0) > 0 ||
    trailGlintLegs !== null;
  for (const kind of EDGE_KIND_PASSES) {
    for (let drawPos = 0; drawPos < edgeDrawOrder.length; drawPos += 1) {
      const edge = edgeDrawOrder[drawPos];
      if (edge.kind !== kind) continue;
      const edgeOrigIndex = domeOn ? domeEdgeIndexReused[drawPos] : drawPos;
      const edgeAlpha = edgeAlphaReused[edgeOrigIndex];
      if (edgeAlpha <= 0.02) continue;
      const edgeFrameA = domeOn ? domeEdgeFrameAReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const edgeFrameB = domeOn ? domeEdgeFrameBReused[edgeOrigIndex] : ZERO_DOME_FRAME;
      const { a, b, control } = projectEdgePoints(edge, edgeFrameA, edgeFrameB);
      let domeEdgeFog = 1;
      let domeWidthScale = 1;
      let domeMinWidthPx = 0;
      let domeHaloWidthPx = 0;
      let domeEdgeDetail = 1;
      if (domeOn) {
        const aMin = Math.min(edgeFrameA.a, edgeFrameB.a);
        if (aMin > 0) {
          const uAvg = (edgeFrameA.u + edgeFrameB.u) / 2;
          domeEdgeFog = 1 + (domeEdgeFogAlpha(uAvg) - 1) * aMin;
          domeWidthScale = 1 + (domeEdgeWidthFactor(uAvg) - 1) * aMin;
          domeMinWidthPx = domeEdgeMinWidthPx(canvasDpr) * aMin;
          domeHaloWidthPx = litOn ? 0 : domeHaloPx(uAvg) * aMin;
          domeEdgeDetail = 1 + (domeDetailFactor(uAvg) - 1) * aMin;
        }
      }
      if (isEdgeCulled(a, b, control, EDGE_CULL_MARGIN_PX, viewportWidth, viewportHeight)) continue;
      const passthrough = isPassthroughEdge(a, b, 24, viewportWidth, viewportHeight);
      const touches = focusedNodeId !== null && (edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
      const isSelectedEdge =
        selectedEdge !== null &&
        edge.sourceId === selectedEdge.sourceId &&
        edge.targetId === selectedEdge.targetId &&
        (!selectedEdge.relationType || edge.relationType === selectedEdge.relationType);
      const isPathEdge = isPathLensEdge(mapLensKind, edge.id, pathEdgeIds);
      const hovered =
        hoveredEdge !== null &&
        edge.sourceId === hoveredEdge.sourceId &&
        edge.targetId === hoveredEdge.targetId &&
        edge.relationType === hoveredEdge.relationType;
      const emphasized =
        !trailLensActive &&
        (hovered ||
          (emphasizedNeighborId !== null &&
            touches &&
            (edge.sourceId === emphasizedNeighborId || edge.targetId === emphasizedNeighborId)));
      let edgeEgoState: EdgeEgoState = trailLensActive
        ? "dim"
        : resolveEdgeEgoStateWithPair(touches, focusedNodeId, selectedEdge, isSelectedEdge);
      if (isPathEdge && !trailLensActive) edgeEgoState = "ego";
      if (
        domeAncestryOn &&
        !trailLensActive &&
        kind === "contains" &&
        domeAncestryEdges.has(domeAncestryEdgeKey(edge.sourceId, edge.targetId))
      ) {
        edgeEgoState = "ego";
      }
      if (
        anyExpanded &&
        kind !== "contains" &&
        edgeEgoState !== "ego" &&
        !isSelectedEdge &&
        !emphasized &&
        !touches
      ) {
        edgeEgoState = "dim";
      }
      const edgeSpotlightSink = spotlightSink(
        pathLensActive
          ? isPathEdge
          : spotlightIds !== null &&
          spotlightIds.has(edge.sourceId) &&
          spotlightIds.has(edge.targetId));
      const walkedKey = !trailKeysLive
        ? ""
        : edge.sourceId < edge.targetId
          ? `${edge.sourceId} ${edge.targetId}`
          : `${edge.targetId} ${edge.sourceId}`;
      const walkedSweep = trailLensOpenedAtMs > 0 && footprintNewestStep > 0
        ? igniteCurve((now -
          trailLensOpenedAtMs -
          trailIgniteStartMs(walkedEdgeArrivalStep?.get(walkedKey) ?? 1, footprintNewestStep)) /
          TRAIL_IGNITE_MS)
        : 1;
      const walkedTrail = trailRamp > 0.001 && walkedEdgeKeys !== null && walkedEdgeKeys.has(walkedKey)
        ? trailRamp * walkedSweep
        : 0;
      const walkedLowToHigh = walkedEdgeDirections?.get(walkedKey);
      const trailDirection = walkedLowToHigh === undefined
        ? undefined
        : edge.sourceId < edge.targetId
          ? walkedLowToHigh
          : !walkedLowToHigh;
      const domeEdgeExempt = emphasized || isSelectedEdge || isPathEdge || edgeEgoState === "ego";
      if (!domeEdgeExempt && domeEdgeDetail < 1)
        domeHaloWidthPx *= domeEdgeDetail;
      const hoverRamp = focusedNodeId === null && hoveredNodeId !== null && !trailLensActive && !pathLensActive
        ? Math.min(1, Math.max(0, emphasisById.get(hoveredNodeId) ?? 0))
        : 0;
      const hoverTouches = hoverRamp > 0 && (edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId);
      const hoverLift = hoverTouches && edgeEgoState === "normal" ? hoverRamp : 0;
      if (focusedNodeId === null) {
        edgeLiftReused[edgeOrigIndex] = hoverLift;
        edgeRestDimReused[edgeOrigIndex] = edgeEgoState === "dim" ? 1 : 0;
      }
      const directional = isDirectionalRelation(edge.relationType);
      const hoverRecede = hoverRamp > 0 && !hoverTouches && !isSelectedEdge && !isPathEdge ? 1 - HOVER_RECEDE_ALPHA_STEP * hoverRamp : 1;
      const domeEdgeFogForEdge = (domeEdgeExempt ? 1 : 1 + (domeEdgeFog - 1) * (1 - hoverLift)) *
        (litOn && !domeEdgeExempt ? focusFogFactor((edgeFrameA.u + edgeFrameB.u) / 2, litFocusRamp) : 1);
      const edgeAppear = appearById
        ? Math.min(1, Math.max(0, Math.min(appearById.get(edge.sourceId) ?? 1, appearById.get(edge.targetId) ?? 1)))
        : 1;
      const filament = 1;
      ctx.globalAlpha =
        (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) *
        edgeSpotlightSink *
        hoverRecede *
        edgeAppear *
        filament
        *
        domeEdgeFogForEdge;
      if (domeHaloWidthPx > 0.05) {
        edgeHaloScratch.color = domeHaloColor;
        edgeHaloScratch.px = domeHaloWidthPx;
        edgeHaloScratch.alpha = Math.min(DOME_HALO_ALPHA_CAP, ctx.globalAlpha * DOME_HALO_ALPHA_GAIN);
      }
      if (walkedTrail > 0.01 && trailStarInk !== null) {
        edgeHaloScratch.color = trailStarInk;
        edgeHaloScratch.px = TRAIL_HALO_PX * walkedTrail;
        edgeHaloScratch.alpha = TRAIL_HALO_ALPHA * walkedTrail;
      }
      const edgeGlows = walkedTrail > 0.01 && trailStarInk !== null
        ? beginEdgeGlow(ctx, walkedTrail,
          {
            ...tokens,
            egoGlowAlpha: tokens.trailGlowAlpha,
            egoGlowBlurPx: tokens.trailGlowBlurPx,
          }, trailStarInk)
        : edgeEgoState === "ego" && !trailLensActive
          ? beginEdgeGlow(ctx, egoGlowRamp, tokens)
          :
          false;
      tracesDraw(ctx, {
        a,
        b,
        control,
        relationType: kind,
        directional,
        egoState: edgeEgoState,
        reveal: touches && edgeRevealAt < 1
          ? {
            progress: edgeRevealAt,
            from: directional || edge.sourceId === focusedNodeId ? "a" : "b",
            baseLift: edgeLiftReused[edgeOrigIndex],
            baseDim: edgeRestDimReused[edgeOrigIndex] * (1 - edgeFocusRamp),
          }
          : null,
        dimRamp: edgeFocusRamp,
        selected: (isSelectedEdge || isPathEdge) && !trailLensActive,
        trailWalked: walkedTrail,
        trailDirection,
        trailGlint: trailGlintLegs === null
          ? null
          : trailGlintLocalPhase(trailGlintLegs.get(walkedKey), trailGlint),
        farT,
        t: edge.t,
        emphasized,
        hoverLift,
        reducedMotion,
        level: edge.level,
        widthScale: domeEdgeExempt ? 1 : 1 + (domeWidthScale - 1) * (1 - hoverLift),
        minWidthPx: domeEdgeExempt ? 0 : domeMinWidthPx,
        halo: domeHaloWidthPx > 0.05 ? edgeHaloScratch : null,
        containsCometEligible: kind === "contains" ? S.mapCometsOn && egoCometEdges.has(edge) : undefined,
        dependsCometEligible: kind === "depends" ? S.mapCometsOn && ambientDependsComets.has(edgePairMeta(edge).key) : undefined,
        cometOwner: edge,
      }, traceTokensFrame);
      if (edgeGlows)
        endEdgeGlow(ctx);
      const caption = edge.id ? relationCaptions?.get(edge.id) : null;
      const directionalCaption = isDirectionalRelation(edge.relationType);
      const captionInFocus = selectedEdge ? isSelectedEdge : focusedNodeId ? touches : true;
      const captionBudgeted = captionFoldedIds === null ||
        captionWithinFlatBudget({
          attended: isSelectedEdge || hovered || isPathEdge,
          touchesFocus: touches,
          spine: isSpineEndpoint(edge.sourceId) && isSpineEndpoint(edge.targetId),
          folded: captionFoldedIds.has(edge.sourceId) || captionFoldedIds.has(edge.targetId),
        });
      if (caption && captionInFocus && captionBudgeted && ctx.globalAlpha >= 0.5 && !passthrough && (directionalCaption || isSelectedEdge || touches || hovered)) {
        captionCandidates.push({ edgeId: edge.id!, text: relationCaptionText(caption, a, b, directionalCaption), x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4, priority: isSelectedEdge ? 5 : touches ? 4 : hovered ? 3 : edge.kind === 'contains' ? 2 : 1, normal: captionNormal(a, b) });
      }
      ctx.globalAlpha = 1;
    }
  }
  if (previewEdge) {
    const source = world.nodeById.get(previewEdge.sourceId);
    const target = world.nodeById.get(previewEdge.targetId);
    if (source && target) {
      const sourceFrame = domeFrameFor(source.id);
      const targetFrame = domeFrameFor(target.id);
      drawPreviewEdge(ctx, {
        source: project(source.x + sourceFrame.dx, source.y + sourceFrame.dy),
        target: project(target.x + targetFrame.dx, target.y + targetFrame.dy),
        sourceRadius: radiusForKind(source.kind, tokens) * source.magnitudeScale * sourceFrame.s * camera.scale.value,
        targetRadius: radiusForKind(target.kind, tokens) * target.magnitudeScale * targetFrame.s * camera.scale.value,
        alpha: previewEdge.alpha,
        solid: previewEdge.phase === "committing",
        solidProgress: previewEdge.commitProgress,
        color: tokens.selectionRingIndigo,
      });
    }
  }
  if (pulses.length > 0) {
    const edgeByPair = indexedPulseEdges(world);
    drawPulses(ctx, pulses, now, (pulse) => {
      const edge = edgeByPair.get(`${pulse.sourceId} ${pulse.targetId}`);
      if (!edge)
        return null;
      const points = projectEdgePoints(edge);
      return { a: points.a, control: points.control, b: points.b };
    }, { head: tokens.indigoBright, trail: tokens.indigo });
    ctx.globalAlpha = 1;
  }
}
