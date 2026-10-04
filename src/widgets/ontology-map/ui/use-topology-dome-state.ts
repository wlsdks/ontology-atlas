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
import { type TierNameAnchor } from "../model/tier-names";
interface Dependencies {
    view3d: boolean;
  mapArrangement: MapArrangement;
  onDomeTierAnchorsChange: ((anchors: readonly TierNameAnchor[] | null) => void) | undefined;
}


export function useTopologyDomeState({
  view3d, mapArrangement, onDomeTierAnchorsChange, }: Dependencies) {
    /** 3D view target — mirrored because draw reads it per frame and hit-testing reads it per event. */
    const view3dRef = useRef<boolean>(view3d);

  /** Flat camera move waits for its coordinates, so the sky never shrinks around scattered stars. */
  const pendingFlatCameraRef = useRef<{
    target: CameraTarget;
    overviewScale: number;
    gestureRevision: number;
    userDriven: boolean;
  } | null>(null);

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
   * The **in-progress, time-sliced** dome model build: each frame with 3D on advances
   * only `DOME_BUILD_SLICE_MS`, it waits while 3D is off, and one that settles on screen
   * is drawn meanwhile.
   * `world`/`arrangement` are recorded alongside: a world swap or arrangement
   * change mid-slice makes this build stale input, and it is restarted.
   */
  const domeModelBuildRef = useRef<{
    world: unknown;
    arrangement: string;
    build: DomeModelBuild;
    settlesOnScreen: boolean;
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

  /**
   * The tier names last handed out — the change filter's memory, and the boxes the
   * next frame's concept names give way to (`model/tier-names.ts`).
   */
  const domeTierAnchorsSentRef = useRef<TierNameAnchor[] | null>(null);

  /**
   * Each tier name's rendered width by kind, measured by the names themselves
   * (`OntologyMapTierLegend`). Empty while they are not on screen, which places none.
   */
  const domeTierNameWidthsRef = useRef<Readonly<Record<string, number>>>({});

  /**
   * The chrome the last fit measured on each side of the canvas, reused by the
   * per-frame name placement so it does not read the DOM on every frame. `null`
   * until the first fit, when the token insets stand in.
   */
  const domeFitInsetsRef = useRef<{ left: number; right: number; top: number; bottom: number; } | null>(null);
  return {
    view3dRef,
        pendingFlatCameraRef, neuralRampRef, mapArrangementRef, domeRuntimeRef, domeWorldSourceRef, domeModelBuildRef,
    domeFocusPendingRef, domeFitPendingRef, domeFitDurationRef, flatFitPendingRef, onDomeTierAnchorsChangeRef,
    domeTierRaisedKindRef, domeTierAnchorsSentRef, domeTierNameWidthsRef,
    domeFitInsetsRef,
  };
}
