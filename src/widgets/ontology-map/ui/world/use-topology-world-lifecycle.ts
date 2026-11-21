"use client";

import type { ExpandPreference } from "@/shared/lib/preferences/expand-preferences";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../../engine/camera";
import type { DomeRuntime } from "../../model/dome-view/runtime";
import {
  type SpringOffset,
} from "../../expressive/release-offsets";
import { ARRIVAL_GLIDE_CONCEPT_CEILING } from "../../morph/layout-morph";
import { armTierAssembly, carryTierAssembly, claimTierAssembly, FLAT_TIER_TIMING, isTierAssembling, settleTierAssembly, TIER_ASSEMBLE_TOTAL_MS } from "../../morph/tier-assembly";
import { createForceSimulation, type ForceSimulation } from "../../model/layout/force-layout";
import { initHomeSpring, type HomeSpringState } from "../../model/layout/relayout-home";
import type { Pulse } from "../../render/edge-fireflies";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { hasAnyNodeOnScreen } from "../camera/topology-camera-math";
import { computeOverviewCameraTarget, computeOverviewFitScale, overviewEntryArea } from "../camera/target/fit-targets";
import { layoutSizeOf } from "../camera/use-topology-viewport-lifecycle";
import type { UseTopologyLoopArgs } from "../loop/topology-loop-contract";
import {
  overviewBoundsFor,
  overviewFitTokens
} from "../camera/topology-overview-fit";
import type { NodeDragState } from "../input/topology-pointer-types";
import { readOntologyMapTokensOrNull } from "../../tokens/topology-read-tokens";
import { buildTopologyWorldSteps, type TopologyWorld } from "./topology-world";
import { dialOverviewFit } from "./framing/dial-world-framing";
import { recomputeWorldGeometry } from "./world-geometry";
import { runStepsSliced } from "./run-steps-sliced";
import { announceWorldSwap, isWorldBuilding, markWorldBuilding } from "./world-swap";
import type { FlatRingMemoryStore } from "../loop/topology-loop-contract";
import { createMeasureText } from "../../dial/fit";
import { readDialTokens } from "../../dial/tokens";
import { claimDialOrderFolder } from "../../dial/order";
import { claimFlatGraphFolder, settleFlatGraph } from "../../flat-graph/scene";
import { readFlatGraphTokens } from "../../flat-graph/tokens";
import { labelFontFamily } from "../../render/labels";
import type { FlatGraphTokens } from "../../flat-graph/flat-graph-shapes";
import { createDialPlacement, dialPlacementOf, setDialPlacement, type DialPlacementState } from "../../dial/placement";
import type { DialLabels, DialMemory, DialWorldInput } from "../../dial/dial-shapes";

interface Dependencies {
  worldRef: RefObject<TopologyWorld | null>;
  viewportRef: RefObject<{ width: number; height: number; dpr: number; }>;
  cameraRef: RefObject<CameraAxes>;
    overviewFitRef: RefObject<"full" | "spine">;
  expandedParentsRef: RefObject<ReadonlySet<string>>;
  clusteredIdsRef: RefObject<ReadonlySet<string>>;
  cameraTokens: <T extends { safeInsetLeft: number; safeInsetRight: number; }>(tokens: T) => T;
  cameraTargetRef: RefObject<CameraTarget>;
  userDrivenCameraRef: RefObject<boolean>;
  hasInitializedRef: RefObject<boolean>;
  domeRuntimeRef: RefObject<DomeRuntime | null>;
  overviewScaleRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  pendingSpotlightFitRef: RefObject<boolean>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  nodes: UseTopologyLoopArgs["nodes"];
  edges: UseTopologyLoopArgs["edges"];
  expand: ExpandPreference;
  previousNodeIdsRef: RefObject<Set<string>>;
  appearRef: RefObject<Map<string, number>>;
  bornNodeIdsRef: RefObject<Set<string>>;
  hasDependsEdgesRef: RefObject<boolean>;
  hasContainsEdgesRef: RefObject<boolean>;
  lastActiveMsRef: RefObject<number>;
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
  previousPinnedNodeIdRef: RefObject<string | null>;
  onVisibleCountChange: ((visible: number) => void) | undefined;
  onGraphStatsChange: ((stats: { nodes: number; relations: number; }) => void) | undefined;
  dataSourceKey: string | null;
  assembleOnOpen: boolean;
  arrivingDocuments: number;
  fittedDataSourceKeyRef: RefObject<string | null>;
    pendingFlatCameraRef: RefObject<{ target: CameraTarget; overviewScale: number; gestureRevision: number; userDriven: boolean; } | null>;
  dialLabels: DialLabels | null;
  flatRingMemory: FlatRingMemoryStore | null;
  loadProgress: { read: number; total: number;
    } | null;
  placingTierRead: boolean;
}

