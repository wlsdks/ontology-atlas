"use client";

import {
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronLeft, Search, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";
import { Link } from "@/i18n/navigation";
import { controlClass } from "@/shared/ui";
import {
  filterTreeByNodeIds,
  filterTreeByQuery,
  type DomainCensusRow,
  type OntologyTreeBuildResult,
} from "@/entities/knowledge-graph";
import { FirstRunStarterModule } from "@/features/first-run-starter";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import { treeAncestorIds } from "../lib/reveal-row";
import { useIndexRootWindow } from "../lib/use-index-root-window";
import {
  flattenVisibleRowIds,
  isRovingNavKey,
  nextRovingId,
  resolveActiveRowId,
} from "../lib/roving-tabindex";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

/** INDEX lenses — 「All」 (all) and 「Recently Changed」 (recently changed). */
export type IndexLens = "all" | "recent";

/**
 * Above this many concepts the map counts as built and the make-a-map-from-code door steps aside,
 * since it would read as starting over; the unbound-source row still offers the connect path. Set
 * above the starter vault's seed count; it does not judge quality.
 */
const WINDOW_CHIP_VALUES = ["auto", 1, 7, 30] as const;
type RecentWindow = (typeof WINDOW_CHIP_VALUES)[number];

const UNBUILT_MAP_CONCEPT_CEILING = 8;

/** One row grammar for every tidy row: a fact on the left, one indigo action word on the right. */
const TIDY_ROW_CLASS = controlClass({
  shape: "card",
  size: "sm",
  className:
    "atlas-touch-floor w-full text-left border-[color:var(--map-panel-border)] hover:bg-[color:var(--map-panel-row-hover)]",
});

interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
  /** The unit word after the document count in the source line — "documents". */
  sourceDocuments: string;
  /** Hover explanation when the folder walk stopped before the end of the tree. */
  sourceDocumentsPartialTitle: string;
  sourceDocumentsReading?: string;
  capabilitiesShort: string;
  elementsShort: string;
  /** What those two kind names mean — see `TopologyIndexTreeRowLabels.subcountsTitle`. */
  subcountsTitle?: string;
  freshTitle: string;
  /** Hover explanation for the domain badge (multi-membership is counted more than once). */
  domainCountTitle: string;
  /** The scope word for the domain row's large number ("everything below"). */
  subtotalTitle?: string;
  emptyHint: string;
  /** Lens segment "all". */
  segmentAll: string;
  /** Lens segment "recently changed N" (the caller has already formatted the count). */
  segmentRecent: string;
  segmentRecentAria: string;
  /** Shown when the "recently changed" lens is active and yields zero results. */
  recentEmptyHint: string;
  /** Spotlight window preset chips (while the lens is active) — the chip row renders only when all of them are supplied. */
  windowChipAuto?: string;
  windowChip1?: string;
  windowChip7?: string;
  windowChip30?: string;
  windowChipsAria?: string;
  /** Heartbeat attribution badge. */
  agentBadge: string;
  /** "N documents not on the map" (the caller has already formatted the count). */
  uncatalogedDocsLabel: string;
  uncatalogedDocsAction: string;
  /**
   * Living-map drift: "N dusty nodes" plus the action to the freshness tab. Neutral tone only; the
   * warning ramp is forbidden here.
   */
  dustyNodesLabel: string;
  dustyNodesAction: string;
  /** "N documents the checks caught" (count formatted by the caller) plus the action that opens
   *  the document library, where the per-document explanation and repair already live. */
  brokenDocsLabel: string;
  brokenDocsAction: string;
  /**
   * "This project has no code folder attached": one quiet line whose press opens that project,
   * where the fix lives; no folder is chosen here.
   */
  sourceUnboundLabel: string;
  /** The eyebrow over the list of things to tidy (uncataloged, dusty, broken, unbound rows). */
  tidyHeading: string;
  /** Says the map inside the picked project was opened, so the substitution is never silent. */
  openedInsideLabel: string;
  /** Accessible name for the control that closes that notice once it has been read. */
  openedInsideDismiss: string;
  sourceUnboundAction: string;
  /** A quiet hint that element rows are absent in plain mode; renders only with `plainMode`. */
  plainHint?: string;
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
  /**
   * The first-run card's tour CTA; HomePage owns the tour state (FSD), so only the callback comes
   * down.
   */
  onStartTour?: () => void;
  /** The guided tour is pointing at the INDEX: the first-run card gives way to the list it describes. */
  tourIndexSpotlit?: boolean;
  /** The guided tour is pointing at the first-run card's one-line command: its disclosure stands open. */
  tourAgentSpotlit?: boolean;
  /** The first-run card's plain-words toggle; HomePage owns audiencePlain. */
  onEnablePlainMode?: () => void;
  labels: TopologyIndexPanelLabels;
  className?: string;
  /**
   * The recently-changed lens (`useAdaptiveRecentChanges`); `filterTreeByNodeIds` keeps these ids
   * plus their ancestor paths, like `filterTreeByQuery`. Omitted, no segmented control renders.
   */
  recentChanges?: {
    ids: ReadonlySet<string>;
    /** The one node (if any) matching a fresh heartbeat's focus. */
    agentAttributedNodeId: string | null;
  } | null;
  /** How many documents are in the vault but still have no kind (so are not on the map). */
  uncatalogedDocCount?: number;
  /** Living-map drift — the number of dusty nodes. At 0 the row is hidden. */
  dustyNodeCount?: number;
  /** Documents carrying at least one error-severity validation issue. At 0 the row is absent. */
  brokenDocCount?: number;
  /** The node id of a project with no code folder bound. null means the row does not exist. */
  unboundProjectNodeId?: string | null;
  /** Opens that project so its code folder can be connected; falls back to `onSelect`. */
  onOpenUnboundSource?: (id: string) => void;
  /** The vault holds no project node at all — distinct from "every project already has code bound". */
  noProjectsYet?: boolean;
  /** Truthy when "open a folder" opened the map inside the folder that was picked. */
  openedInsidePickedFolder?: string | null;
  /** Whether any agent runtime exists to hand 「make a map from my code」 to. */
  agentAvailable?: boolean;
  /** Clears the notice above. Omitted where nothing can clear it, and the control is then not drawn. */
  onDismissOpenedInside?: () => void;
  /** Clicking the row above → the "build a map from my documents" dialog (`bootstrapOpen`). */
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
  /** The spotlight window — "auto" (an adaptive ramp) or the 1/7/30 presets. Used to mark the active chip. */
  recentWindow?: RecentWindow;
  /** A preset chip click switches the window (applied immediately — no popup or confirmation, by contract). */
  onWindowChange?: (window: RecentWindow) => void;
  /**
   * Gate for plain mode's hint row; removing element rows is the caller's job
   * (`filterTreeExcludeKind`).
   */
  plainMode?: boolean;
  /**
   * Hides the dusty-nodes row in the static sample, whose graph is the product's own dogfood;
   * omitted, always shown.
   */
  vaultLoaded?: boolean;
  /**
   * Basename of the folder the concepts were read from, null in sample mode; a basename because the
   * File System Access API offers nothing more, and both surfaces must say the same thing.
   */
  sourceName?: string | null;
  /** Markdown documents read out of that folder. `null` while the manifest is not built yet. */
  sourceDocumentCount?: number | null;
  /**
   * Whether the walk stopped early
   * (`VaultManifest.walkTruncated`); `entities/docs-vault/model/types.ts` requires the count to say so in place, as `N+`.
   */
  sourceDocumentCountPartial?: boolean;
  sourceLoadProgress?: { read: number; total: number } | null;
}

