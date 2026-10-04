"use client";

import type { ExpandPreference } from "@/shared/lib/appearance-preferences";
import { useLatestRef } from "@/shared/lib/use-latest-ref";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject
} from "react";
import type { CameraAxes, CameraTarget } from "../engine/camera";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { ARRIVAL_GLIDE_CONCEPT_CEILING } from "../morph/layout-morph";
import { armTierAssembly, carryTierAssembly, claimTierAssembly, isTierAssembling, settleTierAssembly, TIER_ASSEMBLE_TOTAL_MS } from "../morph/tier-assembly";
import { createForceSimulation, type ForceSimulation } from "../model/force-layout";
import { initHomeSpring, type HomeSpringState } from "../model/relayout-home";
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
import { buildTopologyWorld, dialOverviewFit, recomputeWorldGeometry, type TopologyWorld } from "./topology-world";
import type { FlatRingMemoryStore } from "./topology-loop-contract";
import { createMeasureText } from "../dial/fit";
import { readDialTokens } from "../dial/tokens";
import { claimDialOrderFolder } from "../dial/order";
import { createDialPlacement, dialPlacementOf, setDialPlacement, type DialPlacementState } from "../dial/placement";
import type { DialLabels, DialMemory, DialWorldInput } from "../dial/types";

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
  overviewScaleRef: RefObject<number>;
  cameraAngularFreqRef: RefObject<number | null>;
  pendingSpotlightFitRef: RefObject<boolean>;
  runSpotlightFitRef: RefObject<(() => boolean) | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  nodes: UseTopologyLoopArgs["nodes"];
  edges: UseTopologyLoopArgs["edges"];
  expand: ExpandPreference;
  prevNodeIdsRef: RefObject<Set<string>>;
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
  prevPinnedNodeIdRef: RefObject<string | null>;
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

