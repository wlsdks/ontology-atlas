"use client";

import {
  useEffect,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { type CameraTween } from "../model/camera-easing";
import { computeGalaxyLayout, type GalaxyLayout } from "../model/galaxy-layout";
import { initHomeSpring, type HomeSpringState } from "../model/relayout-home";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import {
  overviewFitTokens,
  overviewForPositionTargets
} from "./topology-overview-fit";
import type { NodeDragState } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { type TopologyWorld } from "./topology-world";

interface Dependencies {
  overviewFit: "spine" | "full";
  galaxyRef: RefObject<boolean>;
  galaxy: boolean;
  galaxyLayoutHandoffRef: RefObject<"flat" | "galaxy" | null>;
  galaxyModeCameraRef: RefObject<{ flat: { target: CameraTarget; userDriven: boolean; } | null; galaxy: { target: CameraTarget; userDriven: boolean; } | null; }>;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  pendingFlatCameraRef: RefObject<{ target: CameraTarget; overviewScale: number; gestureRevision: number; userDriven: boolean; } | null>;
  galaxyEnteredAtRef: RefObject<number>;
  galaxyAtmosphereSeedRef: RefObject<number>;
  worldRef: RefObject<TopologyWorld | null>;
  galaxyLayoutRef: RefObject<GalaxyLayout | null>;
  galaxyFlatReturnPositionsRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  nodeDragRef: RefObject<NodeDragState | null>;
  heatRef: RefObject<number>;
  dragAffectedSetRef: RefObject<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>;
  dragStartPosRef: RefObject<{ x: number; y: number; } | null>;
  dragTugOffsetsRef: RefObject<Map<string, SpringOffset>>;
  homeSpringsRef: RefObject<Map<string, HomeSpringState>>;
  homeTargetOverrideRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  homingActiveRef: RefObject<boolean>;
  lastActiveMsRef: RefObject<number>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  hasInitializedRef: RefObject<boolean>;
  overviewFitRef: RefObject<"full" | "spine">;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  overviewScaleRef: RefObject<number>;
  dampingRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  reducedMotionRef: RefObject<boolean>;
  cameraTweenRef: RefObject<CameraTween | null>;
  cameraRef: RefObject<CameraAxes>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
  cameraGestureRevisionRef: RefObject<number>;
}

/** Own reversible Galaxy/Flat coordinate and camera handoffs. */
export function useTopologyGalaxyTransition({
  overviewFit,
  galaxyRef,
  galaxy,
  galaxyLayoutHandoffRef,
  galaxyModeCameraRef,
  cameraTargetRef,
  userDrivenCameraRef,
  pendingFlatCameraRef,
  galaxyEnteredAtRef,
  galaxyAtmosphereSeedRef,
  worldRef,
  galaxyLayoutRef,
  galaxyFlatReturnPositionsRef,
  nodeDragRef,
  heatRef,
  dragAffectedSetRef,
  dragStartPosRef,
  dragTugOffsetsRef,
  homeSpringsRef,
  homeTargetOverrideRef,
  homingActiveRef,
  lastActiveMsRef,
  viewportRef,
  hasInitializedRef,
  overviewFitRef,
  expandedParentsRef,
  cameraTokens,
  overviewScaleRef,
  dampingRef,
  cameraAngularFreqRef,
  reducedMotionRef,
  cameraTweenRef,
  cameraRef,
  beginCameraTween,
  cameraGestureRevisionRef,
}: Dependencies) {
  useEffect(() => { overviewFitRef.current = overviewFit; }, [overviewFit, overviewFitRef]);

  // Synced in an effect, not during render: the loop reads this ref on its own clock, and
  // writing a ref while rendering is the one way to make those two disagree.
  useEffect(() => {
    if (galaxyRef.current === galaxy) return;
    const previousHandoff = galaxyLayoutHandoffRef.current;
    if (galaxy) {
      // A reversal while Flat coordinates are still returning is still the
      // same Galaxy departure. Do not overwrite the person's saved Flat view
      // with the temporarily held Galaxy camera.
      if (previousHandoff !== "flat") {
        galaxyModeCameraRef.current.flat = {
          target: { ...cameraTargetRef.current },
          userDriven: userDrivenCameraRef.current,
        };
      }
      pendingFlatCameraRef.current = null;
    } else {
      galaxyModeCameraRef.current.galaxy = {
        target: { ...cameraTargetRef.current },
        userDriven: userDrivenCameraRef.current,
      };
    }
    galaxyRef.current = galaxy;
    if (galaxy) {
      galaxyEnteredAtRef.current = performance.now();
      galaxyAtmosphereSeedRef.current = Math.random();
    }
    const world = worldRef.current;
    const tokens = readOntologyMapTokensOrNull();
    if (!world || !tokens) return;

    const layout = computeGalaxyLayout(
      world.nodes.map((node) => ({ id: node.id, kind: node.kind, parentId: node.parentId })),
      {
        domain: tokens.layoutRingDomain,
        capability: tokens.layoutRingCapability,
        element: tokens.layoutRingElement,
      },
    );
    galaxyLayoutRef.current = layout;
    if (galaxy && galaxyFlatReturnPositionsRef.current === null) {
      galaxyFlatReturnPositionsRef.current = new Map(
        world.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
    }
    const targets = galaxy
      ? layout.points
      : galaxyFlatReturnPositionsRef.current ??
      new Map(world.nodes.map((node) => [node.id, { x: node.homeX, y: node.homeY }]));

    // A view transition owns coordinates until it settles. Clear drag/force
    // state first so the hand and the transition never fight over one node.
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      if (targets.has(node.id)) springs.set(node.id, initHomeSpring(node.x, node.y));
    }
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = targets;
    homingActiveRef.current = springs.size > 0;
    galaxyLayoutHandoffRef.current = galaxy ? "galaxy" : "flat";
    lastActiveMsRef.current = performance.now();

    // Galaxy can travel with its already-known sky frame. Flat deliberately
    // waits for its coordinates: fitting the final Flat bounds while stars are
    // still scattered across the Galaxy made the interim frame look tiny and
    // empty. Once the nodes arrive, `finishGalaxyLayoutHandoff` starts the
    // stored Flat camera move.
    const { width, height } = viewportRef.current;
    if (width > 0 && height > 0 && hasInitializedRef.current) {
      const flatOverview = galaxy
        ? null
        : overviewForPositionTargets(
          overviewFitRef.current,
          world,
          tokens,
          targets,
          expandedParentsRef.current,
        );
      const measuredTokens = overviewFitTokens(cameraTokens(tokens), galaxy);
      const fitBounds = galaxy ? layout.bounds : flatOverview!.bounds;
      // The small-graph clamp counts the vault, as every other overview fit does; a
      // count of the drawn spine put five-domain vaults under it on this path alone.
      const nodeCount = world.nodes.length;
      const fittedTarget = computeOverviewCameraTarget(
        fitBounds,
        width,
        height,
        measuredTokens,
        nodeCount,
      );
      const savedCamera = galaxy
        ? galaxyModeCameraRef.current.galaxy
        : galaxyModeCameraRef.current.flat;
      const target = savedCamera?.target ?? fittedTarget;
      const overviewScale = computeOverviewFitScale(
        fitBounds,
        width,
        height,
        measuredTokens,
        nodeCount,
      );
      if (galaxy) {
        overviewScaleRef.current = overviewScale;
        cameraTargetRef.current = target;
        userDrivenCameraRef.current = savedCamera?.userDriven ?? false;
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        if (reducedMotionRef.current) {
          cameraTweenRef.current = null;
          cameraRef.current = {
            x: { value: target.tx, velocity: 0 },
            y: { value: target.ty, velocity: 0 },
            scale: { value: target.tscale, velocity: 0 },
          };
        } else {
          beginCameraTween(target);
        }
      } else {
        // Stop an interrupted Galaxy camera tween at the visible frame. The
        // deferred Flat move begins only after node homing finishes.
        const camera = cameraRef.current;
        cameraTweenRef.current = null;
        cameraRef.current = {
          x: { value: camera.x.value, velocity: 0 },
          y: { value: camera.y.value, velocity: 0 },
          scale: { value: camera.scale.value, velocity: 0 },
        };
        cameraTargetRef.current = {
          tx: camera.x.value,
          ty: camera.y.value,
          tscale: camera.scale.value,
        };
        pendingFlatCameraRef.current = {
          target,
          overviewScale,
          gestureRevision: cameraGestureRevisionRef.current,
          userDriven: savedCamera?.userDriven ?? false,
        };
      }
    }
  }, [galaxy, beginCameraTween, cameraTokens, galaxyRef, galaxyLayoutHandoffRef, worldRef, galaxyLayoutRef, galaxyFlatReturnPositionsRef, nodeDragRef, heatRef, dragAffectedSetRef, dragStartPosRef, dragTugOffsetsRef, homeSpringsRef, homeTargetOverrideRef, homingActiveRef, lastActiveMsRef, viewportRef, hasInitializedRef, pendingFlatCameraRef, galaxyModeCameraRef, cameraTargetRef, userDrivenCameraRef, galaxyEnteredAtRef, galaxyAtmosphereSeedRef, overviewFitRef, expandedParentsRef, overviewScaleRef, dampingRef, cameraAngularFreqRef, reducedMotionRef, cameraTweenRef, cameraRef, cameraGestureRevisionRef]);

}