/**
 * INDEX: the left panel floating over the topology map with `--topology-index-*` tokens
 * (`app/globals.css`, `docs/prototypes/index-panel-v2-full.html`); `TopologyIndexTab` is its
 * collapsed form. Search reuses `filterTreeByQuery` so ancestor-keeping cannot drift between
 * surfaces.
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
  recentChanges = null,
  uncatalogedDocCount,
  dustyNodeCount,
  brokenDocCount,
  unboundProjectNodeId = null,
  onOpenUnboundSource,
  noProjectsYet = false,
  sourceName = null,
  sourceDocumentCount = null,
  sourceDocumentCountPartial = false,
  sourceLoadProgress = null,
  openedInsidePickedFolder = null,
  agentAvailable = false,
  onDismissOpenedInside,
  onPromoteUncatalogedDocs = null,
  onStartTour,
  tourIndexSpotlit = false,
  tourAgentSpotlit = false,
  onEnablePlainMode,
  domainCensus = null,
  lens: lensProp,
  onLensChange,
  recentWindow = "auto",
  onWindowChange,
  plainMode = false,
  vaultLoaded = true,
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

  const [query, setQuery] = useState("");
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
  const openIds = treeOpenState.openIds;
  /*
   * The tree follows the selection: each new selection opens the rows above it once, a later fold
   * is respected, and a row not built yet is revealed when it arrives.
   */
  const [revealedSelection, setRevealedSelection] = useState<string | null>(null);
  if (selectedId !== revealedSelection) {
    // Walked only while a reveal is owed, not on every render of a large tree.
    const ancestors = selectedId ? treeAncestorIds(treeResult.roots, selectedId) : null;
    if (selectedId === null || ancestors !== null) {
      setRevealedSelection(selectedId);
      if (ancestors?.some((id) => !openIds.has(id))) {
        setTreeOpenState((current) => ({
          ...current,
          openIds: new Set([...current.openIds, ...ancestors]),
        }));
      }
    }
  }
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
  const maxDomainDescendantCount = useMemo(() => {
    // The meter's denominator comes from the same source of truth — with a census, the largest BFS total.
    if (domainCensus && domainCensus.size > 0) {
      return Math.max(0, ...Array.from(domainCensus.values(), (row) => row.total));
    }
    const domains = treeResult.roots.flatMap((root) =>
      root.children.filter((child) => child.node.kind === "domain"),
    );
    return computeMaxDomainDescendantCount(domains);
  }, [treeResult.roots, domainCensus]);

  const toggleOpen = (nodeId: string) => {
    setTreeOpenState((current) => {
      const next = new Set(current.openIds);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return { ...current, openIds: next };
    });
  };
  // An active lens auto-expands narrowed ancestor paths, like search.
  const isOpen = (nodeId: string) => isFiltering || lensActive || openIds.has(nodeId);

  // Roving tabindex over the visible rows (the same `isOpen` as the auto-expansion); arrow keys are
  // handled on the tree container.
  const [rootRange, rootListRef, bringRow, tabStopFor] = useIndexRootWindow(visibleRoots);
  const revealRow = useEffectEvent((nodeId: string) => bringRow(nodeId, "reveal"));
  // A revealed row is scrolled into the tree's own view, also when a search ends.
  useEffect(() => {
    if (revealedSelection) revealRow(revealedSelection);
  }, [revealedSelection, isFiltering]);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const orderedRowIds = useMemo(
    () => flattenVisibleRowIds(visibleRoots, isOpen),
    // isOpen closes over openIds/isFiltering/lensActive — its sources are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, openIds, isFiltering, lensActive],
  );
  const resolvedActiveRowId = resolveActiveRowId(orderedRowIds, activeRowId, selectedId);
  const tabStopRowId = tabStopFor(resolvedActiveRowId);

  // A tabIndex=-1 row still accepts focus(); it becomes the entry point on the next render.
  const focusRow = (nodeId: string) => bringRow(nodeId, "focus");

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
    const rowEl = (event.target as HTMLElement).closest?.("[data-index-row]") as HTMLElement | null;
    const id = rowEl?.dataset.indexRow;
    if (id && id !== activeRowId) setActiveRowId(id);
  };

  // Rows a person can tidy from here; each exists only while its condition holds.
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
  if (vaultLoaded && dustyNodeCount && dustyNodeCount > 0) {
    tidyRows.push({
      key: "dusty",
      testId: "topology-index-dusty-nodes",
      label: labels.dustyNodesLabel,
      action: labels.dustyNodesAction,
      href: "/ontology/insights?tab=do-next",
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
  if (vaultLoaded && unboundProjectNodeId) {
    const unboundId = unboundProjectNodeId;
    tidyRows.push({
      key: "unbound",
      testId: "topology-index-source-unbound",
      label: labels.sourceUnboundLabel,
      action: labels.sourceUnboundAction,
      onClick: () => (onOpenUnboundSource ?? onSelect)(unboundId),
    });
  }
  const tidyHeadingId = useId();
  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      data-topology-camera-obstacle="side-panel"
      className={`flex max-h-full flex-col rounded-[var(--map-panel-radius)] border border-[color:var(--map-panel-border)] bg-[color:var(--map-panel-surface)] p-3 shadow-[var(--map-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/*
       * The get-started module (`first-run-v3-flagship.html`): the card and INDEX are exclusive
       * states, so there is one scroll.
       */}
      <FirstRunStarterModule
        concepts={totalConcepts}
        /*
         * Pass lens, not lensActive (which also needs an empty search and computed changes):
         * pressing the lens must collapse the card even with zero highlights.
         */
        lensActive={lens === "recent"}
        /* Selecting any node means the guidance card has done its job —
           see `FirstRunStarterModule`'s `nodeSelected` doc-block. */
        nodeSelected={selectedId !== null}
        indexSpotlit={tourIndexSpotlit}
        agentSpotlit={tourAgentSpotlit}
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
        relations={totalRelations}
        domains={domainCount}
        onStartTour={onStartTour}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={plainMode}
      >
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded={true}
        aria-label={labels.foldAria}
        title={labels.fold}
        data-testid="topology-index-fold"
        className={controlClass({ shape: "row", className: "group -mx-2 mb-3 w-auto gap-1.5 rounded-[var(--chrome-radius-inner)] px-2 max-md:pr-12 hover:bg-[color:var(--map-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
      >
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--map-panel-text-quaternary)]">
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
      {/*
       * Which folder these rows came from, under the panel's name so it shows at every width; only
       * with a folder open.
       */}
      {sourceName ? (
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
          {sourceLoadProgress ? (
            <>
              <span aria-hidden>·</span>
              <span
                className="shrink-0 tabular-nums"
                data-vault-load-progress={`${sourceLoadProgress.read}/${sourceLoadProgress.total}`}
              >
                {labels.sourceDocumentsReading}
              </span>
            </>
          ) : sourceDocumentCount === null ? null : (
            <>
              <span aria-hidden>·</span>
              <span
                className="shrink-0"
                title={sourceDocumentCountPartial ? labels.sourceDocumentsPartialTitle : undefined}
              >
                {sourceDocumentCount}
                {sourceDocumentCountPartial ? "+" : ""} {labels.sourceDocuments}
              </span>
            </>
          )}
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

      {recentChanges ? (
        <div
          role="tablist"
          aria-label={labels.segmentRecentAria}
          className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--map-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={!lensActive}
            data-testid="topology-index-segment-all"
            onClick={() => setLens("all")}
            className={controlClass({
              shape: "segment",
              scope: "panel",
              active: !lensActive,
              className: "min-w-0 hover:text-[color:var(--map-panel-text-primary)]",
            })}
          >
            {labels.segmentAll}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lensActive}
            data-testid="topology-index-segment-recent"
            onClick={() => setLens("recent")}
            className={controlClass({
              shape: "segment",
              scope: "panel",
              truncate: true,
              active: lensActive,
              className: "min-w-0 hover:text-[color:var(--map-panel-text-primary)]",
            })}
          >
            {labels.segmentRecent}
          </button>
        </div>
      ) : null}

      {/*
       * Spotlight window presets apply on click, shown only when the lens is active, controlled and
       * fully labelled.
       */}
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
              /*
               * Chips follow the segments above: 24px high, 11px text, 7px corner, a uniform 48px
               * width; 44px under touch.
               */
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

      {/* A quiet one-liner explaining why element rows are missing in plain
          (non-developer) mode. Above the tree, below the lens and preset chips. */}
      {plainMode && labels.plainHint ? (
        <p
          data-testid="topology-index-plain-hint"
          className="mb-2 shrink-0 text-label text-[color:var(--map-panel-text-quaternary)]"
        >
          {labels.plainHint}
        </p>
      ) : null}

      <div
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        onKeyDown={handleTreeKeyDown}
        onFocusCapture={handleTreeFocus}
        // min-h 24 keeps the tree from collapsing to 0 in a short window beside the first-run card.
        className="min-h-24 shrink overflow-y-auto"
        // A 12px bottom mask fade instead of a hard-clipped last row.
        style={{
          maskImage: "linear-gradient(to bottom, black calc(100% - 12px), transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, black calc(100% - 12px), transparent)",
        }}
      >
        {visibleRoots.length === 0 ? (
          <p className="py-2 text-label text-[color:var(--map-panel-text-quaternary)]">
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
                  activeRowId={tabStopRowId}
                  changedSlugs={changedSlugs}
                  agentAttributedNodeId={recentChanges?.agentAttributedNodeId ?? null}
                  maxDomainDescendantCount={maxDomainDescendantCount}
                  domainCensus={domainCensus}
                  query={trimmedQuery || undefined}
                  labels={labels}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
       * One titled list of things to tidy, directly under the tree; each row exists only while its
       * condition holds.
       */}
      {tidyRows.length > 0 ? (
        <section data-testid="topology-index-tidy" aria-labelledby={tidyHeadingId} className="mt-3 shrink-0">
          <p
            id={tidyHeadingId}
            className="mb-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--map-panel-text-quaternary)]"
          >
            {labels.tidyHeading}
          </p>
          <ul className="flex flex-col gap-1">
            {tidyRows.map((row) => (
              <li key={row.key}>
                {row.href ? (
                  <Link href={row.href} data-testid={row.testId} className={TIDY_ROW_CLASS}>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--map-panel-text-tertiary)]">{row.label}</span>
                    <span className="shrink-0 text-[color:var(--color-indigo-accent)]">{row.action}</span>
                  </Link>
                ) : (
                  <button type="button" onClick={row.onClick} data-testid={row.testId} className={TIDY_ROW_CLASS}>
                    <span className="min-w-0 flex-1 truncate text-[color:var(--map-panel-text-tertiary)]">{row.label}</span>
                    <span className="shrink-0 text-[color:var(--color-indigo-accent)]">{row.action}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
       * States that the map inside the picked project was opened, so the substitution is never
       * silent.
       */}
      {openedInsidePickedFolder ? (
        <div
          data-testid="topology-index-opened-inside"
          className="mt-2 flex shrink-0 items-start gap-1.5"
        >
          <p className="min-w-0 flex-1 break-keep text-caption leading-caption text-[color:var(--map-panel-text-tertiary)]">
            {labels.openedInsideLabel}
          </p>
          {/* The notice can be closed; nothing else clears it. */}
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
