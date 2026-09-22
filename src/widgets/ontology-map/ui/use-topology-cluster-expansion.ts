"use client";

import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import {
  useEffect,
  type RefObject
} from "react";
import type { CameraTarget } from "../engine/camera";
import { rankEgoNeighborsByDOI } from "../model/focus-state";
import { computeClusterFitTarget } from "./topology-camera-math";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { type TopologyWorld } from "./topology-world";

interface Dependencies {
  prevExpandedParentsRef: RefObject<ReadonlySet<string>>;
  expandedParents: ReadonlySet<string>;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  lastActiveMsRef: RefObject<number>;
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  hasInitializedRef: RefObject<boolean>;
  overviewScaleRef: RefObject<number>;
  expandPrefRef: RefObject<ExpandPreference>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  dampingRef: RefObject<number>;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  cameraAngularFreqRef: RefObject<number | null>;
  beginCameraTween: (target: CameraTarget, durationOverrideMs?: number) => void;
}

/** Apply expansion changes to the visibility and appearance clocks. */
export function useTopologyClusterExpansion({
  prevExpandedParentsRef,
  expandedParents,
  expandedParentsRef,
  lastActiveMsRef,
  worldRef,
  viewportRef,
  hasInitializedRef,
  overviewScaleRef,
  expandPrefRef,
  cameraTokens,
  dampingRef,
  cameraTargetRef,
  userDrivenCameraRef,
  cameraAngularFreqRef,
  beginCameraTween,
}: Dependencies) {

  useEffect(() => {
    const prev = prevExpandedParentsRef.current;
    prevExpandedParentsRef.current = expandedParents;
    expandedParentsRef.current = expandedParents;
    // An expansion toggle is a static state transition: wake even while idle
    // skipping so the collapsed children appearing or disappearing is drawn at
    // once.
    lastActiveMsRef.current = performance.now();

    // Dive the camera to the newly expanded parent, if there is one. A collapse
    // alone leaves the camera where it is (owner's instruction). The children
    // reveal naturally through tier alpha as the camera descends into the disc,
    // reusing the existing ramp rather than adding a motion contract.
    let newlyExpanded: string | null = null;
    for (const id of expandedParents) {
      if (!prev.has(id)) {
        newlyExpanded = id;
        break;
      }
    }
    if (newlyExpanded === null) return;
    const tokens = readOntologyMapTokensOrNull();
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!tokens || !world || width <= 0 || height <= 0 || !hasInitializedRef.current) return;
    const overviewEntryScale = overviewScaleRef.current * tokens.overviewEntryRatio;
    // The dive fits the bbox of **this batch** (the top DOI-ranked children),
    // not the whole disc: few and large beats pulling far back to contain, say,
    // all 108 children when only the top 24 are actually drawn. The rest are
    // collapsed, so they need no framing. Only gated children are ranked, by
    // the same rule as the density gate's domain exemption. Below the threshold
    // there is no restriction at all.
    const gatedChildren = (world.childrenByParent.get(newlyExpanded) ?? []).filter(
      (c) => world.nodeById.get(c)?.kind !== "domain",
    );
    // Batch size comes from the expansion preference. If framing disagrees with
    // how many are actually drawn, what we aimed to contain and what the user
    // sees diverge.
    const batchSize = expandPrefRef.current.batchSize;
    let batchRestrict: Set<string> | null = null;
    if (gatedChildren.length > batchSize) {
      const ranked = rankEgoNeighborsByDOI(
        gatedChildren.map((id) => ({
          id,
          kind: world.nodeById.get(id)?.kind ?? "element",
          degree: world.neighborMap.get(id)?.size ?? 0,
          // childrenByParent is derived from containment, so every entry is a
          // `contains` edge — a uniform weight, which keeps the relative order
          // deterministic.
          relationType: "contains",
        })),
      );
      batchRestrict = new Set<string>([newlyExpanded, ...ranked.slice(0, batchSize)]);
    }
    /*
     * Through `cameraTokens`, like every other camera move. The cluster dive was the
     * one that took the raw tokens, so it framed the fan against the whole window while
     * the INDEX panel or an inspector covered part of it — measured 2026-09-21 at
     * 1000×700 with the inspector open: thirteen of seventeen opened children landed
     * under the panel, and the camera reported a successful frame.
     */
    const target = computeClusterFitTarget(world, cameraTokens(tokens), width, height, newlyExpanded, overviewEntryScale, batchRestrict);
    if (!target) return;
    dampingRef.current = tokens.cameraDampingDefault;
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    // Programmatic camera move: a cubic ease-in-out tween, delegated to the
    // spring under reduced-motion. angfreq is the value the spring takes over
    // with once the tween ends or is interrupted.
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    beginCameraTween(target);
  }, [expandedParents, beginCameraTween, cameraTokens, prevExpandedParentsRef, expandedParentsRef, lastActiveMsRef, worldRef, viewportRef, hasInitializedRef, overviewScaleRef, expandPrefRef, dampingRef, cameraTargetRef, userDrivenCameraRef, cameraAngularFreqRef]);

}
