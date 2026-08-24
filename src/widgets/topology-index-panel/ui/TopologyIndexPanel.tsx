"use client";

import {
  useMemo,
  useRef,
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
} from "@/shared/lib/ontology-tree";
import { FirstRunStarterModule } from "@/features/first-run-starter";
import { computeMaxDomainDescendantCount } from "../lib/domain-subcounts";
import {
  flattenVisibleRowIds,
  nextRovingId,
  resolveActiveRowId,
  type RovingNavKey,
} from "../lib/roving-tabindex";
import { TopologyIndexTreeRow } from "./TopologyIndexTreeRow";
import { fieldClass } from '@/shared/ui/control-class';

/** INDEX lenses — 「All」 (all) and 「Recently Changed」 (recently changed). */
export type IndexLens = "all" | "recent";

export interface TopologyIndexPanelLabels {
  label: string;
  fold: string;
  foldAria: string;
  searchPlaceholder: string;
  censusConcepts: string;
  censusRelations: string;
  censusDomains: string;
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
  /** Living-map drift — "N dusty nodes" (count formatted by the caller) plus the
   *  action that moves to the freshness tab. Neutral tone only; the warning ramp is
   *  forbidden here (Guardian's first ruling). */
  dustyNodesLabel: string;
  dustyNodesAction: string;
  /**
   * 「This project has no code folder attached」 (this project has no code folder
   * attached) — a fact that used to be visible **only after clicking that exact
   * project node** (measured 2026-08-04: 0 occurrences on the first screen). It is
   * one quiet line shaped like the two rows above; pressing it opens that project,
   * where the prescription lives. No folder is chosen here — the same action is
   * never placed in two spots. */
  sourceUnboundLabel: string;
  /** Says the map inside the picked project was opened, so the substitution is never silent. */
  openedInsideLabel: string;
  /** Accessible name for the control that closes that notice once it has been read. */
  openedInsideDismiss: string;
  sourceUnboundAction: string;
  /**
   * A quiet one-line hint explaining that element rows are absent from the tree in
   * plain (non-developer) mode. It renders only alongside `plainMode`; omitting it
   * removes the hint entirely (backwards compatible).
   */
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
   * The first-run card's "take a 2-minute look" CTA. The tour state machine is
   * owned by HomePage (the view), per FSD, so only the callback comes down here.
   * Omitting it makes the card render no CTA.
   */
  onStartTour?: () => void;
  /** The first-run card's one-click "show it in plain words" toggle. The
   *  audiencePlain state is owned by HomePage (the same source as the `plainMode` prop). */
  onEnablePlainMode?: () => void;
  labels: TopologyIndexPanelLabels;
  className?: string;
  /**
   * The "recently changed" lens (a 7-day mtime window, `useRecentChanges`). Omitting
   * it renders no segmented control at all (the previous search-only behaviour).
   * Enabled, `filterTreeByNodeIds` narrows the tree to this id set plus its ancestor
   * paths — reusing the same "preserve the parent chain" filter mechanism as
   * `filterTreeByQuery`.
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
  /** The node id of a project with no code folder bound. null means the row does not exist. */
  unboundProjectNodeId?: string | null;
  /** Truthy when "open a folder" opened the map inside the folder that was picked. */
  openedInsidePickedFolder?: string | null;
  /** Whether any agent runtime exists to hand 「make a map from my code」 to. */
  agentAvailable?: boolean;
  /** Clears the notice above. Omitted where nothing can clear it, and the control is then not drawn. */
  onDismissOpenedInside?: () => void;
  /** Clicking the row above → the "build a map from my documents" dialog (`bootstrapOpen`). */
  onPromoteUncatalogedDocs?: (() => void) | null;
  /**
   * A lookup map for the single source of truth on domain size (graph BFS,
   * `computeDomainCensusRows`). When present, domain row counts and meters use it —
   * the same numbers as /projects and insights. Omitting it keeps the previous tree
   * walk.
   */
  domainCensus?: ReadonlyMap<string, DomainCensusRow> | null;
  /**
   * The spotlight's single source of truth — when supplied, the lens becomes
   * **controlled**: one `?recent=` URL param drives both the map's settling and this
   * lens, making a window mismatch between the two surfaces structurally impossible.
   * Omitting it keeps the existing local state (backwards compatible — other callers
   * and tests are unaffected).
   */
  lens?: IndexLens;
  onLensChange?: (lens: IndexLens) => void;
  /** The spotlight window — "auto" (an adaptive ramp) or the 1/7/30 presets. Used to mark the active chip. */
  recentWindow?: "auto" | 1 | 7 | 30;
  /** A preset chip click switches the window (applied immediately — no popup or confirmation, by contract). */
  onWindowChange?: (window: "auto" | 1 | 7 | 30) => void;
  /**
   * The display gate for plain (non-developer) mode. Removing element rows from
   * `treeResult` itself is the caller's job (HomePage, `filterTreeExcludeKind`);
   * this flag only decides whether the hint row explaining "why they are missing"
   * renders. It changes no data.
   */
  plainMode?: boolean;
  /**
   * Unify attention winner for the left rail of the overview (2026-07-24) — do not expose the "N dusty nodes" row
   * in the vault disconnected (static sample) state.
   * This surface describes the *currently loaded graph* — in sample mode,
   * that graph is this product's own dogfood
   * vault, not the user's project, so the abandonment count is noise for the first visitor
   * talking about someone else's repository (`BlockImportModule`'s "without a vault, the feature itself
   * doesn't work" case is a different problem — that one remains disabled+hinted per P1 defect ②, complete concealment prohibited). If omitted, maintain existing backward-compatible behavior
   * (always exposed) — if a real vault is connected (`vaultLoaded=true`), both rows
   * reappear as before (values are demoted, not deleted).
   */
  vaultLoaded?: boolean;
}

