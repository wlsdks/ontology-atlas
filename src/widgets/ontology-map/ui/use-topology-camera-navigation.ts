"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import { type CameraTween } from "../model/camera-easing";
import {
  type DomeModel,
  type DomeRuntime
} from "../model/dome-view";
import { type GalaxyLayout } from "../model/galaxy-layout";
import type { TopologyMapLensKind } from "../model/path-lens";
import {
  type RealmTransitionState
} from "../model/realm-transition";
import { resolveViewportReframeMode } from "../model/viewport-reframe";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeFocusCameraTarget, computeLensFitTarget, computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "./topology-overview-fit";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "./topology-realm-runtime";
import { type TopologyWorld } from "./topology-world";
import {
  type ViewportReframeMotion
} from "./use-topology-viewport-lifecycle";

interface Dependencies {
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
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  domeFitTarget: (model: DomeModel, yaw: number, pitch: number, width: number, height: number, tokens: OntologyMapTokens) => CameraTarget | null;
  lastActiveMsRef: RefObject<number>;
  overviewFitRef: RefObject<"full" | "spine">;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
  galaxyRef: RefObject<boolean>;
  galaxyLayoutRef: RefObject<GalaxyLayout | null>;
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
  domeFocusPendingRef: RefObject<{ slug: string | null; } | null>;
  reframeViewportRef: RefObject<((motion: ViewportReframeMotion) => boolean) | null>;
}

