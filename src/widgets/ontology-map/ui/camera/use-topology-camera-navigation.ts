"use client";

import { branchFocusTarget, branchTargetLeash } from "./branch-frame/target";
import { selectionSlideTarget } from "./branch-frame/selection-margin";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  type RefObject
} from "react";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import { type CameraTween, type CameraTweenEase } from "../../model/camera/camera-easing";
import { recordSelectionCamera, selectionZoomBase, type SelectionCamera } from "../../model/camera/flat-selection-camera";
import { isPathTargetPick, type TopologyMapLensKind } from "../../model/visibility/path-lens";
import {
  type RealmTransitionState
} from "../../model/realm/realm-transition";
import { resolveViewportReframeMode } from "../../model/camera/viewport-reframe";
import { spotlightRevealsHidden } from "../../model/visibility/tier-visibility";
import { landTierAssembly } from "../../morph/tier-assembly";
import { computeFocusCameraTarget, computeLensFitTarget, computeOverviewCameraTarget, computeOverviewFitScale, type FocusLeashPx } from "./topology-camera-math";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "./topology-overview-fit";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "../world/topology-realm-runtime";
import { computeDrawnSpineBounds, computePathPickBounds, dialOverviewFit, type TopologyWorld } from "../world/topology-world";
import { liveDialFocusFrame } from "./use-topology-focus-navigation";
import {
  type ViewportReframeMotion
} from "./use-topology-viewport-lifecycle";

interface Dependencies {
  focusLeashPxRef?: RefObject<FocusLeashPx | null>;
  runOverviewFit: () => void;
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  hasInitializedRef: RefObject<boolean>;
  realmDataRef: RefObject<RealmRuntimeData | null>;
  realmTransitionRef: RefObject<RealmTransitionState>;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  dampingRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number, ease?: CameraTweenEase) => void;
  lastActiveMsRef: RefObject<number>;
  overviewFitRef: RefObject<"full" | "spine">;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  overviewScaleRef: RefObject<number>;
  initialFitTokensRef: RefObject<{ relayout: number; fitView: number; }>;
  relayoutToken: number;
  fitViewToken: number;
  mapLensKindRef: RefObject<TopologyMapLensKind>;
  constellationFocusId: string | null;
  constellationCameraRef: RefObject<{ returnTarget: CameraTarget; dataSourceKey: string | null; } | null>;
  dataSourceKey: string | null;
  cameraTweenRef: RefObject<CameraTween | null>;
  cameraRef: RefObject<CameraAxes>;
  spotlightFitToken: number;
  lastProcessedSpotlightFitTokenRef: RefObject<number | null>;
  pendingSpotlightFitRef: RefObject<boolean>;
  previousConstellationFocusIdRef: RefObject<string | null>;
  focusedSlugRef: RefObject<string | null>;
  selectedEdgeRef: RefObject<{ sourceId: string; targetId: string; relationType?: string; } | null>;
  reframeViewportRef: RefObject<((motion: ViewportReframeMotion) => boolean) | null>;
  selectionCameraRef: RefObject<SelectionCamera | null>;
  cameraGestureRevisionRef: RefObject<number>;
}

type SpotlightMotion = "tween" | "follow" | "snap";
function invokeSpotlightFit(ref: RefObject<(motion?: SpotlightMotion) => boolean>, motion?: SpotlightMotion) {
  return ref.current(motion);
}
function invokeViewportReframe(ref: RefObject<(motion: ViewportReframeMotion) => boolean>, motion: ViewportReframeMotion) {
  return ref.current(motion);
}

