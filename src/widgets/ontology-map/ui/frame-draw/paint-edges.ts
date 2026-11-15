import { trailGlintLocalPhase } from "../../model/visibility/footprint-steps";
import { resolveEdgeEgoStateWithPair, type EdgeEgoState } from "../../model/visibility/focus-state";
import { isPathLensEdge } from "../../model/visibility/path-lens";
import { isDirectionalRelation } from "@/entities/knowledge-graph";
import { captionNormal, relationCaptionText } from "../../render/relation-captions";
import { isEdgeCulled, isPassthroughEdge } from "../../render/viewport-cull";
import { draw as tracesDraw } from "../../render/traces";
import { drawPreviewEdge } from "../../render/preview-edge";
import { drawPulses, edgePairMeta } from "../../render/edge-fireflies";
import { indexedPulseEdges } from "../frame-cache/structure";
import { radiusForKind } from "../world/topology-world";
import { beginEdgeGlow, endEdgeGlow } from "../../expressive/ego-light";
import { passState } from "./frame-state";
import { TRAIL_IGNITE_MS, igniteCurve, trailIgniteStartMs } from "./trail-curves";
import type { FrameInputs } from "./frame-begin";
import type { FrameFocus } from "./frame-focus";
import type { NodeAlpha } from "./node-alpha";
import type { EdgePrep } from "./edge-prep";

const EDGE_CULL_MARGIN_PX = 24;
const EDGE_KIND_PASSES = ["contains", "depends"] as const;
const HOVER_RECEDE_ALPHA_STEP = 0.3;

export function paintEdges(frame: FrameInputs, focus: FrameFocus, alpha: NodeAlpha, edges: EdgePrep): void {
  const { walkedEdgeKeys, walkedEdgeDirections, walkedEdgeArrivalStep,
    viewportWidth, viewportHeight, focusedNodeId, selectedEdge, mapLensKind, pathEdgeIds,
    hoveredEdge, emphasizedNeighborId, spotlightIds, trailLensOpenedAtMs, footprintNewestStep, now,
    hoveredNodeId, emphasisById, appearById, tokens, trailStarInk, farT, reducedMotion,
    relationCaptions, previewEdge, world, camera, pulses, ctx, pathLensActive,
    spotlightSink, trailLensActive, trailRamp, trailGlint, trailGlintLegs } = frame;
  const { project, projectEdgePoints, egoGlowRamp, traceTokensFrame } = focus;
  const { anyExpanded } = alpha;
  const { egoCometEdges, edgeAlphaReused, edgeLiftReused, edgeRestDimReused, edgeFocusRamp,
    edgeRevealAt, captionCandidates, ambientDependsComets } = edges;
  const trailKeysLive =
    (walkedEdgeKeys?.size ?? 0) > 0 ||
    (walkedEdgeDirections?.size ?? 0) > 0 ||
    (walkedEdgeArrivalStep?.size ?? 0) > 0 ||
    trailGlintLegs !== null;
  for (const kind of EDGE_KIND_PASSES) {
    for (let edgeIndex = 0; edgeIndex < world.edges.length; edgeIndex += 1) {
      const edge = world.edges[edgeIndex];
      if (edge.kind !== kind) continue;
      const edgeAlpha = edgeAlphaReused[edgeIndex];
      if (edgeAlpha <= 0.02) continue;
      const { a, b, control } = projectEdgePoints(edge);
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
      const hoverRamp = focusedNodeId === null && hoveredNodeId !== null && !trailLensActive && !pathLensActive
        ? Math.min(1, Math.max(0, emphasisById.get(hoveredNodeId) ?? 0))
        : 0;
      const hoverTouches = hoverRamp > 0 && (edge.sourceId === hoveredNodeId || edge.targetId === hoveredNodeId);
      const hoverLift = hoverTouches && edgeEgoState === "normal" ? hoverRamp : 0;
      if (focusedNodeId === null) {
        edgeLiftReused[edgeIndex] = hoverLift;
        edgeRestDimReused[edgeIndex] = edgeEgoState === "dim" ? 1 : 0;
      }
      const directional = isDirectionalRelation(edge.relationType);
      const hoverRecede = hoverRamp > 0 && !hoverTouches && !isSelectedEdge && !isPathEdge ? 1 - HOVER_RECEDE_ALPHA_STEP * hoverRamp : 1;
      const edgeAppear = appearById
        ? Math.min(1, Math.max(0, Math.min(appearById.get(edge.sourceId) ?? 1, appearById.get(edge.targetId) ?? 1)))
        : 1;
      const filament = 1;
      ctx.globalAlpha =
        (passthrough ? edgeAlpha * tokens.edgePassthroughAlpha : edgeAlpha) *
        edgeSpotlightSink *
        hoverRecede *
        edgeAppear *
        filament;
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
            baseLift: edgeLiftReused[edgeIndex],
            baseDim: edgeRestDimReused[edgeIndex] * (1 - edgeFocusRamp),
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
        containsCometEligible: kind === "contains" ? passState.mapCometsOn && egoCometEdges.has(edge) : undefined,
        dependsCometEligible: kind === "depends" ? passState.mapCometsOn && ambientDependsComets.has(edgePairMeta(edge).key) : undefined,
        cometOwner: edge,
      }, traceTokensFrame);
      if (edgeGlows)
        endEdgeGlow(ctx);
      const caption = edge.id ? relationCaptions?.get(edge.id) : null;
      const directionalCaption = isDirectionalRelation(edge.relationType);
      const captionInFocus = selectedEdge ? isSelectedEdge : focusedNodeId ? touches : true;
      if (caption && captionInFocus && ctx.globalAlpha >= 0.5 && !passthrough && (directionalCaption || isSelectedEdge || touches || hovered)) {
        captionCandidates.push({ edgeId: edge.id!, text: relationCaptionText(caption, a, b, directionalCaption), x: (a.x + 2 * control.x + b.x) / 4, y: (a.y + 2 * control.y + b.y) / 4, priority: isSelectedEdge ? 5 : touches ? 4 : hovered ? 3 : edge.kind === 'contains' ? 2 : 1, normal: captionNormal(a, b) });
      }
      ctx.globalAlpha = 1;
    }
  }
  if (previewEdge) {
    const source = world.nodeById.get(previewEdge.sourceId);
    const target = world.nodeById.get(previewEdge.targetId);
    if (source && target) {
      drawPreviewEdge(ctx, {
        source: project(source.x, source.y),
        target: project(target.x, target.y),
        sourceRadius: radiusForKind(source.kind, tokens) * source.magnitudeScale * camera.scale.value,
        targetRadius: radiusForKind(target.kind, tokens) * target.magnitudeScale * camera.scale.value,
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
