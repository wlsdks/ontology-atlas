"use client";

import {
  useEffect,
  useRef,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import {
  type SpringOffset,
} from "../../expressive/release-offsets";
import { createForceSimulation, type ForceSimulation } from "../../model/layout/force-layout";
import {
  isRealmOutsideCulled,
  REALM_EXIT_OUTSIDE_RETURN_DELAY_MS,
  REALM_WARDING_DRAW_DELAY_MS,
  realmOutsideReturnAlpha,
  realmWardingDrawProgress,
  realmWardingEraseProgress,
  realmTransitionReducer,
  type RealmTransitionState
} from "../../model/realm/realm-transition";
import type { WardingFitState } from "../../model/realm/realm-warding-fit";
import { initHomeSpring, type HomeSpringState } from "../../model/layout/relayout-home";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "../camera/topology-camera-math";
import {
  overviewBoundsFor
} from "../camera/topology-overview-fit";
import type { NodeDragState } from "../input/topology-pointer-types";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { buildRealmRuntimeData, realmCameraTarget, type RealmRuntimeData } from "./topology-realm-runtime";
import { dialOverviewFit, type TopologyWorld } from "./topology-world";
import { readDialTokens } from "../../dial/tokens";
import { createMeasureText } from "../../dial/fit";
import { branchFocusTarget } from "../camera/branch-frame/target";
import type { DialLabels } from "../../dial/types";

interface Dependencies {
  view3d?: boolean;
  cameraTokens?: <T extends { safeInsetLeft: number; safeInsetRight: number }>(tokens: T) => T;
  dialLabels?: DialLabels | null;
  realmRootId: string | null;
  prevRealmRootIdRef: RefObject<string | null>;
  lastActiveMsRef: RefObject<number>;
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  reducedMotionRef: RefObject<boolean>;
  nodeDragRef: RefObject<NodeDragState | null>;
  heatRef: RefObject<number>;
  dragAffectedSetRef: RefObject<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>;
  dragStartPosRef: RefObject<{ x: number; y: number; } | null>;
  dragTugOffsetsRef: RefObject<Map<string, SpringOffset>>;
  realmActiveHandedOffRef: RefObject<boolean>;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  realmDataRef: RefObject<RealmRuntimeData | null>;
  wardingFitRef: RefObject<WardingFitState | null>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  homingActiveRef: RefObject<boolean>;
  homeSpringsRef: RefObject<Map<string, HomeSpringState>>;
  homeTargetOverrideRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  hasInitializedRef: RefObject<boolean>;
  cameraRef: RefObject<CameraAxes>;
  dampingRef: RefObject<number>;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  cameraAngularFreqRef: RefObject<number | null>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
  simRef: RefObject<ForceSimulation | null>;
  overviewFitRef: RefObject<"full" | "spine">;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  overviewScaleRef: RefObject<number>;
}

/** Coordinate realm entry, root switches, and return to overview. */
export function useTopologyRealmTransition({
  view3d = false, cameraTokens, dialLabels,
  realmRootId,
  prevRealmRootIdRef,
  lastActiveMsRef,
  worldRef,
  viewportRef,
  reducedMotionRef,
  nodeDragRef,
  heatRef,
  dragAffectedSetRef,
  dragStartPosRef,
  dragTugOffsetsRef,
  realmActiveHandedOffRef,
  expandedParentsRef,
  realmDataRef,
  wardingFitRef,
  realmTransitionRef,
  homingActiveRef,
  homeSpringsRef,
  homeTargetOverrideRef,
  hasInitializedRef,
  cameraRef,
  dampingRef,
  cameraTargetRef,
  userDrivenCameraRef,
  cameraAngularFreqRef,
  beginCameraTween,
  simRef,
  overviewFitRef,
  clusteredIdsRef,
  overviewScaleRef,
}: Dependencies) {
  const realmWorldRef = useRef<TopologyWorld | null>(null);

  // Realm motion owns coordinates until the transition hands them back to drag physics.
  useEffect(() => {
    const world = worldRef.current;
    const sameRoot = realmRootId === prevRealmRootIdRef.current;
    if (sameRoot && (realmRootId === null || (world === realmWorldRef.current && realmDataRef.current !== null && Boolean(realmDataRef.current.flat) === !view3d))) return;
    const savedEntry = realmDataRef.current?.entryCamera;
    const savedPositions = realmDataRef.current?.returnPositions;
    prevRealmRootIdRef.current = realmRootId;
    lastActiveMsRef.current = performance.now();

    const tokens = readOntologyMapTokensOrNull();
    const { width, height } = viewportRef.current;
    if (!world || !tokens) return;
    realmWorldRef.current = world;
    const now = performance.now();
    const reduced = reducedMotionRef.current;

    // A transition is exclusive with physics and homing, so in-flight state is
    // cleared — same contract as relayout.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    // A new transition (either direction) resets the coordinate-ownership handoff.
    realmActiveHandedOffRef.current = false;

    if (realmRootId !== null) {
      // --- Entering ---
      // The warding ring and framing use the members visible under the
      // expansion state at entry. The realm root is always treated as expanded,
      // because its direct children are the realm's spine.
      const data = buildRealmRuntimeData(
        world,
        realmRootId,
        tokens,
        new Set([...expandedParentsRef.current, realmRootId]),
        !view3d ? { tokens: readDialTokens(), labels: dialLabels ?? null, measureText: createMeasureText(), rememberOrder: false, memory: null } : undefined,
      );
      if (!data) return;
      data.returnPositions = savedPositions ?? new Map(world.nodes.map(n => [n.id, { x: n.x, y: n.y }]));
      realmDataRef.current = data;
      // New realm, so the warding ease resets and the first frame seeds by
      // snapping to the initial radius.
      wardingFitRef.current = null;
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "enter",
        rootId: realmRootId,
        now,
        reducedMotion: reduced,
      });
      // Homing is off during entry: the realm owns coordinates.
      homingActiveRef.current = false;
      homeSpringsRef.current.clear();
      homeTargetOverrideRef.current = null;
      // Camera: dolly in to the warding-ring fit, reusing the cubic tween.
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // Save "where the user was looking" as the keyframe to return to on
        // exit, taken from the camera just before entry. Only when the camera
        // has initialized — a deep-link mount keeps this null.
        data.entryCamera = savedEntry ?? {
          tx: cameraRef.current.x.value,
          ty: cameraRef.current.y.value,
          tscale: cameraRef.current.scale.value,
        };
        const measured = cameraTokens?.(tokens) ?? tokens;
        const target = branchFocusTarget(world, data.dial, realmRootId, measured, width, height, { positions: data.insideTargets, scopedCapability: data.flat })
          ?? realmCameraTarget(data.bounds, measured, width, height, data.dial?.overviewPadPx);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // The dolly-in spans the whole choreography (fling → FLIP → warding).
        // A distance-proportional short tween finishes the camera first, which
        // reads as a cut — confirmed on recorded review.
        beginCameraTween(target, 860);
      }
    } else {
      // Capture the live frame before changing phase; cancelling entry must not finish its fling.
      const data = realmDataRef.current;
      const previous = realmTransitionRef.current;
      if (data) {
        const elapsed = now - previous.startMs;
        data.exitSnapshot = {
          positions: new Map(world.nodes.map(n => [n.id, { x: n.x, y: n.y }])),
          outsideAlpha: previous.phase === "exiting"
            ? realmOutsideReturnAlpha(elapsed - REALM_EXIT_OUTSIDE_RETURN_DELAY_MS, undefined, data.exitSnapshot?.outsideAlpha)
            : isRealmOutsideCulled(previous, now) ? 0 : 1,
          wardingProgress: previous.phase === "exiting"
            ? realmWardingEraseProgress(elapsed, undefined, data.exitSnapshot?.wardingProgress)
            : previous.phase === "active" ? 1 : realmWardingDrawProgress(elapsed - REALM_WARDING_DRAW_DELAY_MS),
        };
      }
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "exit",
        now,
        reducedMotion: reduced,
      });
      // Physics is exclusive with a transition, so the sim is reseeded at home
      // coordinates and a drag right after the exit does not jump. Heat is 0
      // during the transition, so it does not tick.
      simRef.current = createForceSimulation(
        world.nodes.map((n) => ({ id: n.id, x: data?.returnPositions?.get(n.id)?.x ?? n.homeX, y: data?.returnPositions?.get(n.id)?.y ?? n.homeY })),
        world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      );
      if (reduced) {
        // Under reduced-motion, deliver the result without the journey: skip
        // the deterministic reverse playback and take the proven home-spring
        // snap path, where the frame loop's reduced homing block jumps straight
        // to homeX/homeY. Nodes are never mutated from inside an effect.
        const springs = new Map<string, HomeSpringState>();
        for (const node of world.nodes) springs.set(node.id, initHomeSpring(node.x, node.y));
        homeSpringsRef.current = springs;
        homeTargetOverrideRef.current = data?.returnPositions ?? null;
        homingActiveRef.current = true;
      } else {
        // The realm data owns the inside reverse-FLIP and the outside return,
        // so the home springs are off.
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
      }
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // Return to "where the user was looking" if entry saved a keyframe,
        // falling back to the overview fit.
        const savedEntry = realmDataRef.current?.entryCamera ?? null;
        const target = savedEntry ?? computeOverviewCameraTarget(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length, dialOverviewFit(world));
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length, dialOverviewFit(world));
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // 750 ms, matched to the choreography (inside reverse-FLIP 660,
        // outside return 650) — the same pattern as entry's 860.
        beginCameraTween(target, 750);
      }
    }
  });

}
