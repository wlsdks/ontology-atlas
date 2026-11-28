import {
  useId,
  useMemo,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronLeft, Plus, Search, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { useRovingRadioGroup } from "@/shared/lib/keyboard/use-roving-radio-group";
import { Link } from "@/i18n/navigation";
import { controlClass, IconButton } from "@/shared/ui";
import { TabBar } from "@/shared/ui/controls/tab-bar";
import {
  filterTreeByNodeIds,
  filterTreeByQuery,
  countMatchingTreeNodes,
  type DomainCensusRow,
  type OntologyTreeBuildResult,
} from "@/entities/knowledge-graph";
import { FirstRunStarterModule } from "@/features/first-run-starter";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import { closedAncestorHolding } from "../lib/selection-path";
import { useIndexRootWindow } from "../lib/use-index-root-window";
import {
  flattenVisibleRowIds,
  isRovingNavKey,
  nextRovingId,
  resolveActiveRowId,
} from "../lib/roving-tabindex";
import type { IndexAddConcept } from "./TopologyIndexAddRow";
import { type IndexAddLabels, TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

export type IndexLens = "all" | "recent";

const WINDOW_CHIP_VALUES = ["auto", 1, 7, 30] as const;
type RecentWindow = (typeof WINDOW_CHIP_VALUES)[number];

/**
 * Above this many concepts the map counts as built and the make-a-map-from-code door steps aside,
 * since it would read as starting over; the unbound-source row still offers the connect path. Set
 * above the starter vault's seed count; it does not judge quality.
 */
const UNBUILT_MAP_CONCEPT_CEILING = 8;

const TIDY_ROW_CLASS = controlClass({
  shape: "row",
  size: "sm",
  className:
    "atlas-touch-floor w-full text-left border-transparent hover:bg-[color:var(--map-panel-row-hover)]",
});

interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  searchMatches: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
  sourceDocumentsReading?: string;
  holdsSelection: string;
  capabilitiesShort: string;
  elementsShort: string;
  subcountsTitle?: string;
  freshTitle: string;
  domainCountTitle: string;
  subtotalTitle?: string;
  emptyHint: string;
  segmentAll: string;
  segmentRecent: string;
  segmentRecentAria: string;
  recentEmptyHint: string;
  /** Spotlight window preset chips (while the lens is active) — the chip row renders only when all of them are supplied. */
  windowChipAuto?: string;
  windowChip1?: string;
  windowChip7?: string;
  windowChip30?: string;
  windowChipsAria?: string;
  agentBadge: string;
  uncatalogedDocsLabel: string;
  uncatalogedDocsAction: string;
  brokenDocsLabel: string;
  brokenDocsAction: string;
  tidyHeading: string;
  /** Says the map inside the picked project was opened, so the substitution is never silent. */
  openedInsideLabel: string;
  openedInsideDismiss: string;
  /** A quiet hint that element rows are absent in plain mode; renders only with `plainMode`. */
  plainHint?: string;
  createConcept?: string;
  add?: IndexAddLabels;
}

export interface TopologyIndexPanelProps {
  treeResult: OntologyTreeBuildResult;
  totalConcepts: number;
  totalRelations: number;
  domainCount: number;
  changedSlugs: ReadonlySet<string>;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  onCollapse: () => void;
  onEnablePlainMode?: () => void;
  labels: TopologyIndexPanelLabels;
  className?: string;
  /**
   * The recently-changed lens (`useAdaptiveRecentChanges`); `filterTreeByNodeIds` keeps these ids
   * plus their ancestor paths, like `filterTreeByQuery`. Omitted, no segmented control renders.
   */
  recentChanges?: {
    ids: ReadonlySet<string>;
    agentAttributedNodeId: string | null;
  } | null;
  uncatalogedDocCount?: number;
  brokenDocCount?: number;
  /**
   * The node id of a project with no code folder bound, for the first-run door only; the project's
   * own panel carries the remedy.
   */
  unboundProjectNodeId?: string | null;
  /** The vault holds no project node at all — distinct from "every project already has code bound". */
  noProjectsYet?: boolean;
  openedInsidePickedFolder?: string | null;
  agentAvailable?: boolean;
  onDismissOpenedInside?: () => void;
  onPromoteUncatalogedDocs?: (() => void) | null;
  /**
   * Domain size from the graph BFS census (`computeDomainCensusRows`), the same numbers as
   * /projects and insights; omitted, the tree walk is used.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  /**
   * Makes the lens controlled by one `?recent=` URL param shared with the map, so the two cannot
   * disagree; omitted, local state.
   */
  lens?: IndexLens;
  onLensChange?: (lens: IndexLens) => void;
  recentWindow?: RecentWindow;
  /** A preset chip click switches the window (applied immediately — no popup or confirmation, by contract). */
  onWindowChange?: (window: RecentWindow) => void;
  /**
   * Gate for plain mode's hint row; removing element rows is the caller's job
   * (`filterTreeExcludeKind`).
   */
  plainMode?: boolean;
  vaultLoaded?: boolean;
  /**
   * Basename of the folder being read; a basename because the File System Access API offers
   * nothing more. Shown only with `sourceLoadProgress`: at rest the rail names the folder.
   */
  sourceName?: string | null;
  sourceLoadProgress?: { read: number; total: number } | null;
  onCreateConcept?: () => void;
  onAddInGroup?: IndexAddConcept;
}

/**
 * INDEX: the left panel floating over the topology map with `--topology-index-*` tokens; `TopologyIndexTab`
 * is its collapsed form. Search reuses `filterTreeByQuery` so ancestor-keeping cannot drift between surfaces.
 */
export function TopologyIndexPanel({
  searchQuery,
  onSearchQueryChange,
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
  recentChanges = null,
  uncatalogedDocCount,
  brokenDocCount,
  unboundProjectNodeId = null,
  noProjectsYet = false,
  sourceName = null,
  sourceLoadProgress = null,
  openedInsidePickedFolder = null,
  agentAvailable = false,
  onDismissOpenedInside,
  onPromoteUncatalogedDocs = null,
  onEnablePlainMode,
  domainCensus = null,
  lens: lensProp,
  onLensChange,
  recentWindow = "auto",
  onWindowChange,
  plainMode = false,
  vaultLoaded = true,
  onCreateConcept,
  onAddInGroup,
}: TopologyIndexPanelProps) {
  /*
   * Window chips take only the behaviour from the hook; their settled dimensions and panel-scoped
   * ink stay here.
   */
  const WINDOW_CHIP_LABELS = [
    labels.windowChipAuto,
    labels.windowChip1,
    labels.windowChip7,
    labels.windowChip30,
  ];
  const windowGroup = useRovingRadioGroup<RecentWindow>({
    value: recentWindow,
    values: WINDOW_CHIP_VALUES,
    onChange: (next) => onWindowChange?.(next),
  });

  const [localQuery, setLocalQuery] = useState("");
  const query = searchQuery ?? localQuery;
  const setQuery = onSearchQueryChange ?? setLocalQuery;
  const rootIds = useMemo(
    () => treeResult.roots.map((root) => root.node.id),
    [treeResult.roots],
  );
  const rootIdsKey = rootIds.join("\u0000");
  const [treeOpenState, setTreeOpenState] = useState(() => ({
    rootIdsKey,
    knownRootIds: new Set(rootIds),
    openIds: new Set(rootIds),
  }));
  if (treeOpenState.rootIdsKey !== rootIdsKey) {
    const nextOpenIds = new Set(treeOpenState.openIds);
    for (const id of rootIds) {
      if (!treeOpenState.knownRootIds.has(id)) nextOpenIds.add(id);
    }
    setTreeOpenState({
      rootIdsKey,
      knownRootIds: new Set(rootIds),
      openIds: nextOpenIds,
    });
  }
  // Only the person opens rows: a selection marks the closed row holding it instead.
  const openIds = treeOpenState.openIds;
  // The lens narrows the tree only while search is empty; with `lensProp` it is controlled by
  // `?recent=`.
  const [lensLocal, setLensLocal] = useState<IndexLens>("all");
  const lens = lensProp ?? lensLocal;
  const setLens = (next: IndexLens) => {
    if (onLensChange) onLensChange(next);
    else setLensLocal(next);
  };
  const trimmedQuery = query.trim();
  const isFiltering = trimmedQuery.length > 0;
  const lensActive = !isFiltering && lens === "recent" && recentChanges !== null;
  const visibleRoots = useMemo(() => {
    if (isFiltering) return filterTreeByQuery(treeResult.roots, trimmedQuery);
    if (lensActive && recentChanges) return filterTreeByNodeIds(treeResult.roots, recentChanges.ids);
    return treeResult.roots;
  }, [treeResult.roots, isFiltering, trimmedQuery, lensActive, recentChanges]);
  const matchCount = useMemo(
    () => isFiltering ? countMatchingTreeNodes(treeResult.roots, trimmedQuery) : 0,
    [treeResult.roots, isFiltering, trimmedQuery],
  );
  const maxDomainDescendantCount = useMemo(() => {
    if (domainCensus && domainCensus.size > 0) {
      return Math.max(0, ...Array.from(domainCensus.values(), (row) => row.total));
    }
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots, domainCensus]);

  // Search and the lens show every narrowed row open; a toggle there would silently change the
  // open set the tree returns to.
  const toggleOpen = (nodeId: string) => {
    if (isFiltering || lensActive) return;
    setTreeOpenState((current) => {
      const next = new Set(current.openIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { ...current, openIds: next };
    });
  };
  const isOpen = (nodeId: string) => isFiltering || lensActive || openIds.has(nodeId);

  // Roving tabindex over the visible rows (the same `isOpen` as the auto-expansion); arrow keys are
  // handled on the tree container.
  // A tabIndex=-1 row still accepts focus(); it becomes the entry point on the next render.
  const [rootRange, rootListRef, focusRow, tabStopFor] = useIndexRootWindow(visibleRoots);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const orderedRowIds = useMemo(
    () => flattenVisibleRowIds(visibleRoots, isOpen),
    // isOpen closes over openIds/isFiltering/lensActive — its sources are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, openIds, isFiltering, lensActive],
  );
  const selectionHolderId = useMemo(
    () => (selectedId ? closedAncestorHolding(visibleRoots, selectedId, isOpen) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, selectedId, openIds, isFiltering, lensActive],
  );
  const resolvedActiveRowId = resolveActiveRowId(orderedRowIds, activeRowId, selectionHolderId ?? selectedId);
  const tabStopRowId = tabStopFor(resolvedActiveRowId);

  const handleTreeKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = event.key;
    if (!isRovingNavKey(key)) return;
    event.preventDefault();
    const nextId = nextRovingId(orderedRowIds, resolvedActiveRowId, key);
    if (nextId === null) return;
    setActiveRowId(nextId);
    focusRow(nextId);
  };

  // Align the active row to wherever focus lands, so the entry point is the row focused last.
  const handleTreeFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const rowElement = (event.target as HTMLElement).closest?.("[data-index-row]") as HTMLElement | null;
    const id = rowElement?.dataset.indexRow;
    if (id && id !== activeRowId) setActiveRowId(id);
  };

  const tidyRows: Array<{
    key: string;
    testId: string;
    label: string;
    action: string;
    href?: string;
    onClick?: () => void;
  }> = [];
  if (vaultLoaded && uncatalogedDocCount && uncatalogedDocCount > 0 && onPromoteUncatalogedDocs) {
    tidyRows.push({
      key: "uncataloged",
      testId: "topology-index-uncataloged-docs",
      label: labels.uncatalogedDocsLabel,
      action: labels.uncatalogedDocsAction,
      onClick: onPromoteUncatalogedDocs,
    });
  }
  if (vaultLoaded && brokenDocCount && brokenDocCount > 0) {
    tidyRows.push({
      key: "broken",
      testId: "topology-index-broken-docs",
      label: labels.brokenDocsLabel,
      action: labels.brokenDocsAction,
      href: "/docs/",
    });
  }
  const tidyHeadingId = useId();
  const tabsId = useId();
  const activeTab = lensActive ? "recent" : "all";
  const projectRoots = treeResult.roots.filter((root) => root.node.kind === "project").length;
  const projectCount = projectRoots === 1 ? totalConcepts : null;
  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      data-topology-camera-obstacle="side-panel"
      className={`flex max-h-full flex-col rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-3 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/*
       * The get-started module: the card and INDEX are exclusive
       * states, so there is one scroll.
       */}
      <FirstRunStarterModule
        /*
         * Pass lens, not lensActive (which also needs an empty search and computed changes):
         * pressing the lens must collapse the card even with zero highlights.
         */
        lensActive={lens === "recent"}
        /* Selecting any node means the guidance card has done its job —
           see `FirstRunStarterModule`'s `nodeSelected` doc-block. */
        nodeSelected={selectedId !== null}
        /*
         * The make-a-map-from-code door is for any open vault with nothing pointing at real code,
         * not only people who never opened a folder.
         */
        mapUnbuilt={
          /*
           * `noProjectsYet` separates "no projects" from "every project bound",
           * since `unboundProjectNodeId` is null for both.
           */
          vaultLoaded &&
          (unboundProjectNodeId !== null || noProjectsYet) &&
          totalConcepts <= UNBUILT_MAP_CONCEPT_CEILING
        }
        agentAvailable={agentAvailable}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={plainMode}
      >
      <div className="-mx-2 mb-3 flex items-center gap-1 max-md:pr-12">
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded={true}
        aria-label={labels.foldAria}
        title={labels.fold}
        data-testid="topology-index-fold"
        className={controlClass({ shape: "row", className: "group min-w-0 flex-1 gap-1.5 rounded-[var(--chrome-radius-inner)] px-2 hover:bg-[color:var(--map-panel-row-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
      >
        <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--map-panel-text-primary)]">
          {labels.label}
        </span>
        {/* No visible count here; the terrain HUD shows it and the sr-only census stays. */}
        <span
          aria-hidden="true"
          // `size-5` keeps the row on its 36px ladder step (44 under a coarse pointer).
          className="ml-auto inline-flex size-5 shrink-0 items-center justify-center text-[color:var(--map-panel-text-quaternary)] transition-colors group-hover:text-[color:var(--map-panel-text-secondary)]"
        >
          <ChevronLeft size={ICON_SIZE.sm} aria-hidden="true" />
        </span>
      </button>
      {onCreateConcept && labels.createConcept ? (
        <IconButton
          label={labels.createConcept}
          size="lg"
          hoverInk="strong"
          onClick={onCreateConcept}
          data-testid="topology-index-create"
        >
          <Plus size={ICON_SIZE.sm} aria-hidden="true" />
        </IconButton>
      ) : null}
      </div>
      {sourceName && sourceLoadProgress ? (
        <p
          data-testid="topology-index-source"
          className="mb-3 flex min-w-0 items-center gap-1.5 text-label leading-label text-[color:var(--map-panel-text-quaternary)]"
        >
          <span
            className="min-w-0 truncate text-[color:var(--map-panel-text-tertiary)]"
            title={sourceName}
          >
            {sourceName}
          </span>
          <span aria-hidden>·</span>
          <span
            className="shrink-0 tabular-nums"
            data-vault-load-progress={`${sourceLoadProgress.read}/${sourceLoadProgress.total}`}
          >
            {labels.sourceDocumentsReading}
          </span>
        </p>
      ) : null}
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-3 shrink-0">
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
            // Escape in INDEX search clears the query and stops the key, so the window's topology
            // Escape ladder does not also deselect; an empty field lets it bubble. The caret stays
            // in the field.
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
            }
          }}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchPlaceholder}
          name="topology-index-search"
          autoComplete="off"
          data-testid="topology-index-search"
          className={fieldClass({ size: "md", className: "w-full pl-7" })}
        />
      </div>

      {isFiltering && matchCount > 0 ? (
        <p role="status" className="mb-3 shrink-0 text-label leading-label text-[color:var(--map-panel-text-secondary)]">
          {labels.searchMatches}: {matchCount}
        </p>
      ) : null}

      {recentChanges ? (
        <div className="mb-3 shrink-0 border-b border-[color:var(--map-panel-zone-divider)]">
          <TabBar
            items={[
              { key: "all", label: labels.segmentAll, testId: "topology-index-segment-all" },
              { key: "recent", label: labels.segmentRecent, testId: "topology-index-segment-recent" },
            ]}
            placement="header"
            activeKey={activeTab}
            onSelect={(key) => setLens(key === "recent" ? "recent" : "all")}
            ariaLabel={labels.segmentRecentAria}
            idPrefix={tabsId}
          />
        </div>
      ) : null}

      {lensActive && onWindowChange && labels.windowChipAuto && labels.windowChip1 && labels.windowChip7 && labels.windowChip30 ? (
        <div
          {...windowGroup.groupProps}
          aria-label={labels.windowChipsAria ?? labels.segmentRecentAria}
          data-testid="topology-index-window-chips"
          /* No visible label for the chips; `aria-label` names them for screen readers. */
          className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5"
        >
          {WINDOW_CHIP_VALUES.map((value, index) => (
            <button
              key={String(value)}
              {...windowGroup.itemProps(index)}
              type="button"
              data-testid={`topology-index-window-chip-${value}`}
              className={`inline-flex h-6 min-w-12 items-center justify-center rounded-[var(--chrome-radius-inner)] border text-label transition-colors [@media(pointer:coarse)]:h-[var(--touch-target-min)] ${
                recentWindow === value
                  ? "border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] text-[color:var(--map-panel-text-primary)]"
                  : "border-[color:var(--map-panel-border)] text-[color:var(--map-panel-text-tertiary)] hover:text-[color:var(--map-panel-text-primary)]"
              }`}
            >
              {WINDOW_CHIP_LABELS[index]}
            </button>
          ))}
        </div>
      ) : null}

      {plainMode && labels.plainHint ? (
        <p
          data-testid="topology-index-plain-hint"
          className="mb-2 shrink-0 text-label text-[color:var(--map-panel-text-quaternary)]"
        >
          {labels.plainHint}
        </p>
      ) : null}

      <div
        role={recentChanges ? "tabpanel" : undefined}
        id={recentChanges ? `${tabsId}-tabpanel-${activeTab}` : undefined}
        aria-labelledby={recentChanges ? `${tabsId}-tab-${activeTab}` : undefined}
        className="flex min-h-0 shrink flex-col"
      >
      <div
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        onKeyDown={handleTreeKeyDown}
        onFocusCapture={handleTreeFocus}
        // min-h 24 keeps the tree from collapsing to 0 in a short window beside the first-run card.
        className="min-h-24 shrink overflow-y-auto"
        style={{
          maskImage: "linear-gradient(to bottom, black calc(100% - 12px), transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 12px), transparent)",
        }}
      >
        {visibleRoots.length === 0 ? (
          <p role={isFiltering ? "status" : undefined} className="py-2 text-label text-[color:var(--map-panel-text-quaternary)]">
            {lensActive ? labels.recentEmptyHint : labels.emptyHint}
          </p>
        ) : (
          <div
            ref={rootListRef}
            className="flex flex-col gap-px"
            style={{ paddingTop: rootRange.before, paddingBottom: rootRange.after }}
          >
            {visibleRoots.slice(rootRange.start, rootRange.end).map((root, offset) => (
              <div key={root.node.id} data-row-index={rootRange.start + offset}>
                <TopologyIndexTreeRow
                  entry={root}
                  depth={0}
                  position={rootRange.start + offset + 1}
                  setSize={visibleRoots.length}
                  isOpen={isOpen}
                  onToggleOpen={toggleOpen}
                  onSelect={onSelect}
                  selectedId={selectedId}
                  selectionHolderId={selectionHolderId}
                  activeRowId={tabStopRowId}
                  changedSlugs={changedSlugs}
                  agentAttributedNodeId={recentChanges?.agentAttributedNodeId ?? null}
                  maxDomainDescendantCount={maxDomainDescendantCount}
                  domainCensus={domainCensus}
                  projectCount={projectCount}
                  query={trimmedQuery || undefined}
                  labels={labels}
                  onAddInGroup={isFiltering || lensActive ? undefined : onAddInGroup}
                  addLabels={labels.add}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      </div>

      {tidyRows.length > 0 ? (
        <section data-testid="topology-index-tidy" aria-labelledby={tidyHeadingId} className="mt-3 shrink-0 border-t border-[color:var(--map-panel-zone-divider)] pt-2">
          <p
            id={tidyHeadingId}
            className="sr-only"
          >
            {labels.tidyHeading}
          </p>
          <ul className="flex flex-col gap-1">
            {tidyRows.map((row) => (
              <li key={row.key}>
                {row.href ? (
                  <Link href={row.href} data-testid={row.testId} className={TIDY_ROW_CLASS}>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--map-panel-text-secondary)]">{row.label}</span>
                    <span className="shrink-0 text-[color:var(--color-indigo-text-strong)]">{row.action}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={row.onClick} data-testid={row.testId} className={TIDY_ROW_CLASS}>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--map-panel-text-secondary)]">{row.label}</span>
                    <span className="shrink-0 text-[color:var(--color-indigo-text-strong)]">{row.action}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {openedInsidePickedFolder ? (
        <div
          data-testid="topology-index-opened-inside"
          className="mt-2 flex shrink-0 items-start gap-1.5"
        >
          <p className="min-w-0 flex-1 break-keep text-caption leading-caption text-[color:var(--map-panel-text-tertiary)]">
            {labels.openedInsideLabel}
          </p>
          {onDismissOpenedInside ? (
            <button
              type="button"
              data-testid="topology-index-opened-inside-dismiss"
              onClick={onDismissOpenedInside}
              aria-label={labels.openedInsideDismiss}
              title={labels.openedInsideDismiss}
              className={controlClass({
                shape: "chip",
                size: "sm",
                scope: "panel",
                hoverInk: "strong",
                className: "touch-hit-expand shrink-0 border-transparent px-1",
              })}
            >
              <X size={ICON_SIZE.sm} aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}



      </FirstRunStarterModule>
    </aside>
  );
}
