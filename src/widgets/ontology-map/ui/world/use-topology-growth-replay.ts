"use client";

import {
  useEffect,
  type RefObject
} from "react";
import type { CameraTarget } from "../../engine/camera";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import { createGrowthReplay, type GrowthReplay } from "../../model/ambient/growth-replay";
import { computeZoomRatio, nodeTierAlpha, type TierRevealConfig } from "../../model/visibility/tier-visibility";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { type TopologyWorld } from "./topology-world";

interface Dependencies {
  growthReplayToken: number;
  growthReplayTokenSeenRef: RefObject<number>;
  growthReplayRef: RefObject<GrowthReplay | null>;
  endGrowthReplay: () => void;
  worldRef: RefObject<TopologyWorld | null>;
  reducedMotionRef: RefObject<boolean>;
  runOverviewFit: () => void;
  cameraTargetRef: RefObject<CameraTarget>;
  overviewScaleRef: RefObject<number>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  tierRevealRef: RefObject<TierRevealConfig>;
  growthReplayAppearRef: RefObject<Map<string, number>>;
  lastActiveMsRef: RefObject<number>;
  onGrowthReplayingChangeRef: RefObject<((running: boolean) => void) | undefined>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

/** Start and cancel growth replays from controls, keyboard, and pointer input. */
export function useTopologyGrowthReplay({
  growthReplayToken,
  growthReplayTokenSeenRef,
  growthReplayRef,
  endGrowthReplay,
  worldRef,
  reducedMotionRef,
  runOverviewFit,
  cameraTargetRef,
  overviewScaleRef,
  domeRuntimeRef,
  clusteredIdsRef,
  tierRevealRef,
  growthReplayAppearRef,
  lastActiveMsRef,
  onGrowthReplayingChangeRef,
  canvasRef,
}: Dependencies) {

  /**
   * The replay is a toggle, not a hold. Deliberate exits, all through `endGrowthReplay`: a second
   * press of the control, `Escape`, any press on the canvas. Pointer move, hover and wheel keep it
   * running.
   */
  useEffect(() => {
    if (growthReplayToken === growthReplayTokenSeenRef.current) return;
    growthReplayTokenSeenRef.current = growthReplayToken;
    // A press while one runs is the second press: stop, and start nothing.
    if (growthReplayRef.current !== null) {
      endGrowthReplay();
      return;
    }
    const world = worldRef.current;
    if (!world || reducedMotionRef.current) return;
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return;
    // Fit first so the whole ontology is on screen while it grows; the fit tween
    // and the first nodes start on the same frame.
    runOverviewFit();
    const now = performance.now();
    /*
     * Schedule only what the screen will show: the density gate hides elements at overview altitude.
     * Tier alpha is read at the fit target scale, where the camera is heading; 3D draws every tier.
     */
    const zoomRatio = computeZoomRatio(cameraTargetRef.current.tscale, overviewScaleRef.current * tokens.overviewEntryRatio);
    const dome = domeRuntimeRef.current;
    const domeOn = dome !== null && dome.active;
    const clustered = clusteredIdsRef.current;
    const shown = world.nodes.filter(
      (n) => !clustered.has(n.id) && (domeOn || nodeTierAlpha(n.kind, n.isHub, zoomRatio, tierRevealRef.current) > 0.05),
    );
    growthReplayRef.current = createGrowthReplay(
      shown.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId })),
      now,
    );
    growthReplayAppearRef.current = new Map();
    lastActiveMsRef.current = now;
    onGrowthReplayingChangeRef.current?.(true);
  }, [cameraTargetRef, clusteredIdsRef, domeRuntimeRef, endGrowthReplay, growthReplayAppearRef, growthReplayRef, growthReplayToken, growthReplayTokenSeenRef, lastActiveMsRef, onGrowthReplayingChangeRef, overviewScaleRef, reducedMotionRef, runOverviewFit, tierRevealRef, worldRef]);

  // Esc — the app-wide "put this away" key, and the one exit that needs no
  // pointer. Registered only while a replay is in flight so it never competes
  // with the dismissal order that owns Esc the rest of the time.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || growthReplayRef.current === null) return;
      e.stopPropagation();
      endGrowthReplay();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [endGrowthReplay, growthReplayRef]);

  /**
   * A press on the canvas ends it. One listener, because `onPaneClick` fires only with a selection to
   * clear. `pointerdown`, not `click`, so it stops when the map is touched; a press opens every drag.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDown = () => endGrowthReplay();
    canvas.addEventListener("pointerdown", onDown);
    return () => canvas.removeEventListener("pointerdown", onDown);
  }, [canvasRef, endGrowthReplay]);

}