/** Own overview, spotlight, constellation, and viewport camera navigation. */
export function useTopologyCameraNavigation({
  focusLeashPxRef,
  runOverviewFit,
  worldRef,
  viewportRef,
  hasInitializedRef,
  realmDataRef,
  realmTransitionRef,
  expandedParentsRef,
  cameraTargetRef,
  userDrivenCameraRef,
  dampingRef,
  cameraAngularFreqRef,
  beginCameraTween,
  lastActiveMsRef,
  overviewFitRef,
  spotlightIdsRef,
  runSpotlightFitRef, clusteredIdsRef,
  cameraTokens,
  overviewScaleRef,
  initialFitTokensRef,
  relayoutToken,
  fitViewToken,
  mapLensKindRef,
  constellationFocusId,
  constellationCameraRef,
  dataSourceKey,
  cameraTweenRef,
  cameraRef,
  spotlightFitToken,
  lastProcessedSpotlightFitTokenRef,
  pendingSpotlightFitRef,
  previousConstellationFocusIdRef,
  focusedSlugRef,
  selectedEdgeRef,
  reframeViewportRef,
  selectionCameraRef,
  cameraGestureRevisionRef,
}: Dependencies) {

  useEffect(() => {
    // Skip while both tokens still equal their captured mount-time values —
    // this effect's own mount-time fire (see `initialFitTokensRef` above).
    // `trySnapInitialCamera` already set the correct initial camera; this
    // effect should only react to an actual "fit view"/relayout click after.
    const initial = initialFitTokensRef.current;
    if (relayoutToken === initial.relayout && fitViewToken === initial.fitView) return;
    runOverviewFit();
  }, [relayoutToken, fitViewToken, runOverviewFit, initialFitTokensRef]);

  /*
   * Spotlight fit: when the recent-changes lens turns on or its window changes, frame every spotlit
   * node. Fits once per token, never after a pan or zoom; with no spotlit nodes it does not move.
   * Returns `true` on success. "Not ready" lets the caller record debt; "nothing to fit" ends there.
   */
  const spotlightFitImplementation = (motion: SpotlightMotion = "tween"): boolean => {
    const ids = spotlightIdsRef.current;
    if (ids === null || ids.size === 0 || !spotlightRevealsHidden(mapLensKindRef.current, ids.size)) return true; // No debt to record.
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return false;
    landTierAssembly(world);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hit = 0;
    for (const node of world.nodes) {
      if (!ids.has(node.id)) continue;
      const point = node;
      hit += 1;
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
    }
    // None of the spotlit ids may exist in the current world (inside a
    // collapsed cluster, say). With no bbox to fit, leave the camera alone —
    // and record no debt, because retrying gives the same result.
    if (hit === 0) return true;
    // A path is read against the ring it sits in; fitting only its endpoints crops the rest of the
    // spine. The ring is as drawn: a hub folded behind a crowded parent counts only if the path
    // runs through it.
    if (mapLensKindRef.current === "path") {
      const spine = computeDrawnSpineBounds(world, tokens, expandedParentsRef.current);
      if (spine.minX < minX) minX = spine.minX;
      if (spine.minY < minY) minY = spine.minY;
      if (spine.maxX > maxX) maxX = spine.maxX;
      if (spine.maxY > maxY) maxY = spine.maxY;
    }

    // Pad so nothing sits flush against the edge: fitting the raw bbox clips
    // labels, rings and footprints.
    const padX = Math.max(48, (maxX - minX) * 0.18);
    const padY = Math.max(48, (maxY - minY) * 0.18);
    const focusBounds = {
      minX: minX - padX,
      minY: minY - padY,
      maxX: maxX + padX,
      maxY: maxY + padY,
    };
    const target = constellationFocusId !== null
      ? computeOverviewCameraTarget(
        focusBounds,
        width,
        height,
        { ...cameraTokens(tokens), overviewEntryRatio: 1 })
      // Fit beside the panels, not on the raw viewport, which would leave expand-all off the free
      // centre; never closer than the overview, which on a large Flat graph sits below the token floor.
      : computeLensFitTarget(focusBounds, width, height, { ...cameraTokens(tokens), cameraScaleMin: Math.min(tokens.cameraScaleMin, overviewScaleRef.current) });
    if (constellationFocusId !== null && constellationCameraRef.current === null) {
      constellationCameraRef.current = {
        returnTarget: { ...cameraTargetRef.current },
        dataSourceKey,
      };
    }
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    // Live viewport tracking is a target that moves every frame like a wheel. Using
    // a slow narrative transition spring makes the camera linger after the dock stops,
    // appearing as two actions.
    cameraAngularFreqRef.current =
      motion === "follow"
        ? tokens.cameraSpringAngFreqInteractive
        : tokens.cameraSpringAngFreqTransition;
    if (motion === "snap") {
      cameraTweenRef.current = null;
      cameraRef.current = {
        x: { value: target.tx, velocity: 0 },
        y: { value: target.ty, velocity: 0 },
        scale: { value: target.tscale, velocity: 0 },
      };
    } else if (motion === "follow") cameraTweenRef.current = null;
    else beginCameraTween(target);
    return true;
  };
  const spotlightImplementationRef = useLatestRef(spotlightFitImplementation);
  const runSpotlightFit = useMemo(() => invokeSpotlightFit.bind(null, spotlightImplementationRef), [spotlightImplementationRef]);

  useLayoutEffect(() => {
    runSpotlightFitRef.current = runSpotlightFit;
    return () => { runSpotlightFitRef.current = null; };
  }, [runSpotlightFit, runSpotlightFitRef]);

  useEffect(() => {
    if (spotlightFitToken === lastProcessedSpotlightFitTokenRef.current) return;
    lastProcessedSpotlightFitTokenRef.current = spotlightFitToken;
    if (!runSpotlightFit()) pendingSpotlightFitRef.current = true;
  }, [spotlightFitToken, runSpotlightFit, lastProcessedSpotlightFitTokenRef, pendingSpotlightFitRef]);

  useEffect(() => {
    const previousId = previousConstellationFocusIdRef.current;
    previousConstellationFocusIdRef.current = constellationFocusId;
    if (previousId === null || constellationFocusId !== null) return;
    const saved = constellationCameraRef.current;
    constellationCameraRef.current = null;
    if (!saved || saved.dataSourceKey !== dataSourceKey) return;
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return;
    cameraTargetRef.current = saved.returnTarget;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    lastActiveMsRef.current = performance.now();
    beginCameraTween(saved.returnTarget);
  }, [beginCameraTween, cameraAngularFreqRef, cameraTargetRef, constellationCameraRef, constellationFocusId, dampingRef, dataSourceKey, lastActiveMsRef, previousConstellationFocusIdRef, userDrivenCameraRef]);

  /**
   * Follow docking panel/window/split width transitions to recalculate the currently
   * viewed semantic meaning into the new available area. `tracking` moves only the
   * spring target in the same frame as the width, and `finalize-tracking` lands on
   // the final target with velocity 0 to eliminate underdamped bounce. `settled` uses
   // the standard camera tween for immediately finished resizes.
   *
   // The previous resize path only recreated canvas resolution and stardust, rescuing
   // the camera only when 「everything is off-screen」. Thus, while INDEX collapsed
   // and the right agent entered, if any nodes remained even slightly, the previous
   // width's camera passed validation, pushing the entire graph left. The reason node
   // selection worked normally was that the selection effect re-initialized the new
   // width and inspector separately.
   *
   // Here we do not unconditionally revert to overview. We recalculate the camera meaning
   // owned by each selection/area/path-full lens, preserving screens panned/zoomed
   // directly.
   */
  const viewportReframeImplementation = (motion: ViewportReframeMotion): boolean => {
    const rawTokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!rawTokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) {
      return false;
    }

    // Put the actual DOM width of INDEX/selection inspector into the same safe inset syntax.
    const tokens = cameraTokens(rawTokens);
    const fitTokens = overviewFitTokens(tokens);
        const overviewBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const dialFit = dialOverviewFit(world);
    overviewScaleRef.current = computeOverviewFitScale(
      overviewBounds,
      width,
      height,
      fitTokens,
      world.nodes.length,
      dialFit);

    const realmPhase = realmTransitionRef.current.phase;
    const realmActive = realmPhase === "entering" || realmPhase === "active";
    const focused = focusedSlugRef.current;
    const mode = resolveViewportReframeMode({
      userDriven: userDrivenCameraRef.current,
      focused: focused !== null,
      pairFocused: selectedEdgeRef.current !== null,
      realmActive,
      spotlightActive: spotlightIdsRef.current !== null && spotlightIdsRef.current.size > 0 && spotlightRevealsHidden(mapLensKindRef.current, spotlightIdsRef.current.size),
    });

    if (mode === "preserve") return false;

    const memory = selectionCameraRef.current;
    if (mode === "focus" && focused !== null && (!realmActive || realmDataRef.current?.flat) && memory?.slug === focused && !memory.framed) {
      // A click only selected, so a new viewport only re-checks that the panel does not cover the node.
      const node = world.nodeById.get(focused);
      const current = cameraTargetRef.current;
      const nudge = motion === "tracking" || !node ? null : selectionSlideTarget(world, realmDataRef.current?.dial ?? world.dial, focused, current, { width, height }, tokens, overviewScaleRef.current, selectionZoomBase(memory, current, cameraGestureRevisionRef.current));
      if (nudge === null) return false;
      selectionCameraRef.current = recordSelectionCamera(memory, { slug: focused, framed: false, current, landed: nudge, gesture: cameraGestureRevisionRef.current });
      cameraTargetRef.current = nudge;
      if (focusLeashPxRef) focusLeashPxRef.current = branchTargetLeash(node!, nudge, width, height, tokens);
      userDrivenCameraRef.current = false;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      lastActiveMsRef.current = performance.now();
      beginCameraTween(nudge, undefined, "spring");
      return true;
    }

    let target: CameraTarget | null = null;
    if (mode === "focus" && focused !== null && !realmActive && isPathTargetPick(mapLensKindRef.current, focused, spotlightIdsRef.current)) {
            target = computeOverviewCameraTarget(
        computePathPickBounds(world, tokens, focused, overviewBounds, expandedParentsRef.current),
        width,
        height,
        fitTokens,
        world.nodes.length,
        dialFit);
    } else if (mode === "focus" && focused !== null) {
      const realmData = realmDataRef.current;
      const dial = realmActive ? realmData?.dial : world.dial;
      const branchTarget = branchFocusTarget(world, dial, focused, tokens, width, height, { scopedCapability: realmActive && realmData?.flat });
      if (branchTarget && focusLeashPxRef) focusLeashPxRef.current = branchTargetLeash(world.nodeById.get(focused)!, branchTarget, width, height, tokens);
      target = branchTarget ?? computeFocusCameraTarget(
        world,
        tokens,
        width,
        height,
        focused,
        overviewScaleRef.current * tokens.overviewEntryRatio,
        realmActive ? realmData?.memberIds ?? null : null,
        undefined,
        realmActive ? undefined : liveDialFocusFrame(world, focused));
    } else if (mode === "realm") {
      const realmData = realmDataRef.current;
      if (realmData !== null) {
        const bounds = realmVisibleBounds(
          world,
          realmData,
          new Set([...expandedParentsRef.current, realmData.rootId]),
          tokens);
        target = branchFocusTarget(world, realmData.dial, realmData.rootId, tokens, width, height, { positions: realmPhase === "entering" ? realmData.insideTargets : undefined, scopedCapability: realmData.flat })
          ?? realmCameraTarget(bounds, tokens, width, height, realmData.dial?.overviewPadPx);
      }
    } else if (mode === "spotlight") {
      // Recent changes/path/full expand already own a single node-set fit in one place.
      return runSpotlightFit(
        motion === "tracking"
          ? "follow"
          : motion === "finalize-tracking"
            ? "snap"
            : "tween");
    } else if (mode === "overview") {
      target = computeOverviewCameraTarget(
        overviewBounds,
        width,
        height,
        fitTokens,
        world.nodes.length,
        dialFit);
    }

    if (target === null) return false;
    if (mode === "focus" && memory !== null && memory.slug === focused) selectionCameraRef.current = { ...memory, landed: { ...target } };
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraAngularFreqRef.current =
      motion === "tracking"
        ? tokens.cameraSpringAngFreqInteractive
        : tokens.cameraSpringAngFreqTransition;
    lastActiveMsRef.current = performance.now();
    if (motion === "finalize-tracking") {
      cameraTweenRef.current = null;
      cameraRef.current = {
        x: { value: target.tx, velocity: 0 },
        y: { value: target.ty, velocity: 0 },
        scale: { value: target.tscale, velocity: 0 },
      };
    } else if (motion === "tracking") cameraTweenRef.current = null;
    else beginCameraTween(target);
    return true;
  };
  const viewportImplementationRef = useLatestRef(viewportReframeImplementation);
  const reframeViewport = useMemo(() => invokeViewportReframe.bind(null, viewportImplementationRef), [viewportImplementationRef]);

  useEffect(() => {
    reframeViewportRef.current = reframeViewport;
    return () => {
      reframeViewportRef.current = null;
    };
  }, [reframeViewport, reframeViewportRef]);

}
