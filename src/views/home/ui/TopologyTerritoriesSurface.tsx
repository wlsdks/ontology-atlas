"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { MapNavigationSpeed } from "@/shared/lib/appearance-preferences";
import { OntologyTerritoriesMap, type OntologyMapEdge, type OntologyMapNode } from "@/widgets/ontology-map";
import { useMapEvidenceStates, type MapEvidenceAvailability } from "../model/use-map-evidence-states";

export function useTerritoryDomainStats() {
  const t = useTranslations("topology.territories");
  return useCallback(
    ({ capabilityCount, elementCount, staleCount }: { capabilityCount: number; elementCount: number; staleCount: number | null }) => {
      const base = t("domainStats", { capabilities: capabilityCount, elements: elementCount });
      if (staleCount == null || staleCount === 0) return { text: base, staleSuffix: "" };
      const staleSuffix = ` · ${t("domainStale", { stale: staleCount })}`;
      return { text: base + staleSuffix, staleSuffix };
    },
    [t],
  );
}

/**
 * Composes the canvas words and names what the evidence ring stands on (Git, still reading, or
 * unreadable); unknown is never shown as current.
 */
export function TopologyTerritoriesSurface({
  nodes,
  edges,
  insightNodes,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion,
  inspectorOpen,
  indexExpanded,
  arrivedByMorph,
  navigationSpeed,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  insightNodes: readonly KnowledgeGraphNode[] | null | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaneClick: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion: boolean;
  inspectorOpen: boolean;
  indexExpanded: boolean;
  arrivedByMorph: boolean;
  navigationSpeed: MapNavigationSpeed;
}) {
  const t = useTranslations("topology.territories");
  const evidence = useMapEvidenceStates({ nodes: insightNodes, enabled: true });
  const measured = evidence.availability === "measured";
  const domainStats = useTerritoryDomainStats();
  const capabilityIds = useMemo(() => nodes.filter((n) => n.kind === "capability").map((n) => n.id), [nodes]);
  const staleTotal = measured ? capabilityIds.filter((id) => evidence.states.get(id) === "stale").length : 0;
  const note: Record<MapEvidenceAvailability, string> = {
    measured: t("evidenceMeasured", { stale: staleTotal, total: capabilityIds.length }),
    reading: t("evidenceReading"),
    "app-only": t("evidenceAppOnly"),
    unreadable: t("evidenceUnreadable"),
    "no-paths": t("evidenceNoPaths"),
  };

  // One calm line: ring states, scales, then the evidence note; long meanings ride on titles.
  // It stays between the published free edges (`--territories-free-left/right`) and wraps rather
  // than cuts.
  const swatch = "inline-block size-2.5 shrink-0 rounded-full";
  const legend = (
    <div
      data-testid="territories-legend"
      data-evidence-availability={evidence.availability}
      className="pointer-events-none absolute bottom-4 left-[max(calc(var(--map-safe-inset-left)*1px),var(--territories-free-left,0px))] right-[max(calc(var(--map-safe-inset-right)*1px),var(--territories-free-right,0px))] flex justify-center px-4"
    >
      <p
        data-territories-legend-pill=""
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3.5 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3.5 py-1.5 text-label text-[color:var(--map-territory-count)]"
      >
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <span aria-hidden className={`${swatch} border border-[color:var(--map-node-stroke-capability)]`} />
          {t("legendCurrent")}
        </span>
        <span className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap" title={t("legendStale")}>
          <span aria-hidden className={`${swatch} border-[1.5px] border-[color:var(--map-territory-stale)] bg-[color:var(--map-territory-stale-fill)]`} />
          {t("legendStaleShort")}
        </span>
        <span className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap" title={t("legendUnknown")}>
          <span aria-hidden className={`${swatch} border border-dashed border-[color:var(--map-node-stroke-capability)]`} />
          {t("legendUnknownShort")}
        </span>
        <span aria-hidden className="h-3 w-px shrink-0 bg-[color:var(--map-panel-border)]" />
        <span className="whitespace-nowrap">{t("legendSize")}</span>
        <span className="whitespace-nowrap">{t("legendRollup")}</span>
        <span data-testid="territories-evidence-note" className="text-center text-[color:var(--map-territory-title)]">
          {note[evidence.availability]}
        </span>
      </p>
    </div>
  );

  return (
    <OntologyTerritoriesMap
      nodes={nodes}
      edges={edges}
      selectedId={selectedId}
      evidence={evidence.states}
      evidenceMeasured={measured}
      domainStats={domainStats}
      onSelect={onSelect}
      onPaneClick={onPaneClick}
      onDrawnCountChange={onDrawnCountChange}
      canvasLabel={t("canvasAriaLabel")}
      listLabel={t("listLabel")}
      legend={legend}
      reducedMotion={reducedMotion}
      inspectorOpen={inspectorOpen}
      chromeKey={`${indexExpanded ? "index" : "rail"}:${inspectorOpen ? "inspector" : "free"}`}
      arrivedByMorph={arrivedByMorph}
      navigationSpeed={navigationSpeed}
    />
  );
}
