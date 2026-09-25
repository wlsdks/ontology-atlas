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
  inspectorOpen,
  indexExpanded,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  insightNodes: readonly KnowledgeGraphNode[] | null | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaneClick: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion: boolean;
  /** The node inspector is standing on the canvas. */
  inspectorOpen: boolean;
  /** INDEX is unfolded over the canvas's left side. */
  indexExpanded: boolean;
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

  /*
   * One calm line: the three ring states, the two scales, then what the ring stands on. The
   * long meaning of each state rides on its title, so the line itself stays short.
   *
   * It stands between whatever panels are open: the map publishes its free edges
   * (`--territories-free-left/right`), so the legend never reaches under INDEX or the
   * inspector. Where that is too narrow for one line it wraps, item by item. The evidence note
   * is the one sentence that says why every ring reads "unknown", so it wraps too and is never
   * cut off (interaction audit, 2026-09-25: it was truncated to 75px at 1040).
   */
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
    />
  );
}
