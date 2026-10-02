"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { DEFAULT_MAP_NAVIGATION_SPEED, type MapNavigationSpeed } from "@/shared/lib/appearance-preferences";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import type { TopologyMapLensKind } from "../model/path-lens";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import { CosmosMirror, type CosmosMirrorLabels } from "./CosmosMirror";
import { chooseArrival, hasArrived, markArrived } from "./cosmos-arrival";
import { CosmosEngine } from "./cosmos-engine";
import { publishCosmosSnapshot } from "./cosmos-marks";
import type { CosmosBand, CosmosInks, CosmosPaintRecord } from "./cosmos-types";
import { mixHex } from "./draw/cosmos-paint";
import type { CosmosPlacementRecord } from "./layout/cosmos-layout";
import { cosmosLayoutFor } from "./layout/cosmos-layout-cache";

export interface CosmosPlacementStore {
  current(): CosmosPlacementRecord | null;
  write(record: CosmosPlacementRecord): void;
  clear(): void;
}

export interface OntologyCosmosMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion?: boolean;
  arrivalKey?: string | null;
  arrivedByMorph?: boolean;
  canvasLabel?: string;
  walkNoticeLabel?: string;
  labels?: CosmosMirrorLabels | null;
  placement?: CosmosPlacementStore | null;
  navigationSpeed?: MapNavigationSpeed;
  relayoutToken?: number;
  fitToken?: number;
  lensFitToken?: number;
  spotlightIds?: ReadonlySet<string> | null;
  mapLensKind?: TopologyMapLensKind;
  pathEdgeIds?: ReadonlySet<string> | null;
  visitedTrail?: readonly string[];
  trailLensActiveRef?: RefObject<boolean>;
  onVisibleCountChange?: (visible: number) => void;
  onGraphStatsChange?: (stats: { nodes: number; relations: number }) => void;
  onZoomTierChange?: (tier: CosmosBand) => void;
  onContextMenuNode?: (slug: string, position: { x: number; y: number }) => void;
  onContextMenuPane?: (position: { x: number; y: number }) => void;
}

function readInks(): CosmosInks | null {
  const t = readOntologyMapTokensOrNull();
  if (!t) return null;
  return {
    project: t.galaxyProject,
    domain: t.galaxyDomain,
    capability: t.galaxyCapability,
    element: t.galaxyElement,
    accent: t.indigo,
    bgNear: t.canvasBgNear,
    bgFar: t.canvasBgFar,
    filament: mixHex(t.canvasBgNear, t.galaxyDomain, 0.42),
    filamentHead: mixHex(t.canvasBgNear, t.galaxyDomain, 0.6),
    filamentDim: mixHex(t.canvasBgNear, t.galaxyDomain, 0.16),
    labelProject: t.labelProject,
    labelDomain: t.labelDomain,
    labelCapability: t.labelCapability,
    labelElement: t.labelElement,
    labelMeta: t.labelElement,
    select: t.indigoBright,
    spotlightRestAlpha: t.spotlightRestAlpha,
    pathRestAlpha: t.pathRestAlpha,
  };
}

function useOnTokenChange(token: number | undefined, run: () => void): void {
  const seen = useRef(token);
  useEffect(() => {
    if (seen.current === token) return;
    seen.current = token;
    run();
  }, [token, run]);
}

