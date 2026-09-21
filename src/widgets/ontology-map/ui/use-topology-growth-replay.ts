"use client";

import {
  useEffect,
  type RefObject
} from "react";
import type { CameraTarget } from "../engine/camera";
import {
  type DomeRuntime
} from "../model/dome-view";
import { createGrowthReplay, type GrowthReplay } from "../model/growth-replay";
import { computeZoomRatio, nodeTierAlpha, type TierRevealConfig } from "../model/tier-visibility";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
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
   * **The replay is a toggle, not a hold** (owner, 2026-09-07: *"nobody keeps the
   * mouse still after pressing a button; make the button show an active state
   * while it runs and stop on a second press."*).
   *
   * It used to end on the first input after a 300 ms grace, which meant the
   * pointer drifting one pixel, a hover, or a wheel notch killed a twelve-second
   * event the person had just asked for. This narrows the 2026-09-02 rule
   * ("ends on its own or on the first input", `docs/DECISIONS.md`) to four
   * **deliberate** exits, all of them routed through `endGrowthReplay`:
   *
   * | Exit | Where |
   * |---|---|
   * | a second press of the control | this effect, below |
   * | `Escape` | the window keydown effect beside this one |
   * | any press on the canvas — a node, the ground, or the start of a drag | the `pointerdown` effect beside this one |
   *
   * **Pointer movement, hover and wheel-zoom keep it running.** Wheel could
   * equally have been an exit; it is not, because the wheel is how a reader
   * leans in to watch something appear, and taking the picture away for that is
   * the same defect in a smaller form. Zooming during a replay is harmless — the
   * replay drives appear ramps only and never touches the camera after its
   * opening fit.
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
     * Schedule only what the screen will actually show. In 2D the density gate
     * hides elements at overview altitude, and a replay paced over 125 nodes of
     * which 36 are visible spent most of its twelve seconds on nothing
     * (measured 2026-09-02: one visible birth per second). The tier alpha is
     * read at the **fit target** scale, since that is where the camera is
     * heading; the cone tree draws every tier, so 3D keeps them all.
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
   * A press on the canvas ends it — the reader reached for the map, which is the
   * one gesture that says "show me this instead of that". One listener rather
   * than a wrapper per callback, because the callbacks do not cover the ground:
   * `onPaneClick` fires only when there is a selection to clear, so a click on
   * empty space with nothing selected reached nothing (measured 2026-09-07). A
   * press also opens every drag, so this covers panning and node dragging too.
   *
   * `pointerdown`, not `click`: the replay should stop the moment the map is
   * touched, not when the button comes back up at the end of a long drag.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onDown = () => endGrowthReplay();
    canvas.addEventListener("pointerdown", onDown);
    return () => canvas.removeEventListener("pointerdown", onDown);
  }, [canvasRef, endGrowthReplay]);

}
