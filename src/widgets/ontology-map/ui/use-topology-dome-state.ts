"use client";

import type { MapArrangement } from "@/shared/lib/appearance-preferences";
import {
  useRef
} from "react";
import type { CameraTarget } from "../engine/camera";
import {
  type DomeModelBuild,
  type DomeRuntime,
  type DomeViewKind
} from "../model/dome-view";
import { type GalaxyLayout } from "../model/galaxy-layout";
import {
  type TierLegendPlacement
} from "../model/tier-legend-rows";

interface Dependencies {
  view3d: boolean;
  galaxy: boolean;
  mapArrangement: MapArrangement;
  onDomeTierAnchorsChange: ((anchors: readonly { kind: DomeViewKind; y: number; }[] | null) => void) | undefined;
  onTierLegendPlacementChange: ((placement: TierLegendPlacement) => void) | undefined;
}

/** Own 3D model assembly, Galaxy handoffs, and deferred dome intents. */
export function useTopologyDomeState({
  view3d,
  galaxy,
  mapArrangement,
  onDomeTierAnchorsChange,
  onTierLegendPlacementChange,
}: Dependencies) {

  /** 3D view target — mirrored because draw reads it per frame and hit-testing reads it per event. */
  const view3dRef = useRef<boolean>(view3d);

  const galaxyRef = useRef<boolean>(galaxy);

  const galaxyEnteredAtRef = useRef<number>(0);

  /** Sampled once per Galaxy entry; every meteor frame hashes this stable seed. */
  const galaxyAtmosphereSeedRef = useRef<number>(0);

  /** Stable Galaxy positions for the current graph, shared with fit and backdrop. */
  const galaxyLayoutRef = useRef<GalaxyLayout | null>(null);

  /** The live Flat coordinates to restore after leaving Galaxy. */
  const galaxyFlatReturnPositionsRef = useRef<ReadonlyMap<string, { x: number; y: number; }> | null>(null);

  /** Which mode owns the active coordinate homing transition. */
  const galaxyLayoutHandoffRef = useRef<"galaxy" | "flat" | null>(null);

  /** The last camera intent in each 2D mode, restored when that mode is chosen again. */
  const galaxyModeCameraRef = useRef<{
    flat: { target: CameraTarget; userDriven: boolean; } | null;
    galaxy: { target: CameraTarget; userDriven: boolean; } | null;
  }>({ flat: null, galaxy: null });

  /** Flat camera move waits for its coordinates, so the sky never shrinks around scattered stars. */
  const pendingFlatCameraRef = useRef<{
    target: CameraTarget;
    overviewScale: number;
    gestureRevision: number;
    userDriven: boolean;
  } | null>(null);

  /**
   * How far the galaxy view has come, 0 (flat) to 1 (sky).
   *
   * A ramp rather than the boolean, so switching views crossfades instead of cutting — the same
   * `stepFocusRamp` and the same token the trail lens and the spotlight already use, because a
   * fourth easing for the same kind of change is a fourth thing to keep in agreement.
   */
  const galaxyRampRef = useRef<number>(galaxy ? 1 : 0);

  const neuralRampRef = useRef<number>(0);

  /**
   * Arrangement mirror, read by the draw loop. On change an effect below drops
   * the dome model so the next frame rebuilds it at the new angle; height and
   * camera are untouched.
   */
  const mapArrangementRef = useRef<MapArrangement>(mapArrangement);

  /**
   * Dome runtime (`model/dome-view.ts#DomeRuntime`) — one box holding the
   * model, pose (yaw/pitch), inertia, assembly clock, and this frame's
   * projection map. The loop updates it each frame; the pointer handlers
   * (orbit, flat drag, hit-testing) and the instrumentation read the same box.
   */
  const domeRuntimeRef = useRef<DomeRuntime | null>(null);

  /** Which world the dome model was computed from — a different world forces a relayout. */
  const domeWorldSourceRef = useRef<unknown>(null);

  /**
   * The **in-progress, time-sliced** dome model build for the first 3D frame
   * (measured 2026-08-19).
   *
   * Relaxing the coupled cloud placement is O(n²) × iterations, ~350 ms at
   * 2,000 nodes, and running `buildDomeModel` synchronously started boot with a
   * **single-frame hitch of 346–368 ms**. Now each frame advances only
   * `DOME_BUILD_SLICE_MS` and resumes on the next. Nothing is drawn until the
   * build completes, so the screen shows what the synchronous hitch showed
   * anyway (an empty canvas on boot, the last 2D frame on a mid-session toggle)
   * while input and timers stay alive. Slicing preserves the floating-point
   * operation order, so the result is **bit-identical**.
   *
   * `world`/`arrangement` are recorded alongside: a world swap or arrangement
   * change mid-slice makes this build stale input, and it is restarted.
   */
  const domeModelBuildRef = useRef<{
    world: unknown;
    arrangement: string;
    build: DomeModelBuild;
  } | null>(null);

  /**
   * Pending 3D reframe on selection: written by the focus effect, consumed by
   * the loop's dome step. At effect time the world may still be rebuilding (a
   * selection also expands ancestor clusters), so computing it there fails
   * silently. The loop always holds the live world, so the next dome frame
   * handles it for certain.
   */
  const domeFocusPendingRef = useRef<{ slug: string | null; } | null>(null);

  /** One-shot after 3D turns on: cinematically fit the camera to the dome bbox. Turning it off leaves the camera alone. */
  const domeFitPendingRef = useRef(false);

  /**
   * Duration for the next dome fit tween (ms), set together with
   * `domeFitPendingRef`: the assembly length on entry, the morph length on an
   * arrangement refit. Undefined falls back to the 2D transition rule.
   */
  const domeFitDurationRef = useRef<number | undefined>(undefined);

  /**
   * Debt to refit the 2D overview after 3D turns off — written by the `view3d`
   * effect, paid by the loop's dome step **once teardown has finished**.
   * Fitting while the ramp is still running would frame mid-morph coordinates.
   */
  const flatFitPendingRef = useRef(false);

  const onDomeTierAnchorsChangeRef = useRef<typeof onDomeTierAnchorsChange>(onDomeTierAnchorsChange);

  /** The legend row under the pointer — that plane's ring is raised for as long as it is set. */
  const domeTierRaisedKindRef = useRef<DomeViewKind | null>(null);

  /** The last anchor set handed out — the change filter's memory, never read by the draw. */
  const domeTierAnchorsSentRef = useRef<{ kind: DomeViewKind; y: number; }[] | null>(null);

  const onTierLegendPlacementChangeRef = useRef<typeof onTierLegendPlacementChange>(onTierLegendPlacementChange);

  /**
   * The placement last published, so the legend re-renders on a change and not on
   * a frame. `null` = nothing published yet.
   */
  const tierLegendPlacementSentRef = useRef<TierLegendPlacement | null>(null);

  /**
   * The panel obstruction the last fit measured, reused by the per-frame
   * placement check so it does not read the DOM on every frame. `null` until the
   * first fit, when the token insets stand in.
   */
  const domeFitInsetsRef = useRef<{ left: number; right: number; } | null>(null);
  return {
    view3dRef, galaxyRef, galaxyEnteredAtRef, galaxyAtmosphereSeedRef, galaxyLayoutRef,
    galaxyFlatReturnPositionsRef, galaxyLayoutHandoffRef, galaxyModeCameraRef, pendingFlatCameraRef,
    galaxyRampRef, neuralRampRef, mapArrangementRef, domeRuntimeRef, domeWorldSourceRef, domeModelBuildRef,
    domeFocusPendingRef, domeFitPendingRef, domeFitDurationRef, flatFitPendingRef, onDomeTierAnchorsChangeRef,
    domeTierRaisedKindRef, domeTierAnchorsSentRef, onTierLegendPlacementChangeRef, tierLegendPlacementSentRef,
    domeFitInsetsRef,
  };
}
