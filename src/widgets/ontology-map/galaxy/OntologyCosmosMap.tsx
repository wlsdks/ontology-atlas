"use client";

import { useEffect, useMemo, useRef } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import { CosmosMirror } from "./CosmosMirror";
import type { CosmosAmbient } from "./cosmos-ambient";
import { chooseArrival, hasArrived, markArrived } from "./cosmos-arrival";
import { CosmosEngine } from "./cosmos-engine";
import type { CosmosInks } from "./cosmos-types";
import { mixHex } from "./draw/cosmos-paint";
import type { CosmosPlacementRecord } from "./layout/cosmos-layout";
import { cosmosLayoutFor } from "./layout/cosmos-layout-cache";

export interface OntologyCosmosMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion?: boolean;
  ambient?: CosmosAmbient;
  arrivalKey?: string | null;
  canvasLabel?: string;
  placement?: CosmosPlacementRecord | null;
  onPlacement?: (record: CosmosPlacementRecord) => void;
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

export function OntologyCosmosMap({
  nodes,
  edges,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion = false,
  ambient = "off",
  arrivalKey = null,
  canvasLabel,
  placement = null,
  onPlacement,
}: OntologyCosmosMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const firstOptions = useRef({ reducedMotion, ambient, arrivalKey });
  const engineRef = useRef<CosmosEngine | null>(null);
  const firstOpen = useRef(true);
  const callbacks = useRef({ onSelect, onPaneClick, onDrawnCountChange });
  useEffect(() => {
    callbacks.current = { onSelect, onPaneClick, onDrawnCountChange };
  }, [onSelect, onPaneClick, onDrawnCountChange]);

  const layout = useMemo(() => cosmosLayoutFor(nodes, edges, placement, false), [nodes, edges, placement]);
  useEffect(() => {
    onPlacement?.(layout.placement);
  }, [layout, onPlacement]);
  const labels = useMemo(() => new Map(nodes.map((n) => [n.id, n.label])), [nodes]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const first = firstOptions.current;
    firstOpen.current = first.arrivalKey === null ? true : !hasArrived(first.arrivalKey);
    if (first.arrivalKey !== null) markArrived(first.arrivalKey);
    const engine = new CosmosEngine(canvas, {
      onSelect: (id) => callbacks.current.onSelect?.(id),
      onPaneClick: () => callbacks.current.onPaneClick?.(),
      onDrawn: (count) => callbacks.current.onDrawnCountChange?.(count),
      reducedMotion: first.reducedMotion,
      ambient: first.ambient,
    });
    engineRef.current = engine;
    const inks = readInks();
    if (inks) engine.setInks(inks);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setLayout(
      layout,
      labels,
      edges,
      chooseArrival({ firstOpen: firstOpen.current, reducedMotion: firstOptions.current.reducedMotion, keyframes: layout.settle.keyframes.length }),
    );
  }, [layout, labels, edges]);

  useEffect(() => {
    engineRef.current?.setSelected(selectedId);
  }, [selectedId]);

  useEffect(() => {
    engineRef.current?.setOptions({ reducedMotion, ambient });
  }, [reducedMotion, ambient]);

  return (
    <div className="absolute inset-0" data-testid="cosmos-map">
      <canvas
        ref={canvasRef}
        data-testid="ontology-map-canvas"
        data-role={MAP_CANVAS_SURFACE_ROLE}
        role="img"
        aria-label={canvasLabel ?? "Galaxy map"}
        tabIndex={0}
        className="absolute inset-0 h-full w-full touch-none outline-none"
        style={{ cursor: "grab" }}
      />
      <CosmosMirror
        layout={layout}
        selectedId={selectedId}
        onSelect={(id) => callbacks.current.onSelect?.(id)}
        labels={null}
        marks={[]}
        restSignal={0}
        deadEndSignal={0}
        walkNotice={null}
      />
    </div>
  );
}
