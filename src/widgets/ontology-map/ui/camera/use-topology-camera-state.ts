"use client";

import { useRef } from "react";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import { type CameraTween, type ZoomEase } from "../../model/camera/camera-easing";
import type { SelectionCamera } from "../../model/camera/flat-selection-camera";
import {
  type ViewportReframeMotion
} from "./use-topology-viewport-lifecycle";

interface Dependencies {
  constellationFocusId: string | null;
    relayoutToken: number;
  fitViewToken: number;
  overviewFit: "full" | "spine";
}

/** Own camera axes, navigation intents, and fit bookkeeping. */
export function useTopologyCameraState({
  constellationFocusId, relayoutToken, fitViewToken, overviewFit, }: Dependencies) {
    const cameraRef = useRef<CameraAxes>({
        x: { value: 0, velocity: 0 },
        y: { value: 0, velocity: 0 },
        scale: { value: 1, velocity: 0 },
    });
    const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });
    /** Camera context paired with an explicit saved-constellation focus. */
    const constellationCameraRef = useRef<{
    returnTarget: CameraTarget;
    dataSourceKey: string | null;
  } | null>(null);

  const previousConstellationFocusIdRef = useRef<string | null>(constellationFocusId);

  /**
   * WCAG 2.2 §2.3.3 — "who moved the camera last". Pointer-handler gestures
   * (wheel, pinch, pan, flick) set it true; every **programmatic** move in this
   * file (ego dive, fit, realm, initial snap) resets it to false.
   * `stepTopologyPhysics` uses it to confine the reduced-motion camera snap to
   * app-initiated moves: user-initiated zoom and pan are an explicit exception
   * in the standard, and cutting them teleports the whole viewport in one
   * frame, which is worse than the motion being removed.
   */
  const userDrivenCameraRef = useRef(false);

  /** Direct pan/zoom advances this; programmatic fits and rebuilds do not. */
  const cameraGestureRevisionRef = useRef(0);

  /**
   * The live cubic camera transition, or null.
   * Set by `beginCameraTween` on every programmatic move (focus dive, cluster
   * dive, fit/relayout); driven each frame in the rAF loop; cleared the instant
   * an interactive gesture (wheel/drag) takes over. Never set under
   * `prefers-reduced-motion` (the spring path snaps instead).
   */
  const cameraTweenRef = useRef<CameraTween | null>(null);

  const zoomEaseRef = useRef<ZoomEase | null>(null);

  const dampingRef = useRef(1.0);

  /**
   * Which spring angular frequency this frame's camera step uses; `null` until the first token read
   * (the rAF loop then uses `cameraSpringAngFreqTransition`). Set to `cameraSpringAngFreqInteractive`
   * on every live wheel tick; reset to the transition value by every programmatic camera move.
   */
  const cameraAngularFreqRef = useRef<number | null>(null);

  const overviewScaleRef = useRef(1);

  const hasInitializedRef = useRef(false);

  /**
   * The **source** the overview was last fitted to. When the world is rebuilt
   * with a different value, the initial fit runs once more (see the
   * `dataSourceKey` prop's comment).
   */
  const fittedDataSourceKeyRef = useRef<string | null>(null);

  /** The last drawn altitude, for `__atlasMap.altitude()`. The canvas has no DOM to read it from. */
  const drawnFarTRef = useRef(0);

  // The effect runs once on mount as well as on token change, and must not overwrite the initial
  // camera. The mount-time tokens are captured by a lazy initializer, which survives StrictMode's
  // double-invoke where a boolean ref does not; the effect skips while both tokens still equal them.
  const initialFitTokensRef = useRef({ relayout: relayoutToken, fitView: fitViewToken });

  // Starts empty so an initial deep-linked spotlight gets one fit. Afterwards the
  // processed token prevents unrelated renders from taking the camera again.
  const lastProcessedSpotlightFitTokenRef = useRef<number | null>(null);

  /*
   * Deferred fit for deep-linked sessions: with `?recent=` in the URL the token bumps once right
   * after mount, before the map has laid out, so the `!hasInitializedRef.current` guard returns and
   * the camera never moves. The fit is recorded as debt and paid where initialization completes.
   */
  const pendingSpotlightFitRef = useRef(false);

  const runSpotlightFitRef = useRef<(() => boolean) | null>(null);

  /** Latest function to reframe the current semantic state with the settled viewport size. */
  const reframeViewportRef = useRef<((motion: ViewportReframeMotion) => boolean) | null>(null);

  /** Has the camera already followed the new available area during the direction change? */
  const viewportCameraTrackedRef = useRef(false);

  // C1 B3 — same mount-skip pattern, but for the DEDICATED relayout-only
  // effect below (node-position homing), which must not fire on mount either.
  const initialRelayoutTokenRef = useRef(relayoutToken);

  /** What a panel covers on each side, refreshed wherever the camera measures it. */
  const panelInsetsRef = useRef<{ left: number; right: number; } | null>(null);

  /**
   * Which bbox the overview fit uses. The workbench (`"spine"`, default) draws only the spine tier on
   * entry; the gateway evidence section (`"full"`) draws every tier (`GATEWAY_TIER_REVEAL`).
   * `overviewScaleRef` must use the same bbox or entry zoomRatio stops being 1.
   */
  const overviewFitRef = useRef(overviewFit);

  const selectionCameraRef = useRef<SelectionCamera | null>(null);

  return {
    cameraRef, cameraTargetRef, constellationCameraRef,
    previousConstellationFocusIdRef, userDrivenCameraRef, cameraGestureRevisionRef, cameraTweenRef, zoomEaseRef,
    dampingRef, cameraAngularFreqRef, overviewScaleRef, hasInitializedRef, fittedDataSourceKeyRef,
    drawnFarTRef, initialFitTokensRef, lastProcessedSpotlightFitTokenRef, pendingSpotlightFitRef,
    runSpotlightFitRef, reframeViewportRef, viewportCameraTrackedRef, initialRelayoutTokenRef, panelInsetsRef,
    overviewFitRef, selectionCameraRef,
  };
}