export function OntologyCosmosMap({
  nodes,
  edges,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion = false,
  arrivalKey = null,
  arrivedByMorph = false,
  canvasLabel,
  walkNoticeLabel,
  labels = null,
  placement = null,
  navigationSpeed = DEFAULT_MAP_NAVIGATION_SPEED,
  relayoutToken,
  fitToken,
  lensFitToken,
  spotlightIds = null,
  mapLensKind = "recent",
  pathEdgeIds = null,
  visitedTrail,
  trailLensActiveRef,
  onVisibleCountChange,
  onGraphStatsChange,
  onZoomTierChange,
  onContextMenuNode,
  onContextMenuPane,
}: OntologyCosmosMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firstOptions = useRef({ reducedMotion, arrivalKey, arrivedByMorph, navigationSpeed });
  const engineRef = useRef<CosmosEngine | null>(null);
  const firstOpen = useRef(true);
  const [deadEnds, setDeadEnds] = useState(0);
  const [rest, setRest] = useState<{ signal: number; marks: readonly CosmosPaintRecord[] }>({ signal: 0, marks: [] });
  const callbacks = useRef({ onSelect, onPaneClick, onDrawnCountChange, onZoomTierChange, onContextMenuNode, onContextMenuPane });
  useEffect(() => {
    callbacks.current = { onSelect, onPaneClick, onDrawnCountChange, onZoomTierChange, onContextMenuNode, onContextMenuPane };
  }, [onSelect, onPaneClick, onDrawnCountChange, onZoomTierChange, onContextMenuNode, onContextMenuPane]);

  const [relaid, setRelaid] = useState<{ nodes: readonly OntologyMapNode[]; edges: readonly OntologyMapEdge[]; token: number } | null>(null);
  const settled = useMemo(() => {
    const fresh = relaid !== null && relaid.nodes === nodes && relaid.edges === edges;
    if (fresh) return { layout: cosmosLayoutFor(nodes, edges, null, true), relayout: true, hasRecord: false };
    const record = placement?.current() ?? null;
    return { layout: cosmosLayoutFor(nodes, edges, record, false), relayout: false, hasRecord: record !== null };
  }, [nodes, edges, placement, relaid]);
  const layout = settled.layout;
  useEffect(() => {
    placement?.write(layout.placement);
  }, [layout, placement, relaid]);
  useEffect(() => {
    onVisibleCountChange?.(nodes.length);
    onGraphStatsChange?.({ nodes: nodes.length, relations: edges.length });
  }, [nodes, edges, onVisibleCountChange, onGraphStatsChange]);
  const conceptLabels = useMemo(() => new Map(nodes.map((n) => [n.id, n.label])), [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const first = firstOptions.current;
    firstOpen.current = first.arrivalKey === null ? true : !hasArrived(first.arrivalKey);
    if (first.arrivalKey !== null) markArrived(first.arrivalKey);
    let inks: CosmosInks | null = null;
    const engine = new CosmosEngine(canvas, {
      onSelect: (id) => callbacks.current.onSelect?.(id),
      onPaneClick: () => callbacks.current.onPaneClick?.(),
      onDrawn: (count) => {
        callbacks.current.onDrawnCountChange?.(count);
      },
      onBand: (band) => callbacks.current.onZoomTierChange?.(band),
      onRest: () => {
        setRest((prev) => ({ signal: prev.signal + 1, marks: engine.marks() }));
        if (inks) publishCosmosSnapshot({ marks: engine.marks(), canvas, inks });
      },
      onWalkDeadEnd: () => setDeadEnds((n) => n + 1),
      onContextMenuNode: (id, position) => callbacks.current.onContextMenuNode?.(id, position),
      onContextMenuPane: (position) => callbacks.current.onContextMenuPane?.(position),
      reducedMotion: first.reducedMotion,
      navigationSpeed: first.navigationSpeed,
    });
    engineRef.current = engine;
    inks = readInks();
    if (inks) engine.setInks(inks);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useLayoutEffect(
    () => () => {
      const engine = engineRef.current;
      const canvas = canvasRef.current;
      const inks = readInks();
      if (engine && canvas && inks) publishCosmosSnapshot({ marks: engine.marks(), canvas, inks });
    },
    [],
  );

  useEffect(() => {
    engineRef.current?.setLayout(
      layout,
      conceptLabels,
      edges,
      chooseArrival({
        firstOpen: firstOpen.current,
        arrivedByMorph: firstOptions.current.arrivedByMorph,
        hasRecord: settled.hasRecord,
        relayout: settled.relayout,
        reducedMotion: firstOptions.current.reducedMotion,
      }),
    );
    firstOpen.current = false;
  }, [layout, conceptLabels, edges, settled.relayout, settled.hasRecord, relaid]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    engineRef.current?.setOptions({ reducedMotion, navigationSpeed });
  }, [reducedMotion, navigationSpeed]);

  useEffect(() => {
    const lens = spotlightIds ? { kind: mapLensKind, memberIds: spotlightIds, edgeIds: mapLensKind === "path" ? pathEdgeIds : null } : null;
    const trail = visitedTrail && visitedTrail.length > 0 && trailLensActiveRef?.current ? { visitedIds: visitedTrail } : null;
    engineRef.current?.setLens(lens, trail);
  }, [spotlightIds, mapLensKind, pathEdgeIds, visitedTrail, trailLensActiveRef]);

  const fit = useMemo(() => () => engineRef.current?.requestFit(), []);
  const lensFit = useMemo(() => () => engineRef.current?.requestLensFit(), []);
  const relayout = useCallback(() => {
    placement?.clear();
    setRelaid((prev) => ({ nodes, edges, token: (prev?.token ?? 0) + 1 }));
    engineRef.current?.requestFit();
  }, [placement, nodes, edges]);
  useOnTokenChange(relayoutToken, relayout);
  useOnTokenChange(fitToken, fit);
  useOnTokenChange(lensFitToken, lensFit);

  return (
    <div className="absolute inset-0" data-testid="cosmos-map">
      <canvas
        ref={canvasRef}
        data-testid="ontology-map-canvas"
        data-role={MAP_CANVAS_SURFACE_ROLE}
        role="img"
        aria-label={canvasLabel ?? "Galaxy map"}
        tabIndex={0}
        className="absolute inset-0 h-full w-full touch-none cursor-grab outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-indigo-focus-ring)] data-[keyboard-focus=true]:outline-2 data-[keyboard-focus=true]:outline-solid data-[keyboard-focus=true]:-outline-offset-2 data-[keyboard-focus=true]:outline-[color:var(--color-indigo-focus-ring)]"
      />
      <CosmosMirror
        layout={layout}
        selectedId={selectedId}
        onSelect={(id) => callbacks.current.onSelect?.(id)}
        labels={labels}
        marks={rest.marks}
        restSignal={rest.signal}
        deadEndSignal={deadEnds}
        walkNotice={walkNoticeLabel ?? null}
      />
    </div>
  );
}
