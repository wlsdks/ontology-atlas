"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { OntologyTerritoriesMap, type OntologyMapEdge, type OntologyMapNode } from "@/widgets/ontology-map";
import { useMapEvidenceStates, type MapEvidenceAvailability } from "../model/use-map-evidence-states";

/**
 * The page side of the Territories view: it reads the evidence states with the product's own
 * rule, composes every word the canvas shows, and says in the legend what the evidence ring is
 * standing on — measured from Git, still being read, or not readable here at all. An unknown
 * state is drawn as unknown and named as unknown; it is never shown as current.
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
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  insightNodes: readonly KnowledgeGraphNode[] | null | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaneClick: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion: boolean;
}) {
  const t = useTranslations("topology.territories");
  const evidence = useMapEvidenceStates({ nodes: insightNodes, enabled: true });
  const measured = evidence.availability === "measured";
  const domainStats = useCallback(
    ({ capabilityCount, elementCount, staleCount }: { capabilityCount: number; elementCount: number; staleCount: number | null }) => {
      const base = t("domainStats", { capabilities: capabilityCount, elements: elementCount });
      if (staleCount == null || staleCount === 0) return { text: base, staleSuffix: "" };
      const staleSuffix = ` · ${t("domainStale", { stale: staleCount })}`;
      return { text: base + staleSuffix, staleSuffix };
    },
    [t],
  );
  const capabilityIds = useMemo(() => nodes.filter((n) => n.kind === "capability").map((n) => n.id), [nodes]);
  const staleTotal = measured ? capabilityIds.filter((id) => evidence.states.get(id) === "stale").length : 0;
  const note: Record<MapEvidenceAvailability, string> = {
    measured: t("evidenceMeasured", { stale: staleTotal, total: capabilityIds.length }),
    reading: t("evidenceReading"),
    "app-only": t("evidenceAppOnly"),
    unreadable: t("evidenceUnreadable"),
    "no-paths": t("evidenceNoPaths"),
  };

  const legend = (
    <div
      data-testid="territories-legend"
      data-evidence-availability={evidence.availability}
      className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px)] right-[calc(var(--map-safe-inset-right)*1px)] flex justify-center"
    >
      {/* A surface of its own: a drawing taller than the room pans under it, and the key must
          stay readable over whatever name is passing beneath. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border border-[color:var(--map-node-stroke-capability)]" />
        {t("legendCurrent")}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border-[1.5px] border-[color:var(--color-status-warning)]" />
        {t("legendStale")}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2.5 rounded-full border border-dashed border-[color:var(--map-node-stroke-capability)]" />
        {t("legendUnknown")}
      </span>
      <span>{t("legendSize")}</span>
      <span>{t("legendRollup")}</span>
      <span data-testid="territories-evidence-note" className="basis-full text-center text-[color:var(--map-panel-text-tertiary)]">
        {note[evidence.availability]}
      </span>
      </div>
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
    />
  );
}
