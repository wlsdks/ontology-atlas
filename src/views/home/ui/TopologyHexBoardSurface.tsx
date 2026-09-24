"use client";

import { useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { OntologyHexBoardMap, type HexBoardLabels, type HexPlacementRecord, type OntologyMapEdge, type OntologyMapNode } from "@/widgets/ontology-map";
import { readHexPlacement, writeHexPlacement } from "../model/hex-board-placement-store";
import { useMapEvidenceStates, type MapEvidenceAvailability } from "../model/use-map-evidence-states";

/** A flat-top hexagon for the legend swatches (16 × 14). */
const HEX_SWATCH = "15,7 11.5,13 4.5,13 1,7 4.5,1 11.5,1";

/**
 * The page side of the hex board: it reads the evidence states with the product's own rule,
 * keeps the placement per vault so nothing already placed ever moves, composes every word the
 * canvas shows, and says in the legend what the evidence ring is standing on. An unknown
 * state is drawn as unknown and named as unknown; it is never shown as current.
 */
export function TopologyHexBoardSurface({
  nodes,
  edges,
  insightNodes,
  vaultKey,
  selectedId,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  reducedMotion,
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
}) {
  const t = useTranslations("topology.hexBoard");
  const evidence = useMapEvidenceStates({ nodes: insightNodes, enabled: true });
  const measured = evidence.availability === "measured";
  const placement = useMemo(() => (typeof window === "undefined" ? null : readHexPlacement(vaultKey)), [vaultKey]);
  const onPlacement = useCallback((record: HexPlacementRecord) => writeHexPlacement(vaultKey, record), [vaultKey]);
  const staleFiles = useMemo(() => {
    const m = new Map<string, string>();
    for (const [id, path] of evidence.movedPaths) m.set(id, path.split("/").pop() ?? path);
    return m;
  }, [evidence.movedPaths]);
  const projectCount = useMemo(() => nodes.find((n) => n.kind === "project")?.descendantCount ?? null, [nodes]);

  const labels: HexBoardLabels = useMemo(
    () => ({
      staleOnly: (count) => (measured ? t("staleOnly", { count }) : t("staleOnlyUnmeasured")),
      regionsOnly: t("regionsOnly"),
      widened: t("widened"),
      tooltip: ({ name, stale, needs, users, elements }) =>
        `${name}${stale ? ` · ${t("tooltipStale")}` : ""} · ${t("tooltipFacts", { needs, users, elements })}`,
      domainMeta: ({ capabilities, elements }) => t("domainMeta", { capabilities, elements }),
      domainStale: (count) => (count == null ? null : count > 0 ? t("domainStale", { count }) : t("domainStaleNone")),
      projectMeta: projectCount != null ? t("projectMeta", { count: projectCount }) : null,
      plateSub: ({ capabilities, stale }) => (stale ? t("plateSubStale", { capabilities, stale }) : t("plateSub", { capabilities })),
    }),
    [t, measured, projectCount],
  );

  const capabilityCount = useMemo(() => nodes.filter((n) => n.kind === "capability").length, [nodes]);
  const staleTotal = measured ? nodes.filter((n) => n.kind === "capability" && evidence.states.get(n.id) === "stale").length : 0;
  const note: Record<MapEvidenceAvailability, string> = {
    measured: t("evidenceMeasured", { stale: staleTotal, total: capabilityCount }),
    reading: t("evidenceReading"),
    "app-only": t("evidenceAppOnly"),
    unreadable: t("evidenceUnreadable"),
    "no-paths": t("evidenceNoPaths"),
  };

  const legend = ({ focused }: { staleOnly: boolean; focused: boolean }) => (
    <div
      data-testid="hex-board-legend"
      data-evidence-availability={evidence.availability}
      className="pointer-events-none flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-chip bg-[color:var(--chrome-surface)] px-3 py-1.5 text-label text-[color:var(--map-panel-text-secondary)]"
    >
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="46" height="14" viewBox="0 0 46 14">
          {[0, 1, 2, 3, 4].map((i) => (
            <rect key={i} x={i * 9} y="1" width="8" height="12" rx="1.5" style={{ fill: `var(--map-hex-face-${i})`, stroke: "var(--map-hex-rim)" }} strokeWidth="0.6" />
          ))}
        </svg>
        {t("legendBrightness")}
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="30" height="14" viewBox="0 0 30 14">
          {[0, 1, 2].map((i) => (
            <circle key={i} cx={5 + i * 8} cy="7" r="2.6" style={{ fill: i === 2 ? "var(--color-status-warning)" : "var(--map-hex-accent)" }} />
          ))}
        </svg>
        {t("legendPips")}
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="16" height="14" viewBox="0 0 16 14">
          <polygon points={HEX_SWATCH} style={{ fill: "var(--map-hex-face-stale-2)", stroke: "var(--color-status-warning)" }} strokeWidth="1.6" />
        </svg>
        {t("legendStale")}
      </span>
      <span className="flex items-center gap-1.5">
        <svg aria-hidden width="16" height="14" viewBox="0 0 16 14">
          <polygon points={HEX_SWATCH} style={{ fill: "var(--map-hex-face-0)", stroke: "var(--map-hex-rim-unknown)" }} strokeDasharray="3 2" />
        </svg>
        {t("legendUnknown")}
      </span>
      {focused ? (
        <>
          <span className="flex items-center gap-1.5">
            <svg aria-hidden width="24" height="14" viewBox="0 0 24 14">
              <line x1="2" y1="7" x2="15" y2="7" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--map-hex-accent)" }} />
              <polygon points="14,3 22,7 14,11" style={{ fill: "var(--map-hex-accent)" }} />
            </svg>
            {t("legendNeeds")}
          </span>
          <span className="flex items-center gap-1.5">
            <svg aria-hidden width="24" height="14" viewBox="0 0 24 14">
              <line x1="2" y1="7" x2="15" y2="7" strokeWidth="2" strokeLinecap="round" style={{ stroke: "var(--map-edge-selected)" }} />
              <polygon points="14,3 22,7 14,11" style={{ fill: "var(--map-edge-selected)" }} />
            </svg>
            {t("legendUsers")}
          </span>
        </>
      ) : (
        <span className="flex items-center gap-1.5">
          <svg aria-hidden width="24" height="14" viewBox="0 0 24 14">
            <line x1="2" y1="7" x2="15" y2="7" strokeWidth="2.4" strokeLinecap="round" style={{ stroke: "var(--map-hex-canal)" }} />
            <polygon points="14,3 22,7 14,11" style={{ fill: "var(--map-hex-canal-head)" }} />
          </svg>
          {t("legendCanals")}
        </span>
      )}
      <span className="flex items-center gap-1.5">
        <kbd className="rounded-micro border border-[color:var(--color-border-soft)] px-1 text-label text-[color:var(--map-panel-text-secondary)]">←↑↓→</kbd>
        {t("legendKeys")}
      </span>
      <span data-testid="hex-board-evidence-note" className="basis-full text-center text-[color:var(--map-panel-text-tertiary)]">
        {note[evidence.availability]}
      </span>
    </div>
  );

  return (
    <OntologyHexBoardMap
      key={vaultKey}
      nodes={nodes}
      edges={edges}
      selectedId={selectedId}
      evidence={evidence.states}
      evidenceMeasured={measured}
      staleFiles={staleFiles}
      labels={labels}
      placement={placement}
      onPlacement={onPlacement}
      arrivalKey={vaultKey}
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