/**
 * INDEX — the left machined instrument that replaces the tree/ego `/ontology`
 * page (「The hub is the map」 — the hub is the map). Floats over the topology map,
 * with `--topology-index-*` width/inset tokens (`app/globals.css`). See
 * `docs/prototypes/index-panel-v2-full.html` (v2.1) for the approved visual
 * spec and `TopologyIndexTab` for the collapsed counterpart.
 *
 * The header places only "INDEX · N" (N=total nodes) + a collapse square button.
   The grid/caret/meter styles of the tree rows themselves are owned by `TopologyIndexTreeRow`.
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
  recentChanges = null,
  uncatalogedDocCount,
  dustyNodeCount,
  unboundProjectNodeId = null,
  openedInsidePickedFolder = null,
  agentAvailable = false,
  onDismissOpenedInside,
  onPromoteUncatalogedDocs = null,
  onStartTour,
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
   * Recently-changed window chips — **only the behaviour** comes from the hook
   * (2026-08-15 (8)).
   *
   * The container stays where it is: these chips' dimensions (24 · 11px · 7px ·
   * a uniform 48px) were settled by the owner over two rounds (2026-08-02
   * *"The buttons are too small."* — the buttons are too small → after the fix,
   * *"The proportions have to line up."* — the proportions have to line up), and they
   * carry panel-scoped ink (`--topology-v2-panel-*`) and the chrome radius, none of
   * which the value layer combines, so pulling them onto the primitive would break
   * that history. **Having no arrow-key movement, by contrast, was a defect
   * unrelated to that history.**
   */
  const WINDOW_CHIP_VALUES = ["auto", 1, 7, 30] as const;
  const WINDOW_CHIP_LABELS = [
    labels.windowChipAuto,
    labels.windowChip1,
    labels.windowChip7,
    labels.windowChip30,
  ];
  const windowGroup = useRovingRadioGroup<(typeof WINDOW_CHIP_VALUES)[number]>({
    value: recentWindow as (typeof WINDOW_CHIP_VALUES)[number],
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
  // P4a — "Recently Changed" lens. If search is active, search takes precedence (narrowing both
  // splits the "why can't I see it" cause into two, causing confusion) — the lens narrows the tree
  // only when search is empty.
  // Spotlight (Council §⑤) — if lensProp is provided, controlled (single source of truth =
  // URL `?recent=`), otherwise legacy local state.
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
      let max = 0;
      for (const row of domainCensus.values()) {
        if (row.total > max) max = row.total;
      }
      return max;
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
  // As with search, an active lens auto-expands too, so the user does not have to
  // open each narrowed ancestor path by caret (the same UX contract as
  // filterTreeByQuery's "auto-reveal matches", applied to filterTreeByNodeIds results).
  const isOpen = (nodeId: string) => isFiltering || lensActive || openIds.has(nodeId);

  // Roving tabindex. Flatten the rows actually visible into top-to-bottom order
  // (using the same `isOpen` that reflects the search/lens auto-expansion) and leave
  // exactly one of them as the Tab entry point (tabIndex=0). Sibling movement is
  // handled by the arrow handler on the nav below.
  const treeRef = useRef<HTMLElement>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const orderedRowIds = useMemo(
    () => flattenVisibleRowIds(visibleRoots, isOpen),
    // isOpen closes over openIds/isFiltering/lensActive — its sources are the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleRoots, openIds, isFiltering, lensActive],
  );
  const resolvedActiveRowId = resolveActiveRowId(orderedRowIds, activeRowId, selectedId);

  const focusRow = (nodeId: string) => {
    // A tabIndex=-1 row still accepts a programmatic focus(). On the next render that
    // row is promoted to tabIndex=0 and the roving entry point moves with it.
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

  // Whichever row focus actually lands on (click, Tab or arrow), align the active row
  // to it — so the roving entry point always matches "the row focused last".
  const handleTreeFocus = (event: ReactFocusEvent<HTMLElement>) => {
    const rowEl = (event.target as HTMLElement).closest?.("[data-index-row]") as HTMLElement | null;
    const id = rowEl?.dataset.indexRow;
    if (id && id !== activeRowId) setActiveRowId(id);
  };

  return (
    <aside
      aria-label={labels.label}
      data-testid="topology-index-panel"
      className={`flex h-full flex-col rounded-[var(--topology-v2-panel-radius)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-3 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
      style={{ width: "var(--topology-index-width)" }}
    >
      {/* The "get started" module (root-first-open v3, `first-run-v3-flagship.html`).
          Restructured 2026-07-24 after the owner reported *"Top scroll and bottom scroll separately"* (the top and bottom scroll separately) — the card and INDEX are
          split into **two exclusive states**. While the guide is expanded the card
          takes the whole panel (one scroll); once the user chooses, it collapses and
          INDEX (children) opens. The module takes children and decides which to
          draw — the widget only passes the INDEX body. */}
      <FirstRunStarterModule
        concepts={totalConcepts}
        /*
         * Pass **the lens state itself** rather than the `lensActive` variable above.
         * That variable also requires `!isFiltering && recentChanges !== null` — it
         * answers «can the tree actually be narrowed» — while what is needed here is
         * «did the user press the lens». Even with zero highlights the card has to
         * collapse and INDEX has to open, or whoever pressed it reads it as
         * 「nothing happened」.
         */
        lensActive={lens === "recent"}
        /* Selecting any node means the guidance card has done its job —
           see `FirstRunStarterModule`'s `nodeSelected` doc-block. */
        nodeSelected={selectedId !== null}
        /*
         * ⚠️ **Who the 「make a map from my code」 door is for** (owner correction, 2026-08-24).
         * A vault is open and nothing in it points at real code — the same fact the unbound-source
         * row below reports. Deliberately *not* "has never opened a folder", which is the card's own
         * rule: somebody who opened a folder, saw an empty map and gave up has opened folders
         * **more** than a first-timer, and that rule hid the door from exactly that person.
         */
        mapUnbuilt={vaultLoaded && unboundProjectNodeId !== null}
        agentAvailable={agentAvailable}
        relations={totalRelations}
        domains={domainCount}
        onStartTour={onStartTour}
        onEnablePlainMode={onEnablePlainMode}
        audiencePlain={plainMode}
      >
      {/* Header — label + measured total count + collapse only.

          The whole header row is the collapse toggle (owner feedback — a hit area
          limited to the chevron was awkward). It reuses the INDEX tree rows' hover
          grammar (`--topology-v2-panel-row-hover` background, `transition-colors`)
          verbatim, so "this is a clickable row too" is said in the same language. The
          chevron is no longer a separate button but a state indicator
          (`aria-hidden`) — folded into the single outer `<button>` to avoid nested
          interactive elements. */}
      <button
        type="button"
        onClick={onCollapse}
        aria-expanded={true}
        aria-label={labels.foldAria}
        title={labels.fold}
        data-testid="topology-index-fold"
        className={controlClass({ shape: "row", className: "group mb-3 gap-1.5 rounded-[var(--chrome-radius-inner)] px-0.5 hover:bg-[color:var(--topology-v2-panel-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
      >
        <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.label}
        </span>
        {/* The visual "· N" count was removed — the terrain HUD already exposes the
            total permanently alongside the label, making three copies of it (the
            sr-only census stays). The chevron is a quiet glyph rather than a bordered
            box: the hit area is the whole row (preserving the owner's feedback), and
            its direction matches the result of collapsing, `‹`. */}
        <span
          aria-hidden="true"
          className="ml-auto inline-flex size-[26px] shrink-0 items-center justify-center text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors group-hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronLeft size={ICON_SIZE.sm} aria-hidden="true" />
        </span>
      </button>
      <p data-testid="topology-index-census" className="sr-only">
        {totalConcepts} {labels.censusConcepts} · {totalRelations} {labels.censusRelations} ·{" "}
        {domainCount} {labels.censusDomains}
      </p>

      <div className="relative mb-3 shrink-0">
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
            // M-10 — Escape in the INDEX search is a search-scoped clear (the
            // macOS workbench convention), NOT a canvas deselect. When there
            // IS a query, rung 1 clears it + blurs and stops the keypress so
            // the window-level topology Esc ladder doesn't ALSO deselect the
            // node underneath on the same press. An empty field lets Escape
            // bubble through to that ladder unchanged.
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              event.stopPropagation();
              setQuery("");
              event.currentTarget.blur();
            }
          }}
          placeholder={labels.searchPlaceholder}
          autoComplete="off"
          data-testid="topology-index-search"
          className={fieldClass({ size: "md", className: "w-full pl-7" })}
        />
      </div>

      {/* The "all | recently changed N" lens segments. Without `recentChanges` (the
          mode has not computed it yet, or the caller omitted it) the render is
          skipped entirely — the previous search-only behaviour is preserved. */}
      {recentChanges ? (
        <div
          role="tablist"
          aria-label={labels.segmentRecentAria}
          className="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-[var(--chrome-radius-inner)] border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--color-overlay-1)] p-1"
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
              className: "min-w-0 hover:text-[color:var(--topology-v2-panel-text-primary)]",
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
              className: "min-w-0 hover:text-[color:var(--topology-v2-panel-text-primary)]",
            })}
          >
            {labels.segmentRecent}
          </button>
        </div>
      ) : null}

      {/* Spotlight window presets — no popup or confirmation; a click applies
          immediately. Only when the lens is active, controlled, and all four labels
          are supplied. "auto" is the adaptive ramp. */}
      {lensActive && onWindowChange && labels.windowChipAuto && labels.windowChip1 && labels.windowChip7 && labels.windowChip30 ? (
        <div
          {...windowGroup.groupProps}
          aria-label={labels.windowChipsAria ?? labels.segmentRecentAria}
          data-testid="topology-index-window-chips"
          /*
           * The period chips **say what row you are choosing in** (2026-08-02, owner:
           * *"The buttons are so small I can barely tell they exist; does this need a guide too?"* — the buttons are so small I can barely tell they exist;
           * does this need a guide too?).
           *
           * They used to float as four unlabelled chips, so nothing on screen said
           * what 「Auto/1 day/7 days/30 days」 (auto / 1 day / 7 days / 30 days) applied to.
           */
          /*
           * A **visible label is not used** (2026-08-02, owner call — tried twice and
           * removed).
           *
           * ① On the same row as the chips: the first chip shifted 27px and broke away
           *    from the panel's left alignment line (search field and segments = 101px)
           *    on its own — the owner spotted that misalignment first.
           * ② On its own line above the chips: alignment was recovered, but one word
           *    consumed a whole row, and this panel already has many rows.
           *
           * The reason for wanting a label was 「I can barely tell they exist」, and the
           * cause of that was not the missing name but **the dimensions** (20px tall,
           * 9.5px text). That was fixed below. A screen reader already hears
           * 「Choose recent-change window」 (choose the recent-change window) through `aria-label` —
           * no accessibility is lost.
           */
          className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5"
        >
          {WINDOW_CHIP_VALUES.map((value, index) => (
            <button
              key={String(value)}
              {...windowGroup.itemProps(index)}
              type="button"
              data-testid={`topology-index-window-chip-${value}`}
              /*
               * The dimensions follow **the same dialect as the segments in this
               * panel** (measured 2026-08-02; owner: *"The buttons are too small"* — the buttons
               * are too small → after the fix, *"But it's not very pretty? The proportions should line up"* — it still isn't pretty, the proportions have to line up).
               *
               * | | Before | First fix | Now |
               * |---|---|---|---|
               * | Height | 20px | 28px | **24px** |
               * | Text | 9.5px | 12.5px | **11px** |
               * | Corner | fully round | fully round | **7px** |
               * | Width | by character count (9.9px spread) | by character count | **a uniform 48px** |
               *
               * Why it took two passes: the first looked at **size only**. Measured,
               * there were two more real defects — ① width was set by character count,
               * giving a 9.9px spread (the pattern this repository forbids as
               * 「Dimension regularity」 (dimension regularity): *in a repeated set, letting height
               * and width become a by-product of the content collapses the grid's
               * rhythm without anyone choosing it*) and ② the corner was fully round
               * while **the segment tabs directly above are 7px** — two dialects in one
               * panel.
               *
               * So no new values were minted; they were **taken from the segments
               * above** (24px · 11px · 7px). 9.5px was the problem, not 11px — the
               * "pressable text is 12.5px" rule is scoped to the settings sheet, and
               * here one dialect within a panel wins.
               *
               * On touch it rises to `--touch-target-min` (44px).
               */
              className={`inline-flex h-6 min-w-12 items-center justify-center rounded-[var(--chrome-radius-inner)] border text-label transition-colors [@media(pointer:coarse)]:h-[var(--touch-target-min)] ${
                recentWindow === value
                  ? "border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] text-[color:var(--topology-v2-panel-text-primary)]"
                  : "border-[color:var(--topology-v2-panel-border)] text-[color:var(--topology-v2-panel-text-tertiary)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
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
          className="mb-2 shrink-0 text-label text-[color:var(--topology-v2-panel-text-quaternary)]"
        >
          {labels.plainHint}
        </p>
      ) : null}

      <nav
        ref={treeRef}
        role="tree"
        aria-label={labels.label}
        data-testid="topology-index-tree"
        onKeyDown={handleTreeKeyDown}
        onFocusCapture={handleTreeFocus}
        // min-h 24 (owner report, 2026-07-24) — contracts a minimum height so the tree
        // does not collapse to 0px in a short window once the first-run card has
        // switched to flexible shrinking (the card shrinks further instead and scrolls
        // internally).
        className="min-h-24 flex-1 space-y-px overflow-y-auto"
        // At the bottom of the scroll list the last row was hard-clipped at
        // mid-height by the container boundary, so a "cut-off row" read as a defect. A
        // 12px bottom mask fade hides it smoothly and implies "there is more" (the top
        // stays crisp — the first row is never cut). It is a mask rather than a
        // transform or colour, so it does not touch the charter.
        style={{
          maskImage: "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 12px), transparent)",
        }}
      >
        {visibleRoots.length === 0 ? (
          <p className="px-1 py-2 text-label text-[color:var(--topology-v2-panel-text-quaternary)]">
            {lensActive ? labels.recentEmptyHint : labels.emptyHint}
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
              agentAttributedNodeId={recentChanges?.agentAttributedNodeId ?? null}
              maxDomainDescendantCount={maxDomainDescendantCount}
              domainCensus={domainCensus}
              labels={labels}
            />
          ))
        )}
      </nav>

      {/* The quiet "N documents not on the map" row. It takes
          `bootstrapPlan.elements.length` (HomePage, `deriveBootstrapPlan` — a count
          that already excludes documents with a kind) verbatim; nothing new is
          derived. At 0, or with no promotion handler, the row itself is hidden. */}
      {vaultLoaded && uncatalogedDocCount && uncatalogedDocCount > 0 && onPromoteUncatalogedDocs ? (
        <button
          type="button"
          onClick={onPromoteUncatalogedDocs}
          data-testid="topology-index-uncataloged-docs"
          className={controlClass({
            shape: "card",
            size: "sm",
            className:
              "mt-2 shrink-0 text-left border-[color:var(--topology-v2-panel-border)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
          })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.uncatalogedDocsLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.uncatalogedDocsAction}
          </span>
        </button>
      ) : null}

      {/* Living-map drift — the quiet "N dusty nodes" row. It takes only the count
          from the dusty decision (HomePage `deriveDustySlugs`, the double condition of
          the vault mtime median plus 30 days). At 0 the row does not exist (no success
          badge). Neutral tone only — neglect is not a warning but a state of the map.
          The destination is the to-do tab (the biggest friction item in the 2026-07-23
          persona re-research) — the freshness tab is a per-domain recency heat strip,
          so it read as the exact opposite picture ("everything updated today") to a
          promise of "51 nodes long neglected". The actual list of old nodes
          ("hubs unchanged for a long time" plus today's tidying) is what the to-do tab
          answers. */}
      {vaultLoaded && dustyNodeCount && dustyNodeCount > 0 ? (
        <Link
          href="/ontology/insights?tab=do-next"
          data-testid="topology-index-dusty-nodes"
          className={controlClass({ shape: "chip", size: "md", className: "mt-2 shrink-0 gap-2 rounded-[var(--chrome-radius-inner)] border-[color:var(--topology-v2-panel-border)] text-left hover:bg-[color:var(--topology-v2-panel-row-hover)]" })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.dustyNodesLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.dustyNodesAction}
          </span>
        </Link>
      ) : null}

      {/*
        ⚠️ **Saying that a different folder was opened** (owner, 2026-08-24). Since the map moved to
        `<project>/atlas`, picking a project root opens the map inside it — the substitution people
        actually want. But quietly opening a folder other than the one somebody chose teaches them
        the product does not do what they asked, so the fact is stated once, plainly, in the panel
        that lists what was loaded.
      */}
      {openedInsidePickedFolder ? (
        <div
          data-testid="topology-index-opened-inside"
          className="mt-2 flex shrink-0 items-start gap-1.5 px-1"
        >
          <p className="min-w-0 flex-1 break-keep text-caption leading-caption text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.openedInsideLabel}
          </p>
          {/*
            A one-time fact must not become permanent furniture. Nothing else clears this, so without
            a way to close it the line sits in the panel for the rest of the session, long after it
            has told the person everything it knows.
          */}
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

      {/* No code folder bound — **the same shape and the same weight** as the two rows
          above. No new visual form is invented: one line of fact plus one indigo
          action word, only while the condition holds. A folder picker is not opened
          here because the prescription must live in exactly one place — this row makes
          the diagnosis visible, and the opened project panel gives the prescription
          (on the web it also states why, where, and what does work here). So this row
          is never a dead CTA on any surface. */}
      {vaultLoaded && unboundProjectNodeId ? (
        <button
          type="button"
          onClick={() => onSelect(unboundProjectNodeId)}
          data-testid="topology-index-source-unbound"
          className={controlClass({
            shape: "card",
            size: "sm",
            className:
              "mt-2 shrink-0 text-left border-[color:var(--topology-v2-panel-border)] hover:bg-[color:var(--topology-v2-panel-row-hover)]",
          })}
        >
          <span className="min-w-0 flex-1 truncate text-[color:var(--topology-v2-panel-text-tertiary)]">
            {labels.sourceUnboundLabel}
          </span>
          <span className="shrink-0 text-[color:var(--color-indigo-accent)]">
            {labels.sourceUnboundAction}
          </span>
        </button>
      ) : null}

      {/* 「Import nodes from another folder」 (import nodes from another folder) moved to
          **settings → workspace** (2026-08-02, owner: *"What is this? Why is this text here? Is it unnecessary?"* — what is this? why is this text here? is it
          unnecessary?).

          The feature itself suits a local-first product — pick another vault's `.md`,
          open a merge preview, and write nothing to the folder before approval. The
          placement was wrong: **something used once or twice in a lifetime** stood as a
          permanent button at the bottom of INDEX every time someone read the map. And
          「Block」 (block) is defined nowhere in this app, so a first-time reader had no
          way to know what the button opens. */}

      </FirstRunStarterModule>
    </aside>
  );
}
