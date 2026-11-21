"use client";

import {
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, CornerUpRight, Search } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import {
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeNode,
} from "@/entities/knowledge-graph";
import { RealmBlockExportAction } from "@/features/ontology-blocks";
import { OntologyMapKindGlyph } from "@/shared/ui/ontology-node/map-kind-glyph";
import { controlClass } from "@/shared/ui";
import {
  flattenVisibleRowIds,
  nextRovingId,
  resolveActiveRowId,
  type RovingNavKey,
} from "../lib/roving-tabindex";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

export interface RealmBoundaryRow {
  edgeId: string;
  fromTitle: string;
  toTitle: string;
  relationLabel: string;
  outsideId: string;
  jumpRealmId: string;
}

interface TopologyRealmLedgerLabels {
  label: string;
  elementsShort: string;
  capabilitiesShort: string;
  depthShort: string;
  searchPlaceholder: string;
  exit: string;
  exitAria: string;
  emptyHint: string;
  boundaryHeading: string;
  boundaryToggleAria: string;
  boundaryJump: string;
  boundaryJumpAria: string;
  boundaryEmpty: string;
  freshTitle: string;
  domainCountTitle: string;
}

export interface TopologyRealmLedgerProps {
  rootKind: string;
  rootTitle: string;
  census: { elementCount: number; capabilityCount: number; depth: number };
  subtree: OntologyTreeNode;
  boundaryRows: RealmBoundaryRow[];
  boundaryTotal: number;
  selectedId: string | null;
  changedSlugs: ReadonlySet<string>;
  onSelect: (nodeId: string) => void;
  onExit: () => void;
  onJumpRealm: (realmId: string) => void;
  maxDomainDescendantCount: number;
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  labels: TopologyRealmLedgerLabels;
  className?: string;
}

/**
 * The realm ledger shown instead of the global INDEX while a realm is expanded (`?realm=slug`): header,
 * the realm tree with search, and boundary relations behind one summary line. It reuses INDEX's tokens,
 * shell and `TopologyIndexTreeRow`.
 */
