"use client";

import {
  useEffect,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import {
  realmTransitionReducer,
  type RealmTransitionState
} from "../model/realm-transition";
import type { WardingFitState } from "../model/realm-warding-fit";
import { initHomeSpring, type HomeSpringState } from "../model/relayout-home";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import {
  overviewBoundsFor
} from "./topology-overview-fit";
import type { NodeDragState } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { buildRealmRuntimeData, realmCameraTarget, type RealmRuntimeData } from "./topology-realm-runtime";
import { type TopologyWorld } from "./topology-world";

interface Dependencies {
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

  // --- Realm entry/exit: a `realmRootId` change relays out the subtree and
  // starts the transition choreography. Entering re-lays the subtree around
  // that node as a temporary root, FLIPs the members, flings the outsiders away
  // under gravity, and dollies the camera into the warding ring. Exiting
  // returns every node on its home spring (reusing the relayout homing) and
  // fits the camera to the overview. The only new motion contract is
  // realm-transition's FLIP and fling; the exit rides the proven homing path.
  useEffect(() => {
    if (realmRootId === prevRealmRootIdRef.current) return;
    prevRealmRootIdRef.current = realmRootId;
    lastActiveMsRef.current = performance.now();

    const world = worldRef.current;
    const tokens = readOntologyMapTokensOrNull();
    const { width, height } = viewportRef.current;
    if (!world || !tokens) return;
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
      );
      if (!data) return;
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
        data.entryCamera = {
          tx: cameraRef.current.x.value,
          ty: cameraRef.current.y.value,
          tscale: cameraRef.current.scale.value,
        };
        const target = realmCameraTarget(data.bounds, tokens, width, height);
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
      // --- Exiting: a deterministic reverse playback of the entry — inside
      // nodes reverse-FLIP (deepest layer first) and outside nodes return
      // against reverse gravity. The realm data owns those coordinates, not the
      // home springs, so the frame loop's exiting step drives them. The camera
      // rides a 750 ms overview tween to stay in sync with the choreography. ---
      realmTransitionRef.current = realmTransitionReducer(realmTransitionRef.current, {
        type: "exit",
        now,
        reducedMotion: reduced,
      });
      // Physics is exclusive with a transition, so the sim is reseeded at home
      // coordinates and a drag right after the exit does not jump. Heat is 0
      // during the transition, so it does not tick.
      simRef.current = createForceSimulation(
        world.nodes.map((n) => ({ id: n.id, x: n.homeX, y: n.homeY })),
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
        homeTargetOverrideRef.current = null; // Exiting targets global home.
        homingActiveRef.current = true;
      } else {
        // The realm data owns the inside reverse-FLIP and the outside return,
        // so the home springs are off.
        homingActiveRef.current = false;
        homeSpringsRef.current.clear();
        homeTargetOverrideRef.current = null;
        // Members may have been dragged since the realm settled, so refresh the
        // reverse-FLIP origins (`insideTargets`) to the live coordinates and
        // the first exit frame does not jump.
        const data = realmDataRef.current;
        if (data) {
          const liveTargets = new Map<string, { x: number; y: number; }>();
          for (const [id, fallback] of data.insideTargets) {
            const n = world.nodeById.get(id);
            liveTargets.set(id, n ? { x: n.x, y: n.y } : fallback);
          }
          realmDataRef.current = { ...data, insideTargets: liveTargets };
        }
      }
      if (width > 0 && height > 0 && hasInitializedRef.current) {
        // Return to "where the user was looking" if entry saved a keyframe,
        // falling back to the overview fit.
        const savedEntry = realmDataRef.current?.entryCamera ?? null;
        const target = savedEntry ?? computeOverviewCameraTarget(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length);
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = false;
        overviewScaleRef.current = computeOverviewFitScale(overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current), width, height, tokens, world.nodes.length);
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        // 750 ms, matched to the choreography (inside reverse-FLIP 660,
        // outside return 650) — the same pattern as entry's 860.
        beginCameraTween(target, 750);
      }
    }
  }, [realmRootId, beginCameraTween, prevRealmRootIdRef, lastActiveMsRef, worldRef, viewportRef, reducedMotionRef, nodeDragRef, heatRef, dragAffectedSetRef, dragStartPosRef, dragTugOffsetsRef, realmActiveHandedOffRef, expandedParentsRef, realmDataRef, wardingFitRef, realmTransitionRef, homingActiveRef, homeSpringsRef, homeTargetOverrideRef, hasInitializedRef, cameraRef, dampingRef, cameraTargetRef, userDrivenCameraRef, cameraAngularFreqRef, simRef, overviewFitRef, clusteredIdsRef, overviewScaleRef]);

}
