"use client";

import {
  useCallback,
  type RefObject
} from "react";
import type { CameraTarget } from "../../engine/camera";
import {
  type RealmTransitionState
} from "../../model/realm/realm-transition";
import { landTierAssembly } from "../../morph/tier-assembly";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "./topology-overview-fit";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "../world/topology-realm-runtime";
import { dialOverviewFit, type TopologyWorld } from "../world/topology-world";
import { branchFocusTarget } from "./branch-frame/target";

interface Dependencies {
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
  lastActiveMsRef: RefObject<number>;
  overviewFitRef: RefObject<"full" | "spine">;
  spotlightIdsRef: RefObject<ReadonlySet<string> | null>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
    clusteredIdsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  overviewScaleRef: RefObject<number>;
}

/** Provide the stable overview-fit command used by replay, keyboard, and fit controls. */
export function useTopologyOverviewNavigation({
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
  runSpotlightFitRef,
  clusteredIdsRef,
  cameraTokens,
  overviewScaleRef,
}: Dependencies) {

  // --- relayoutToken / fitViewToken — both mean "spring back to the full overview fit" ---
  /**
   * Spring back to the full overview fit — shared by the fit/relayout tokens
   * and the `0` key (`interaction/keyboard-zoom.ts`), so the keyboard fit is
   * byte for byte the fit the toolbar performs.
   */
  const runOverviewFit = useCallback(() => {
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    landTierAssembly(world);
    // Inside a realm, fit and relayout return to the realm's content bbox, not the global spine:
    // tweening to the global overview takes the camera out of the realm. Same contract as the
    // deselect return.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens);
      const measured = cameraTokens(tokens);
      const target = branchFocusTarget(world, realmData.dial, realmData.rootId, measured, width, height, {
        positions: realmPhase === "entering" ? realmData.insideTargets : undefined,
        scopedCapability: realmData.flat,
      }) ?? realmCameraTarget(bounds, measured, width, height, realmData.dial?.overviewPadPx);
      cameraTargetRef.current = target;
      userDrivenCameraRef.current = false;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(target);
      return;
    }
    // Expand-all is a lens and its frame is the lens fit: the overview fit reserves the tool lane,
    // docking chips and readout, which would shrink and move the expanded map on "fit" or
    // "auto-arrange". One lens, one frame.
    if (overviewFitRef.current === "full" && spotlightIdsRef.current !== null && runSpotlightFitRef.current?.()) {
      return;
    }
    // Panel-aware: spring back to the overview centered in the VISIBLE area, not
    // behind the left ReaderLens panel (design guardian's camera rejection). Fits the
    // SPINE bbox (not the full 295-node bounds) so "fit view" reframes the same
    // legible 8-node spine as the initial entry — and keeps `overviewScaleRef`
    // on the same spine bounds so the zoom-ratio/altitude anchor stays at ratio 1.
    const fitBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const measuredTokens = overviewFitTokens(cameraTokens(tokens));
    const overviewTarget = computeOverviewCameraTarget(fitBounds, width, height, measuredTokens, world.nodes.length, dialOverviewFit(world));
    cameraTargetRef.current = overviewTarget;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(fitBounds, width, height, measuredTokens, world.nodes.length, dialOverviewFit(world));
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // eases via the cubic transition tween (reduced-motion → spring/snap), not
    // whatever a preceding wheel gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(overviewTarget);
  }, [beginCameraTween, cameraAngularFreqRef, cameraTargetRef, cameraTokens, clusteredIdsRef, dampingRef, expandedParentsRef, hasInitializedRef, lastActiveMsRef, overviewFitRef, overviewScaleRef, realmDataRef, realmTransitionRef, runSpotlightFitRef, spotlightIdsRef, userDrivenCameraRef, viewportRef, worldRef]);
  return { runOverviewFit };
}
