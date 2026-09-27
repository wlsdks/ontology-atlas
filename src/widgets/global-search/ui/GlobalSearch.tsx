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
   * Optional projects, searched together with ontology by one Cmd+K; must arrive
   * with `onSelectProject`.
   */
  projects?: readonly Project[];
  onSelectProject?: (project: Project) => void;
  /** Inline selection can hand focus to its destination after the dialog releases it. */
  onSelectionFocus?: (keyboard: boolean) => void;
  /**
   * Opened on the map, where it may call itself "Search this map". Off by default, so other
   * surfaces name what they search; the Korean copy keeps the kind name out
   * (`user-facing-vocabulary.contract.test.ts`).
   */
  onMap?: boolean;
}

/**
 * Search palette for concepts and projects over one loaded scope, named in the footer. Our matchers
 * (`matchOntologyNodes`, `matchProjects`) score and sort; cmdk only displays and navigates
 * (`shouldFilter={false}`). Item values are `<source>:<id>` to avoid collisions.
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
   * Map wording lives under `onMap` with a same-key counterpart, so a test can prove none renders
   * off the map.
   */
  const placed = (key: PlacedCopyKey) => (onMap ? `onMap.${key}` : key);
  const kindLabel = useOntologyKindLabel();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Capture the trigger in our own ref as well as Radix's, whichever path opened the dialog.
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const selectedResultRef = useRef(false);
  const keyboardInteractionRef = useRef(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  /*
   * Release focus as soon as `open` turns false so the next key reaches the page during the exit
   * motion; `onCloseAutoFocus` still decides where it lands.
   */
  useLayoutEffect(() => {
    if (open) return;
    const holder = document.activeElement;
    if (holder instanceof HTMLElement && contentRef.current?.contains(holder)) holder.blur();
  }, [open]);
  const [query, setQuery] = useState("");
  // Kind and project filter chips narrow ontology results; multi-select sets, cleared with the
  // query on close.
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

  // Count what the map draws: a `vault-readme` is a document, not a node (same predicate as the
  // recent-changes lens).
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
  // A project card is the same entity as its kind:project node, so projects already counted as
  // nodes are subtracted.
  const projectNodes = useMemo(() => drawnNodes.filter((node) => node.kind === "project"), [drawnNodes]);
  const projectNodeCount = projectNodes.length;
  const totalCorpus = ontologySize + Math.max(0, projectSize - projectNodeCount);
  /**
   * Names the searched scope: the single loaded project's name, otherwise "this folder" ("this map"
   * on the map).
   */
  const locale = useLocale();
  const scopeName = useMemo(() => {
    if (projects?.length !== 1) return null;
    const project = projects[0];
    // The project node's display name, as the map label and INDEX row show it.
    const projectNode = drawnNodes.find(
      (node) => node.kind === "project" && (node.id === `project:${project.slug}` || node.id.endsWith(`:${project.slug}`)),
    );
    const localized = projectNode?.displayLocales?.[locale]?.trim();
    return localized || project.name.trim() || null;
  }, [projects, drawnNodes, locale]);
  const scope = scopeName ?? t(placed("scopeFallback"));
  // The footer number is what was found, with the same card-and-node subtraction as `totalCorpus`;
  // re-running the matcher over project nodes finds the overlap.
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

  // Project chips come from the projects prop, or from distinct node projectIds when only nodes
  // flow; a horizontal virtualizer renders only visible chips, most relevant first.
  const projectChipSource = useMemo(() => buildProjectChips(projects, nodes), [projects, nodes]);

  // Chip widths vary with Korean labels: estimateSize is an average, measureElement corrects it,
  // overscan 4 avoids stutter.
  const projectScrollRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns imperative measurement functions; this component does not pass the virtualizer through memoized children.
  const projectVirtualizer = useVirtualizer({
    count: projectChipSource.length,
    horizontal: true,
    overscan: 4,
    getScrollElement: () => projectScrollRef.current,
    estimateSize: () => 110,
  });
  // The content mounts a render after `open` flips, so the virtualizer re-measures when its scroll
  // element arrives; the callback is stable and guarded because each measure is a render.
  const attachProjectScroll = useCallback(
    (element: HTMLDivElement | null) => {
      if (projectScrollRef.current === element) return;
      projectScrollRef.current = element;
      if (element) projectVirtualizer.measure();
    },
    [projectVirtualizer],
  );

  /**
   * Enter belongs to the focused control: stopped at the control's row in the bubble phase, so
   * cmdk's root only handles Enter from the search field.
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

  // cmdk's Command.Dialog has no Title or Description, so Radix Dialog is used directly with
  // visually hidden ones.
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // Escape, a scrim click and the close button converge here, clearing the input and the
        // filters.
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
          // Declares aria-modal: the app's global Escape handlers look for
          // `[role="dialog"][aria-modal="true"]`, or the first Escape is swallowed. The scrim and
          // focus trap make it true.
          aria-modal="true"
          data-overlay-spring="true"
          data-global-search-responsive-contract="mobile-sheet-md-floating"
          data-global-search-floating-width-token="--topology-search-sheet-floating-width"
          data-global-search-radius-token="--radius-sheet"
          data-global-search-mobile-bottom-reserve-token="--topology-mobile-bottom-tab-reserve"
          // Animation classes sit on Dialog.Content: Radix Presence listens only to animationend on
          // its own node, so a child's animation would unmount early.
          className={cn(
            "fixed inset-0 z-50 flex items-stretch justify-center md:items-start md:px-4 md:pt-[12vh]",
            reducedMotion ? "overlay-fade-only" : "overlay-spring-surface",
          )}
          // Focus the search box on open with preventScroll.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            previousFocusRef.current = document.activeElement as HTMLElement | null;
            selectedResultRef.current = false;
            keyboardInteractionRef.current = false;
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Cancel returns to the opener; a map result continues on the map after Radix releases
            // focus.
            if (selectedResultRef.current && onSelectionFocus) {
              onSelectionFocus(keyboardInteractionRef.current);
              return;
            }
            // If something took focus during the exit (the shortcut sheet), it keeps it.
            const holder = document.activeElement;
            if (holder && holder !== document.body && holder !== document.documentElement) return;
            if (keyboardInteractionRef.current && previousFocusRef.current?.dataset.surfaceRole === MAP_CANVAS_SURFACE_ROLE) focusMapCanvasWhenReady(undefined, true);
            else previousFocusRef.current?.focus?.({ preventScroll: true });
          }}
          onKeyDownCapture={() => { keyboardInteractionRef.current = true; }}
          onEscapeKeyDown={() => { keyboardInteractionRef.current = true; }}
          onPointerDownCapture={() => { keyboardInteractionRef.current = false; }}
          // Closes only when the full-screen wrapper itself is pressed: Radix's
          // `onPointerDownOutside` never fires because the scrim is inside Content. Matches the
          // settings sheet's scrim contract for mouse, touch and pen.
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

        {/*
         * Kind and project chips narrow ontology results only; expanded by default, multi-select.
         */}
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
              {/* Horizontal virtualizer renders only chips in the viewport. */}
              {/*
               * The scroller height follows `--control-h-sm`; `overflow-x: auto` clips vertically,
               * so a fixed height cut the coarse-pointer chip.
               */}
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
              {ontologyResults.map(({ node, matched }) => {
                // File-path element titles are demoted to mono tertiary, never hidden, because
                // the path is the row's only label.
                // Results use the name the map and INDEX draw.
                const label = node.display ?? node.title;
                const pathLike = node.kind === "element" && isPathLikeTitle(label);
                // The trailing column is the row's reason: the summary as context when the drawn
                // name matched, otherwise the text that earned the row.
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
                    // Result rows stand on the control ladder (`--control-h-lg`, 44 under a coarse
                    // pointer).
                    className="flex min-h-[var(--control-h-lg)] cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                  >
                    <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                      {kindLabel(node.kind)}
                    </span>
                    {/* Beside the name from `md` up, under it below; see `reasonLineClass`. */}
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
                  // Same ladder height as the concept rows.
                  className="flex min-h-[var(--control-h-lg)] cursor-pointer items-center gap-2 rounded-chip px-3 py-2 text-body-lg text-[color:var(--color-text-secondary)] aria-selected:bg-[color:var(--color-indigo-a14)] aria-selected:text-[color:var(--color-text-primary)]"
                >
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[color:var(--color-indigo-a20)] bg-[color:var(--color-indigo-a06)] px-1.5 py-[1px] font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-text-strong)]">
                    {project.isHub ? t('hub') : t('project')}
                  </span>
                  {/* Highlighted like the concept rows: the same project is also listed as a concept, so each row shows why it is there. */}
                  {/* The reason: the slug until another field earned the row. */}
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
           * The count and the scope travel together in every state, since the dialog title is
           * visually hidden.
           */}
          {/* Only the scope name yields, by truncating. */}
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
