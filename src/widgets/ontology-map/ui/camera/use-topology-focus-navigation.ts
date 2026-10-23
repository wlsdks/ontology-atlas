"use client";

import { measureEdgeFitObstacle } from "../../interaction/free-area";
import {
  useCallback,
  useEffect,
  type RefObject
} from "react";
import { clampPointToPanBounds, type CameraAxes, type CameraTarget } from "../../engine/camera";
import type { CameraTweenEase } from "../../model/camera/camera-easing";
import {
  deselectCamera,
  recordSelectionCamera,
  selectionNudgeTarget,
  type SelectionCamera,
  type SelectionSource
} from "../../model/camera/flat-selection-camera";
import { commitDomeEntrySweep } from "../../model/dome-view/frame";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import { isPathTargetPick, type TopologyMapLensKind } from "../../model/visibility/path-lens";
import {
  type RealmTransitionState
} from "../../model/realm/realm-transition";
import { computeFocusCameraTarget, computeOverviewCameraTarget, focusPanBounds, focusTargetLeashPx, type FocusLeashPx } from "./topology-camera-math";
import {
  overviewBoundsFor
} from "./topology-overview-fit";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "../world/topology-realm-runtime";
import { computePathPickBounds, dialFocusFrame, type DialFocusFrame, type TopologyWorld } from "../world/topology-world";
import { lastDialFrame } from "../../dial/frame/frame";
import { readDialTokens } from "../../dial/tokens";
import { branchSelectionMargin } from "./branch-frame/selection-margin";
import { branchFocusTarget } from "./branch-frame/target";

export function liveDialFocusFrame(world: TopologyWorld, focusId: string): DialFocusFrame | undefined {
  if (lastDialFrame() === null) return undefined;
  try {
    return dialFocusFrame(world, focusId, readDialTokens());
  } catch {
    return undefined;
  }
}

interface Dependencies {
  lastFocusedSlugRef: RefObject<string | null>;
  focusedSlug: string | null;
  egoRevealBatchesRef: RefObject<number>;
  selectionPulseRef: RefObject<{ nodeId: string; startAtMs: number; } | null>;
  cameraTargetRef: RefObject<CameraTarget>;
  cameraRef: RefObject<CameraAxes>;
  constellationFocusId: string | null;
  cameraGestureRevisionRef: RefObject<number>;
  userDrivenCameraRef: RefObject<boolean>;
  dampingRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  lastActiveMsRef: RefObject<number>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number, ease?: CameraTweenEase) => void;
  focusedSlugRef: RefObject<string | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  overviewScaleRef: RefObject<number>;
  view3dRef: RefObject<boolean>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  realmDataRef: RefObject<RealmRuntimeData | null>;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  focusLeashPxRef: RefObject<FocusLeashPx | null>;
  overviewFitRef: RefObject<"full" | "spine">;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  selectionCameraRef: RefObject<SelectionCamera | null>;
  selectionSourceRef: RefObject<{ slug: string; source: SelectionSource; } | null>;
}

function leashFor(width: number, height: number, tokens: OntologyMapTokens): FocusLeashPx {
  return focusTargetLeashPx(tokens, width, height);
}

