"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  filterTreeByQuery,
  type OntologyTreeBuildResult,
} from "@/shared/lib/ontology-tree";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";

export interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
  agentSync: string;
  capabilitiesShort: string;
  elementsShort: string;
  freshTitle: string;
  emptyHint: string;
}

export interface TopologyIndexPanelProps {
  treeResult: OntologyTreeBuildResult;
  totalConcepts: number;
  totalRelations: number;
  domainCount: number;
  changedSlugs: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  onCollapse: () => void;
  labels: TopologyIndexPanelLabels;
  className?: string;
}

/**
 * INDEX — the left machined instrument that replaces the tree/ego `/ontology`
 * page (B3 허브가 곧 지도). Floats over the topology map, `--topology-index-*`
 * width/inset tokens (`app/globals.css`). See
 * `docs/prototypes/hub-b3-immersive.html` for the approved visual spec and
 * `TopologyIndexTab` for the collapsed counterpart.
 *
 * Search reuses `filterTreeByQuery` (`@/shared/lib/ontology-tree`) — the
 * SAME pure filter the old `/ontology` tree used — instead of a bespoke
 * matcher, so "search narrows the tree, keeping ancestor chains" behavior
 * can't drift between surfaces.
 */
export function TopologyIndexPanel({
  treeResult,
  totalConcepts,
  totalRelations,
  domainCount,
  changedSlugs,
  selectedId,
  onSelect,
  onCollapse,
  labels,
  className,
}: TopologyIndexPanelProps) {
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(treeResult.roots.map((root) => root.node.id)),
  );
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;

  const visibleRoots = useMemo(
    () => (isFiltering ? filterTreeByQuery(treeResult.roots, trimmedQuery) : treeResult.roots),
    [treeResult.roots, isFiltering, trimmedQuery],
  );
  const maxDomainDescendantCount = useMemo(() => {
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots]);

  const toggleOpen = (nodeId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const isOpen = (nodeId: string) => isFiltering || openIds.has(nodeId);

  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      className={`flex h-full flex-col rounded-[11px] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* Owner chrome-recomposition spec — the top chrome lane's engraved
          census is the single source; this header keeps only the label,
          agent-sync dot, and fold (no duplicate concepts/relations/domains
          row). The totals still reach screen readers via the sr-only
          summary below, and the tree rows below keep their own per-domain
          subcounts (unaffected — those aren't a page-level duplicate). */}
      <div className="mb-2.5 flex items-center gap-2 border-b border-[color:var(--topology-v2-panel-divider)] px-0.5 pb-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-[color:var(--topology-v2-panel-text-tertiary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--topology-v2-panel-power-on)]" />
          {labels.agentSync}
        </span>
        <button
          type="button"
          onClick={onCollapse}
          aria-label={labels.foldAria}
          data-testid="topology-index-fold"
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-[color:var(--topology-v2-panel-border)] px-1.5 py-0.5 font-mono text-[9.5px] text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {labels.fold} <span aria-hidden="true">⌃</span>
        </button>
      </div>
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-2 shrink-0">
        <Search
          size={11}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--topology-v2-panel-text-quaternary)]"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-index-search"
          className="w-full rounded-[7px] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-canvas)] py-1.5 pl-7 pr-2.5 text-[12px] text-[color:var(--topology-v2-panel-text-primary)] outline-none transition-colors placeholder:text-[color:var(--topology-v2-panel-text-quaternary)] focus:border-[color:var(--topology-v2-indigo)]"
        />
      </div>

      <nav
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        className="min-h-0 flex-1 space-y-0.5 overflow-y-auto"
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-[color:var(--topology-v2-panel-text-quaternary)]">
            {labels.emptyHint}
          </p>
        ) : (
          visibleRoots.map((root) => (
            <TopologyIndexTreeRow
              key={root.node.id}
              entry={root}
              depth={0}
              isOpen={isOpen}
              onToggleOpen={toggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              changedSlugs={changedSlugs}
              maxDomainDescendantCount={maxDomainDescendantCount}
              labels={labels}
            />
          ))
        )}
      </nav>
    </aside>
  );
}
