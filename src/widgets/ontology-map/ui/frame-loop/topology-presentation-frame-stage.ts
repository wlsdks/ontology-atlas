import type { DialWorld } from '../../dial/types';
import type { PanelInsets } from "../../interaction/free-area";
import type { CanvasBackground, ExpandPreference, FootprintPreference } from "@/shared/lib/preferences/appearance-preferences";
import type { FootprintInk } from "@/shared/lib/map-canvas/footprint-glyph";
import {
  type RefObject
} from "react";
import type { CameraAxes } from "../../engine/camera";
import { ambientSleepFactor } from "../../model/ambient/ambient-sleep";
import type { ClusterChip } from "../../model/layout/density-gate";
import { stepFocusRamp } from "../../model/visibility/focus-state";
import {
  buildFootprintSteps,
  buildWalkedEdgeArrivalSteps,
  buildWalkedEdgeDirections,
  buildWalkedEdgeKeys,
} from "../../model/visibility/footprint-steps";
import { type GrowthReplay } from "../../model/ambient/growth-replay";
import type { TopologyMapLensKind } from "../../model/visibility/path-lens";
import {
  type DepthParallaxOffset
} from "../../model/realm/realm-depth-parallax";
import { stepSpotlightPhase } from "../../model/ambient/spotlight-motion";
import { type TierRevealConfig } from "../../model/visibility/tier-visibility";
import { type AnimatedBackground } from "../../render/animated-background";
import type { ClusterBarLabels } from "../../render/cluster-chips";
import type { Pulse } from "../../render/edge-fireflies";
import type { DustPoint } from "../../render/starfield";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { OntologyMapProps } from "../OntologyMap";
import { worldToScreen } from "../camera/topology-camera-math";
import { drawTopologyFrame, lastDrawnNodeCount } from "../frame-draw/topology-frame-draw";
import { reportFlatDial, type FlatDialFrameProps } from "../loop/topology-loop-contract";
import { dialFrameSummary } from "../../dial/frame/frame";
import { type TopologyWorld } from "../world/topology-world";

interface Dependencies {
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
  animatedBgRef: RefObject<AnimatedBackground | null>;
  lastInputMsRef: RefObject<number>;
  ambientSleepDelayRef: RefObject<number | undefined>;
  bgPointerRef: RefObject<{ x: number; y: number; } | null>;
  ctx: CanvasRenderingContext2D;
  panelInsetsRef: RefObject<PanelInsets | null>;
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
    realmStarPointsRef: RefObject<DustPoint[]>;
  footprintPrefRef: RefObject<FootprintPreference | null>;
  footprintStepColorRef: RefObject<string>;
  footprintInkRef: RefObject<FootprintInk>;
  visitedTrailSetRef: RefObject<Set<string>>;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  pathEdgeIdsRef: RefObject<ReadonlySet<string> | null>;
  tierRevealRef: RefObject<TierRevealConfig>;
  glyphStyleRef: RefObject<"fill" | "line">;
  canvasBackgroundRef: RefObject<CanvasBackground>;
  nodeLayerRef: RefObject<((ctx: CanvasRenderingContext2D) => CanvasRenderingContext2D) | null>;
  depthDotPatternsRef: RefObject<(CanvasPattern | null)[]>;
  expandPrefRef: RefObject<ExpandPreference>;
  getClusterBarLabels: () => ClusterBarLabels | null;
  drawnTrailLensRef: RefObject<boolean>;
  drawnNodeCountRef: RefObject<number>;
  onDrawnCountChangeRef: RefObject<((drawn: number) => void) | undefined>;
  flatDialRef: RefObject<FlatDialFrameProps>;
}

