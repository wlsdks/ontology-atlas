"use client";

import { useCallback, useMemo, useState } from "react";
import { OntologyCosmosMap, type CosmosAmbient, type CosmosPlacementRecord, type OntologyMapEdge, type OntologyMapNode } from "@/widgets/ontology-map";
import { readCosmosPlacement, writeCosmosPlacement } from "../model/cosmos-placement-store";

export function TopologyCosmosSurface({
  nodes,
  edges,
  vaultKey,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  vaultKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaneClick: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion: boolean;
}) {
  const [ambient] = useState<CosmosAmbient>(() => {
    if (typeof window === "undefined") return "off";
    const raw = new URLSearchParams(window.location.search).get("cosmosAmbient");
    return raw === "haze" || raw === "sway" ? raw : "off";
  });
  const placement = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (new URLSearchParams(window.location.search).get("cosmosFresh") === "1") return null;
    return readCosmosPlacement(vaultKey);
  }, [vaultKey]);
  const onPlacement = useCallback((record: CosmosPlacementRecord) => writeCosmosPlacement(vaultKey, record), [vaultKey]);
  return (
    <OntologyCosmosMap
      key={vaultKey}
      nodes={nodes}
      edges={edges}
      selectedId={selectedId}
      onSelect={onSelect}
      onPaneClick={onPaneClick}
      onDrawnCountChange={onDrawnCountChange}
      reducedMotion={reducedMotion}
      ambient={ambient}
      arrivalKey={vaultKey}
      placement={placement}
      onPlacement={onPlacement}
    />
  );
}