/** Own overview, spotlight, constellation, and viewport camera navigation. */
export function useTopologyCameraNavigation({
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
  domeRuntimeRef,
  lastActiveMsRef,
  overviewFitRef,
  spotlightIdsRef,
  runSpotlightFitRef,
  galaxyRef,
  galaxyLayoutRef,
  clusteredIdsRef,
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
  domeFocusPendingRef,
  reframeViewportRef,
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
   * The spotlight fit: the **moment** the recent-changes lens turns on or its
   * window changes, aim the camera so every spotlit node is on screen.
   *
   * Owner report 2026-08-02: narrowing the window from 30 days to 1 dropped the
   * spotlight from 15 nodes to 3 while **the view stayed put**, so nothing
   * appeared to happen. Everywhere else — search selection, "View Only This" — the
   * camera follows.
   *
   * It fits once when the token changes and never again after a pan or zoom, so
   * it cannot take away a view the user set; with zero spotlit nodes it does
   * not move at all.
   *
   * Returns `true` on success. The two failure reasons are deliberately
   * distinct: "not ready yet" lets the caller record debt, "nothing to fit"
   * ends there — debt recorded then could never be paid, and a session with no
   * spotlit nodes would retry on every initialization.
   */
  const runSpotlightFit = useCallback((motion: "tween" | "follow" | "snap" = "tween"): boolean => {
    const ids = spotlightIdsRef.current;
    if (ids === null || ids.size === 0) return true; // No debt to record.
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hit = 0;
    for (const node of world.nodes) {
      if (!ids.has(node.id)) continue;
      const point = galaxyRef.current
        ? galaxyLayoutRef.current?.points.get(node.id) ?? node
        : node;
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
    // A path is read against the ring it sits in. Fitting the two endpoints
    // alone put the camera at 1.55× the overview, and the rest of the spine
    // overflowed: three domains under the toolbar, one off the canvas
    // (measured 2026-09-19). The lens dims that ring now, so it is the frame
    // the path wants, not a crop to cut away.
    if (mapLensKindRef.current === "path" && !galaxyRef.current) {
      const spine = world.spineBounds;
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
        { ...cameraTokens(tokens), overviewEntryRatio: 1 },
      )
      // Beside the panels, not on the raw viewport: the raw fit landed
      // expand-all 116 px off the free centre (measured 2026-09-19).
      : computeLensFitTarget(focusBounds, width, height, cameraTokens(tokens));
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
  }, [beginCameraTween, cameraAngularFreqRef, cameraRef, cameraTargetRef, cameraTokens, cameraTweenRef, constellationCameraRef, constellationFocusId, dampingRef, dataSourceKey, galaxyLayoutRef, galaxyRef, hasInitializedRef, mapLensKindRef, spotlightIdsRef, userDrivenCameraRef, viewportRef, worldRef]);

  const getRunSpotlightFit = useEffectEvent(() => runSpotlightFit);

  useLayoutEffect(() => {
    runSpotlightFitRef.current = getRunSpotlightFit();
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
   // owned by each selection/area/path-full lens/3D, preserving screens panned/zoomed
   // directly.
   */
  const reframeViewport = useCallback((motion: ViewportReframeMotion): boolean => {
    const rawTokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!rawTokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) {
      return false;
    }

    // Put the actual DOM width of INDEX/selection inspector into the same safe inset syntax.
    const tokens = cameraTokens(rawTokens);
    const fitTokens = overviewFitTokens(tokens, galaxyRef.current);
    const overviewBounds = galaxyRef.current && galaxyLayoutRef.current
      ? galaxyLayoutRef.current.bounds
      : overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    overviewScaleRef.current = computeOverviewFitScale(
      overviewBounds,
      width,
      height,
      fitTokens,
      world.nodes.length,
    );

    const realmPhase = realmTransitionRef.current.phase;
    const realmActive = realmPhase === "entering" || realmPhase === "active";
    const focused = focusedSlugRef.current;
    const dome = domeRuntimeRef.current;
    const mode = resolveViewportReframeMode({
      userDriven: userDrivenCameraRef.current,
      domeActive: dome !== null && dome.active,
      focused: focused !== null,
      pairFocused: selectedEdgeRef.current !== null,
      realmActive,
      spotlightActive: (spotlightIdsRef.current?.size ?? 0) > 0,
    });

    if (mode === "preserve") return false;

    // 3D must be handled with live projection coordinates held by rAF. Do not reset
    // orientation; only feed the new viewport into the existing select/deselect reframe path.
    if (mode === "dome-focus" || mode === "dome-overview") {
      // The DOM owns its final bbox in its own projection step. Do not restart that
      // step every frame for width; only hand off the debt once upon settling.
      if (motion === "tracking") return false;
      domeFocusPendingRef.current = { slug: mode === "dome-focus" ? focused : null };
      lastActiveMsRef.current = performance.now();
      return true;
    }

    let target: CameraTarget | null = null;
    if (mode === "focus" && focused !== null) {
      const realmData = realmDataRef.current;
      target = computeFocusCameraTarget(
        world,
        tokens,
        width,
        height,
        focused,
        overviewScaleRef.current * tokens.overviewEntryRatio,
        realmActive ? realmData?.memberIds ?? null : null,
      );
    } else if (mode === "realm") {
      const realmData = realmDataRef.current;
      if (realmData !== null) {
        const bounds = realmVisibleBounds(
          world,
          realmData,
          new Set([...expandedParentsRef.current, realmData.rootId]),
          tokens,
        );
        target = realmCameraTarget(bounds, tokens, width, height);
      }
    } else if (mode === "spotlight") {
      // Recent changes/path/full expand already own a single node-set fit in one place.
      return runSpotlightFit(
        motion === "tracking"
          ? "follow"
          : motion === "finalize-tracking"
            ? "snap"
            : "tween",
      );
    } else if (mode === "overview") {
      target = computeOverviewCameraTarget(
        overviewBounds,
        width,
        height,
        fitTokens,
        world.nodes.length,
      );
    }

    if (target === null) return false;
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
  }, [beginCameraTween, cameraAngularFreqRef, cameraRef, cameraTargetRef, cameraTokens, cameraTweenRef, clusteredIdsRef, dampingRef, domeFocusPendingRef, domeRuntimeRef, expandedParentsRef, focusedSlugRef, galaxyLayoutRef, galaxyRef, hasInitializedRef, lastActiveMsRef, overviewFitRef, overviewScaleRef, realmDataRef, realmTransitionRef, runSpotlightFit, selectedEdgeRef, spotlightIdsRef, userDrivenCameraRef, viewportRef, worldRef]);

  useEffect(() => {
    reframeViewportRef.current = reframeViewport;
    return () => {
      reframeViewportRef.current = null;
    };
  }, [reframeViewport, reframeViewportRef]);

}