const SIM_AFTER_ASSEMBLY_MS = 400;

type GraphArea = (graph: FlatGraphTokens) => { width: number; height: number } | null;

function dialWorldInput(labels: DialLabels | null, memory: DialMemory | null, areaOf: GraphArea): DialWorldInput | null {
  try {
    const graph = readFlatGraphTokens();
    return { graph, graphAreaPx: areaOf(graph), labels, tokens: readDialTokens(), measureText: createMeasureText(), rememberOrder: true, memory };
  } catch {
    return null;
  }
}

export function useTopologyWorldLifecycle({
  worldRef,
  viewportRef,
  cameraRef, overviewFitRef,
  expandedParentsRef,
  clusteredIdsRef,
  cameraTokens,
  cameraTargetRef,
  userDrivenCameraRef,
  hasInitializedRef,
  domeRuntimeRef,
  overviewScaleRef,
  cameraAngularFreqRef,
  pendingSpotlightFitRef,
  runSpotlightFitRef,
  containerRef,
  nodes,
  edges,
  expand,
  previousNodeIdsRef,
  appearRef,
  bornNodeIdsRef,
  hasDependsEdgesRef,
  hasContainsEdgesRef,
  lastActiveMsRef,
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
  previousPinnedNodeIdRef,
  onVisibleCountChange,
  onGraphStatsChange,
  dataSourceKey,
  assembleOnOpen,
  arrivingDocuments,
  fittedDataSourceKeyRef,
  pendingFlatCameraRef,
  dialLabels,
  flatRingMemory,
  loadProgress,
  placingTierRead,
}: Dependencies) {
  const arriving = arrivingDocuments > 0;
  const arrivingRef = useRef(arriving);
  const arrivalStillRef = useRef(false);
  const arrivalGlideRef = useRef(false);
  const [dialPlacement] = useState(createDialPlacement);
  const placementStateRef = useRef<DialPlacementState>("settled");
  const pendingSimRef = useRef<{ world: TopologyWorld; nodes: { id: string; x: number; y: number;
        }[];
        edges: {
            source: string;
            target: string;
        }[];
    } | null>(null);
  const buildPendingSim = useCallback(() => {
    const pending = pendingSimRef.current;
    pendingSimRef.current = null;
    if (pending && worldRef.current === pending.world && simRef.current === null) simRef.current = createForceSimulation(pending.nodes, pending.edges);
  }, [simRef, worldRef]);
  const provisionalMemoryRef = useRef<DialMemory | null>(null);

  const rescueCameraIfEverythingOffscreen = useCallback((tokens: OntologyMapTokens) => {
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    if (hasAnyNodeOnScreen(cameraRef.current, width, height, world.nodes)) return;
    const fitBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const target = computeOverviewCameraTarget(
      fitBounds,
      width,
      height,
      overviewFitTokens(cameraTokens(tokens)), world.nodes.length, dialOverviewFit(world));
    cameraTargetRef.current = { tx: target.tx, ty: target.ty, tscale: target.tscale };
    userDrivenCameraRef.current = false;
  }, [cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, overviewFitRef, userDrivenCameraRef, viewportRef, worldRef]);

  const trySnapInitialCamera = useCallback((tokens: OntologyMapTokens) => {
    if (hasInitializedRef.current) return;
    const world = worldRef.current;
    const { width, height } = viewportRef.current;
    if (!world || width <= 0 || height <= 0) return;
    // An active dome has fitted the camera itself and keeps the structure where it stands across a
    // rebuilt world; a flat fit here would land the 3D entry on the flat overview.
    if (domeRuntimeRef.current?.active) {
      hasInitializedRef.current = true;
      return;
    }
    const fitBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const measuredTokens = overviewFitTokens(cameraTokens(tokens));
        const dialFit = dialOverviewFit(world);
    const target = computeOverviewCameraTarget(
      fitBounds,
      width,
      height,
      measuredTokens,
      world.nodes.length,
      dialFit);
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
      dialFit);
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    hasInitializedRef.current = true;
    if (pendingSpotlightFitRef.current && runSpotlightFitRef.current?.()) {
      pendingSpotlightFitRef.current = false;
    }
  }, [cameraAngularFreqRef, cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, domeRuntimeRef, hasInitializedRef, overviewFitRef, overviewScaleRef, pendingSpotlightFitRef, runSpotlightFitRef, userDrivenCameraRef, viewportRef, worldRef]);

  /** Aims the camera at `world`'s overview unless a gesture or the dome owns it; `still` lands it this frame, otherwise its spring carries it there. */
  const aimOverview = useCallback((world: TopologyWorld, tokens: OntologyMapTokens, still: boolean) => {
    const { width, height } = viewportRef.current;
    if (userDrivenCameraRef.current || domeRuntimeRef.current?.active || width <= 0 || height <= 0) return;
    const fitBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
    const measuredTokens = overviewFitTokens(cameraTokens(tokens));
    const dialFit = dialOverviewFit(world);
    const target = computeOverviewCameraTarget(fitBounds, width, height, measuredTokens, world.nodes.length, dialFit);
    cameraTargetRef.current = target;
    overviewScaleRef.current = computeOverviewFitScale(fitBounds, width, height, measuredTokens, world.nodes.length, dialFit);
    if (still) {
      cameraRef.current = {
        x: { value: target.tx, velocity: 0 },
        y: { value: target.ty, velocity: 0 },
        scale: { value: target.tscale, velocity: 0 },
      };
    }
  }, [cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, domeRuntimeRef, expandedParentsRef, overviewFitRef, overviewScaleRef, userDrivenCameraRef, viewportRef]);

  /** Concepts replaced the fitted ones while no source was named; the source named next is theirs and owes them the opening fit. */
  const unnamedConceptsRef = useRef(false);

  const glideArrivedWorld = (previousWorld: TopologyWorld, world: TopologyWorld, tokens: OntologyMapTokens, still: boolean) => {
    aimOverview(world, tokens, still);
    if (still || isTierAssembling(world)) return;
    const springs = new Map<string, HomeSpringState>();
    for (const node of world.nodes) {
      const before = previousWorld.nodeById.get(node.id);
      if (!before || (before.x === node.x && before.y === node.y)) continue;
      springs.set(node.id, initHomeSpring(before.x, before.y));
      node.x = before.x;
      node.y = before.y;
    }
    if (springs.size === 0) return;
    recomputeWorldGeometry(world, tokens);
    homeSpringsRef.current = springs;
    homeTargetOverrideRef.current = null;
    homingActiveRef.current = true;
  };

  // A reopened folder's concepts can reach the map before its key; the key then claims the fit the
  // rebuild would have made, and the camera glides there from the frames already drawn.
  const claimUnnamedFit = useCallback((key: string | null) => {
    if (key === null || !unnamedConceptsRef.current) return;
    unnamedConceptsRef.current = false;
    if (key === fittedDataSourceKeyRef.current) return;
    fittedDataSourceKeyRef.current = key;
    pendingFlatCameraRef.current = null;
    const world = worldRef.current;
    const tokens = readOntologyMapTokensOrNull();
    if (!world || !tokens) return;
    aimOverview(world, tokens, false);
    cameraAngularFreqRef.current = tokens.cameraSpringAngFreqTransition;
    lastActiveMsRef.current = performance.now();
  }, [aimOverview, cameraAngularFreqRef, fittedDataSourceKeyRef, lastActiveMsRef, pendingFlatCameraRef, worldRef]);
  const claimSource = useCallback((key: string | null) => {
    if (key !== null && worldRef.current) claimTierAssembly(worldRef.current, key);
    const dial = key === null ? null : worldRef.current?.dial;
    if (dial && placementStateRef.current === "settled") flatRingMemory?.write(dial.scene.memory);
  }, [flatRingMemory, worldRef]);

  // The source key last applied to a world; one named while a build is in flight waits for its swap.
  const appliedKeyRef = useRef<string | null>(null);
  const applySource = useCallback((key: string | null) => {
    appliedKeyRef.current = key;
    claimUnnamedFit(key);
    claimSource(key);
  }, [claimSource, claimUnnamedFit]);
  const [, setBuildFailure] = useState<null>(null);
  const latest = useLatestRef({ nodes, edges, onGraphStatsChange, onVisibleCountChange, dataSourceKey, loadProgress, applySource });
  useEffect(() => {
    const live = latest.current;
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return;
    containerRef.current?.setAttribute(
      "data-stage-pan-click-cancel-px",
      String(tokens.hysteresisPx));
    if (dataSourceKey !== null) {
      claimDialOrderFolder(dataSourceKey);
      claimFlatGraphFolder(dataSourceKey);
    }
    const ringMemory = dataSourceKey === null ? null : flatRingMemory;
    const stored = ringMemory?.current() ?? null;
    let placed = { state: "settled" as DialPlacementState, held: 0 };
    const placeDial = (model: Parameters<typeof dialPlacement.next>[0]["model"]) => {
      const step = dialPlacement.next({ model, reading: arriving, capabilityTierRead: placingTierRead, memory: stored });
      placed = { state: step.state, held: step.held };
      return step.model;
    };
    const graphArea: GraphArea = (graph) => {
      const measured = viewportRef.current;
      const container = containerRef.current;
      const size = measured.width > 0 && measured.height > 0 ? measured : container ? layoutSizeOf(container) : null;
      if (!size || size.width <= 0 || size.height <= 0) return null;
      const pad = graph.paint.domainNamePx;
      return overviewEntryArea(size.width, size.height, overviewFitTokens(cameraTokens(tokens)), { padPx: { left: pad, right: pad, top: pad, bottom: pad } });
    };
    let simTask: ReturnType<typeof setTimeout> | undefined;
    const swapIn = (world: TopologyWorld) => {
      markWorldBuilding(worldRef, false);
      const glidingFromArrival = arrivalGlideRef.current && homingActiveRef.current;
      const firstPlacement = world.dial != null && placementStateRef.current === "reading" && placed.state !== "reading";
      placementStateRef.current = placed.state;
      if (world.dial) {
        setDialPlacement(world.dial, { ...placed, progress: latest.current.loadProgress });
        if (placed.state === "settled") ringMemory?.write(world.dial.scene.memory);
        if (world.dial.scene.graph) settleFlatGraph(world.dial.model, world.dial.scene.graph, placed.state, labelFontFamily());
        provisionalMemoryRef.current = placed.state === "provisional" ? world.dial.scene.memory : null;
      }
      const previousWorld = worldRef.current;
      worldRef.current = world;
      let armAssembly = previousNodeIdsRef.current.size === 0 && dataSourceKey === null;
      let conceptsReplaced = false;
      {
        const previousIds = previousNodeIdsRef.current;
        const appear = appearRef.current;
        const isFirstBuild = previousIds.size === 0;
        const nextIds = new Set<string>();
        for (const n of world.nodes) {
          nextIds.add(n.id);
          if (isFirstBuild || previousIds.has(n.id)) {
            if (!appear.has(n.id)) appear.set(n.id, 1);
          } else {
            appear.set(n.id, 0);
            bornNodeIdsRef.current.add(n.id);
            conceptsReplaced = true;
          }
        }
        if (!isFirstBuild && nextIds.size !== previousIds.size) conceptsReplaced = true;
        for (const id of [...appear.keys()]) if (!nextIds.has(id)) appear.delete(id);
        for (const id of [...bornNodeIdsRef.current]) if (!nextIds.has(id)) bornNodeIdsRef.current.delete(id);
        previousNodeIdsRef.current = nextIds;
      }
      hasDependsEdgesRef.current = world.edges.some((e) => e.kind === "depends");
      hasContainsEdgesRef.current = world.edges.some((e) => e.kind === "contains");
      pulsesRef.current = [];
      simRef.current = null;
      pendingSimRef.current = {
        world,
        nodes: world.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y })),
        edges: world.edges.map((e) => ({ source: e.sourceId, target: e.targetId })),
      };
      simTask = setTimeout(buildPendingSim, TIER_ASSEMBLE_TOTAL_MS + SIM_AFTER_ASSEMBLY_MS);
      nodeDragRef.current = null;
      heatRef.current = 0;
      dragAffectedSetRef.current = null;
      dragStartPosRef.current = null;
      dragTugOffsetsRef.current.clear();
      homeSpringsRef.current.clear();
      homingActiveRef.current = false;
      homeTargetOverrideRef.current = null;
      previousPinnedNodeIdRef.current = null;
      live.onVisibleCountChange?.(live.nodes.length);
      live.onGraphStatsChange?.({ nodes: live.nodes.length, relations: live.edges.length });
      if (dataSourceKey !== null && dataSourceKey !== fittedDataSourceKeyRef.current) {
        fittedDataSourceKeyRef.current = dataSourceKey;
        pendingFlatCameraRef.current = null;
        hasInitializedRef.current = false;
        armAssembly = true;
      }
      if (firstPlacement) {
        armAssembly = true;
        if (!userDrivenCameraRef.current) hasInitializedRef.current = false;
      }
      if (dataSourceKey !== null || !hasInitializedRef.current) unnamedConceptsRef.current = false;
      else if (conceptsReplaced) unnamedConceptsRef.current = true;
      const grew = arriving || arrivingRef.current || glidingFromArrival;
      arrivingRef.current = arriving;
      arrivalGlideRef.current = grew;
      if (arriving) arrivalStillRef.current = arrivingDocuments > ARRIVAL_GLIDE_CONCEPT_CEILING;
      const arrivalStill = grew && arrivalStillRef.current;
      if (armAssembly) {
        armTierAssembly(world, firstPlacement ? null : dataSourceKey, arrivalStill || (world.dial != null && stored !== null) || window.matchMedia("(prefers-reduced-motion: reduce)").matches, world.dial?.scene.graph ? FLAT_TIER_TIMING : undefined);
        if (!assembleOnOpen) settleTierAssembly(world);
      } else if (!grew) {
        carryTierAssembly(previousWorld, world);
      }
      if (grew && !armAssembly && previousWorld && hasInitializedRef.current) glideArrivedWorld(previousWorld, world, tokens, arrivalStill);
      trySnapInitialCamera(tokens);
      lastActiveMsRef.current = performance.now();
      const namedSince = latest.current.dataSourceKey;
      if (namedSince !== appliedKeyRef.current) latest.current.applySource(namedSince);
      announceWorldSwap(worldRef);
    };
    // The previous world stays drawn until this build swaps in; a newer input cancels it first.
    markWorldBuilding(worldRef, true);
    const fail = (error: unknown) => setBuildFailure(() => {
      throw error;
    });
    const cancel = runStepsSliced(buildTopologyWorldSteps(live.nodes, live.edges, tokens, expand.structure, dialWorldInput(dialLabels, provisionalMemoryRef.current ?? stored, graphArea), placeDial), swapIn, fail);
    return () => {
      markWorldBuilding(worldRef, false);
      cancel();
      clearTimeout(simTask);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only graph and placement inputs rebuild the world; commands and progress have separate effects.
    }, [nodes, edges, expand.structure, dialLabels, arriving, placingTierRead]);
    useEffect(() => {
        const dial = worldRef.current?.dial;
        if (!dial || placementStateRef.current === "settled")
            return;
        setDialPlacement(dial, { ...dialPlacementOf(dial), progress: loadProgress });
        lastActiveMsRef.current = performance.now();
    }, [loadProgress, worldRef, lastActiveMsRef]);
    useEffect(() => {
        if (!isWorldBuilding(worldRef)) applySource(dataSourceKey);
    }, [applySource, dataSourceKey, worldRef]);
    useEffect(() => {
        const container = containerRef.current;
        if (!container)
            return;
        const settle = () => {
            buildPendingSim();
            if (worldRef.current)
                settleTierAssembly(worldRef.current);
        };
        const events = ["pointerdown", "wheel", "touchstart"] as const;
        for (const type of events)
            container.addEventListener(type, settle, { capture: true, passive: true });
        window.addEventListener("keydown", settle, { capture: true });
        return () => {
            for (const type of events)
                container.removeEventListener(type, settle, { capture: true });
            window.removeEventListener("keydown", settle, { capture: true });
        };
    }, [buildPendingSim, containerRef, worldRef]);
    return { rescueCameraIfEverythingOffscreen, trySnapInitialCamera };
}