export function TopologyRealmLedger({
  rootKind,
  rootTitle,
  census,
  subtree,
  boundaryRows,
  boundaryTotal,
  selectedId,
  changedSlugs,
  onSelect,
  onExit,
  onJumpRealm,
  maxDomainDescendantCount,
  domainCensus = null,
  labels,
  className,
}: TopologyRealmLedgerProps) {
  const [query, setQuery] = useState("");
  const childRoots = subtree.children;
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(childRoots.map((child) => child.node.id)),
  );
  const [boundaryOpen, setBoundaryOpen] = useState(false);
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;

  const visibleRoots = useMemo(
    () => (isFiltering ? filterTreeByQuery(childRoots, trimmedQuery) : childRoots),
    [childRoots, isFiltering, trimmedQuery],
  );

  const toggleOpen = (nodeId: string) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const isOpen = (nodeId: string) => isFiltering || openIds.has(nodeId);

  // The same roving tabindex contract as the INDEX tree (same widget, same tree pattern).
  const treeRef = useRef<HTMLElement>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const orderedRowIds = useMemo(
    () => flattenVisibleRowIds(visibleRoots, isOpen),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, openIds, isFiltering],
  );
  const resolvedActiveRowId = resolveActiveRowId(orderedRowIds, activeRowId, selectedId);

  const focusRow = (nodeId: string) => {
    const rows = treeRef.current?.querySelectorAll<HTMLElement>("[data-index-row]");
    rows?.forEach((el) => {
      if (el.dataset.indexRow === nodeId) el.focus();
    });
  };

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    const nextId = nextRovingId(orderedRowIds, resolvedActiveRowId, key as RovingNavKey);
    if (nextId === null) return;
    setActiveRowId(nextId);
    focusRow(nextId);
  };

  const handleTreeFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const rowEl = (event.target as HTMLElement).closest?.("[data-index-row]") as HTMLElement | null;
    const id = rowEl?.dataset.indexRow;
    if (id && id !== activeRowId) setActiveRowId(id);
  };

  return (
    /*
     * Content height up to the slot (`max-h-full`), like `TopologyIndexPanel`, so swapping the two
     * reads as one box changing contents.
     */
    <aside
      aria-label={labels.label}
      data-testid="topology-realm-ledger"
      className={`flex max-h-full flex-col rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-3 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      <header className="mb-3 shrink-0 px-0.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--map-panel-text-tertiary)]">
            {labels.label}
          </span>
          <RealmBlockExportAction rootTitle={rootTitle} census={census} subtree={subtree} />
          <button
            type="button"
            onClick={onExit}
            aria-label={labels.exitAria}
            data-testid="topology-realm-exit"
            className={controlClass({
              shape: "link",
              size: "md",
              tone: "muted",
              className:
                "shrink-0 text-[color:var(--map-panel-text-quaternary)] hover:text-[color:var(--map-panel-text-primary)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
            })}
          >
            {labels.exit}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            <OntologyMapKindGlyph kind={rootKind} size={15} />
          </span>
          <p
            data-testid="topology-realm-title"
            className="min-w-0 flex-1 truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--map-panel-text-primary)]"
          >
            {rootTitle}
          </p>
        </div>
        <p
          data-testid="topology-realm-census"
          className="mt-1 truncate font-mono text-caption text-[color:var(--map-panel-text-quaternary)]"
        >
          {labels.elementsShort} {census.elementCount} · {labels.capabilitiesShort}{" "}
          {census.capabilityCount} · {labels.depthShort} {census.depth}
        </p>
      </header>

      <div className="relative mb-2 shrink-0">
        <Search
          size={ICON_SIZE.sm}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--map-panel-text-quaternary)]"
        />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-realm-search"
          className={fieldClass({ size: "md", className: "w-full pl-7" })}
        />
      </div>

      <nav
        ref={treeRef}
        role="tree"
        aria-label={labels.label}
        data-testid="topology-realm-tree"
        onKeyDown={handleTreeKeyDown}
        onFocusCapture={handleTreeFocus}
        className="min-h-0 flex-1 space-y-px overflow-y-auto"
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-label text-[color:var(--map-panel-text-quaternary)]">
            {labels.emptyHint}
          </p>
        ) : (
          visibleRoots.map((root, rootIndex) => (
            <TopologyIndexTreeRow
              key={root.node.id}
              entry={root}
              depth={0}
              position={rootIndex + 1}
              setSize={visibleRoots.length}
              isOpen={isOpen}
              onToggleOpen={toggleOpen}
              onSelect={onSelect}
              selectedId={selectedId}
              activeRowId={resolvedActiveRowId}
              changedSlugs={changedSlugs}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              query={trimmedQuery || undefined}
              labels={{
                capabilitiesShort: labels.capabilitiesShort,
                elementsShort: labels.elementsShort,
                freshTitle: labels.freshTitle,
                domainCountTitle: labels.domainCountTitle,
              }}
            />
          ))
        )}
      </nav>

      <div
        data-testid="topology-realm-boundary"
        className="mt-2.5 shrink-0 border-t border-[color:var(--map-panel-divider)] pt-2"
      >
        {boundaryTotal === 0 ? (
          <p className="px-1 text-label text-[color:var(--map-panel-text-quaternary)]">
            {labels.boundaryEmpty}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setBoundaryOpen((open) => !open)}
              aria-expanded={boundaryOpen}
              aria-label={labels.boundaryToggleAria}
              data-testid="topology-realm-boundary-toggle"
              className={controlClass({ shape: "row", className: "gap-1.5 rounded-[var(--chrome-radius-inner)] px-1 py-0.5 hover:bg-[color:var(--map-panel-row-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
            >
              <span className="min-w-0 flex-1 truncate text-label text-[color:var(--map-panel-text-tertiary)]">
                {labels.boundaryHeading}
              </span>
              <ChevronDown
                size={ICON_SIZE.sm}
                aria-hidden="true"
                className={`shrink-0 text-[color:var(--map-panel-text-quaternary)] transition-transform ${boundaryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {boundaryOpen ? (
              <ul className="mt-1 max-h-[132px] space-y-px overflow-y-auto">
                {boundaryRows.map((row) => (
                  <li
                    key={row.edgeId}
                    data-testid="topology-realm-boundary-row"
                    className="group flex items-center gap-2 rounded-chip px-1 py-1 transition-colors hover:bg-[color:var(--map-panel-row-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-label text-[color:var(--map-panel-text-secondary)]">
                      <span className="text-[color:var(--map-panel-text-primary)]">
                        {row.fromTitle}
                      </span>
                      <span className="mx-1 text-[color:var(--map-panel-text-quaternary)]">→</span>
                      <span className="text-[color:var(--map-panel-text-primary)]">
                        {row.toTitle}
                      </span>
                      <span className="ml-1 text-[color:var(--map-panel-text-quaternary)]">
                        ({row.relationLabel})
                      </span>
                    </span>
                    {/* A quiet action — revealed only on row hover or focus (no permanently listed buttons). */}
                    <button
                      type="button"
                      onClick={() => onJumpRealm(row.jumpRealmId)}
                      aria-label={labels.boundaryJumpAria}
                      title={labels.boundaryJump}
                      data-testid="topology-realm-boundary-jump"
                      className={controlClass({
                        shape: "link",
                        size: "md",
                        className:
                          "shrink-0 text-[color:var(--color-indigo-accent)] [@media(hover:hover)]:opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset group-hover:opacity-100 motion-reduce:transition-none",
                      })}
                    >
                      <CornerUpRight size={ICON_SIZE.sm} aria-hidden="true" />
                      {labels.boundaryJump}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
