import type { CanvasBackground, ExpandPreference, FootprintPreference, MapArrangement } from "@/shared/lib/appearance-preferences";
import type { FootprintInk } from "@/shared/lib/footprint-glyph";
import {
  type RefObject
} from "react";
import type { CameraAxes } from "../engine/camera";
import { ambientSleepFactor } from "../model/ambient-sleep";
import type { ClusterChip } from "../model/density-gate";
import {
  DOME_ASSEMBLE_TOTAL_MS,
  domeRingAlphaFor,
  type DomeRuntime,
  type DomeViewKind
} from "../model/dome-view";
import { stepFocusRamp } from "../model/focus-state";
import { createStrataStage, sampleStrataStage } from "../model/strata-stage";
import { hexToRgb, parseRgbTriple, type DomeLightFrame, type EvidenceLight, type Rgb } from "../render/dome-light";
import {
  buildFootprintSteps,
  buildWalkedEdgeArrivalSteps,
  buildWalkedEdgeDirections,
  buildWalkedEdgeKeys,
} from "../model/footprint-steps";
import { type GalaxyLayout } from "../model/galaxy-layout";
import { type GrowthReplay } from "../model/growth-replay";
import type { TopologyMapLensKind } from "../model/path-lens";
import {
  type DepthParallaxOffset
} from "../model/realm-depth-parallax";
import { stepSpotlightPhase } from "../model/spotlight-motion";
import { placeTierNames, sameTierNames, type TierNameAnchor, type TierPlane } from "../model/tier-names";
import { type TierRevealConfig } from "../model/tier-visibility";
import { type AnimatedBackground } from "../render/animated-background";
import type { ClusterBarLabels } from "../render/cluster-chips";
import type { Pulse } from "../render/edge-fireflies";
import type { DustPoint } from "../render/starfield";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import type { OntologyMapProps } from "./OntologyMap";
import { worldToScreen } from "./topology-camera-math";
import { drawTopologyFrame, lastDrawnNodeCount } from "./topology-frame-draw";
import { radiusForKind, type TopologyWorld, type WorldEdge } from "./topology-world";

const EMPTY_DOME_CLUSTERED: ReadonlySet<string> = new Set();
const EMPTY_DOME_CHIPS: readonly ClusterChip[] = [];
const DOME_LEGEND_KINDS: readonly DomeViewKind[] = ["project", "domain", "capability", "element"];

/**
 * The Strata planes the last frame placed tier names against, canvas CSS px — the
 * drawn rims, for the `?e2e=1` probe to measure the names against.
 */
let lastPlanes: readonly TierPlane[] = [];
export function lastTierPlanes(): readonly TierPlane[] {
  return lastPlanes;
}

