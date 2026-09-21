"use client";

import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import {
  useCallback,
  useEffect,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { computeGalaxyLayout, type GalaxyLayout } from "../model/galaxy-layout";
import { type HomeSpringState } from "../model/relayout-home";
import type { Pulse } from "../render/edge-fireflies";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { computeOverviewCameraTarget, computeOverviewFitScale, hasAnyNodeOnScreen } from "./topology-camera-math";
import type { UseTopologyLoopArgs } from "./topology-loop-contract";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "./topology-overview-fit";
import type { NodeDragState } from "./topology-pointer-handlers";
import { readOntologyMapTokensOrNull } from "./topology-read-tokens";
import { buildTopologyWorld, recomputeWorldGeometry, type TopologyWorld } from "./topology-world";

interface Dependencies {
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  cameraRef: RefObject<CameraAxes>;
  galaxyRef: RefObject<boolean>;
  galaxyLayoutRef: RefObject<GalaxyLayout | null>;
  overviewFitRef: RefObject<"full" | "spine">;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  hasInitializedRef: RefObject<boolean>;
  overviewScaleRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  pendingSpotlightFitRef: RefObject<boolean>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  nodes: UseTopologyLoopArgs["nodes"];
  edges: UseTopologyLoopArgs["edges"];
  expand: ExpandPreference;
  galaxyFlatReturnPositionsRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  galaxyLayoutHandoffRef: RefObject<"flat" | "galaxy" | null>;
  prevNodeIdsRef: RefObject<Set<string>>;
  appearRef: RefObject<Map<string, number>>;
  bornNodeIdsRef: RefObject<Set<string>>;
  hasDependsEdgesRef: RefObject<boolean>;
  hasContainsEdgesRef: RefObject<boolean>;
  pulsesRef: RefObject<Pulse[]>;
  simRef: RefObject<ForceSimulation | null>;
  nodeDragRef: RefObject<NodeDragState | null>;
  heatRef: RefObject<number>;
  dragAffectedSetRef: RefObject<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>;
  dragStartPosRef: RefObject<{ x: number; y: number; } | null>;
  dragTugOffsetsRef: RefObject<Map<string, SpringOffset>>;
  homeSpringsRef: RefObject<Map<string, HomeSpringState>>;
  homingActiveRef: RefObject<boolean>;
  homeTargetOverrideRef: RefObject<ReadonlyMap<string, { x: number; y: number; }> | null>;
  prevPinnedNodeIdRef: RefObject<string | null>;
  onVisibleCountChange: ((visible: number) => void) | undefined;
  onGraphStatsChange: ((stats: { nodes: number; relations: number; }) => void) | undefined;
  dataSourceKey: string | null;
  fittedDataSourceKeyRef: RefObject<string | null>;
  galaxyModeCameraRef: RefObject<{ flat: { target: CameraTarget; userDriven: boolean; } | null; galaxy: { target: CameraTarget; userDriven: boolean; } | null; }>;
  pendingFlatCameraRef: RefObject<{ target: CameraTarget; overviewScale: number; gestureRevision: number; userDriven: boolean; } | null>;
}

/** Construct the world and simulation; own initial fit, source changes, and disposal. */
export function useTopologyWorldLifecycle({
  worldRef,
  viewportRef,
  cameraRef,
  galaxyRef,
  galaxyLayoutRef,
  overviewFitRef,
  expandedParentsRef,
  clusteredIdsRef,
  cameraTokens,
  cameraTargetRef,
  userDrivenCameraRef,
  hasInitializedRef,
  overviewScaleRef,
  cameraAngularFreqRef,
  pendingSpotlightFitRef,
  runSpotlightFitRef,
  containerRef,
  nodes,
  edges,
  expand,
  galaxyFlatReturnPositionsRef,
  galaxyLayoutHandoffRef,
  prevNodeIdsRef,
  appearRef,
  bornNodeIdsRef,
  hasDependsEdgesRef,
  hasContainsEdgesRef,
  pulsesRef,
  simRef,
  nodeDragRef,
  heatRef,
  dragAffectedSetRef,
  dragStartPosRef,
  dragTugOffsetsRef,
  homeSpringsRef,
  homingActiveRef,
  homeTargetOverrideRef,
  prevPinnedNodeIdRef,
  onVisibleCountChange,
  onGraphStatsChange,
  dataSourceKey,
  fittedDataSourceKeyRef,
  galaxyModeCameraRef,
  pendingFlatCameraRef,
}: Dependencies) {

  /**
   * Safety net: if a resize or a monitor change leaves **no node on screen at
   * all**, return to the overview fit.
   *
   * The discipline is not to refit on every resize. A zoom and position the
   * user set are intent, and erasing them is its own kind of defect. This
   * intervenes only in the unambiguous "the map looks empty" state
   * (`hasAnyNodeOnScreen === false`), and moves the spring target rather than
   * the value so nothing jumps; reduced-motion is already honoured by the
   * camera tween contract.
   */
  const rescueCameraIfEverythingOffscreen = useCallback((tokens: OntologyMapTokens) => {
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    if (hasAnyNodeOnScreen(cameraRef.current, width, height, world.nodes)) return;
    const fitBounds = galaxyRef.current && galaxyLayoutRef.current
      ? galaxyLayoutRef.current.bounds
      : overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const target = computeOverviewCameraTarget(
      fitBounds,
      width,
      height,
      overviewFitTokens(cameraTokens(tokens), galaxyRef.current),
      world.nodes.length,
    );
    cameraTargetRef.current = { tx: target.tx, ty: target.ty, tscale: target.tscale };
    userDrivenCameraRef.current = false;
  }, [cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, galaxyLayoutRef, galaxyRef, overviewFitRef, userDrivenCameraRef, viewportRef, worldRef]);

  const trySnapInitialCamera = useCallback((tokens: OntologyMapTokens) => {
    if (hasInitializedRef.current) return;
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    const fitBounds = galaxyRef.current && galaxyLayoutRef.current
      ? galaxyLayoutRef.current.bounds
      : overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const measuredTokens = overviewFitTokens(cameraTokens(tokens), galaxyRef.current);
    const target = computeOverviewCameraTarget(
      fitBounds,
      width,
      height,
      measuredTokens,
      world.nodes.length,
    );
    cameraRef.current = {
      x: { value: target.tx, velocity: 0 },
      y: { value: target.ty, velocity: 0 },
      scale: { value: target.tscale, velocity: 0 },
    };
    cameraTargetRef.current = target;
    userDrivenCameraRef.current = false;
    overviewScaleRef.current = computeOverviewFitScale(
      fitBounds,
      width,
      height,
      measuredTokens,
      world.nodes.length,
    );
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    hasInitializedRef.current = true;
    if (pendingSpotlightFitRef.current && runSpotlightFitRef.current?.()) {
      pendingSpotlightFitRef.current = false;
    }
  }, [cameraAngularFreqRef, cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, galaxyLayoutRef, galaxyRef, hasInitializedRef, overviewFitRef, overviewScaleRef, pendingSpotlightFitRef, runSpotlightFitRef, userDrivenCameraRef, viewportRef, worldRef]);

  // --- world (layout + adjacency) — rebuilt whenever the graph itself changes ---
  useEffect(() => {
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return;
    // Contract point for installed-app proof: desktop WebView verification
    // reads the click-cancel hysteresis from here. Exposes the token verbatim.
    containerRef.current?.setAttribute(
      "data-stage-pan-click-cancel-px",
      String(tokens.hysteresisPx),
    );
    // The expansion structure decides the **seed coordinates**, so it is an
    // input to the world build and appears in the dep array below: changing the
    // preference rebuilds the world and children move to the new placement.
    const world = buildTopologyWorld(nodes, edges, tokens, expand.structure);
    const galaxyLayout = computeGalaxyLayout(
      world.nodes.map((node) => ({ id: node.id, kind: node.kind, parentId: node.parentId })),
      {
        domain: tokens.layoutRingDomain,
        capability: tokens.layoutRingCapability,
        element: tokens.layoutRingElement,
      },
    );
    galaxyLayoutRef.current = galaxyLayout;
    if (galaxyRef.current) {
      galaxyFlatReturnPositionsRef.current = new Map(
        world.nodes.map((node) => [node.id, { x: node.x, y: node.y }]),
      );
      for (const node of world.nodes) {
        const target = galaxyLayout.points.get(node.id);
        if (!target) continue;
        node.x = target.x;
        node.y = target.y;
      }
      recomputeWorldGeometry(world, tokens);
      galaxyLayoutHandoffRef.current = null;
    } else {
      galaxyFlatReturnPositionsRef.current = null;
      galaxyLayoutHandoffRef.current = null;
    }
    worldRef.current = world;
    // Seed the new-node appearance ramp. On the first build (no previous set)
    // everything is 1, so nothing animates and this cannot collide with the
    // initial-load choreography. Later builds seed only previously unseen ids
    // at 0 and leave existing nodes at 1; vanished ids are pruned. Convergence
    // itself belongs to the frame loop (`stepTopologyPhysics`).
    {
      const prevIds = prevNodeIdsRef.current;
      const appear = appearRef.current;
      const isFirstBuild = prevIds.size === 0;
      const nextIds = new Set<string>();
      for (const n of world.nodes) {
        nextIds.add(n.id);
        if (isFirstBuild || prevIds.has(n.id)) {
          if (!appear.has(n.id)) appear.set(n.id, 1);
        } else {
          appear.set(n.id, 0); // New node — swells into view from 0.
          bornNodeIdsRef.current.add(n.id); // Tier-gate exemption; see `bornNodeIdsRef`.
        }
      }
      for (const id of [...appear.keys()]) if (!nextIds.has(id)) appear.delete(id);
      for (const id of [...bornNodeIdsRef.current]) if (!nextIds.has(id)) bornNodeIdsRef.current.delete(id);
      prevNodeIdsRef.current = nextIds;
    }
    // Cache whether comets can ever run, so the idle gate can decide.
    hasDependsEdgesRef.current = world.edges.some((e) => e.kind === "depends");
    hasContainsEdgesRef.current = world.edges.some((e) => e.kind === "contains");
    // A new world invalidates pulses aimed at the old world's edges.
    pulsesRef.current = [];
    // Seed the force sim off the concentric layout (spatial memory) and warm it
    // so it settles into an organic layout that un-piles the fan-arcs.
    simRef.current = createForceSimulation(
      world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
      world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
    );
    nodeDragRef.current = null;
    // No load-time settle: the sim stays cold until a node is pin-dragged. The
    // static default is the deterministic de-piled grid from `topology-world`.
    heatRef.current = 0;
    // A graph rebuild invalidates any in-flight drag/tug/homing state — those
    // ids/refs point at the OLD world's nodes.
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    homeSpringsRef.current.clear();
    homingActiveRef.current = false;
    homeTargetOverrideRef.current = null;
    prevPinnedNodeIdRef.current = null;
    onVisibleCountChange?.(nodes.length);
    onGraphStatsChange?.({ nodes: nodes.length, relations: edges.length });
    /*
     * **A different data source refits the overview** (decision ledger
     * 2026-08-08 (3) ②).
     *
     * `trySnapInitialCamera` ran once, guarded by `hasInitializedRef`, so
     * opening a vault mid-session (sample → local) **drew the new graph with
     * the previous graph's camera**, leaving the new world's outermost nodes
     * outside the chrome safe area.
     *
     * The single trigger is source identity; triggering on node count would
     * hijack the camera every time the user adds one. Lowering the
     * initialization flag reuses the **same overview fit path**, so safe-area
     * fit, the `overviewScaleRef` anchor and reduced-motion handling all come
     * along for free.
     *
     * ⚠️ **`null` means "not known yet", not "changed".** The vault identity
     * string **lies while loading**: every live refresh sends `load()` back to
     * status `'loading'` (`use-local-vault.ts`), so the identity computed then
     * is `sample:<sample>` rather than `local:<folder>`. Counting that as a
     * change **hijacks the camera on every file saved into the vault** —
     * measured 2026-08-08: adding one node jumped it dx −3.93, dy −10.66,
     * scale −0.0327. So the caller passes `null` until it settles (HomePage's
     * `deeplinkSourceReady`) and this compares only against the last value it
     * knew.
     */
    if (dataSourceKey !== null && dataSourceKey !== fittedDataSourceKeyRef.current) {
      fittedDataSourceKeyRef.current = dataSourceKey;
      galaxyModeCameraRef.current = { flat: null, galaxy: null };
      pendingFlatCameraRef.current = null;
      hasInitializedRef.current = false;
    }
    trySnapInitialCamera(tokens);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, expand.structure]);
  return { rescueCameraIfEverythingOffscreen, trySnapInitialCamera };
}