/** Own focus camera transitions and reversible inspection targets. */
export function useTopologyFocusNavigation({
  lastFocusedSlugRef,
  focusedSlug,
  egoRevealBatchesRef,
  selectionPulseRef, cameraTargetRef,
  cameraRef,
  constellationFocusId,
  cameraGestureRevisionRef,
  userDrivenCameraRef,
  dampingRef,
  cameraAngularFreqRef,
  lastActiveMsRef,
  beginCameraTween,
  focusedSlugRef,
  canvasRef,
  worldRef,
  viewportRef,
  overviewScaleRef,
  view3dRef,
  realmTransitionRef,
  domeRuntimeRef,
  realmDataRef,
  expandedParentsRef,
  cameraTokens,
  focusLeashPxRef,
  overviewFitRef,
  clusteredIdsRef,
  mapLensKindRef,
  spotlightIdsRef,
  selectionCameraRef,
  selectionSourceRef,
}: Dependencies) {

  const moveCamera = useCallback((target: CameraTarget, tokens: OntologyMapTokens, ease?: CameraTweenEase) => {
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    lastActiveMsRef.current = performance.now();
    beginCameraTween(target, undefined, ease);
  }, [beginCameraTween, cameraAngularFreqRef, cameraTargetRef, dampingRef, lastActiveMsRef, userDrivenCameraRef]);

  /** The flat map's zoom gesture (double-click, Enter): frame the node and its neighbours. */
  const flyToNode = useCallback((slug: string) => {
    const phase = realmTransitionRef.current.phase;
    const realm = phase === "active" ? realmDataRef.current : null;
    if (view3dRef.current || (phase !== "idle" && !realm?.flat)) return;
    const raw = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!raw || !world || width <= 0 || height <= 0 || !world.nodeById.has(slug)) return;
    const tokens = cameraTokens(raw);
    const activeDial = realm?.dial ?? world.dial;
    const target = branchFocusTarget(world, activeDial, slug, tokens, width, height) ?? computeFocusCameraTarget(
      world, tokens, width, height, slug,
      overviewScaleRef.current * raw.overviewEntryRatio,
      realm?.memberIds ?? null,
      realm?.bounds ?? overviewBoundsFor(overviewFitRef.current, world, raw, expandedParentsRef.current, clusteredIdsRef.current),
      activeDial ? dialFocusFrame({ dial: activeDial }, slug, readDialTokens()) : liveDialFocusFrame(world, slug));
    if (!target) return;
    selectionCameraRef.current = recordSelectionCamera(selectionCameraRef.current, {
      slug, framed: true, current: cameraTargetRef.current, landed: target, gesture: cameraGestureRevisionRef.current,
    });
    const leash = leashFor(width, height, tokens);
    const node = world.nodeById.get(slug)!;
    focusLeashPxRef.current = {
      x: Math.max(leash.x, Math.abs(node.x - target.tx) * target.tscale + 1),
      y: Math.max(leash.y, Math.abs(node.y - target.ty) * target.tscale + 1),
    };
    moveCamera(target, raw);
  }, [cameraGestureRevisionRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, selectionCameraRef, focusLeashPxRef, moveCamera, overviewFitRef, overviewScaleRef, realmDataRef, realmTransitionRef, view3dRef, viewportRef, worldRef]);

  useEffect(() => {
    if (lastFocusedSlugRef.current === focusedSlug) return;
    const releasedSlug = lastFocusedSlugRef.current;
    const releasedLeash = focusLeashPxRef.current;
    lastFocusedSlugRef.current = focusedSlug;
    // A new focus starts from the top-ranked neighbours again, discarding
    // batches opened by chip clicks.
    egoRevealBatchesRef.current = 1;
    selectionPulseRef.current = focusedSlug !== null ? { nodeId: focusedSlug, startAtMs: performance.now() } : null;
        /*
         * In 3D a click only selects: the camera and pose stay put, and flying to a node is its own gesture
         * (double-click or Enter, consumed by the dome frame, `DOME_FLY_MS`). A selection stops the attention
         * spin; the nudge off the inspector is undone on deselect. Esc and Home fly back, a click does not.
         */
        if (view3dRef.current && realmTransitionRef.current.phase === "idle" && domeRuntimeRef.current !== null) {
      const dome = domeRuntimeRef.current;
      if (focusedSlug !== null) {
        dome.spinArmed = false;
        commitDomeEntrySweep(dome);
      } else if (dome.nudgeReturn !== null) {
        dome.flyRequest = { slug: null, unnudge: true };
      }
      lastActiveMsRef.current = performance.now();
      return;
    }

    const effectTokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!effectTokens || !world || width <= 0 || height <= 0) return;

    const realmActive = realmTransitionRef.current.phase !== "idle";
    const realmData = realmDataRef.current;
    const pending = selectionSourceRef.current;
    selectionSourceRef.current = null;
    const source = focusedSlug !== null && pending?.slug === focusedSlug ? pending.source : null;
    // The panel this selection opens enters the DOM after this effect, so it is measured a frame later.
    const raf = requestAnimationFrame(() => {
      const phase = realmTransitionRef.current.phase;
      if (phase === "exiting" || (phase === "entering" && focusedSlug === null)) return;
      const tokens = readOntologyMapTokensOrNull() ?? effectTokens;
      const memory = selectionCameraRef.current;
      const gesture = cameraGestureRevisionRef.current;
      const pathPick = focusedSlug !== null && isPathTargetPick(mapLensKindRef.current, focusedSlug, spotlightIdsRef.current);

      if (!realmActive && focusedSlug === null) {
        selectionCameraRef.current = null;
        focusLeashPxRef.current = null;
        const back = deselectCamera(memory, cameraTargetRef.current, gesture, userDrivenCameraRef.current);
        if (back.kind === "return") moveCamera(back.target, tokens, memory?.framed ? undefined : "spring");
        // The released leash must not carry on a pan it was holding short, nor pull back its stretch.
        const anchor = releasedSlug === null ? undefined : world.nodeById.get(releasedSlug);
        const held = cameraTargetRef.current;
        if (back.kind === "stay" && anchor && releasedLeash && held.tscale > overviewScaleRef.current) {
          const bounds = focusPanBounds(anchor, releasedLeash, held.tscale, cameraTokens(tokens).cameraFocusPanMargin);
          const edge = clampPointToPanBounds(held.tx, held.ty, bounds);
          const seen = cameraRef.current;
          const between = (value: number, a: number, b: number) => Math.min(Math.max(a, b), Math.max(Math.min(a, b), value));
          cameraTargetRef.current = { tx: between(seen.x.value, edge.x, held.tx), ty: between(seen.y.value, edge.y, held.ty), tscale: held.tscale };
        }
        if (back.kind !== "overview") return;
      }
      // A double-click already framed this node.
      if ((!realmActive || realmData?.flat) && focusedSlug !== null && memory?.slug === focusedSlug && memory.framed) return;

      if ((!realmActive || realmData?.flat) && source === "canvas-click" && !pathPick && focusedSlug !== null) {
        const node = world.nodeById.get(focusedSlug);
        const measured = cameraTokens(tokens);
        const current = cameraTargetRef.current;
        const activeDial = realmData?.dial ?? world.dial;
        const margin = branchSelectionMargin(world, activeDial, focusedSlug, current.tscale, width - measured.safeInsetLeft - measured.safeInsetRight);
        const nudge = node ? selectionNudgeTarget(current, node, width, { left: measured.safeInsetLeft, right: measured.safeInsetRight }, margin) : null;
        const landed = nudge ?? current;
        selectionCameraRef.current = recordSelectionCamera(memory, { slug: focusedSlug, framed: false, current, landed, gesture });
        const leash = leashFor(width, height, measured);
        focusLeashPxRef.current = node
          ? { x: Math.max(leash.x, Math.abs(node.x - landed.tx) * landed.tscale + 1), y: Math.max(leash.y, Math.abs(node.y - landed.ty) * landed.tscale + 1) }
          : leash;
        if (nudge) moveCamera(nudge, tokens, "spring");
        return;
      }

      const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
      let target: CameraTarget | null;
      if (focusedSlug === null && realmActive && realmData) {
        const bounds = realmVisibleBounds(
          world,
          realmData,
          new Set([...expandedParentsRef.current, realmData.rootId]),
          tokens);
        target = realmCameraTarget(bounds, tokens, width, height, realmData.dial?.overviewPadPx);
      } else {
        const realmMembers = realmActive ? realmData?.memberIds ?? null : null;
        const measured = cameraTokens(tokens);
        // A deselect lands where the fit tile will: the folding panel is still on screen, so its side
        // takes the token and the rail's reach, which is what a fit with no panel measures.
        const canvas = canvasRef.current;
        const focusTokens =
          focusedSlug === null
            ? { ...measured, safeInsetRight: tokens.safeInsetRight, obstacleInsetRight: canvas ? measureEdgeFitObstacle(canvas, "right")?.reach ?? 0 : 0 }
            : measured;
        focusLeashPxRef.current = focusedSlug === null ? null : leashFor(width, height, focusTokens);
        const overviewBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
        target =
          focusedSlug !== null && !realmActive && pathPick
            ? // A path's source waits for its target: frame the map the target is picked
              // from, the source's own neighbours included, rather than dive into them.
              computeOverviewCameraTarget(
                computePathPickBounds(world, tokens, focusedSlug, overviewBounds, expandedParentsRef.current),
                width,
                height,
                focusTokens,
                world.nodes.length)
            : computeFocusCameraTarget(world, focusTokens, width, height, focusedSlug, overviewEntryScale, realmMembers, overviewBounds, realmActive || focusedSlug === null ? undefined : liveDialFocusFrame(world, focusedSlug));
      }
      selectionCameraRef.current =
        target !== null && focusedSlug !== null && !realmActive
          ? recordSelectionCamera(memory, { slug: focusedSlug, framed: true, current: cameraTargetRef.current, landed: target, gesture })
          : null;
      if (!target) return;
      moveCamera(target, tokens);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusedSlug, beginCameraTween, cameraTokens, constellationFocusId, lastFocusedSlugRef, egoRevealBatchesRef, selectionPulseRef, view3dRef, realmTransitionRef, domeRuntimeRef, worldRef, viewportRef, overviewScaleRef, realmDataRef, cameraTargetRef, cameraGestureRevisionRef, userDrivenCameraRef, dampingRef, cameraAngularFreqRef, lastActiveMsRef, focusedSlugRef, canvasRef, expandedParentsRef, focusLeashPxRef, overviewFitRef, clusteredIdsRef, mapLensKindRef, spotlightIdsRef, selectionCameraRef, selectionSourceRef, cameraRef, moveCamera]);

  return { flyToNode };
}
