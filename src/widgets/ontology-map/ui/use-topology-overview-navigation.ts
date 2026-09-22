"use client";

import {
  useCallback,
  type RefObject
} from "react";
import type { CameraTarget } from "../engine/camera";
import {
  DOME_PITCH_DEFAULT,
  DOME_POSE_MS,
  domeNearestYawTurn,
  type DomeModel,
  type DomeRuntime
} from "../model/dome-view";
import { type GalaxyLayout } from "../model/galaxy-layout";
import {
  type RealmTransitionState
} from "../model/realm-transition";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeOverviewCameraTarget, computeOverviewFitScale } from "./topology-camera-math";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "./topology-overview-fit";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { realmCameraTarget, realmVisibleBounds, type RealmRuntimeData } from "./topology-realm-runtime";
import { type TopologyWorld } from "./topology-world";

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
  domeRuntimeRef,
  domeFitTarget,
  lastActiveMsRef,
  overviewFitRef,
  spotlightIdsRef,
  runSpotlightFitRef,
  galaxyRef,
  galaxyLayoutRef,
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
    // Warding invariant (owner bug report 2026-07-23): inside a realm, fit and
    // relayout return to the **realm's content bbox**, not the global spine.
    // Tweening to the global overview takes the camera out of the realm and
    // leaves "an empty ring plus some nodes somewhere" — same contract as the
    // deselect return.
    const realmData = realmDataRef.current;
    const realmPhase = realmTransitionRef.current.phase;
    if (realmData !== null && (realmPhase === "entering" || realmPhase === "active")) {
      const bounds = realmVisibleBounds(
        world,
        realmData,
        new Set([...expandedParentsRef.current, realmData.rootId]),
        tokens,
      );
      const target = realmCameraTarget(bounds, tokens, width, height);
      cameraTargetRef.current = target;
      userDrivenCameraRef.current = false;
      dampingRef.current = tokens.cameraDampingDefault;
      cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
      beginCameraTween(target);
      return;
    }
    // 3D "reset" — the way back after spinning the dome until you are lost.
    // Eases the pose to the default (yaw 0.55, pitch 0.34) and fits the camera
    // to that pose's dome bbox. The yaw target is the equivalent angle nearest
    // the current one, so it never takes the long way round.
    const dome = domeRuntimeRef.current;
    if (dome !== null && dome.active) {
      const targetYaw = domeNearestYawTurn(0.55, dome.yaw);
      dome.yawVel = 0;
      // Drop the landing target too — new input and an explicit reset always win.
      dome.yawSnap = null;
      dome.pitchVel = 0;
      dome.orbiting = false;
      dome.poseTween = { startYaw: dome.yaw, startPitch: dome.pitch, targetYaw, targetPitch: DOME_PITCH_DEFAULT, startMs: performance.now(), durationMs: DOME_POSE_MS };
      // Auto-align is the explicit reset that sends the pose home, and it is
      // the one place the attention spin is rearmed after user interaction
      // lowered `spinArmed`.
      dome.spinArmed = true;
      const target = domeFitTarget(dome.model, targetYaw, DOME_PITCH_DEFAULT, width, height, tokens);
      if (target !== null) {
        cameraTargetRef.current = target;
        dome.fitScale = target.tscale;
        userDrivenCameraRef.current = false;
        dampingRef.current = tokens.cameraDampingDefault;
        cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
        beginCameraTween(target);
        lastActiveMsRef.current = performance.now();
        return;
      }
    }
    // Expand-all is a lens, and its frame is the lens fit. The overview fit
    // below reserves the tool lane and the docking-chip row on top and the
    // readout on the bottom, which is right for the spine but shrinks the
    // expanded map from 75 % to 63 % of the height and moves it — pressing
    // "fit" or "auto-arrange" after expand-all made the map jump to a second,
    // smaller frame of the same nodes (measured 2026-09-19 at 1512×806). One
    // lens, one frame: hand the fit to the lens while it is on.
    if (overviewFitRef.current === "full" && spotlightIdsRef.current !== null && runSpotlightFitRef.current?.()) {
      return;
    }
    // Panel-aware: spring back to the overview centered in the VISIBLE area, not
    // behind the left ReaderLens panel (design guardian's camera rejection). Fits the
    // SPINE bbox (not the full 295-node bounds) so "fit view" reframes the same
    // legible 8-node spine as the initial entry — and keeps `overviewScaleRef`
    // on the same spine bounds so the zoom-ratio/altitude anchor stays at ratio 1.
    const fitBounds = galaxyRef.current && galaxyLayoutRef.current
      ? galaxyLayoutRef.current.bounds
      : overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const measuredTokens = overviewFitTokens(cameraTokens(tokens), galaxyRef.current);
    const overviewTarget = computeOverviewCameraTarget(fitBounds, width, height, measuredTokens, world.nodes.length);
    cameraTargetRef.current = overviewTarget;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(fitBounds, width, height, measuredTokens, world.nodes.length);
    dampingRef.current = tokens.cameraDampingDefault;
    // Dive-zoom fix — "fit view"/relayout is a PROGRAMMATIC camera move, so it
    // eases via the cubic transition tween (reduced-motion → spring/snap), not
    // whatever a preceding wheel gesture left in interactive mode.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(overviewTarget);
  }, [beginCameraTween, cameraAngularFreqRef, cameraTargetRef, cameraTokens, clusteredIdsRef, dampingRef, domeFitTarget, domeRuntimeRef, expandedParentsRef, galaxyLayoutRef, galaxyRef, hasInitializedRef, lastActiveMsRef, overviewFitRef, overviewScaleRef, realmDataRef, realmTransitionRef, runSpotlightFitRef, spotlightIdsRef, userDrivenCameraRef, viewportRef, worldRef]);
  return { runOverviewFit };
}
