import { buildTrailGlintLegs } from "../../model/footprint-steps";
import {
  resolveNodeEgoStateWithPair,
  resolveTrailLensNodeEgoState,
  type EdgePairFocus,
  type NodeEgoState,
} from "../../model/focus-state";
import { resolveBackgroundOrigin } from "../../model/background-parallax";
import { footprintScaleFor } from "@/shared/lib/footprint-glyph";
import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import { depthParallaxOffsetFor, ZERO_PARALLAX } from "../../model/realm-depth-parallax";
import { DOME_RING_ALPHA, type DomeNodeFrame } from "../../model/dome-view";
import { DEFAULT_TIER_REVEAL } from "../../model/tier-visibility";
import { labelZoomScale } from "../../render/labels";
import { worldToScreen } from "../topology-camera-math";
import { S, ZERO_DOME_FRAME, domeNodeFrameReused } from "./frame-state";
import { TRAIL_GLINT_PERIOD_MS } from "./trail-curves";
import { type FrameDrawParams } from "./frame-draw-params";
import { type FrameScope } from "./frame-scope";

export function beginFrame(F: FrameScope, params: FrameDrawParams): void {
  F.params = params;
  const { ctx: baseCtx, world, camera, farT, neuralRamp: neuralRampProp = 0, zoomRatio, now, viewportWidth, viewportHeight, panelInsets = null, devicePixelRatio: canvasDpr = 1, gridPattern, dustPoints, tokens, focusedNodeId, hoveredNodeId, hoverReleasedNodeId = null, hoverStartedAt = null, emphasizedNeighborId, hoveredEdge, selectedEdge, relationCaptions, captionFoldedIds = null, reviewQuestionIds, previewEdge, emphasisById, egoRevealById, focusRampById, appearById, bornNodeIds, chipRevealById, batchAppearById, labelPresentById, colorFocusedNodeId, colorSelectedEdge, reducedMotion, pulses, selectionPulse, agentFocusNodeId, clusteredIds, clusterChips, hoveredClusterId, wardingRing, realmTierKinds, expandRevealById, realmDepthById, realmDepthParallax, realmDustParallax, realmOutsideReturnAlphaById, realmStarPoints, footprintStepsById, footprintPref = null, walkedEdgeKeys = null, walkedEdgeDirections = null, walkedEdgeArrivalStep = null, footprintInk = [232, 196, 122], footprintStepColor = "#e8c47a", footprintNewestId = null, footprintAppear = 1, trailStarInk = null, footprintNewestStep = 1, trailLensOpenedAtMs = 0, trailLensIds = null, spotlightIds, mapLensKind, pathEdgeIds, spotlightRamp, spotlightDashOffset, tierReveal = DEFAULT_TIER_REVEAL, glyphStyle = "fill", backgroundVariant = "dot", paintAnimatedBackground = null, depthDotPatterns, expand = DEFAULT_EXPAND, clusterBarLabels = null, domeFrame = null, domeRamp = 0, domeRings = null, domeRingAlpha = DOME_RING_ALPHA, tierNameBoxes = null, domeTierRaisedKind = null, domeControlFor = null, domeLight = null, trailLensRamp, dial: dialProps = null, } = params;
  const ctx = baseCtx;
  const spotlightLensActive = spotlightIds !== null && spotlightRamp > 0.001 && colorFocusedNodeId === null && colorSelectedEdge === null;
  const pathLensActive = spotlightLensActive && mapLensKind === "path";
  const constellationLensActive = spotlightLensActive && mapLensKind === "constellation";
  const recentSpotlightActive = spotlightLensActive && mapLensKind === "recent";
  const lensRestAlpha = pathLensActive ? tokens.pathRestAlpha : tokens.spotlightRestAlpha;
  const spotlightSink = (inSpotlight: boolean): number => spotlightLensActive && !inSpotlight ? 1 - spotlightRamp * (1 - lensRestAlpha) : 1;
  const trailLensKeepIds = trailLensIds !== null && trailLensIds.size > 0 ? trailLensIds : null;
  const trailLensActive = trailLensKeepIds !== null;
  const trailRamp = trailLensActive
    ? Math.min(1, Math.max(0, trailLensRamp ?? 1))
    : 0;
  const trailGlint = trailRamp > 0.001 ? ((now % TRAIL_GLINT_PERIOD_MS) / TRAIL_GLINT_PERIOD_MS) : 0;
  const trailGlintLegs = trailRamp > 0.001 && walkedEdgeArrivalStep !== null && walkedEdgeArrivalStep.size > 0
    ? buildTrailGlintLegs([...walkedEdgeArrivalStep.entries()]
      .sort((left, right) => left[1] - right[1])
      .map(([key]) => {
        const [sourceId, targetId] = key.split(" ");
        const from = world.nodeById.get(sourceId ?? "");
        const to = world.nodeById.get(targetId ?? "");
        return {
          key,
          length: from && to ? Math.hypot(to.x - from.x, to.y - from.y) : 0,
        };
      }))
    : null;
  const isTrailKept = (nodeId: string): boolean => trailLensKeepIds !== null && trailLensKeepIds.has(nodeId);
  const lensNodeEgoState = (nodeId: string, focusId: string | null, neighbors: ReadonlySet<string>, pair: EdgePairFocus | null): NodeEgoState => trailLensKeepIds !== null
    ? resolveTrailLensNodeEgoState(nodeId, focusId, trailLensKeepIds)
    : resolveNodeEgoStateWithPair(nodeId, focusId, neighbors, pair);
  const realmDepthOf = (nodeId: string): number | undefined => realmDepthById?.get(nodeId);
  const realmParallaxOffsetFor = (nodeId: string): {
    x: number;
    y: number;
  } => {
    if (!realmDepthParallax || !realmDepthById)
      return ZERO_PARALLAX;
    return depthParallaxOffsetFor(realmDepthById.get(nodeId), realmDepthParallax.depth2, realmDepthParallax.depth3);
  };
  const domeOn = domeFrame !== null && domeFrame !== undefined && domeFrame.size > 0;
  const neural = domeOn ? Math.min(1, Math.max(0, neuralRampProp)) : 0;
  const skyTimeMs = now - 0;
  S.drawnSkyTimeMs = skyTimeMs;
  const domeFrameFor = (nodeId: string): DomeNodeFrame => (domeOn ? domeFrame.get(nodeId) : undefined) ?? ZERO_DOME_FRAME;
  if (domeOn) {
    domeNodeFrameReused.length = 0;
    for (let i = 0; i < world.nodes.length; i += 1) {
      domeNodeFrameReused.push(domeFrame.get(world.nodes[i].id) ?? ZERO_DOME_FRAME);
    }
  }
  const nodeFrameAt = (index: number): DomeNodeFrame => (domeOn ? domeNodeFrameReused[index] : ZERO_DOME_FRAME);
  const gridOrigin = worldToScreen(camera, viewportWidth, viewportHeight, 0, 0);
  const footprintScale = footprintScaleFor(camera.scale.value);
  const labelScale = Math.max(labelZoomScale(camera.scale.value), domeOn ? 1 + Math.min(1, domeRamp) * 0.3 : 1);
  const bgOrigin = resolveBackgroundOrigin(gridOrigin, { width: viewportWidth, height: viewportHeight }, backgroundVariant, tokens.canvasBgParallax, reducedMotion);
  F.world = world;
  F.camera = camera;
  F.farT = farT;
  F.zoomRatio = zoomRatio;
  F.now = now;
  F.viewportWidth = viewportWidth;
  F.viewportHeight = viewportHeight;
  F.panelInsets = panelInsets;
  F.canvasDpr = canvasDpr;
  F.gridPattern = gridPattern;
  F.dustPoints = dustPoints;
  F.tokens = tokens;
  F.focusedNodeId = focusedNodeId;
  F.hoveredNodeId = hoveredNodeId;
  F.hoverReleasedNodeId = hoverReleasedNodeId;
  F.hoverStartedAt = hoverStartedAt;
  F.emphasizedNeighborId = emphasizedNeighborId;
  F.hoveredEdge = hoveredEdge;
  F.selectedEdge = selectedEdge;
  F.relationCaptions = relationCaptions;
  F.captionFoldedIds = captionFoldedIds;
  F.reviewQuestionIds = reviewQuestionIds;
  F.previewEdge = previewEdge;
  F.emphasisById = emphasisById;
  F.egoRevealById = egoRevealById;
  F.focusRampById = focusRampById;
  F.appearById = appearById;
  F.bornNodeIds = bornNodeIds;
  F.chipRevealById = chipRevealById;
  F.batchAppearById = batchAppearById;
  F.labelPresentById = labelPresentById;
  F.colorFocusedNodeId = colorFocusedNodeId;
  F.colorSelectedEdge = colorSelectedEdge;
  F.reducedMotion = reducedMotion;
  F.pulses = pulses;
  F.selectionPulse = selectionPulse;
  F.agentFocusNodeId = agentFocusNodeId;
  F.clusteredIds = clusteredIds;
  F.clusterChips = clusterChips;
  F.hoveredClusterId = hoveredClusterId;
  F.wardingRing = wardingRing;
  F.realmTierKinds = realmTierKinds;
  F.expandRevealById = expandRevealById;
  F.realmDepthById = realmDepthById;
  F.realmDustParallax = realmDustParallax;
  F.realmOutsideReturnAlphaById = realmOutsideReturnAlphaById;
  F.realmStarPoints = realmStarPoints;
  F.footprintStepsById = footprintStepsById;
  F.footprintPref = footprintPref;
  F.walkedEdgeKeys = walkedEdgeKeys;
  F.walkedEdgeDirections = walkedEdgeDirections;
  F.walkedEdgeArrivalStep = walkedEdgeArrivalStep;
  F.footprintInk = footprintInk;
  F.footprintStepColor = footprintStepColor;
  F.footprintNewestId = footprintNewestId;
  F.footprintAppear = footprintAppear;
  F.trailStarInk = trailStarInk;
  F.footprintNewestStep = footprintNewestStep;
  F.trailLensOpenedAtMs = trailLensOpenedAtMs;
  F.spotlightIds = spotlightIds;
  F.mapLensKind = mapLensKind;
  F.pathEdgeIds = pathEdgeIds;
  F.spotlightRamp = spotlightRamp;
  F.spotlightDashOffset = spotlightDashOffset;
  F.tierReveal = tierReveal;
  F.glyphStyle = glyphStyle;
  F.backgroundVariant = backgroundVariant;
  F.paintAnimatedBackground = paintAnimatedBackground;
  F.depthDotPatterns = depthDotPatterns;
  F.expand = expand;
  F.clusterBarLabels = clusterBarLabels;
  F.domeRamp = domeRamp;
  F.domeRings = domeRings;
  F.domeRingAlpha = domeRingAlpha;
  F.tierNameBoxes = tierNameBoxes;
  F.domeTierRaisedKind = domeTierRaisedKind;
  F.domeControlFor = domeControlFor;
  F.domeLight = domeLight;
  F.dialProps = dialProps;
  F.ctx = ctx;
  F.spotlightLensActive = spotlightLensActive;
  F.pathLensActive = pathLensActive;
  F.constellationLensActive = constellationLensActive;
  F.recentSpotlightActive = recentSpotlightActive;
  F.spotlightSink = spotlightSink;
  F.trailLensKeepIds = trailLensKeepIds;
  F.trailLensActive = trailLensActive;
  F.trailRamp = trailRamp;
  F.trailGlint = trailGlint;
  F.trailGlintLegs = trailGlintLegs;
  F.isTrailKept = isTrailKept;
  F.lensNodeEgoState = lensNodeEgoState;
  F.realmDepthOf = realmDepthOf;
  F.realmParallaxOffsetFor = realmParallaxOffsetFor;
  F.domeOn = domeOn;
  F.neural = neural;
  F.domeFrameFor = domeFrameFor;
  F.nodeFrameAt = nodeFrameAt;
  F.gridOrigin = gridOrigin;
  F.footprintScale = footprintScale;
  F.labelScale = labelScale;
  F.bgOrigin = bgOrigin;
}