interface Dependencies {
  galaxyRef: RefObject<boolean>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  clusterChipsRef: RefObject<readonly ClusterChip[]>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  realmTierKindsRef: RefObject<ReadonlyMap<string, "capability" | "domain" | "element" | "project"> | null>;
  visitedTrailRef: RefObject<readonly string[]>;
  footprintTrailLenRef: RefObject<number>;
  footprintAppearAtRef: RefObject<number>;
  reducedMotionRef: RefObject<boolean>;
  spotlightRampRef: RefObject<number>;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  spotlightDashOffsetRef: RefObject<number>;
  trailLensOpenedAtRef: RefObject<number>;
  trailLensRampRef: RefObject<number>;
  view3dRef: RefObject<boolean>;
  neuralRampRef: RefObject<number>;
  galaxyLayoutHandoffRef: RefObject<"flat" | "galaxy" | null>;
  galaxyRampRef: RefObject<number>;
  animatedBgRef: RefObject<AnimatedBackground | null>;
  lastInputMsRef: RefObject<number>;
  ambientSleepDelayRef: RefObject<number | undefined>;
  bgPointerRef: RefObject<{ x: number; y: number; } | null>;
  ctx: CanvasRenderingContext2D;
  galaxyLayoutRef: RefObject<GalaxyLayout | null>;
  galaxyEnteredAtRef: RefObject<number>;
  galaxyAtmosphereSeedRef: RefObject<number>;
  panelInsetsRef: RefObject<{ left: number; right: number; } | null>;
  gridPatternRef: RefObject<CanvasPattern | null>;
  dustPointsRef: RefObject<DustPoint[]>;
  hoverStartRef: RefObject<{ id: string | null; at: number; }>;
  hoverReleasedRef: RefObject<string | null>;
  hoveredEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType: string; declaredBySlug: string | null; } | null>;
  selectedEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType?: string; } | null>;
  annotationRef: RefObject<{ captions: ReadonlyMap<string, string> | null | undefined; questions: ReadonlySet<string> | null | undefined; }>;
  previewEdgeHeldRef: RefObject<NonNullable<OntologyMapProps["previewEdge"]> | null>;
  previewAlphaRef: RefObject<number>;
  previewCommitRef: RefObject<number>;
  emphasisRef: RefObject<Map<string, number>>;
  egoRevealRef: RefObject<Map<string, number>>;
  focusRampRef: RefObject<Map<string, number>>;
  growthReplayRef: RefObject<GrowthReplay | null>;
  growthReplayAppearRef: RefObject<Map<string, number>>;
  appearRef: RefObject<Map<string, number>>;
  bornNodeIdsRef: RefObject<Set<string>>;
  chipRevealRef: RefObject<Map<string, number>>;
  expandRevealRef: RefObject<Map<string, number>>;
  batchAppearRef: RefObject<Map<string, number>>;
  labelPresentRef: RefObject<Map<string, number>>;
  colorFocusRef: RefObject<{ focusedNodeId: string | null; selectedEdge: { sourceId: string; targetId: string; relationType?: string; } | null; } | null>;
  pulsesRef: RefObject<Pulse[]>;
  selectionPulseRef: RefObject<{ nodeId: string; startAtMs: number; } | null>;
  agentFocusNodeIdRef: RefObject<string | null>;
  hoveredClusterIdRef: RefObject<string | null>;
  cosmosPointsRef: RefObject<DustPoint[]>;
  footprintPrefRef: RefObject<FootprintPreference | null>;
  footprintStepColorRef: RefObject<string>;
  footprintInkRef: RefObject<FootprintInk>;
  visitedTrailSetRef: RefObject<Set<string>>;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  pathEdgeIdsRef: RefObject<ReadonlySet<string> | null>;
  tierRevealRef: RefObject<TierRevealConfig>;
  glyphStyleRef: RefObject<"fill" | "line">;
  canvasBackgroundRef: RefObject<CanvasBackground>;
  domeEdgeControlForFrame: (edge: WorldEdge) => { x: number; y: number; } | null;
  depthDotPatternsRef: RefObject<(CanvasPattern | null)[]>;
  expandPrefRef: RefObject<ExpandPreference>;
  getClusterBarLabels: () => ClusterBarLabels | null;
  mapArrangementRef: RefObject<MapArrangement>;
  domeTierRaisedKindRef: RefObject<DomeViewKind | null>;
  drawnTrailLensRef: RefObject<boolean>;
  tourAnchorNodeIdRef: RefObject<string | null>;
  drawnNodeCountRef: RefObject<number>;
  onDrawnCountChangeRef: RefObject<((drawn: number) => void) | undefined>;
  domeTierAnchorsSentRef: RefObject<TierNameAnchor[] | null>;
  onDomeTierAnchorsChangeRef: RefObject<((anchors: readonly TierNameAnchor[] | null) => void) | undefined>;
  domeTierNameWidthsRef: RefObject<Readonly<Record<string, number>>>;
  domeFitInsetsRef: RefObject<{ left: number; right: number; top: number; bottom: number; } | null>;
  /** Lit 3D — node id → evidence state from the product's one rule; null when nothing was measured. */
  domeEvidenceRef: RefObject<ReadonlyMap<string, EvidenceLight> | null>;
}

