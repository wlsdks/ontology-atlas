"use client";

import {
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, CornerUpRight, Search } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import {
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeNode,
} from "@/shared/lib/ontology-tree";
import { RealmBlockExportAction } from "@/features/ontology-blocks";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";
import { controlClass } from "@/shared/ui";
import {
  flattenVisibleRowIds,
  nextRovingId,
  resolveActiveRowId,
  type RovingNavKey,
} from "../lib/roving-tabindex";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

/** One boundary relation row — display-ready, with i18n labels already assembled (HomePage builds it). */
export interface RealmBoundaryRow {
  edgeId: string;
  fromTitle: string;
  toTitle: string;
/** The relation type's plain label (e.g. "depends on") — assembled by HomePage's relationVocabulary. */
  relationLabel: string;
  outsideId: string;
  jumpRealmId: string;
}

export interface TopologyRealmLedgerLabels {
  /** The top eyebrow — 「Realm」 (realm). */
  label: string;
  /** Labels for the realm census fragments. */
  elementsShort: string;
  capabilitiesShort: string;
  depthShort: string;
  /** Placeholder for the realm tree's search field. */
  searchPlaceholder: string;
  /** The 「Leave Realm」 (leave realm) text button. */
  exit: string;
  exitAria: string;
  /** The one-line message when the tree is empty (zero search results and the like). */
  emptyHint: string;
  /** "N relations touching the outside" (HomePage formats the count) — the collapsed-by-default summary line. */
  boundaryHeading: string;
  boundaryToggleAria: string;
  /** The 「Go to this realm」 (go to this realm) hover action on a row. */
  boundaryJump: string;
  boundaryJumpAria: string;
  /** The one-line message when a realm is completely isolated. */
  boundaryEmpty: string;
  // Tree row labels forwarded to TopologyIndexTreeRow.
  freshTitle: string;
  domainCountTitle: string;
}

export interface TopologyRealmLedgerProps {
  /** The realm's root node — the header glyph and title. */
  rootKind: string;
  rootTitle: string;
  /** Realm census fragments (elements, capabilities, depth). Derived by HomePage. */
  census: { elementCount: number; capabilityCount: number; depth: number };
  /** The realm subtree — the root's children become the tree's top-level rows. */
  subtree: OntologyTreeNode;
  /** The boundary edge rows to display (the top few). */
  boundaryRows: RealmBoundaryRow[];
  /** The total boundary edge count (the whole set, independent of the row slice). */
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
 * The realm ledger — while a realm is expanded (`?realm=slug`), the left panel
 * transforms to show **only this node's world** instead of the global INDEX (fable's
 * design plus the owner's instruction to keep it restrained). The global first-run
 * card, global census, global tree and global footer all hide, and exactly three
 * blocks remain:
 *
 *   1. Header — root glyph, title, a one-line census, and a quiet 「Leave Realm」 (leave
 *      realm) text button.
 *   2. Realm tree — the root subtree only, search included.
 *   3. Boundary relations — a collapsed-by-default summary line ("N relations
 *      touching the outside"); the list appears only when expanded.
 *
 * The restraint contract (the owner's rejection criteria): no box inside a box
 * (sections are separated by a caps eyebrow, whitespace and one hairline divider),
 * no badge or chip soup (the census is one line of text, and the jump is a quiet
 * action revealed only on row hover), and an empty state is one line of copy. It
 * reuses the global `TopologyIndexPanel`'s `--topology-v2-panel-*` /
 * `--topology-index-*` tokens, the same aside shell and the same
 * `TopologyIndexTreeRow` — a sister panel with only its content narrowed to the
 * realm's scope.
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
  // The realm tree's top level is the root's direct children (the header already names the root itself).
  const childRoots = subtree.children;
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(childRoots.map((child) => child.node.id)),
  );
  // Boundary relations are collapsed by default — the default screen stays tidy with just the header and tree.
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
    <aside
      aria-label={labels.label}
      data-testid="topology-realm-ledger"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* ── 1. Header ── caps eyebrow + title + one-line census + a quiet leave action. */}
      <header className="mb-3 shrink-0 px-0.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.label}
          </span>
          {/* "Export this realm as a block". A self-contained module (the
              FirstRunStarterModule contract): it reads vault state and labels itself
              rather than widening this widget's prop surface, and renders null on its
              own when the local vault is not loaded (the static sample). It stands
              beside the exit text button in the same quiet action grammar. */}
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
                "shrink-0 text-[color:var(--topology-v2-panel-text-quaternary)] hover:text-[color:var(--topology-v2-panel-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
            })}
          >
            {labels.exit}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0">
            <TopologyV2KindGlyph kind={rootKind} size={15} />
          </span>
          <p
            data-testid="topology-realm-title"
            className="min-w-0 flex-1 truncate text-body-lg font-[var(--font-weight-signature)] text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {rootTitle}
          </p>
        </div>
        <p
          data-testid="topology-realm-census"
          className="mt-1 truncate font-mono text-caption text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {labels.elementsShort} {census.elementCount} · {labels.capabilitiesShort}{" "}
          {census.capabilityCount} · {labels.depthShort} {census.depth}
        </p>
      </header>

      {/* Realm-scoped search — a filter belonging to the tree section, not a separate card. */}
      <div className="relative mb-2 shrink-0">
        <Search
          size={ICON_SIZE.sm}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[color:var(--topology-v2-panel-text-quaternary)]"
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

      {/* ── 2. Realm tree ── the root subtree only, indented by depth. */}
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
          <p className="px-1 py-2 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
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
              activeRowId={resolvedActiveRowId}
              changedSlugs={changedSlugs}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
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

      {/* ── 3. Boundary relations ── separated by one hairline, a collapsed-by-default summary line. */}
      <div
        data-testid="topology-realm-boundary"
        className="mt-2.5 shrink-0 border-t border-[color:var(--topology-v2-panel-divider)] pt-2"
      >
        {boundaryTotal === 0 ? (
          <p className="px-1 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
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
              className={controlClass({ shape: "row", className: "gap-1.5 rounded-[var(--chrome-radius-inner)] px-1 py-0.5 hover:bg-[color:var(--topology-v2-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
            >
              <span className="min-w-0 flex-1 truncate text-label text-[color:var(--topology-v2-panel-text-tertiary)]">
                {labels.boundaryHeading}
              </span>
              <ChevronDown
                size={ICON_SIZE.sm}
                aria-hidden="true"
                className={`shrink-0 text-[color:var(--topology-v2-panel-text-quaternary)] transition-transform ${boundaryOpen ? "rotate-180" : ""}`}
              />
            </button>
            {boundaryOpen ? (
              <ul className="mt-1 max-h-[132px] space-y-px overflow-y-auto">
                {boundaryRows.map((row) => (
                  <li
                    key={row.edgeId}
                    data-testid="topology-realm-boundary-row"
                    className="group flex items-center gap-2 rounded-chip px-1 py-1 transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate text-label text-[color:var(--topology-v2-panel-text-secondary)]">
                      <span className="text-[color:var(--topology-v2-panel-text-primary)]">
                        {row.fromTitle}
                      </span>
                      <span className="mx-1 text-[color:var(--topology-v2-panel-text-quaternary)]">→</span>
                      <span className="text-[color:var(--topology-v2-panel-text-primary)]">
                        {row.toTitle}
                      </span>
                      <span className="ml-1 text-[color:var(--topology-v2-panel-text-quaternary)]">
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
                          "shrink-0 text-[color:var(--color-indigo-accent)] [@media(hover:hover)]:opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset group-hover:opacity-100 motion-reduce:transition-none",
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