/** Advance visual ramps, publish hit-test visibility, paint the canvas, and report screen anchors. */
export function createPresentationFrameStage({
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
  animatedBgRef, lastInputMsRef, ambientSleepDelayRef, bgPointerRef, ctx,
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
  hoveredClusterIdRef, realmStarPointsRef,
  footprintPrefRef,
  footprintStepColorRef,
  footprintInkRef,
  visitedTrailSetRef,
  mapLensKindRef,
  pathEdgeIdsRef,
  tierRevealRef,
  glyphStyleRef,
  canvasBackgroundRef,
  nodeLayerRef,
  depthDotPatternsRef,
  expandPrefRef,
  getClusterBarLabels,
  drawnTrailLensRef,
  drawnNodeCountRef,
  onDrawnCountChangeRef,
  flatDialRef,
}: Dependencies) {
    return function runPresentationFrameStage(frameChips: readonly ClusterChip[], frameClusteredIds: ReadonlySet<string>, realmTierKinds: ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null, now: number, dt: number, tokens: OntologyMapTokens, trailLensActive: boolean, camera: CameraAxes, width: number, height: number, dpr: number, world: TopologyWorld, farT: number, zoomRatio: number, focusedNodeId: string | null, hoveredNodeId: string | null, panelEmphasisNodeId: string | null, realmWarding: {
        centerX: number;
        centerY: number;
        radius: number;
        drawProgress: number;
        caption: string | null;
    } | null, realmDepthById: ReadonlyMap<string, number> | null, realmDepthParallax: {
        depth2: DepthParallaxOffset;
        depth3: DepthParallaxOffset;
    } | null, realmDustParallax: number, realmOutsideReturnAlphaById: Map<string, number> | null, realmDial: DialWorld | null = null) {
        clusterChipsRef.current = frameChips;
        // Publish this frame's NOT-DRAWN set for hit-testing (density-gate
        // collapsed plus selective-ego hidden neighbours), so draw and hit see
        // the same set.
        clusteredIdsRef.current = frameClusteredIds;
        // Publish the depth override the draw used for this frame's tier alphas
        // to hit-testing as well (null when no realm is active), keeping draw and
        // hit in lockstep.
        realmTierKindsRef.current = realmTierKinds;
        /*
         * Visit ordinal per node for the footprint trail. The focused node stays in the map: the mark emits
         * light outward, so it does not collide with the selection ring.
         */
        const footprintStepsById = buildFootprintSteps(visitedTrailRef.current);
        // A longer trail stamps the arrival motion's start time; a shorter one
        // (cleared) drops the ramp.
        const trailLen = visitedTrailRef.current.length;
        if (trailLen > footprintTrailLenRef.current)
            footprintAppearAtRef.current = now;
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
         * The trail lens clock outlives the close so an interrupted open fades from where the sweep got to
         * instead of lighting every star. Reduced motion arrives immediately.
         */
        if (trailLensActive && trailLensOpenedAtRef.current === 0)
            trailLensOpenedAtRef.current = now;
        else if (!trailLensActive && trailLensRampRef.current < 0.01)
            trailLensOpenedAtRef.current = 0;
        if (reducedMotionRef.current) {
            /*
             * Reduced motion gets an opacity crossfade, not a cut: it carries no position or scale, so no
             * vestibular signal.
             */
            const stepPerMs = 1 / Math.max(1, tokens.trailReducedFadeMs);
            const target = trailLensActive ? 1 : 0;
            const delta = target - trailLensRampRef.current;
            const stride = dt * 1000 * stepPerMs;
            trailLensRampRef.current =
                Math.abs(delta) <= stride ? target : trailLensRampRef.current + Math.sign(delta) * stride;
        }
        else {
            trailLensRampRef.current = stepFocusRamp(trailLensRampRef.current, trailLensActive, dt, tokens.focusDimTau);
        }
        const ambientFactor = ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current);
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
                    ambientFactor,
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
            zoomRatio,
            now,
            viewportWidth: width,
            viewportHeight: height,
            panelInsets: panelInsetsRef.current,
            gridPattern: gridPatternRef.current,
            dustPoints: dustPointsRef.current,
            tokens,
            focusedNodeId,
            hoveredNodeId,
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
            clusteredIds: frameClusteredIds,
            clusterChips: frameChips,
            hoveredClusterId: hoveredClusterIdRef.current,
            wardingRing: realmWarding,
            realmTierKinds,
            realmDial, realmDepthById,
            realmDepthParallax,
            realmDustParallax,
            realmOutsideReturnAlphaById,
            // clipped by the warding ring.
            realmStarPoints: realmWarding ? realmStarPointsRef.current : null,
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
            trailLensIds: trailLensActive || trailLensRampRef.current > 0.01 ? visitedTrailSetRef.current : null,
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
            paintAnimatedBackground: animatedBgRef.current
                ? (target, w, h) => animatedBgRef.current?.paint(target, w, h)
                : null,
            nodeLayer: nodeLayerRef.current,
            depthDotPatterns: canvasBackgroundRef.current === "depth" ? depthDotPatternsRef.current : undefined,
            expand: expandPrefRef.current,
            clusterBarLabels: getClusterBarLabels(),
            dial: flatDialRef.current,
        });
        reportFlatDial(flatDialRef.current, dialFrameSummary());
        // Record which lens state this frame drew; the idle gate compares
        // against it next frame to decide whether the lens changed.
        drawnTrailLensRef.current = trailLensActive;
        // What the frame actually painted, reported only on change — the readout is
        // an instrument, and an instrument that restates a rule instead of the
        // screen is the defect this replaces.
        const painted = lastDrawnNodeCount();
        if (painted !== drawnNodeCountRef.current) {
            drawnNodeCountRef.current = painted;
            onDrawnCountChangeRef.current?.(painted);
        }
    };
}
