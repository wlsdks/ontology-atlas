"use client";
import { useCallback } from "react";

import {
  useLayoutEffect,
  useRef
} from "react";
import {
  ZERO_PARALLAX,
  type DepthParallaxOffset,
} from "../model/realm-depth-parallax";
import {
  INITIAL_REALM_TRANSITION_STATE,
  type RealmTransitionState
} from "../model/realm-transition";
import type { WardingFitState } from "../model/realm-warding-fit";
import type { ClusterBarLabels } from "../render/cluster-chips";
import { type RealmRuntimeData } from "./topology-realm-runtime";

interface Dependencies {
  realmCaption: string | null;
  clusterBarLabels: ClusterBarLabels | null;
  onEnterRealm: ((slug: string) => void) | undefined;
}

/** Own realm depth, transition state, and DOM anchor handoffs. */
export function useTopologyRealmState({
  realmCaption,
  clusterBarLabels,
  onEnterRealm,
}: Dependencies) {

  // --- Realm state ---
  /** Transition state machine (idle/entering/active/exiting). */
  const realmTransitionRef = useRef<RealmTransitionState>(INITIAL_REALM_TRANSITION_STATE);

  /** The current realm's transition-start data: subtree, relaid-out coords, warding ring, exit origins. */
  const realmDataRef = useRef<RealmRuntimeData | null>(null);

  /**
   * Has coordinate ownership been handed back to the ordinary paths (drag, sim,
   * homing) after the realm settled into `active`?
   *
   * Owner bug report: while the active phase overwrote `node.x = insideTargets`
   * every frame it fought the drag and nodes would not move. Now the first
   * settled frame snaps once, reseeds the sim, and sets this flag; later active
   * frames leave coordinates alone. Reset to false on entry and exit.
   */
  const realmActiveHandedOffRef = useRef(false);

  /**
   * Easing state for refitting the warding radius. Each frame measures the
   * target radius from the **visible** members (excluding density-gate
   * collapsed ones) and eases toward it over 240 ms — one ease per chip expand
   * or collapse, never a continuous animation. Reset to null on every entry so
   * the first frame seeds by snapping to the initial radius.
   */
  const wardingFitRef = useRef<WardingFitState | null>(null);

  // Previous `realmRootId`, for the enter/exit diff. Initialising to null is
  // the point: mounting from a `?realm=slug` deep link gives prev(null) ≠
  // realmRootId(slug), so the first effect fires realm entry and a shared link
  // or an agent reproduces the realm exactly.
  const prevRealmRootIdRef = useRef<string | null>(null);

  /** The node slug the orbit's enter button currently targets; the button's click reads it. */
  const realmEnterTargetRef = useRef<string | null>(null);

  /** `onEnterRealm` prop mirror, for the button listener's closure. */
  const onEnterRealmRef = useRef<typeof onEnterRealm>(onEnterRealm);

  /** Orbit button DOM mirror, so the mount-only rAF effect need not depend on the prop ref. */
  const realmEnterButtonElRef = useRef<HTMLButtonElement | null>(null);

  /** Guided-tour anchor circle DOM mirror — same reason as the realm button. */
  const tourAnchorElRef = useRef<HTMLDivElement | null>(null);

  // --- Depth parallax (reacts to camera input while a realm is active) ---
  /** Parallax offset for depth 2 (the capability ring), in world units. Converges to 0 when the camera stops. */
  const realmParallaxDepth2Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);

  /** Parallax offset for depth 3+ (the element ring), in world units. */
  const realmParallaxDepth3Ref = useRef<DepthParallaxOffset>(ZERO_PARALLAX);

  /** Previous frame's camera centre in world coords, for the parallax delta. null = no earlier sample. */
  const prevCameraCenterRef = useRef<{ x: number; y: number; } | null>(null);

  /**
   * This frame's parallax data (per-band offsets plus depthById). rAF refreshes
   * it every frame and pointer hit-testing reads it, so clicks land against the
   * **same** offsets the draw used. Non-null only while a realm is active and
   * the offsets are meaningful.
   */
  const realmParallaxRef = useRef<{
    depthById: ReadonlyMap<string, number>;
    depth2: DepthParallaxOffset;
    depth3: DepthParallaxOffset;
  } | null>(null);

  /**
   * This frame's depth-derived tier kind overrides. rAF fills it every frame
   * through the **same gate** the draw uses (null when no realm is active), and
   * pointer hit-testing reads it so depth-1 element children are clickable
   * exactly when they are drawn.
   */
  const realmTierKindsRef = useRef<ReadonlyMap<string, "project" | "domain" | "capability" | "element"> | null>(null);

  /** Cached `contains` ancestor chain of the realm root — treated as expanded so the outer density gate cannot hide the realm's interior. */
  const realmExpandChainRef = useRef<{ rootId: string; chain: ReadonlySet<string>; } | null>(null);

  /** Latest render inputs read by the mount-only rAF and pointer closures. */
  const realmCaptionRef = useRef<string | null>(realmCaption);

  const clusterBarLabelsRef = useRef<ClusterBarLabels | null>(clusterBarLabels);

  useLayoutEffect(() => {
    realmCaptionRef.current = realmCaption;
    clusterBarLabelsRef.current = clusterBarLabels;
  }, [realmCaption, clusterBarLabels]);
  const getRealmCaption = useCallback(() => realmCaptionRef.current, []);
  const getClusterBarLabels = useCallback(() => clusterBarLabelsRef.current, []);
  return {
    getRealmCaption, getClusterBarLabels, realmTransitionRef, realmDataRef, realmActiveHandedOffRef,
    wardingFitRef, prevRealmRootIdRef, realmEnterTargetRef, onEnterRealmRef, realmEnterButtonElRef,
    tourAnchorElRef, realmParallaxDepth2Ref, realmParallaxDepth3Ref, prevCameraCenterRef, realmParallaxRef,
    realmTierKindsRef, realmExpandChainRef, clusterBarLabelsRef,
  };
}