/** Advance visual ramps, publish hit-test visibility, paint the canvas, and report screen anchors. */
export function createPresentationFrameStage({
  galaxyRef,
  domeRuntimeRef,
  clusterChipsRef,
  clusteredIdsRef,
  realmTierKindsRef,
  visitedTrailRef,
  footprintTrailLenRef,
  footprintAppearAtRef,
  reducedMotionRef,
  spotlightRampRef,
  spotlightIdsRef,
  spotlightDashOffsetRef,
  trailLensOpenedAtRef,
  trailLensRampRef,
  view3dRef,
  neuralRampRef,
  galaxyLayoutHandoffRef,
  galaxyRampRef,
  animatedBgRef,
  lastInputMsRef,
  ambientSleepDelayRef,
  bgPointerRef,
  ctx,
  galaxyLayoutRef,
  galaxyEnteredAtRef,
  galaxyAtmosphereSeedRef,
  panelInsetsRef,
  gridPatternRef,
  dustPointsRef,
  hoverStartRef,
  hoverReleasedRef,
  hoveredEdgeRef,
  selectedEdgeRef,
  annotationRef,
  previewEdgeHeldRef,
  previewAlphaRef,
  previewCommitRef,
  emphasisRef,
  egoRevealRef,
  focusRampRef,
  growthReplayRef,
  growthReplayAppearRef,
  appearRef,
  bornNodeIdsRef,
  chipRevealRef,
  expandRevealRef,
  batchAppearRef,
  labelPresentRef,
  colorFocusRef,
  pulsesRef,
  selectionPulseRef,
  agentFocusNodeIdRef,
  hoveredClusterIdRef,
  cosmosPointsRef,
  footprintPrefRef,
  footprintStepColorRef,
  footprintInkRef,
  visitedTrailSetRef,
  mapLensKindRef,
  pathEdgeIdsRef,
  tierRevealRef,
  glyphStyleRef,
  canvasBackgroundRef,
  domeEdgeControlForFrame,
  depthDotPatternsRef,
  expandPrefRef,
  getClusterBarLabels,
  mapArrangementRef,
  domeTierRaisedKindRef,
  drawnTrailLensRef,
  tourAnchorNodeIdRef,
  drawnNodeCountRef,
  onDrawnCountChangeRef,
  domeTierAnchorsSentRef,
  onDomeTierAnchorsChangeRef,
  domeTierNameWidthsRef,
  domeFitInsetsRef,
  domeEvidenceRef,
}: Dependencies) {
  /*
   * Lit 3D (2026-09-25) — the stage buffers and parsed inks live for the stage's lifetime;
   * the inks are re-parsed only when the token strings change.
   */
  const strataStage = createStrataStage();
  let litInkKey = "";
  let litInks: Pick<DomeLightFrame, "kindRgb" | "warningRgb" | "focusRgb"> | null = null;
  const resolveLitInks = (tokens: OntologyMapTokens) => {
    const key = `${tokens.kindRgbProject}|${tokens.kindRgbDomain}|${tokens.kindRgbCapability}|${tokens.kindRgbElement}|${tokens.statusWarning}|${tokens.indigoBright}`;
    if (key === litInkKey && litInks !== null) return litInks;
    const fallback: Rgb = [128, 128, 140];
    litInks = {
      kindRgb: {
        project: parseRgbTriple(tokens.kindRgbProject) ?? fallback,
        domain: parseRgbTriple(tokens.kindRgbDomain) ?? fallback,
        capability: parseRgbTriple(tokens.kindRgbCapability) ?? fallback,
        element: parseRgbTriple(tokens.kindRgbElement) ?? fallback,
      },
      warningRgb: hexToRgb(tokens.statusWarning) ?? parseRgbTriple(tokens.statusWarning) ?? fallback,
      focusRgb: hexToRgb(tokens.indigoBright) ?? fallback,
    };
    litInkKey = key;
    return litInks;
  };
  const domeLightFor = (tokens: OntologyMapTokens): DomeLightFrame | null => {
    const dome = domeRuntimeRef.current;
    if (dome === null || dome.rampClock <= 0) return null;
    const inks = resolveLitInks(tokens);
    return {
      ...inks,
      evidence: domeEvidenceRef.current,
      reducedMotion: reducedMotionRef.current,
      sampleStage:
        dome.model.arrangement === "strata"
          ? (litIds) => sampleStrataStage(dome, litIds, strataStage)
          : null,
    };
  };

  return function runPresentationFrameStage(
    frameChips: readonly ClusterChip[],
    frameClusteredIds: ReadonlySet<string>,
    realmTierKinds: ReadonlyMap<string, DomeViewKind> | null,
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    trailLensActive: boolean,
    camera: CameraAxes,
    width: number,
    height: number,
    dpr: number,
    world: TopologyWorld,
    farT: number,
    zoomRatio: number,
    focusedNodeId: string | null,
    hoveredNodeId: string | null,
    panelEmphasisNodeId: string | null,
    realmWarding: { centerX: number; centerY: number; radius: number; drawProgress: number; caption: string | null; } | null,
    realmDepthById: ReadonlyMap<string, number> | null,
    realmDepthParallax: { depth2: DepthParallaxOffset; depth3: DepthParallaxOffset; } | null,
    realmDustParallax: number,
    realmOutsideReturnAlphaById: Map<string, number> | null,
  ) {

    const modeShowsEveryNode =
      galaxyRef.current ||
      (domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0);

    clusterChipsRef.current = modeShowsEveryNode ? EMPTY_DOME_CHIPS : frameChips;

    // Publish this frame's NOT-DRAWN set for hit-testing (density-gate
    // collapsed plus selective-ego hidden neighbours), so draw and hit see
    // the same set.
    clusteredIdsRef.current = modeShowsEveryNode ? EMPTY_DOME_CLUSTERED : frameClusteredIds;

    // Publish the depth override the draw used for this frame's tier alphas
    // to hit-testing as well (null when no realm is active), keeping draw and
    // hit in lockstep.
    realmTierKindsRef.current = realmTierKinds;

    /*
     * Footprint trail: this frame's visit ordinal per node, starting at 1. The array is
     * short (≤30), so recomputing it per frame costs nothing.
     *
     * ⚠️ **The focused node used to be deleted from this map and is not any more.** The
     * reason it was — "the selection ring already holds that position" — was true of a
     * shoe print, which sat *beside* the node in the ring's own orbit. Since 2026-09-10 the
     * mark is the node emitting, and the two occupy different geometry: the ring strokes
     * the silhouette and the r+6 hairline, the star throws light outward from it. Keeping
     * the deletion after that cost the walk its last stop — usually the node the person had
     * just clicked — so the end of the path was a hole, and the "here is where the walk
     * ends" cross could almost never draw because the star it rides on was missing.
     * `topology-frame-draw` separates the two by ink instead: indigo on the focused node,
     * star ink on the rest.
     */
    const footprintStepsById = buildFootprintSteps(visitedTrailRef.current);

    // A longer trail stamps the arrival motion's start time; a shorter one
    // (cleared) drops the ramp.
    const trailLen = visitedTrailRef.current.length;

    if (trailLen > footprintTrailLenRef.current) footprintAppearAtRef.current = now;

    footprintTrailLenRef.current = trailLen;

    const footprintNewestId = trailLen > 0 ? visitedTrailRef.current[trailLen - 1] : null;

    // Same step as the movement ramp (`--motion-base`, 180 ms): a surface
    // taking its place.
    const footprintAppear = reducedMotionRef.current
      ? 1
      : Math.min(1, Math.max(0, (now - footprintAppearAtRef.current) / 180));

    // Spotlight on/off exponential ramp, reusing focusDimTau so no new
    // easing is introduced. Reduced-motion arrives immediately: static
    // contrast alone carries the information.
    spotlightRampRef.current = reducedMotionRef.current
      ? (spotlightIdsRef.current !== null ? 1 : 0)
      : stepFocusRamp(spotlightRampRef.current, spotlightIdsRef.current !== null, dt, tokens.focusDimTau);

    spotlightDashOffsetRef.current = stepSpotlightPhase({
      dashOffset: spotlightDashOffsetRef.current,
      settling: Math.abs(spotlightRampRef.current - (spotlightIdsRef.current !== null ? 1 : 0)) > 0.01,
      reducedMotion: reducedMotionRef.current,
      dtSeconds: dt,
      speedPxPerMs: tokens.spotlightRingSpeed,
    });

    /*
     * Trail lens on/off ramp, reusing the same easing and token. Reduced-motion arrives
     * immediately — same contract as the spotlight.
     *
     * ⚠️ **The clock outlives the close, and that is the whole fix for the interruption
     * flash.** It used to zero on the closing frame, which made `sweep` fall back to its
     * default of 1 for every star the ignition had not reached yet — so closing the lens
     * *mid-sweep* lit the entire constellation for the two or three frames the ramp took to
     * fade it. design-motion recorded it: a star jumped 28.2 → 42.6 luminance in one 33 ms
     * frame, **+51%**, on the way out (2026-09-10). Holding the clock until the ramp is
     * spent lets an interrupted open fade from wherever the sweep actually got to, which is
     * the difference between a transition that can be interrupted and one that must be
     * waited out.
     */
    if (trailLensActive && trailLensOpenedAtRef.current === 0) trailLensOpenedAtRef.current = now;
    else if (!trailLensActive && trailLensRampRef.current < 0.01) trailLensOpenedAtRef.current = 0;

    /*
     * The galaxy view's crossfade. Reduced motion takes it immediately, the same contract the
     * spotlight and the trail lens follow: what the preference removes is travel, and a
     * brightness crossfade on a settled canvas is not travel — but the ramp below it *is* the
     * trail lens, which does move, so the two are answered separately.
     */
    const neuralTarget = view3dRef.current && domeRuntimeRef.current?.model.arrangement === "coupling";

    // Reduced motion keeps geometry at its destination; only the cell material
    // crossfades. Curve projection separately uses the destination mix above.
    if (reducedMotionRef.current) {
      const target = neuralTarget ? 1 : 0;
      const delta = target - neuralRampRef.current;
      const stride = dt * 1000 / Math.max(1, tokens.trailReducedFadeMs);
      neuralRampRef.current = Math.abs(delta) <= stride
        ? target : neuralRampRef.current + Math.sign(delta) * stride;
    } else {
      neuralRampRef.current = stepFocusRamp(neuralRampRef.current, neuralTarget, dt, tokens.focusDimTau);
    }

    const galaxyIdentityActive =
      galaxyRef.current || galaxyLayoutHandoffRef.current === "flat";

    galaxyRampRef.current = reducedMotionRef.current
      ? (galaxyIdentityActive ? 1 : 0)
      : stepFocusRamp(galaxyRampRef.current, galaxyIdentityActive, dt, tokens.focusDimTau);

    if (reducedMotionRef.current) {
      /*
       * ⚠️ **Reduced motion asked for no travel, not for a cut.** This used to be
       * `trailLensActive ? 1 : 0`, and design-motion measured the result: the constellation
       * went 22.25 → 51.9 luminance **in one 33 ms frame** (2026-09-10). Everything the
       * preference is actually for is still suppressed — the ignition sweep, the twinkle,
       * the travelling light — and none of them comes back here. What comes back is an
       * opacity crossfade over `--motion-settle`, which carries no position, no scale and
       * no vestibular signal; it is the same fade a `prefers-reduced-motion` stylesheet
       * would leave in place of a slide.
       */
      const stepPerMs = 1 / Math.max(1, tokens.trailReducedFadeMs);
      const target = trailLensActive ? 1 : 0;
      const delta = target - trailLensRampRef.current;
      const stride = dt * 1000 * stepPerMs;
      trailLensRampRef.current =
        Math.abs(delta) <= stride ? target : trailLensRampRef.current + Math.sign(delta) * stride;
    } else {
      trailLensRampRef.current = stepFocusRamp(trailLensRampRef.current, trailLensActive, dt, tokens.focusDimTau);
    }

    // One animated-background step, refreshing its own buffer **before** the
    // draw. It receives `ambientFactor` directly, so it decelerates to a stop
    // once the hand lets go, and at 0 the call returns early — zero raster
    // cost while idle.
    {
      const bg = animatedBgRef.current;
      if (bg) {
        const origin = worldToScreen(camera, width, height, 0, 0);
        bg.step({
          width,
          height,
          dpr,
          originX: origin.x,
          originY: origin.y,
          ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
          pointerX: bgPointerRef.current?.x ?? null,
          pointerY: bgPointerRef.current?.y ?? null,
          dtMs: dt * 1000,
          reducedMotion: reducedMotionRef.current,
        });
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    drawTopologyFrame({
      ctx,
      world,
      camera,
      farT,
      galaxyRamp: galaxyRampRef.current,
      galaxyIdentityActive,
      galaxyLayoutRadius: galaxyLayoutRef.current?.radius ?? 0,
      galaxyElapsedMs:
        galaxyRampRef.current > 0.001 && galaxyEnteredAtRef.current > 0
          ? Math.max(0, now - galaxyEnteredAtRef.current)
          : 0,
      galaxyAtmosphereSeed: galaxyAtmosphereSeedRef.current,
      neuralRamp: neuralRampRef.current,
      zoomRatio,
      now,
      viewportWidth: width,
      viewportHeight: height,
      panelInsets: panelInsetsRef.current,
      // The ratio this frame is really rasterising at — the adaptive one while a
      // drag has lowered it, not `window.devicePixelRatio`. Only the 3D resting
      // line's width floor reads it.
      devicePixelRatio: dpr,
      gridPattern: gridPatternRef.current,
      dustPoints: dustPointsRef.current,
      tokens,
      focusedNodeId,
      hoveredNodeId,
      // Press (2026-09-08): when this hover began, so the draw can run the
      // underdamped step response from that instant.
      hoverStartedAt: (() => {
        if (hoverStartRef.current.id !== hoveredNodeId) {
          hoverReleasedRef.current = hoverStartRef.current.id;
          hoverStartRef.current = { id: hoveredNodeId, at: now };
        }
        return hoveredNodeId === null ? null : hoverStartRef.current.at;
      })(),
      // The node the press left, so its swell decays instead of stepping down.
      hoverReleasedNodeId: hoverReleasedRef.current,
      emphasizedNeighborId: panelEmphasisNodeId,
      hoveredEdge: hoveredEdgeRef.current,
      selectedEdge: selectedEdgeRef.current,
      relationCaptions: annotationRef.current.captions,
      // A view that draws every concept still captions only what the flat map would.
      captionFoldedIds: modeShowsEveryNode ? frameClusteredIds : null,
      reviewQuestionIds: annotationRef.current.questions,
      previewEdge: previewEdgeHeldRef.current && previewAlphaRef.current > 0.001
        ? {
          ...previewEdgeHeldRef.current,
          alpha: previewAlphaRef.current,
          commitProgress: previewCommitRef.current,
        }
        : null,
      emphasisById: emphasisRef.current,
      egoRevealById: egoRevealRef.current,
      focusRampById: focusRampRef.current,
      appearById: growthReplayRef.current !== null ? growthReplayAppearRef.current : appearRef.current,
      bornNodeIds: bornNodeIdsRef.current,
      chipRevealById: chipRevealRef.current,
      expandRevealById: expandRevealRef.current,
      batchAppearById: batchAppearRef.current,
      labelPresentById: labelPresentRef.current,
      colorFocusedNodeId: colorFocusRef.current?.focusedNodeId ?? null,
      colorSelectedEdge: colorFocusRef.current?.selectedEdge ?? null,
      reducedMotion: reducedMotionRef.current,
      pulses: pulsesRef.current,
      selectionPulse: selectionPulseRef.current,
      agentFocusNodeId: agentFocusNodeIdRef.current,
      clusteredIds: modeShowsEveryNode ? EMPTY_DOME_CLUSTERED : frameClusteredIds,
      clusterChips: modeShowsEveryNode ? EMPTY_DOME_CHIPS : frameChips,
      hoveredClusterId: hoveredClusterIdRef.current,
      wardingRing: realmWarding,
      realmTierKinds,
      realmDepthById,
      realmDepthParallax,
      realmDustParallax,
      realmOutsideReturnAlphaById,
      // Cosmos dots are passed only while a realm is active; they are
      // clipped by the warding ring.
      realmCosmosPoints: realmWarding ? cosmosPointsRef.current : null,
      footprintStepsById,
      footprintPref: footprintPrefRef.current,
      trailStarInk: footprintStepColorRef.current,
      footprintNewestStep: visitedTrailRef.current.length,
      walkedEdgeKeys: buildWalkedEdgeKeys(visitedTrailRef.current),
      walkedEdgeDirections: buildWalkedEdgeDirections(visitedTrailRef.current),
      walkedEdgeArrivalStep: buildWalkedEdgeArrivalSteps(visitedTrailRef.current),
      footprintInk: footprintInkRef.current,
      footprintStepColor: footprintStepColorRef.current,
      footprintNewestId,
      footprintAppear,
      // The lens keep-set is passed only while the popover is open; closed
      // sends null. After the lens turns off the set keeps being passed until
      // the ramp reaches 0, so the trail ink and background dim *fade down*
      // rather than *disappear*.
      trailLensIds:
        trailLensActive || trailLensRampRef.current > 0.01 ? visitedTrailSetRef.current : null,
      trailLensRamp: trailLensRampRef.current,
      trailLensOpenedAtMs: trailLensOpenedAtRef.current,
      spotlightIds: spotlightIdsRef.current,
      mapLensKind: mapLensKindRef.current,
      pathEdgeIds: pathEdgeIdsRef.current,
      spotlightRamp: spotlightRampRef.current,
      spotlightDashOffset: spotlightDashOffsetRef.current,
      tierReveal: tierRevealRef.current,
      glyphStyle: glyphStyleRef.current,
      backgroundVariant: canvasBackgroundRef.current,
      domeFrame:
        domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
          ? domeRuntimeRef.current.frame
          : null,
      domeRamp: domeRuntimeRef.current !== null ? domeRuntimeRef.current.rampClock / DOME_ASSEMBLE_TOTAL_MS : 0,
      domeRings:
        domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
          ? domeRuntimeRef.current.rings
          : null,
      domeControlFor:
        domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
          ? domeEdgeControlForFrame
          : null,
      domeLight: domeLightFor(tokens),
      paintAnimatedBackground: animatedBgRef.current
        ? (target, w, h) => animatedBgRef.current?.paint(target, w, h)
        : null,
      depthDotPatterns: canvasBackgroundRef.current === "depth" ? depthDotPatternsRef.current : undefined,
      expand: expandPrefRef.current,
      clusterBarLabels: getClusterBarLabels(),
      domeRingAlpha: domeRingAlphaFor(mapArrangementRef.current),
      domeTierRaisedKind: domeTierRaisedKindRef.current,
      // Concept names give way to the tier names placed last frame (`model/tier-names.ts`).
      tierNameBoxes: domeTierAnchorsSentRef.current,
    });

    // Record which lens state this frame drew; the idle gate compares
    // against it next frame to decide whether the lens changed.
    drawnTrailLensRef.current = trailLensActive;

    // Guided-tour spotlight ring, drawn by the engine onto the frame rather
    // than as an overlay DOM circle. Owner bug report 2026-07-24: the DOM
    // circle was slightly offset and a slightly different shape from the
    // node, so it looked misaligned. Using the same `worldToScreen` in the
    // same frame makes agreement with the drawn node structural. The scrim
    // cutout stays with the GuidedTourOverlay.
    {
      const anchorId = tourAnchorNodeIdRef.current;
      const node = anchorId ? world.nodeById.get(anchorId) : undefined;
      if (node) {
        const dFrame = domeRuntimeRef.current?.frame.get(node.id);
        const rr = radiusForKind(node.kind, tokens) * node.magnitudeScale * (dFrame?.s ?? 1) * camera.scale.value;
        const s = worldToScreen(camera, width, height, node.x + (dFrame?.dx ?? 0), node.y + (dFrame?.dy ?? 0));
        ctx.save();
        ctx.beginPath();
        ctx.arc(s.x, s.y, rr + 10, 0, Math.PI * 2);
        ctx.strokeStyle = tokens.selectionRingIndigo;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }

    // What the frame actually painted, reported only on change — the readout is
    // an instrument, and an instrument that restates a rule instead of the
    // screen is the defect this replaces.
    const painted = lastDrawnNodeCount();

    if (painted !== drawnNodeCountRef.current) {
      drawnNodeCountRef.current = painted;
      onDrawnCountChangeRef.current?.(painted);
    }

    /*
     * **Where each Strata tier name stands this frame** (`model/tier-names.ts`). The
     * planes are the rings the frame just drew, not the model: during an orbit or a
     * morph the two are different numbers. The room is the fit's own free box — the
     * canvas minus the chrome it measured on each side — so a name never lands where
     * the drawing was kept from.
     */
    {
      const runtime = domeRuntimeRef.current;
      let names: TierNameAnchor[] | null = null;
      lastPlanes = [];
      if (runtime !== null && runtime.rampClock > 0 && runtime.model.arrangement === "strata") {
        const strongest = new Map<DomeViewKind, (typeof runtime.rings)[number]>();
        for (const ring of runtime.rings) {
          if (ring.label === null || ring.a <= 0.01) continue;
          const seen = strongest.get(ring.kind);
          // A morph draws the old model's rings behind the new ones; the tier
          // belongs to whichever of the two is currently the stronger.
          if (seen && seen.a >= ring.a) continue;
          strongest.set(ring.kind, ring);
        }
        const planes: TierPlane[] = [];
        for (const kind of DOME_LEGEND_KINDS) {
          const ring = strongest.get(kind);
          if (!ring || ring.label === null) continue;
          let left = Infinity;
          let right = -Infinity;
          let top = Infinity;
          let bottom = -Infinity;
          for (const point of ring.points) {
            const at = worldToScreen(camera, width, height, point.wx, point.wy);
            if (at.x < left) left = at.x;
            if (at.x > right) right = at.x;
            if (at.y < top) top = at.y;
            if (at.y > bottom) bottom = at.y;
          }
          if (!Number.isFinite(left)) continue;
          const y = worldToScreen(camera, width, height, ring.label.wx, ring.label.wy).y;
          planes.push({ kind, left, right, top, bottom, y, a: ring.a });
        }
        lastPlanes = planes;
        const fit = domeFitInsetsRef.current;
        names = placeTierNames(planes, domeTierNameWidthsRef.current, {
          left: fit?.left ?? tokens.safeInsetLeft,
          right: width - (fit?.right ?? tokens.safeInsetRight),
          top: fit?.top ?? tokens.domeFitInsetTop,
          bottom: height - (fit?.bottom ?? tokens.domeFitInsetBottom),
        });
      }
      if (!sameTierNames(domeTierAnchorsSentRef.current, names)) {
        domeTierAnchorsSentRef.current = names;
        onDomeTierAnchorsChangeRef.current?.(names);
      }
    }

  };
}
