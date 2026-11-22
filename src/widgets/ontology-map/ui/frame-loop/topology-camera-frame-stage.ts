import type { RefObject } from "react";

import type { CameraAxes, CameraTarget } from "../../engine/camera";
import type { PointerMachineState } from "../../interaction/pointer-state-machine";
import { ambientSleepFactor } from "../../model/ambient/ambient-sleep";
import { createFocusRampClock } from "../../model/visibility/focus-state";
import { easeAnchoredZoom, easeCameraKeyframe, type CameraTween, type ZoomEase } from "../../model/camera/camera-easing";
import { domeFitFocusLeash, type DomeRuntime } from "../../model/dome-view/runtime";
import type { GrowthReplay } from "../../model/ambient/growth-replay";
import {
  depthParallaxFactorForDepth,
  isDepthParallaxActive,
  stepDepthParallax,
  ZERO_PARALLAX,
  type DepthParallaxOffset,
} from "../../model/realm/realm-depth-parallax";
import type { RealmTransitionState } from "../../model/realm/realm-transition";
import {
  classifyZoomTier,
  type TierRevealConfig,
  type ZoomTier,
} from "../../model/visibility/tier-visibility";
import { updatePulses, type Pulse } from "../../render/edge-fireflies";
import { lastDialFrame } from "../../dial/frame/frame";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { FocusLeashPx } from "../camera/target/pan-leash";
import { stepTopologyPhysics } from "./topology-physics-step";
import type { RealmRuntimeData } from "../world/realm/topology-realm-runtime";
import type { TopologyWorld } from "../world/topology-world";

type SourceRef<T> = { current: T; };
type SelectedEdge = {
  sourceId: string;
  targetId: string;
  relationType?: string;
};

export interface CameraFrameResult {
  focusedNodeId: string | null;
  trailLensActive: boolean;
  hoveredNodeId: string | null;
  panelEmphasisNodeId: string | null;
  camera: CameraAxes;
  farT: number;
  zoomRatio: number;
}

export interface CameraFrameStageSources {
  focusedSlugRef: SourceRef<string | null>;
  trailLensPropRef: SourceRef<RefObject<boolean> | null>;
  trailBrushPropRef: SourceRef<RefObject<string | null> | null>;
  panelHoverPropRef: SourceRef<RefObject<string | null> | null>;
  hoveredNodeIdRef: SourceRef<string | null>;
  drawnHoveredNodeIdRef: SourceRef<string | null>;
  panelEmphasisNodeIdRef: SourceRef<string | null>;
  cameraTweenRef: SourceRef<CameraTween | null>;
  zoomEaseRef: SourceRef<ZoomEase | null>;
  reducedMotionRef: SourceRef<boolean>;
  cameraRef: SourceRef<CameraAxes>;
  cameraTargetRef: SourceRef<CameraTarget>;
  dampingRef: SourceRef<number>;
  overviewScaleRef: SourceRef<number>;
  cameraAngularFreqRef: SourceRef<number | null>;
  lastInputMsRef: SourceRef<number>;
  ambientSleepDelayRef: SourceRef<number | undefined>;
  selectedEdgeRef: SourceRef<SelectedEdge | null>;
  pointerMachineRef: SourceRef<PointerMachineState>;
  domeRuntimeRef: SourceRef<DomeRuntime | null>;
  focusLeashPxRef: SourceRef<FocusLeashPx | null>;
  userDrivenCameraRef: SourceRef<boolean>;
  clusteredIdsRef: SourceRef<ReadonlySet<string>>;
  emphasisRef: SourceRef<Map<string, number>>;
  rippleStartRef: SourceRef<Map<string, number>>;
  egoRevealRef: SourceRef<Map<string, number>>;
  focusRampRef: SourceRef<Map<string, number>>;
  growthReplayRef: SourceRef<GrowthReplay | null>;
  growthReplayAppearRef: SourceRef<Map<string, number>>;
  appearRef: SourceRef<Map<string, number>>;
  tierRevealRef: SourceRef<TierRevealConfig>;
  drawnFarTRef: SourceRef<number>;
  colorFocusRef: SourceRef<{
    focusedNodeId: string | null;
    selectedEdge: SelectedEdge | null;
  } | null>;
  pulsesRef: SourceRef<Pulse[]>;
  realmDataRef: SourceRef<RealmRuntimeData | null>;
  realmTransitionRef: SourceRef<RealmTransitionState>;
  realmParallaxDepth2Ref: SourceRef<DepthParallaxOffset>;
  realmParallaxDepth3Ref: SourceRef<DepthParallaxOffset>;
  realmParallaxRef: SourceRef<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>;
  previousCameraCenterRef: SourceRef<{ x: number; y: number; } | null>;
  lastZoomTierRef: SourceRef<ZoomTier | null>;
  onZoomTierChangeRef: SourceRef<((tier: ZoomTier) => void) | undefined>;
}