function dialWorldInput(labels: DialLabels | null, memory: DialMemory | null): DialWorldInput | null {
  try {
    return { labels, tokens: readDialTokens(), measureText: createMeasureText(), rememberOrder: true, memory };
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
  overviewScaleRef,
  cameraAngularFreqRef,
  pendingSpotlightFitRef,
  runSpotlightFitRef,
  containerRef,
  nodes,
  edges,
  expand,
  prevNodeIdsRef,
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
  prevPinnedNodeIdRef,
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
  }, [cameraAngularFreqRef, cameraRef, cameraTargetRef, cameraTokens, clusteredIdsRef, expandedParentsRef, hasInitializedRef, overviewFitRef, overviewScaleRef, pendingSpotlightFitRef, runSpotlightFitRef, userDrivenCameraRef, viewportRef, worldRef]);

  const glideArrivedWorld = (previousWorld: TopologyWorld, world: TopologyWorld, tokens: OntologyMapTokens, still: boolean) => {
    const { width, height } = viewportRef.current;
    if (!userDrivenCameraRef.current && width > 0 && height > 0) {
      const fitBounds = overviewBoundsFor(overviewFitRef.current, world, tokens, expandedParentsRef.current, clusteredIdsRef.current);
      const measuredTokens = overviewFitTokens(cameraTokens(tokens));
      const target = computeOverviewCameraTarget(fitBounds, width, height, measuredTokens, world.nodes.length, dialOverviewFit(world));
      cameraTargetRef.current = target;
      overviewScaleRef.current = computeOverviewFitScale(fitBounds, width, height, measuredTokens, world.nodes.length, dialOverviewFit(world));
      if (still) {
        cameraRef.current = {
          x: { value: target.tx, velocity: 0 },
          y: { value: target.ty, velocity: 0 },
          scale: { value: target.tscale, velocity: 0 },
        };
      }
    }
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

  const latest = useLatestRef({ nodes, edges, onGraphStatsChange, onVisibleCountChange });
  useEffect(() => {
    const live = latest.current;
    const tokens = readOntologyMapTokensOrNull();
    if (!tokens) return;
    const glidingFromArrival = arrivalGlideRef.current && homingActiveRef.current;
    containerRef.current?.setAttribute(
      "data-stage-pan-click-cancel-px",
      String(tokens.hysteresisPx));
    if (dataSourceKey !== null) claimDialOrderFolder(dataSourceKey);
    const ringMemory = dataSourceKey === null ? null : flatRingMemory;
    const stored = ringMemory?.current() ?? null;
    let placed = { state: "settled" as DialPlacementState, held: 0 };
    const placeDial = (model: Parameters<typeof dialPlacement.next>[0]["model"]) => {
      const step = dialPlacement.next({ model, reading: arriving, capabilityTierRead: placingTierRead, memory: stored });
      placed = { state: step.state, held: step.held };
      return step.model;
    };
    const world = buildTopologyWorld(live.nodes, live.edges, tokens, expand.structure, dialWorldInput(dialLabels, provisionalMemoryRef.current ?? stored), placeDial);
    const firstPlacement = world.dial != null && placementStateRef.current === "reading" && placed.state !== "reading";
    placementStateRef.current = placed.state;
    if (world.dial) {
      setDialPlacement(world.dial, { ...placed, progress: loadProgress });
      if (placed.state === "settled") ringMemory?.write(world.dial.scene.memory);
      provisionalMemoryRef.current = placed.state === "provisional" ? world.dial.scene.memory : null;
    }
    const previousWorld = worldRef.current;
    worldRef.current = world;
    let armAssembly = prevNodeIdsRef.current.size === 0 && dataSourceKey === null;
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
          appear.set(n.id, 0);
          bornNodeIdsRef.current.add(n.id);
        }
      }
      for (const id of [...appear.keys()]) if (!nextIds.has(id)) appear.delete(id);
      for (const id of [...bornNodeIdsRef.current]) if (!nextIds.has(id)) bornNodeIdsRef.current.delete(id);
      prevNodeIdsRef.current = nextIds;
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
    const simTask = setTimeout(buildPendingSim, TIER_ASSEMBLE_TOTAL_MS + SIM_AFTER_ASSEMBLY_MS);
    nodeDragRef.current = null;
    heatRef.current = 0;
    dragAffectedSetRef.current = null;
    dragStartPosRef.current = null;
    dragTugOffsetsRef.current.clear();
    homeSpringsRef.current.clear();
    homingActiveRef.current = false;
    homeTargetOverrideRef.current = null;
    prevPinnedNodeIdRef.current = null;
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
    const grew = arriving || arrivingRef.current || glidingFromArrival;
    arrivingRef.current = arriving;
    arrivalGlideRef.current = grew;
    if (arriving) arrivalStillRef.current = arrivingDocuments > ARRIVAL_GLIDE_CONCEPT_CEILING;
    const arrivalStill = grew && arrivalStillRef.current;
        {
      if (armAssembly) {
        armTierAssembly(world, firstPlacement ? null : dataSourceKey, arrivalStill || (world.dial != null && stored !== null) || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        if (!assembleOnOpen) settleTierAssembly(world);
      } else if (!grew) {
        carryTierAssembly(previousWorld, world);
      }
    }
    if (grew && !armAssembly && previousWorld && hasInitializedRef.current) {
            glideArrivedWorld(previousWorld, world, tokens, arrivalStill);
        }
        trySnapInitialCamera(tokens);
        lastActiveMsRef.current = performance.now();
        return () => clearTimeout(simTask);
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
        if (dataSourceKey !== null && worldRef.current)
            claimTierAssembly(worldRef.current, dataSourceKey);
        const dial = dataSourceKey === null ? null : worldRef.current?.dial;
        if (dial && placementStateRef.current === "settled")
            flatRingMemory?.write(dial.scene.memory);
    }, [dataSourceKey, flatRingMemory, worldRef]);
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
