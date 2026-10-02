"use client";

import { useEffect, useMemo, useRef } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { readOntologyMapTokensOrNull } from "../ui/topology-read-tokens";
import { CosmosEngine, type CosmosAmbient } from "./cosmos-engine";
import { computeCosmosLayout, type CosmosPlacementRecord } from "./cosmos-layout";
import { mixHex, type CosmosInks } from "./cosmos-paint";

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

const arrivedKeys = new Set<string>();

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
  const callbacks = useRef({ onSelect, onPaneClick, onDrawnCountChange });
  useEffect(() => {
    callbacks.current = { onSelect, onPaneClick, onDrawnCountChange };
  }, [onSelect, onPaneClick, onDrawnCountChange]);

  const layout = useMemo(
    () =>
      computeCosmosLayout(
        nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind, size: n.size, fullDegree: n.fullDegree })),
        edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
        { placement },
      ),
    [nodes, edges, placement],
  );
  useEffect(() => {
    onPlacement?.(layout.placement);
  }, [layout, onPlacement]);
  const labels = useMemo(() => new Map(nodes.map((n) => [n.id, n.label])), [nodes]);
  const dependencies = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const e of edges) {
      if (e.kind !== "depends") continue;
      for (const [a, b] of [
        [e.source, e.target],
        [e.target, e.source],
      ] as const) {
        const list = out.get(a);
        if (list) list.push(b);
        else out.set(a, [b]);
      }
    }
    return out;
  }, [edges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const first = firstOptions.current;
    const arrive = first.arrivalKey === null ? true : !arrivedKeys.has(first.arrivalKey);
    if (first.arrivalKey !== null) arrivedKeys.add(first.arrivalKey);
    const engine = new CosmosEngine(canvas, {
      onSelect: (id) => callbacks.current.onSelect?.(id),
      onPaneClick: () => callbacks.current.onPaneClick?.(),
      onDrawn: (count) => callbacks.current.onDrawnCountChange?.(count),
      reducedMotion: first.reducedMotion,
      ambient: first.ambient,
      arrive,
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
    engineRef.current?.setLayout(layout, labels, dependencies);
  }, [layout, labels, dependencies]);

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
      <ul className="sr-only" data-testid="cosmos-galaxy-list">
        {layout.galaxies.map((g) => (
          <li key={g.id}>
            {g.label}: {g.members}
          </li>
        ))}
      </ul>
    </div>
  );
}