export function createCameraFrameStage(sources: CameraFrameStageSources) {
  const {
    focusedSlugRef,
    trailLensPropRef,
    trailBrushPropRef,
    panelHoverPropRef,
    hoveredNodeIdRef,
    drawnHoveredNodeIdRef,
    panelEmphasisNodeIdRef,
    cameraTweenRef,
    zoomEaseRef,
    reducedMotionRef,
    cameraRef,
    cameraTargetRef,
    dampingRef,
    overviewScaleRef,
    cameraAngularFreqRef,
    lastInputMsRef,
    ambientSleepDelayRef,
    selectedEdgeRef,
    pointerMachineRef,
    domeRuntimeRef,
    focusLeashPxRef,
    userDrivenCameraRef,
    clusteredIdsRef,
    emphasisRef,
    rippleStartRef,
    egoRevealRef,
    focusRampRef,
    growthReplayRef,
    growthReplayAppearRef,
    appearRef,
    tierRevealRef,
    drawnFarTRef,
    colorFocusRef,
    pulsesRef,
    realmDataRef,
    realmTransitionRef,
    realmParallaxDepth2Ref,
    realmParallaxDepth3Ref,
    realmParallaxRef,
    previousCameraCenterRef,
    lastZoomTierRef,
    onZoomTierChangeRef,
  } = sources;
  const result: CameraFrameResult = {
    focusedNodeId: null,
    trailLensActive: false,
    hoveredNodeId: null,
    panelEmphasisNodeId: null,
    camera: cameraRef.current,
    farT: 0,
    zoomRatio: 1,
  };
  const focusRampDt = createFocusRampClock();

  return function runCameraFrameStage(
    now: number,
    dt: number,
    tokens: OntologyMapTokens,
    world: TopologyWorld,
    width: number,
    height: number,
    previousDrawnAt = Number.NaN,
  ): CameraFrameResult {
    const requestedFocusId = focusedSlugRef.current;
    const focusedNodeId =
      requestedFocusId !== null && world.nodeById.has(requestedFocusId)
        ? requestedFocusId
        : null;
    // While focused, hover is nulled — focus owns emphasis exclusively. The
    // trail lens is the **only exception**: during the lens the cursor is
    // over the popover rather than the canvas, so it cannot compete with
    // canvas hover, and a row hover borrows the map's hover channel to brush
    // row ↔ node. Turning the lens off restores the original rule at once.
    const trailLensActive = trailLensPropRef.current?.current ?? false;
    const trailBrushNodeId = trailLensActive ? (trailBrushPropRef.current?.current ?? null) : null;
    // Side-panel hover (chat, data sheet) occupies the same slot as trail
    // brushing. Both exist only while the cursor is off the canvas, so they
    // cannot collide.
    const panelHoverNodeId = panelHoverPropRef.current?.current ?? null;
    const hoveredNodeId =
      trailBrushNodeId ?? panelHoverNodeId ?? (focusedNodeId ? null : hoveredNodeIdRef.current);
    // What the `__atlasMap.hover()` instrument reads: **exactly what this
    // frame used**. Exposing each channel's source ref separately would let a
    // check pass green on a state where the value is right and the screen is
    // not.
    drawnHoveredNodeIdRef.current = hoveredNodeId;
    // While focused, `isNodeEmphasisActive` reads only this value, and the hover ring alpha rides that
    // ramp (`ringAlpha = hoverEmphasis ?? 1`), so the panel hover ref must feed it too.
    const panelEmphasisNodeId = focusedNodeId
      ? (panelEmphasisNodeIdRef.current ?? panelHoverNodeId)
      : null;

    // Cubic camera transition tween. While one is in flight it drives this
    // frame's camera directly and skips the physics step's spring
    // (`freezeCamera`). Reduced-motion drops the tween and delegates to the
    // spring/snap path. On completion it snaps to the final value and
    // clears, so later frames find the spring already at rest on target.
    let freezeCamera = false;
    let altitudeScale: number | null = null;
    {
      const tween = cameraTweenRef.current;
      if (tween) {
        if (reducedMotionRef.current) {
          cameraTweenRef.current = null;
        } else {
          if (tween.altitude === "held-at-target") altitudeScale = tween.target.scale;
          const elapsed = now - tween.startMs;
          if (elapsed >= tween.durationMs) {
            cameraRef.current = {
              x: { value: tween.target.x, velocity: 0 },
              y: { value: tween.target.y, velocity: 0 },
              scale: { value: tween.target.scale, velocity: 0 },
            };
            cameraTweenRef.current = null;
          } else {
            /*
             * Passing the viewport width selects the van Wijk optimal path (`VAN_WIJK_RHO`, `camera-easing.ts`); without it the move
             * degrades to per-axis linear interpolation, a "lerp" sweep when a move and a zoom overlap.
             */
            const eased = easeCameraKeyframe(tween.start, tween.target, elapsed, tween.durationMs, width, tween.ease, tween.startSpeed);
            cameraRef.current = {
              x: { value: eased.x, velocity: 0 },
              y: { value: eased.y, velocity: 0 },
              scale: { value: eased.scale, velocity: 0 },
            };
            freezeCamera = true;
          }
        }
      }
    }
    {
      const zoom = zoomEaseRef.current;
      if (zoom !== null) {
        if (freezeCamera || zoom.target !== cameraTargetRef.current || pointerMachineRef.current.phase === "dragging") {
          zoomEaseRef.current = null;
        } else {
          const eased = easeAnchoredZoom(zoom, now, width, height);
          cameraRef.current = {
            x: { value: eased.x, velocity: 0 },
            y: { value: eased.y, velocity: 0 },
            scale: { value: eased.scale, velocity: 0 },
          };
          if (eased.done) zoomEaseRef.current = null;
          else freezeCamera = true;
        }
      }
    }

    // In 3D, leash the pan to the focused node's drawn place; aimed at a Neural fit, to the free area it fills.
    const domeFocus = (() => {
      const dome = domeRuntimeRef.current;
      if (dome === null || dome.rampClock <= 0 || focusedNodeId === null) return null;
      const off = dome.frame.get(focusedNodeId);
      const node = world.nodeById.get(focusedNodeId);
      if (!off || !node) return null;
      const anchor = { x: node.x + off.dx, y: node.y + off.dy };
      return domeFitFocusLeash(anchor, cameraTargetRef.current, cameraRef.current.scale.value) ?? { anchor, leashPx: null };
    })();
    const { camera, farT, zoomRatio } = stepTopologyPhysics({
      world,
      camera: cameraRef.current,
      target: cameraTargetRef.current,
      damping: dampingRef.current,
      overviewScale: overviewScaleRef.current,
      tokens,
      cameraAngularFrequency: cameraAngularFreqRef.current ?? tokens.cameraSpringAngFreqTransition,
      dt,
      rampDt: focusRampDt(`${focusedNodeId ?? ""}|${selectedEdgeRef.current ? `${selectedEdgeRef.current.sourceId}>${selectedEdgeRef.current.targetId}` : ""}`, dt, now, previousDrawnAt),
      now,
      // Ambient sleep factor multiplied into comet speed (1 awake, 0
      // asleep). Recomputed here because the idle-gate decision is in another
      // scope; it is pure arithmetic, so it costs nothing and returns the
      // same value for the same `now`/`lastInputMs`.
      ambientFactor: ambientSleepFactor(now, lastInputMsRef.current, ambientSleepDelayRef.current),
      focusedNodeId,
      pairFocusActive: selectedEdgeRef.current !== null,
      hoveredNodeId,
      panelEmphasisNodeId,
      isDragging: pointerMachineRef.current.phase === "dragging",
      // In 3D, anchor the pan leash to the drawn dome bounds and focused node, not the 2D `world.bounds`.
      worldBoundsOverride:
        domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
          ? domeRuntimeRef.current.drawnBounds
          : null,
      focusAnchorOverride: domeFocus?.anchor ?? null,
      scaleMinOverride:
        domeRuntimeRef.current !== null && domeRuntimeRef.current.rampClock > 0
          ? domeRuntimeRef.current.fitScale
          : null,
      focusLeashPx: domeFocus?.leashPx ?? focusLeashPxRef.current,
      reducedMotion: reducedMotionRef.current,
      userDrivenCamera: userDrivenCameraRef.current,
      freezeCamera,
      altitudeScale,
      // This is the **previous frame's** collapsed set; this frame's is not
      // decided until the cluster stage below. Ramps are values over time, so
      // a one-frame lag is the correct behaviour — an expanded node ramps in
      // from 0 starting next frame, a collapsed one ramps for one more frame
      // — and reversing the order would gain nothing.
      clusteredIds: clusteredIdsRef.current,
      emphasisById: emphasisRef.current,
      rippleStartById: rippleStartRef.current,
      egoRevealById: egoRevealRef.current,
      focusRampById: focusRampRef.current,
      appearById: growthReplayRef.current !== null ? growthReplayAppearRef.current : appearRef.current,
      tierReveal: tierRevealRef.current,
    });
    drawnFarTRef.current = farT;
    cameraRef.current = camera;

    // Click-focus signature — refresh the retained color focus. While a
    // selection is live, mirror it; after a deselect, hold the last focus so
    // the color fade has a dim/ego target to ease from, clearing only once the
    // retained subject's ramp has decayed (~160ms) — then the selection ring
    // and background dim have fully faded out (④·⑨). Reduced motion snaps the
    // ramp to 0 the same frame, so this clears immediately too.
    {
      const livePairFocus = selectedEdgeRef.current;
      if (focusedNodeId !== null || livePairFocus !== null) {
        colorFocusRef.current = { focusedNodeId, selectedEdge: livePairFocus };
      } else if (colorFocusRef.current !== null) {
        const retained = colorFocusRef.current;
        const probeId =
          retained.focusedNodeId ?? retained.selectedEdge?.sourceId ?? retained.selectedEdge?.targetId ?? null;
        const retainedRamp = probeId !== null ? (focusRampRef.current.get(probeId) ?? 0) : 0;
        if (retainedRamp < 0.02) colorFocusRef.current = null;
      }
    }

    // Drop hover pulses past their 420 ms lifetime. Firing (appending) is
    // done by the pointer handlers' hover path.
    pulsesRef.current = updatePulses(pulsesRef.current, now);

    // Depth parallax step: while a realm is active the per-band offsets are charged from the camera's frame delta and decay
    // exponentially to 0 when it stops (tau 0.18 s, ending inside the 1200 ms idle grace); reduced motion holds them at 0. The
    // entering dolly-in is programmatic and excluded, with the centre kept in sync so entering `active` makes no delta spike.
    {
      const realmActive =
        realmDataRef.current !== null &&
        realmTransitionRef.current.phase === "active" &&
        !reducedMotionRef.current;
      const previousC = previousCameraCenterRef.current;
      if (realmActive && previousC) {
        const delta = { x: camera.x.value - previousC.x, y: camera.y.value - previousC.y };
        const depthById = realmDataRef.current!.depthById;
        realmParallaxDepth2Ref.current = stepDepthParallax(
          realmParallaxDepth2Ref.current,
          delta,
          depthParallaxFactorForDepth(2),
          dt,
        );
        realmParallaxDepth3Ref.current = stepDepthParallax(
          realmParallaxDepth3Ref.current,
          delta,
          depthParallaxFactorForDepth(3),
          dt,
        );
        const d2 = realmParallaxDepth2Ref.current;
        const d3 = realmParallaxDepth3Ref.current;
        realmParallaxRef.current =
          isDepthParallaxActive(d2) || isDepthParallaxActive(d3)
            ? { depthById, depth2: d2, depth3: d3 }
            : null;
      } else {
        realmParallaxDepth2Ref.current = ZERO_PARALLAX;
        realmParallaxDepth3Ref.current = ZERO_PARALLAX;
        realmParallaxRef.current = null;
      }
      previousCameraCenterRef.current = { x: camera.x.value, y: camera.y.value };
    }

    // Emit the semantic-zoom tier only when it changes, on the draw pass's reveal bands so the readout and the visible nodes cannot contradict.
    // Suppressed during a realm transition: `onZoomTierChange` is a HomePage setState and the dolly crosses tier boundaries repeatedly
    // (a 125 ms hitch measured on perf-realm); once settled the comparison below emits the final tier once.
    const realmTransitioning =
      realmTransitionRef.current.phase === "entering" || realmTransitionRef.current.phase === "exiting";
    const nextZoomTier = lastDialFrame()?.tier ?? classifyZoomTier(zoomRatio, tierRevealRef.current);
    if (!realmTransitioning && nextZoomTier !== lastZoomTierRef.current) {
      lastZoomTierRef.current = nextZoomTier;
      onZoomTierChangeRef.current?.(nextZoomTier);
    }

    // Density gate: this frame's collapsed/chip state from the live positions, so a chip follows its dragged parent; the decision logic is the pure model in `density-gate.ts`.
    // The realm root counts as expanded (collapsing its children leaves the realm an empty ring) and is read from the ref, not the prop: a stale closure missed the expansion.

    result.focusedNodeId = focusedNodeId;
    result.trailLensActive = trailLensActive;
    result.hoveredNodeId = hoveredNodeId;
    result.panelEmphasisNodeId = panelEmphasisNodeId;
    result.camera = camera;
    result.farT = farT;
    result.zoomRatio = zoomRatio;
    return result;
  };
}
