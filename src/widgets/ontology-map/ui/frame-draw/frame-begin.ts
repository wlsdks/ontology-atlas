import { buildTrailGlintLegs, type TrailGlintLeg } from "../../model/footprint-steps";
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
import { passState, ZERO_DOME_FRAME, domeNodeFrameReused } from "./frame-state";
import { TRAIL_GLINT_PERIOD_MS } from "./trail-curves";
import type { FrameDrawParams } from "./frame-draw-params";

type DefaultedKey = "neuralRamp" | "panelInsets" | "devicePixelRatio" | "hoverReleasedNodeId" | "hoverStartedAt"
  | "captionFoldedIds" | "footprintPref" | "walkedEdgeKeys" | "walkedEdgeDirections" | "walkedEdgeArrivalStep"
  | "footprintInk" | "footprintStepColor" | "footprintNewestId" | "footprintAppear" | "trailStarInk"
  | "footprintNewestStep" | "trailLensOpenedAtMs" | "trailLensIds" | "tierReveal" | "glyphStyle"
  | "backgroundVariant" | "paintAnimatedBackground" | "expand" | "clusterBarLabels" | "domeFrame" | "domeRamp"
  | "domeRings" | "domeRingAlpha" | "tierNameBoxes" | "domeTierRaisedKind" | "domeControlFor" | "domeLight"
  | "dial";

type ResolvedDefaults = { [K in DefaultedKey]-?: Exclude<FrameDrawParams[K], undefined> };

interface FrameLens {
  spotlightLensActive: boolean;
  pathLensActive: boolean;
  constellationLensActive: boolean;
  recentSpotlightActive: boolean;
  spotlightSink: (inSpotlight: boolean) => number;
  trailLensKeepIds: ReadonlySet<string> | null;
  trailLensActive: boolean;
  trailRamp: number;
  trailGlint: number;
  trailGlintLegs: Map<string, TrailGlintLeg> | null;
  isTrailKept: (nodeId: string) => boolean;
  lensNodeEgoState: (nodeId: string, focusId: string | null, neighbors: ReadonlySet<string>, pair: EdgePairFocus | null) => NodeEgoState;
  realmDepthOf: (nodeId: string) => number | undefined;
  realmParallaxOffsetFor: (nodeId: string) => { x: number; y: number };
  domeOn: boolean;
  neural: number;
  domeFrameFor: (nodeId: string) => DomeNodeFrame;
  nodeFrameAt: (index: number) => DomeNodeFrame;
  gridOrigin: { x: number; y: number };
  footprintScale: number;
  labelScale: number;
  bgOrigin: { x: number; y: number };
}

export type FrameInputs = Readonly<Omit<FrameDrawParams, DefaultedKey> & ResolvedDefaults & FrameLens>;

export function beginFrame(params: FrameDrawParams): FrameInputs {
  const { world, camera, neuralRamp = 0, now, viewportWidth, viewportHeight, panelInsets = null,
    devicePixelRatio = 1, tokens, hoverReleasedNodeId = null, hoverStartedAt = null,
    captionFoldedIds = null, colorFocusedNodeId, colorSelectedEdge, reducedMotion, realmDepthById,
    realmDepthParallax, footprintPref = null, walkedEdgeKeys = null, walkedEdgeDirections = null,
    walkedEdgeArrivalStep = null, footprintInk = [232, 196, 122], footprintStepColor = "#e8c47a",
    footprintNewestId = null, footprintAppear = 1, trailStarInk = null, footprintNewestStep = 1,
    trailLensOpenedAtMs = 0, trailLensIds = null, spotlightIds, mapLensKind, spotlightRamp,
    tierReveal = DEFAULT_TIER_REVEAL, glyphStyle = "fill", backgroundVariant = "dot",
    paintAnimatedBackground = null, expand = DEFAULT_EXPAND, clusterBarLabels = null, domeFrame = null,
    domeRamp = 0, domeRings = null, domeRingAlpha = DOME_RING_ALPHA, tierNameBoxes = null,
    domeTierRaisedKind = null, domeControlFor = null, domeLight = null, trailLensRamp, dial = null } = params;
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
  const neural = domeOn ? Math.min(1, Math.max(0, neuralRamp)) : 0;
  const skyTimeMs = now - 0;
  passState.drawnSkyTimeMs = skyTimeMs;
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
  return {
    ...params,
    neuralRamp, panelInsets, devicePixelRatio, hoverReleasedNodeId, hoverStartedAt, captionFoldedIds,
    footprintPref, walkedEdgeKeys, walkedEdgeDirections, walkedEdgeArrivalStep, footprintInk,
    footprintStepColor, footprintNewestId, footprintAppear, trailStarInk, footprintNewestStep,
    trailLensOpenedAtMs, trailLensIds, tierReveal, glyphStyle, backgroundVariant, paintAnimatedBackground,
    expand, clusterBarLabels, domeFrame, domeRamp, domeRings, domeRingAlpha, tierNameBoxes,
    domeTierRaisedKind, domeControlFor, domeLight, dial,
    spotlightLensActive, pathLensActive, constellationLensActive, recentSpotlightActive, spotlightSink,
    trailLensKeepIds, trailLensActive, trailRamp, trailGlint, trailGlintLegs, isTrailKept,
    lensNodeEgoState, realmDepthOf, realmParallaxOffsetFor, domeOn, neural, domeFrameFor, nodeFrameAt,
    gridOrigin, footprintScale, labelScale, bgOrigin,
  };
}
