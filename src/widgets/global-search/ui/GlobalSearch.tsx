"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useReducedMotion } from "framer-motion";
import { Search, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useLocale, useTranslations } from "next-intl";
import { isGraphDrawnKind, type KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { buildProjectChips } from "../lib/project-chips";
import { projectDisplayName, type Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  type MeaningfulOntologyKind,
} from "@/entities/knowledge-graph";
import { controlClass, HighlightedText } from "@/shared/ui";
import { isPathLikeTitle, matchOntologyNodes, matchProjects } from "../lib/match";
import { describeMatchReason, reasonLineClass } from "../lib/match-reason";
import { focusMapCanvasWhenReady, MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/focus-map-canvas";

/**
 * How many rows each group draws. The heading says "shown / found" whenever this
 * binds, so the limit is visible rather than silently standing in for the answer.
 */
const RESULT_LIMIT = 20;

const EMPTY_PROJECT_PAGE = { results: [], total: 0 } as const;

/** The copy that depends on where the dialog opened: each key exists plain and under `onMap`. */
type PlacedCopyKey =
  | "dialogAriaLabel"
  | "dialogTitle"
  | "dialogDescription"
  | "commandLabel"
  | "closeAriaLabel"
  | "emptyNoCorpus"
  | "emptyNoMatch"
  | "scopeFallback";

export interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ontology nodes — the first search source (vault frontmatter plus build-time dogfood, unified). */
  nodes: readonly KnowledgeGraphNode[];
  /** Ontology node selection callback. */
  onSelectNode: (node: KnowledgeGraphNode) => void;
  /**
   * projects — optional. One ⌘K searches ontology and projects together. Must arrive
   * alongside `onSelectProject`.
   */
  projects?: readonly Project[];
  onSelectProject?: (project: Project) => void;
  /** Inline selection can hand focus to its destination after the dialog releases it. */
  onSelectionFocus?: (keyboard: boolean) => void;
  /**
   * **Opened on the map**, whose drawing is exactly what this dialog searches, so there it may
   * call itself "Search this map" and its scope "this map".
   *
   * Off by default (2026-09-26). The shell now opens the same dialog on Library, Git, Automations,
   * Agents, the harness and Insights, where there is no map on screen; there the copy names what
   * it searches — concepts, a project being one — and the folder or sample they come from. The
   * Korean copy keeps the kind's name out of these sentences on purpose: the count of strings that
   * say it is ratcheted (`user-facing-vocabulary.contract.test.ts`). A reviewer read
   * `No matches for "…" in this map.` on the Library. Only the caller that is the map says so, so
   * a new place to open the search cannot inherit the map's words.
   */
  onMap?: boolean;
}

/**
 * The search palette (cmdk based) for concepts and projects. It searches one scope —
 * the vault or sample currently loaded — and says so in the footer beside the count,
 * in every state, as well as in the empty state sentence.
 *
 * Our own matchers (`matchOntologyNodes`, `matchProjects`) do the scoring and
 * sorting, and cmdk handles display and keyboard nav only (`shouldFilter={false}`) —
 * deliberately, so mixed Korean/English matching stays ours.
 *
 * The two sources (ontology plus projects) are exposed as separate groups. cmdk item
 * values are prefixed `<source>:<id>` to avoid collisions. With an empty query both
 * sources show a sample (ontology by lastApprovedAt desc, projects by updatedAt desc).
 */
export function GlobalSearch({
  open,
  onOpenChange,
  nodes,
  onSelectNode,
  projects,
  onSelectProject,
  onSelectionFocus,
  onMap = false,
}: GlobalSearchProps) {
  const t = useTranslations("searchWidgets.globalSearch");
  /*
   * The strings that speak of the map live under `onMap`, with a counterpart of the same key that
   * names what is searched instead. Keeping the two sets key for key is what lets a test prove no
   * map-only string renders off the map.
   */
  const placed = (key: PlacedCopyKey) => (onMap ? `onMap.${key}` : key);
  const kindLabel = useOntologyKindLabel();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // rank18 — return focus to the trigger. Radix Dialog/FocusScope restores it by
  // default (capturing the internal activeElement), but this captures it in our own
  // ref as well, to guarantee it explicitly whichever trigger path opened it (button
  // click or ⌘K shortcut).
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const selectedResultRef = useRef(false);
  const keyboardInteractionRef = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /*
   * **Focus leaves with the dialog, not after its exit motion** (2026-09-26).
   *
   * Radix keeps the content mounted while its exit animation plays and hands focus back only when
   * it unmounts, so for that stretch focus sat in a field that had already closed. Measured against
   * a real folder: `?` pressed right after Esc closed the search landed in that field, counted as
   * typing, and opened nothing. Letting go as soon as `open` turns false sends the next key to the
   * page; `onCloseAutoFocus` below still decides where focus lands once the content is gone.
   */
  useLayoutEffect(() => {
    if (open) return;
    const holder = document.activeElement;
    if (holder instanceof HTMLElement && contentRef.current?.contains(holder)) holder.blur();
  }, [open]);
  const [query, setQuery] = useState("");
  // Narrow the ontology results with kind and project filter chips. A set-based
  // multi-select (toggle) model, cleared along with the query on close.
  const [selectedKinds, setSelectedKinds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedProjectIds, setSelectedProjectIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleKind = useCallback((kind: MeaningfulOntologyKind) => {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  const toggleProjectId = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }, []);

  // What the map draws is what the palette searches and counts: a starter's
  // README (`vault-readme`) is a document, not a node, and counting it said
  // "5 indexed" beside a census of 4 concepts (design audit 2026-09-04). The
  // predicate is the one the recent-changes lens uses, so the two agree.
  const drawnNodes = useMemo(() => nodes.filter((node) => isGraphDrawnKind(node.kind)), [nodes]);
  const ontologyPage = useMemo(
    () =>
      matchOntologyNodes(query, drawnNodes, RESULT_LIMIT, {
        kinds: selectedKinds,
        projectIds: selectedProjectIds,
      }),
    [query, drawnNodes, selectedKinds, selectedProjectIds],
  );
  const ontologyResults = ontologyPage.results;
  const projectPage = useMemo(
    () => (projects ? matchProjects(query, projects, RESULT_LIMIT) : EMPTY_PROJECT_PAGE),
    [query, projects],
  );
  const projectResults = projectPage.results;

  const isEmptyQuery = query.trim() === "";
  const ontologySize = drawnNodes.length;
  const projectSize = projects?.length ?? 0;
  // M-6 — a project card is the same entity as ontology's kind:project node. Adding
  // them straight gives "296 indexed", one more than the canonical inventory (295) —
  // the same species as the P0c map double-count. Projects already counted as nodes
  // are subtracted before summing.
  const projectNodes = useMemo(() => drawnNodes.filter((node) => node.kind === "project"), [drawnNodes]);
  const projectNodeCount = projectNodes.length;
  const totalCorpus = ontologySize + Math.max(0, projectSize - projectNodeCount);
  /**
   * **Name what was actually searched** (owner report, 2026-09-04).
   *
   * A visitor on the bundled "Online Store" sample typed "MCP" under a palette
   * titled "Global search" and read "0 MATCHES · 125 INDEXED". Nothing was
   * broken — MCP is not in that sample — but the title promised a search wider
   * than the loaded vault, so the empty result read as a defect in the search.
   *
   * The scope has a name whenever exactly one project is loaded (the sample, or
   * a single-project vault); it is already on screen as the project chip. With
   * several projects there is no single honest name, so the copy falls back to
   * "this folder" — or "this map" on the map. Both bundled samples hold exactly
   * one project, so the fallback only ever stands for a folder the person opened.
   */
  const locale = useLocale();
  const scopeName = useMemo(() => {
    if (projects?.length !== 1) return null;
    const project = projects[0];
    // The project node already carries `display_<locale>`; the footer reads the
    // same name the map label and the INDEX row show, not the canonical title.
    const projectNode = drawnNodes.find(
      (node) => node.kind === "project" && (node.id === `project:${project.slug}` || node.id.endsWith(`:${project.slug}`)),
    );
    const localized = projectNode?.displayLocales?.[locale]?.trim();
    return localized || project.name.trim() || null;
  }, [projects, drawnNodes, locale]);
  const scope = scopeName ?? t(placed("scopeFallback"));
  // The footer names the scope it searched, so its number is read as a fact about
  // that folder — it has to be what was found, not what fitted (measured 2026-09-19).
  //
  // The same subtraction as `totalCorpus`, because the same entity is on both sides: typing a
  // project's name matches its card *and* its `kind:project` node, and adding the two totals
  // said "2 matches" about one project. There is one project node per project, so re-running
  // the matcher over just those is the cheapest way to learn how many of the two lists overlap.
  const projectNodeMatches = useMemo(
    () =>
      matchOntologyNodes(query, projectNodes, 0, {
        kinds: selectedKinds,
        projectIds: selectedProjectIds,
      }).total,
    [query, projectNodes, selectedKinds, selectedProjectIds],
  );
  const totalMatches = ontologyPage.total + Math.max(0, projectPage.total - projectNodeMatches);
  const hasFilter = selectedKinds.size > 0 || selectedProjectIds.size > 0;

  // The source for the workspace project chip row — the projects prop when present
  // (slug plus name), otherwise a fallback built from the distinct projectIds found
  // in nodes (slug only), so it works both when the projects prop flows and when only
  // nodes do.
  //
  // A `@tanstack/react-virtual` horizontal virtualizer renders only the chips in the
  // viewport (~10–15) even in a large vault. The ontology-frequency weighting is kept
  // so the most relevant chips appear first on the initial screen.
  const projectChipSource = useMemo(() => buildProjectChips(projects, nodes), [projects, nodes]);

  // Horizontal virtualizer — chip widths vary because the labels are Korean.
  // estimateSize is an average (~110px including padding for a 10–16 character chip),
  // and measureElement corrects the real size. overscan 4 avoids stutter on horizontal scroll.
  const projectScrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns imperative measurement functions; this component does not pass the virtualizer through memoized children.
  const projectVirtualizer = useVirtualizer({
    count: projectChipSource.length,
    horizontal: true,
    overscan: 4,
    getScrollElement: () => projectScrollRef.current,
    estimateSize: () => 110,
  });
  // The dialog's content mounts a render after `open` flips (Radix Presence),
  // so the virtualizer first looked for its scroll element and found nothing —
  // and nothing re-rendered until the person typed. Opened fresh, the row said
  // "Project · 1" with no chip under it (2026-09-19). Measuring when the
  // element arrives is the re-render that lets the virtualizer find it. The
  // callback is stable and guarded, because an inline one runs every render
  // and each measure is itself a render.
  const attachProjectScroll = useCallback(
    (element: HTMLDivElement | null) => {
      if (projectScrollRef.current === element) return;
      projectScrollRef.current = element;
      if (element) projectVirtualizer.measure();
    },
    [projectVirtualizer],
  );

  /**
   * Enter belongs to whichever control has focus.
   *
   * cmdk's root listens for Enter across the whole palette and turns it into "open
   * the highlighted row", `preventDefault` included — so it also swallowed Enter
   * pressed on a control. Measured 2026-09-19: tabbing to a kind filter chip and
   * pressing Enter left the chip `aria-pressed="false"` and instead **closed the
   * palette and flew the map to `capability:account-closure`**, whichever row
   * happened to be highlighted. The close button did the same: Enter navigated
   * instead of closing. Space was unaffected, so the two keys disagreed about what
   * the focused control does.
   *
   * Stopping Enter at the control's own row (bubble phase, so the button still gets
   * it) leaves cmdk's root handling only Enter from the search field, which is the
   * one place "open the highlighted row" is what a person means.
   */
  const keepEnterOnTheFocusedControl = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter") return;
    if (event.target === inputRef.current) return;
    event.stopPropagation();
  };

  const closeAndClear = () => {
    onOpenChange(false);
    setQuery("");
    setSelectedKinds(new Set());
    setSelectedProjectIds(new Set());
  };

  // cmdk's built-in Command.Dialog wraps Radix Dialog but supplies no Title or
  // Description node, so Radix logs a console error. Radix Dialog is wrapped directly
  // here so a VisuallyHidden Title/Description can be planted.
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Esc, a scrim click and the close button all converge here — the footer's
        // promise of "ESC closes" closes the window in one press and clears the input
        // and filters with it. (The Esc path used to clear only the query and leave
        // the kind/project filters, so reopening showed inexplicably narrowed results.)
        if (!next) {
          closeAndClear();
          return;
        }
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          data-overlay-spring="true"
          className={cn(
            "fixed inset-0 z-50 bg-[color:var(--overlay-scrim)]",
            reducedMotion ? "overlay-fade-only" : "overlay-spring-scrim",
          )}
        />
        <Dialog.Content
          ref={contentRef}
          aria-label={t(placed("dialogAriaLabel"))}
          // Radix sets `aria-hidden` on sibling nodes rather than adding `aria-modal`
          // itself. But this app's global Esc discipline decides "is a modal open"
          // with `[role="dialog"][aria-modal="true"]` (the first-run card's capture
          // handler, the auto-tour firing guard, and so on). With no declaration those
          // checks could not see this search window, and the first-run card intercepted
          // the first Esc with preventDefault, so **the first press did nothing**
          // (measured 2026-07-26: one Esc left both the input and the dialog
          // untouched; only the second closed it). Every other modal in the app
          // (SearchPalette, the studio entry chooser, the docs palette …) declares this
          // attribute and only this search window was missing it. It has a scrim, a
          // focus trap and outside-click-to-close, so the declaration is also true.
          aria-modal="true"
          data-overlay-spring="true"
          data-global-search-responsive-contract="mobile-sheet-md-floating"
          data-global-search-floating-width-token="--topology-search-sheet-floating-width"
          data-global-search-radius-token="--radius-sheet"
          data-global-search-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          // The animation classes go on Dialog.Content itself — Radix Presence listens
          // only for animationend on the node it rendered (target === node) and ignores
          // events bubbling from children, so putting them on a child (Command)
          // unmounts before the exit animation finishes.
          className={cn(
            "fixed inset-0 z-50 flex items-stretch justify-center md:items-start md:px-4 md:pt-[12vh]",
            reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
          )}
          // rank18 — focus the first input (the search box) on open. The result matches
          // Radix's default (the first focusable element), but it is specified directly
          // to guarantee preventScroll explicitly.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            previousFocusRef.current = document.activeElement as HTMLElement | null;
            selectedResultRef.current = false;
            keyboardInteractionRef.current = false;
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Cancel returns to the opener; choosing a map result continues the
            // task on the map after Radix has released the modal focus scope.
            if (selectedResultRef.current && onSelectionFocus) {
              onSelectionFocus(keyboardInteractionRef.current);
              return;
            }
            // Focus left this dialog when it closed (above). If something took it
            // during the exit — the shortcut sheet, for `?` pressed right after Esc —
            // it keeps it: pulling focus back to the opener would leave that sheet up
            // with the keyboard behind it.
            const holder = document.activeElement;
            if (holder && holder !== document.body && holder !== document.documentElement) return;
            if (keyboardInteractionRef.current && previousFocusRef.current?.dataset.surfaceRole === MAP_CANVAS_SURFACE_ROLE) focusMapCanvasWhenReady(undefined, true);
            else previousFocusRef.current?.focus?.({ preventScroll: true });
          }}
          onKeyDownCapture={() => { keyboardInteractionRef.current = true; }}
          onEscapeKeyDown={() => { keyboardInteractionRef.current = true; }}
          onPointerDownCapture={() => { keyboardInteractionRef.current = false; }}
          // An outside click closes (the de facto standard for command palettes:
          // Linear · VS Code · Raycast · Spotlight). Radix's `onPointerDownOutside`
          // does not fire here — this `Dialog.Content` is itself a `fixed inset-0` flex
          // wrapper covering the whole screen, so what looks like a scrim is actually
          // **inside** Content and no "outside" exists as far as Radix is concerned
          // (owner report 2026-07-25: "clicking outside should close it and doesn't" — clicking
          // outside should close it and doesn't). So it closes only when the wrapper
          // itself is the pressed target; the panel (Command) already stopPropagations,
          // so inside clicks never reach here. `onPointerDown` matches the settings
          // sheet's (`AppSettingsMenu`) existing scrim contract while covering mouse,
          // touch and pen together.
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) closeAndClear();
          }}
        >
          <VisuallyHidden>
            <Dialog.Title>{t(placed("dialogTitle"))}</Dialog.Title>
            <Dialog.Description>
              {t(placed("dialogDescription"), { scope })}
            </Dialog.Description>
          </VisuallyHidden>
          <Command
            label={t(placed("commandLabel"))}
            shouldFilter={false}
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)] md:h-auto md:max-w-[var(--topology-search-sheet-floating-width)] md:rounded-sheet"
            onClick={(event) => event.stopPropagation()}
          >
        <div
          className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-4 py-3"
          onKeyDown={keepEnterOnTheFocusedControl}
        >
          <Search size={ICON_SIZE.md} className="shrink-0 text-[color:var(--color-text-quaternary)]" />
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={
              projects && projects.length > 0
                ? t('placeholderWithProjects')
                : t('placeholderOntologyOnly')
            }
            className="flex-1 bg-transparent text-body-lg text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded-micro border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-2)] px-1.5 py-0.5 font-mono text-caption text-[color:var(--color-text-tertiary)] sm:inline-block">
            ESC
          </kbd>
          <button
            type="button"
            onClick={closeAndClear}
            aria-label={t(placed("closeAriaLabel"))}
            data-testid="global-search-close"
            data-global-search-close-contract="touch-visible"
            data-global-search-close-size-token="--overlay-close-size"
            className="flex h-[var(--overlay-close-size)] w-[var(--overlay-close-size)] shrink-0 items-center justify-center rounded-chip text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset"
          >
            <X size={ICON_SIZE.md} aria-hidden />
          </button>
        </div>

        {/* kind / project chip filter row — narrows the ontology results only
            (documents and projects results are unaffected). Expanded by default so
            the user can see at a glance how they can narrow. Multi-select toggle. */}
        <div
          className="flex flex-col gap-1 border-b border-[color:var(--color-border-soft)] px-3 py-2"
          aria-label={t('filterAriaLabel')}
          data-testid="global-search-filter-row"
          onKeyDown={keepEnterOnTheFocusedControl}
        >
          <div className="flex items-center gap-2 overflow-x-auto">
            <span
              className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
              aria-hidden
            >
              {t('kindLabel')}
            </span>
            {MEANINGFUL_ONTOLOGY_KINDS.map((kind) => {
              const active = selectedKinds.has(kind);
              return (
                <button
                  key={`kind-${kind}`}
                  type="button"
                  onClick={() => toggleKind(kind)}
                  aria-pressed={active}
                  className={controlClass({
                    shape: "pill",
                    size: "sm",
                    active,
                    className: cn(
                      "shrink-0 uppercase tracking-[var(--tracking-caps-10)]",
                      !active &&
                        "hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                    ),
                  })}
                >
                  {kindLabel(kind)}
                </button>
              );
            })}
            {hasFilter ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedKinds(new Set());
                  setSelectedProjectIds(new Set());
                }}
                className={controlClass({ shape: "pill", tone: "secondary", className: "ml-auto shrink-0 px-2 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] hover:text-[color:var(--color-text-secondary)]" })}
              >
                {t('clearFilter')}
              </button>
            ) : null}
          </div>
          {projectChipSource.length > 0 ? (
            <div className="flex items-center gap-2">
              <span
                className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]"
                aria-hidden
              >
                {t('projectLabel', { count: projectChipSource.length })}
              </span>
              {/* @tanstack/react-virtual horizontal virtualizer — renders only the
                  chips in the viewport (~10–15) even in a workspace of 1,979 projects.
                  The overflow-x-auto + relative + absolute-child pattern. */}
              {/* The scroller's height is the control's, not a number.
                  `overflow-x: auto` clips the other axis too, and this was a hardcoded
                  24px while the chip inside it is `--control-h-sm` — 28px on a mouse
                  and 44px under a coarse pointer, where the touch floor raises it.
                  Measured 2026-09-19 at 390x844: the chip rendered 44px tall inside a
                  24px box and lost its bottom 20px, so the control the touch floor
                  exists for was clipped to 24. */}
              <div
                ref={attachProjectScroll}
                className="relative h-[var(--control-h-sm)] flex-1 overflow-x-auto"
              >
                <div
                  className="relative"
                  style={{
                    width: `${projectVirtualizer.getTotalSize()}px`,
                    height: "100%",
                  }}
                >
                  {projectVirtualizer.getVirtualItems().map((virtualItem) => {
                    const item = projectChipSource[virtualItem.index];
                    if (!item) return null;
                    const { slug, label } = item;
                    const active = selectedProjectIds.has(slug);
                    return (
                      <button
                        key={`project-${slug}`}
                        type="button"
                        onClick={() => toggleProjectId(slug)}
                        aria-pressed={active}
                        title={slug !== label ? slug : undefined}
                        ref={projectVirtualizer.measureElement}
                        data-index={virtualItem.index}
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          transform: `translateX(${virtualItem.start}px)`,
                        }}
                        className={controlClass({
                          shape: "pill",
                          size: "sm",
                          active,
                          className: cn(
                            "mr-1.5 whitespace-nowrap",
                            !active &&
                              "hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]",
                          ),
                        })}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <Command.List className="flex-1 overflow-y-auto overscroll-y-contain px-2 py-2 md:max-h-[52vh] md:flex-none">
          <Command.Empty className="px-3 py-6 text-center text-body-lg text-[color:var(--color-text-tertiary)]">
            {isEmptyQuery
              ? totalCorpus === 0
                ? t(placed("emptyNoCorpus"))
                : t('emptyIndexed', { count: totalCorpus })
              : hasFilter
                ? t('emptyNoMatchFiltered', { query })
                : t(placed("emptyNoMatch"), { query, scope })}
          </Command.Empty>

          {ontologyResults.length > 0 ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? t('groupConceptRecent') : t('groupConceptMatch')} · {ontologyResults.length}
                  {ontologyPage.total > ontologyResults.length ? ` / ${ontologyPage.total}` : ""}
                </span>
              }
            >
              {/* After R10 the vault is the only mode — node.evidenceCount is
                  permanently undefined, so the 'Evidence N' chip was removed under the
                  same policy as cycle 16's cleanup of the old detail panel (now
                  FullDetailA1). If the same information is ever needed, cycle 6's
                  ontology→docs jump chip shows it more richly. */}
              {ontologyResults.map(({ node, matched }) => {
                // N12 (persona-ux-2026-07 report) — element titles that are
                // literal file paths ("mcp/src/ontology-engine.mjs") read as
                // body-text noise at full title weight next to plain-language
                // capability/domain titles in the same list. Demote to mono +
                // quaternary tone instead of hiding the row — the path is
                // still the row's only identifying label.
                // Results are named with the same name the map and INDEX draw. With
                // only the result rows showing the raw title, a user who searched by
                // the name just read on screen has to re-check "is this that node".
                const label = node.display ?? node.title;
                const pathLike = node.kind === "element" && isPathLikeTitle(label);
                // The trailing column is the row's reason for being in the list.
                // A name match on the name already drawn needs no second copy, so the
                // summary keeps that seat as context; every other match shows the text
                // that actually earned the row — another of the node's names, the
                // summary opened at the match, or the id's slug. Measured 2026-09-19:
                // without this, 30.6% of rows over thirty queries carried no mark at all.
                const reason = describeMatchReason({ matched, label, summary: node.summary, query });
                return (
                  <Command.Item
                    key={`ontology:${node.id}`}
                    value={`ontology:${node.id}`}
                    onSelect={() => {
                      selectedResultRef.current = true;
                      onSelectNode(node);
                      closeAndClear();
                    }}
                    // A result row is a control, so it stands on the control ladder rather than
                    // on whatever its padding happens to add up to: `px-3 py-2` measured
                    // **38px**, a step that does not exist (24/28/32/36/40/44), and it stayed
                    // 38 under a coarse pointer because nothing here read a height token
                    // (measured 2026-09-05). `--control-h-lg` is 40 on a mouse and the coarse
                    // block already redefines it to 44, so one reference pays both.
                    className="flex min-h-[var(--control-h-lg)] cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                      {kindLabel(node.kind)}
                    </span>
                    {/* Beside the name from `md` up, under it below — see
                        `reasonLineClass`. */}
                    <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
                      <span
                        data-search-result-path-like={pathLike ? "true" : undefined}
                        className={cn(
                          "min-w-0 truncate md:flex-1",
                          pathLike
                            ? "font-mono text-body text-[color:var(--color-text-tertiary)]"
                            : "text-[color:var(--color-text-primary)]",
                        )}
                      >
                        <HighlightedText text={label} query={isEmptyQuery ? undefined : query} />
                      </span>
                      {reason ? (
                        <span
                          data-search-result-reason={reason.kind}
                          className={cn(
                            reasonLineClass(reason),
                            reason.kind === "id" && "font-mono text-caption",
                          )}
                        >
                          <HighlightedText text={reason.text} query={reason.query} />
                        </span>
                      ) : null}
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}

          {projects && projectResults.length > 0 && onSelectProject ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? t('groupProjectRecent') : t('groupProjectMatch')} · {projectResults.length}
                  {projectPage.total > projectResults.length ? ` / ${projectPage.total}` : ""}
                </span>
              }
            >
              {projectResults.map(({ project, matched }) => {
                const reason = describeMatchReason({ matched, label: project.name, summary: project.slug, query });
                return (
                <Command.Item
                  key={`project:${project.slug}`}
                  value={`project:${project.slug}`}
                  onSelect={() => {
                    selectedResultRef.current = true;
                    onSelectProject(project);
                    closeAndClear();
                  }}
                  // Same ladder height as the concept rows above — the two result kinds are one
                  // row role and must not differ by which block introduced them.
                  className="flex min-h-[var(--control-h-lg)] cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-indigo-a20)] bg-[color:var(--color-indigo-a06)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-text-strong)]">
                    {project.isHub ? t('hub') : t('project')}
                  </span>
                  {/* Marked like the concept rows above. The same project appears in
                      both groups — as a concept and as a project — and only one of the
                      two was showing why it was there (measured live 2026-09-19). */}
                  {/* Same seat, same job as the concept rows: the reason. It holds the
                      slug until something else earned the row — the English name, or
                      the description, tag or category that matched and which this row
                      otherwise never shows. */}
                  <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-2">
                    <span className="min-w-0 truncate text-[color:var(--color-text-primary)] md:flex-1">
                      {/* The word this screen draws for the project, with the match still lit. */}
                      <HighlightedText
                        text={projectDisplayName(project, locale)}
                        query={isEmptyQuery ? undefined : query}
                      />
                    </span>
                    {reason ? (
                      <span
                        data-search-result-reason={reason.kind}
                        className={cn(
                          reasonLineClass(reason),
                          reason.kind !== "summary" && "font-mono",
                        )}
                      >
                        <HighlightedText text={reason.text} query={reason.query} />
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                    {project.status}
                  </span>
                </Command.Item>
                );
              })}
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {/*
           * **The count and the scope travel together** (owner report, 2026-09-04).
           *
           * The dialog title is visually hidden for Radix, so the only place the
           * scope was ever written was the zero-result sentence. A visitor reading
           * "0 MATCHES" under a palette that names nothing read it as a broken search
           * rather than as a sample that does not contain the word. A visible title
           * bar was rejected — it pushes the input down — so the name joins the
           * number that is already permanent, in every state.
           *
           * `scope` is the loaded project when there is exactly one; with several
           * there is no honest single name, so the copy falls back to "this folder"
           * ("this map" on the map).
           */}
          {/* The number never truncates and the hints never shrink; only the
              name yields, and it yields by truncating, not by breaking mid-word
              (measured 2026-09-04: "ONLINE / STORE" on every phone width). */}
          <span data-testid="global-search-footer-count" className="flex min-w-0 items-center gap-1">
            <span className="shrink-0">
              {isEmptyQuery
                ? t('indexed', { count: totalCorpus })
                : t('matches', { count: totalMatches })}
            </span>
            <span aria-hidden className="shrink-0">·</span>
            <span data-testid="global-search-footer-scope" className="min-w-0 truncate">
              {scope}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-3">
            <span>{t('shortcutMove')}</span>
            <span>{t('shortcutSelect')}</span>
            <span>{t('shortcutClose')}</span>
          </span>
        </div>
          </Command>
          <div
            aria-hidden="true"
            data-testid="global-search-bottom-reserve-scrim"
            data-bottom-reserve-scrim-contract="opaque-sheet-continuation"
            data-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
            className="fixed inset-x-0 bottom-0 h-[var(--topology-mobile-bottom-tab-reserve)] border-t border-[color:var(--color-divider)] bg-[color:var(--color-panel)] md:hidden"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
