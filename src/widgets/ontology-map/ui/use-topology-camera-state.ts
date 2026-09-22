"use client";

import {
  useEffect,
  useRef
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import { type CameraTween } from "../model/camera-easing";
import {
  type ViewportReframeMotion
} from "./use-topology-viewport-lifecycle";

interface Dependencies {
  constellationFocusId: string | null;
  galaxy: boolean;
  relayoutToken: number;
  fitViewToken: number;
  overviewFit: "full" | "spine";
}

/** Own camera axes, navigation intents, and fit bookkeeping. */
export function useTopologyCameraState({
  constellationFocusId,
  galaxy,
  relayoutToken,
  fitViewToken,
  overviewFit,
}: Dependencies) {

  const cameraRef = useRef<CameraAxes>({
    x: { value: 0, velocity: 0 },
    y: { value: 0, velocity: 0 },
    scale: { value: 1, velocity: 0 },
  });

  const cameraTargetRef = useRef<CameraTarget>({ tx: 0, ty: 0, tscale: 1 });

  /** Galaxy focus approach and the exact camera context it must yield back to. */
  const galaxyInspectionCameraRef = useRef<{
    returnTarget: CameraTarget;
    focusTarget: CameraTarget;
    gestureRevision: number;
  } | null>(null);

  /** Camera context paired with an explicit saved-constellation focus. */
  const constellationCameraRef = useRef<{
    returnTarget: CameraTarget;
    dataSourceKey: string | null;
  } | null>(null);

  const previousConstellationFocusIdRef = useRef<string | null>(constellationFocusId);

  useEffect(() => {
    if (!galaxy) galaxyInspectionCameraRef.current = null;
  }, [galaxy]);

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

  const dampingRef = useRef(1.0);

  /**
   * Dive-zoom fix. Owner: "Zooming in and out feels slow." Which spring angular frequency
   * this frame's camera step uses. `null` until the first token read (the rAF
   * loop falls back to `cameraSpringAngFreqTransition` for that first frame).
   * Set to `cameraSpringAngFreqInteractive` on every live wheel tick
   * (`topology-pointer-handlers.ts#handleWheel`); reset to
   * `cameraSpringAngFreqTransition` by every PROGRAMMATIC camera move below
   * (initial snap, fit/relayout, focus dive/deselect) so that move's whole
   * settle plays out at the cinematic rate, not whatever the last wheel tick
   * left behind.
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

  // `useEffect(fn, [relayoutToken, fitViewToken])` also fires once on mount
  // (standard React behaviour, not only on token change). That used to be
  // harmless because it recomputed the same tight-bounding fit target
  // `trySnapInitialCamera` had just set. Once the initial camera deliberately
  // started at the *simplified* overview scale (`computeOverviewCameraTarget`),
  // the same mount-time fire immediately overwrote it back to the tight fit and
  // the reduced-density fix never visibly took effect.
  //
  // Captured through a lazy initializer, which runs exactly once even under
  // StrictMode's dev-only double-invoke of effects. A plain "have I run before"
  // boolean ref does NOT survive that double-invoke, because the
  // mount/cleanup/remount cycle flips it back and forth. The effect below skips
  // while both tokens still equal their captured mount-time values — i.e. no
  // real fit-view or relayout click has happened yet.
  const initialFitTokensRef = useRef({ relayout: relayoutToken, fitView: fitViewToken });

  // Starts empty so an initial deep-linked spotlight gets one fit. Afterwards the
  // processed token prevents unrelated renders from taking the camera again.
  const lastProcessedSpotlightFitTokenRef = useRef<number | null>(null);

  /*
   * **Deferred fit** for deep-linked sessions (2026-08-02, caught by the motion
   * seat's audit).
   *
   * Mounting with `?recent=` already in the URL bumps the token **once, right
   * after mount** — at which point the map has not laid out yet, so the guard
   * below (`!hasInitializedRef.current`) returns silently. The token never
   * changes again, so the camera **never moves**: someone arriving from the
   * history screen lands on the default overview with the spotlit node
   * off-screen, which is the exact symptom this was meant to fix.
   *
   * So instead of dropping the fit when it cannot run, record it as debt and
   * pay it once where initialization completes.
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
   * Which bbox the overview fit uses. The workbench (`"spine"`, the default)
   * draws only the spine tier on entry, so the spine bbox is the honest frame;
   * the gateway's evidence section (`"full"`) draws every tier from entry via
   * `GATEWAY_TIER_REVEAL`, so the all-node bbox is. Measured 2026-08-18 at 1512
   * on the gateway: drawing every tier while fitting the spine bbox left 143 px
   * empty above the frame and 17 px below, because the graph's mass sits below
   * the spine centre — the owner's "It sits too low."
   *
   * Labels are not in the bbox; bottom clearance stays with
   * `OVERVIEW_LABEL_BOTTOM_ALLOWANCE` in `topology-camera-math`. The
   * `overviewScaleRef` anchor must use the same bbox or the entry zoomRatio
   * stops being 1 — same contract as the warning in `trySnapInitialCamera`.
   *
   * A ref plus a module-level function, because lint blocks ref writes during
   * render and component-local functions in effect deps, while a ref read and
   * a pure function outside the hook trip neither.
   *
   * The ref follows the prop. It was once "frozen at mount" because both
   * consumers passed a literal; the map now passes `full` while expand-all is
   * on, and a frozen `spine` sent auto-arrange and the `0` key back to the
   * spine bounds with 19 of 125 expanded nodes off screen (measured
   * 2026-09-03). Expand-all itself was unaffected because its own refit reads
   * the prop, which is how the two fits came to disagree.
   */
  const overviewFitRef = useRef(overviewFit);

  return {
    cameraRef, cameraTargetRef, galaxyInspectionCameraRef, constellationCameraRef,
    previousConstellationFocusIdRef, userDrivenCameraRef, cameraGestureRevisionRef, cameraTweenRef,
    dampingRef, cameraAngularFreqRef, overviewScaleRef, hasInitializedRef, fittedDataSourceKeyRef,
    drawnFarTRef, initialFitTokensRef, lastProcessedSpotlightFitTokenRef, pendingSpotlightFitRef,
    runSpotlightFitRef, reframeViewportRef, viewportCameraTrackedRef, initialRelayoutTokenRef, panelInsetsRef,
    overviewFitRef,
  };
}
