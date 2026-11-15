"use client";

import { useMemo, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import { OntologyTreeMap, type OntologyMapEdge, type OntologyMapNode, type TreeMapLabels } from "@/widgets/ontology-map";
import { useMapEvidenceStates, type MapEvidence, type MapEvidenceAvailability } from "../model/map-canvas/use-map-evidence-states";

/** A legend swatch: the mark's disc at the size that tells the kinds apart. */
function KindDot({ radius, ink, ring = false }: { radius: number; ink: string; ring?: boolean }) {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
      <circle cx="7" cy="7" r={radius} style={{ fill: ink, stroke: ring ? "var(--map-graph-halo)" : undefined }} strokeWidth={ring ? 1.4 : undefined} />
    </svg>
  );
}

function ArcSwatch({ ink }: { ink: string }) {
  return (
    <svg aria-hidden width="22" height="14" viewBox="0 0 22 14">
      <path d="M2 11 Q11 1 20 11" fill="none" strokeWidth="1.6" strokeLinecap="round" style={{ stroke: ink }} />
    </svg>
  );
}

/**
 * Composes the tree's words and names what the amber stands on; unknown evidence is never shown as
 * current, and the stale count appears only once evidence was measured.
 */
export function TopologyTreeSurface({
  nodes,
  edges,
  insightNodes,
  vaultKey,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion,
  arrivedByMorph,
  synthEvidence = null,
  navigationSpeed,
  fitToken,
  growthReplayToken,
}: {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  insightNodes: readonly KnowledgeGraphNode[] | null | undefined;
  vaultKey: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPaneClick: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  reducedMotion: boolean;
  arrivedByMorph: boolean;
  synthEvidence?: MapEvidence | null;
  navigationSpeed: MapNavigationSpeed;
  fitToken: number;
  growthReplayToken: number;
}) {
  const t = useTranslations("mapTree");
  const tHex = useTranslations("topology.hexBoard");
  const tDial = useTranslations("mapDial");
  const tKinds = useTranslations("kinds");
  const measuredEvidence = useMapEvidenceStates({ nodes: insightNodes, enabled: true });
  const evidence = synthEvidence ?? measuredEvidence;
  const measured = evidence.availability === "measured";

  const labels: TreeMapLabels = useMemo(() => {
    const withStale = (meta: string, stale: number | null) =>
      stale == null ? meta : `${meta} · ${stale > 0 ? tHex("domainStale", { count: stale }) : tHex("domainStaleNone")}`;
    return {
      domainMeta: ({ capabilities, elements, stale }) => withStale(tHex("domainMeta", { capabilities, elements }), stale),
      projectMeta: ({ concepts, stale }) => withStale(tHex("projectMeta", { count: concepts }), stale),
      looseCaption: (count) => tDial("orphans", { count }),
    };
  }, [tHex, tDial]);

  const staleTotal = useMemo(
    () => (measured ? nodes.reduce((sum, n) => sum + (evidence.states.get(n.id) === "stale" ? 1 : 0), 0) : 0),
    [measured, nodes, evidence.states],
  );
  const note: Record<Exclude<MapEvidenceAvailability, "measured">, string> = {
    reading: tHex("evidenceReading"),
    "app-only": t("evidenceAppOnly"),
    unreadable: tHex("evidenceUnreadable"),
    "no-paths": t("evidenceNoPaths"),
  };

  const legend: ComponentProps<typeof OntologyTreeMap>["legend"] = ({ focused }) => (
    <div
      data-testid="tree-map-legend"
      data-evidence-availability={evidence.availability}
      className="flex max-w-full flex-col items-center gap-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]"
    >
      <div data-testid="tree-map-legend-marks" className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <KindDot radius={5} ink="var(--map-graph-name-strong)" ring />
          {tKinds("domain")}
        </span>
        <span className="flex items-center gap-1.5">
          <KindDot radius={3.5} ink="var(--map-graph-name-strong)" />
          {tKinds("capability")}
        </span>
        <span className="flex items-center gap-1.5">
          <KindDot radius={2} ink="var(--map-graph-name-strong)" />
          {tKinds("element")}
        </span>
        {measured ? (
          <span data-testid="tree-map-legend-stale" className="flex items-center gap-1.5">
            <KindDot radius={3} ink="var(--color-status-warning)" />
            {tDial("stale", { count: staleTotal })}
          </span>
        ) : null}
        {focused ? (
          <>
            <span className="flex items-center gap-1.5">
              <ArcSwatch ink="var(--map-graph-arc)" />
              {tDial("keyNeeds")}
            </span>
            <span className="flex items-center gap-1.5">
              <ArcSwatch ink="var(--map-graph-reach)" />
              {tDial("keyNeededBy")}
            </span>
          </>
        ) : null}
      </div>
      {evidence.availability === "measured" ? null : (
        <span data-testid="tree-map-evidence-note" className="text-center text-[color:var(--map-panel-text-tertiary)]">
          {note[evidence.availability]}
        </span>
      )}
    </div>
  );

  return (
    <OntologyTreeMap
      key={vaultKey}
      nodes={nodes}
      edges={edges}
      selectedId={selectedId}
      evidence={evidence.states}
      evidenceMeasured={measured}
      labels={labels}
      onSelect={onSelect}
      onPaneClick={onPaneClick}
      onDrawnCountChange={onDrawnCountChange}
      canvasLabel={t("canvasAriaLabel")}
      listLabel={t("listLabel")}
      legend={legend}
      fitToken={fitToken}
      replayToken={growthReplayToken}
      reducedMotion={reducedMotion}
      arrivedByMorph={arrivedByMorph}
      navigationSpeed={navigationSpeed}
    />
  );
}
