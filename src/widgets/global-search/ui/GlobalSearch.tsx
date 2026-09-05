"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { Project } from "@/entities/project";
import { cn } from "@/shared/lib/cn";
import {
  MEANINGFUL_ONTOLOGY_KINDS,
  type MeaningfulOntologyKind,
} from "@/entities/knowledge-graph";
import { controlClass, HighlightedText } from "@/shared/ui";
import { isPathLikeTitle, matchOntologyNodes, matchProjects } from "../lib/match";

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
}

/**
 * The map's search palette (cmdk based). It searches one scope — the vault or
 * sample currently loaded — and says so in the footer beside the count, in every
 * state, as well as in the empty state sentence.
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
}: GlobalSearchProps) {
  const t = useTranslations("searchWidgets.globalSearch");
  const kindLabel = useOntologyKindLabel();
  const reducedMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement | null>(null);
  // rank18 — return focus to the trigger. Radix Dialog/FocusScope restores it by
  // default (capturing the internal activeElement), but this captures it in our own
  // ref as well, to guarantee it explicitly whichever trigger path opened it (button
  // click or ⌘K shortcut).
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    } else {
      previousFocusRef.current?.focus?.({ preventScroll: true });
    }
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
  const ontologyResults = useMemo(
    () =>
      matchOntologyNodes(query, drawnNodes, 20, {
        kinds: selectedKinds,
        projectIds: selectedProjectIds,
      }),
    [query, drawnNodes, selectedKinds, selectedProjectIds],
  );
  const projectResults = useMemo(
    () => (projects ? matchProjects(query, projects, 20) : []),
    [query, projects],
  );

  const isEmptyQuery = query.trim() === "";
  const ontologySize = drawnNodes.length;
  const projectSize = projects?.length ?? 0;
  // M-6 — a project card is the same entity as ontology's kind:project node. Adding
  // them straight gives "296 indexed", one more than the canonical inventory (295) —
  // the same species as the P0c map double-count. Projects already counted as nodes
  // are subtracted before summing.
  const projectNodeCount = useMemo(
    () => drawnNodes.filter((node) => node.kind === "project").length,
    [drawnNodes],
  );
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
   * "this map".
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
  const totalMatches = ontologyResults.length + projectResults.length;
  const hasFilter = selectedKinds.size > 0 || selectedProjectIds.size > 0;

  // The source for the workspace project chip row — the projects prop when present
  // (slug plus name), otherwise a fallback built from the distinct projectIds found
  // in nodes (slug only), so it works both when the projects prop flows and when only
  // nodes do.
  //
  // A `@tanstack/react-virtual` horizontal virtualizer renders only the chips in the
  // viewport (~10–15) even in a large vault. The ontology-frequency weighting is kept
  // so the most relevant chips appear first on the initial screen.
  const projectChipSource = useMemo<Array<{ slug: string; label: string }>>(() => {
    const ontologyFreq = new Map<string, number>();
    for (const node of nodes) {
      for (const pid of node.projectIds) {
        ontologyFreq.set(pid, (ontologyFreq.get(pid) ?? 0) + 1);
      }
    }

    if (projects && projects.length > 0) {
      return projects
        .slice()
        .sort((a, b) => {
          const fa = ontologyFreq.get(a.slug) ?? 0;
          const fb = ontologyFreq.get(b.slug) ?? 0;
          if (fa !== fb) return fb - fa;
          return a.name.localeCompare(b.name, "ko");
        })
        .map((p) => ({ slug: p.slug, label: p.name }));
    }
    return Array.from(ontologyFreq.keys())
      .sort((a, b) => (ontologyFreq.get(b) ?? 0) - (ontologyFreq.get(a) ?? 0))
      .map((slug) => ({ slug, label: slug }));
  }, [projects, nodes]);

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
          aria-label={t('dialogAriaLabel')}
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
            inputRef.current?.focus({ preventScroll: true });
          }}
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
            <Dialog.Title>{t('dialogTitle')}</Dialog.Title>
            <Dialog.Description>
              {t('dialogDescription')}
            </Dialog.Description>
          </VisuallyHidden>
          <Command
            label={t('commandLabel')}
            shouldFilter={false}
            className="flex h-[calc(100dvh-var(--topology-mobile-bottom-tab-reserve))] w-full flex-col overflow-hidden border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-2)] md:h-auto md:max-w-[var(--topology-search-sheet-floating-width)] md:rounded-sheet"
            onClick={(event) => event.stopPropagation()}
          >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-4 py-3">
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
            aria-label={t('closeAriaLabel')}
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
              <div
                ref={projectScrollRef}
                className="relative flex-1 overflow-x-auto"
                style={{ height: 24 }}
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
                ? t('emptyNoCorpus')
                : t('emptyIndexed', { count: totalCorpus })
              : hasFilter
                ? t('emptyNoMatchFiltered', { query })
                : t('emptyNoMatch', { query })}
          </Command.Empty>

          {ontologyResults.length > 0 ? (
            <Command.Group
              heading={
                <span className="px-2 pb-1 pt-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
                  {isEmptyQuery ? t('groupConceptRecent') : t('groupConceptMatch')} · {ontologyResults.length}
                  {isEmptyQuery && ontologySize > ontologyResults.length ? ` / ${ontologySize}` : ""}
                </span>
              }
            >
              {/* After R10 the vault is the only mode — node.evidenceCount is
                  permanently undefined, so the 'Evidence N' chip was removed under the
                  same policy as cycle 16's cleanup of the old detail panel (now
                  FullDetailA1). If the same information is ever needed, cycle 6's
                  ontology→docs jump chip shows it more richly. */}
              {ontologyResults.map(({ node }) => {
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
                return (
                  <Command.Item
                    key={`ontology:${node.id}`}
                    value={`ontology:${node.id}`}
                    onSelect={() => {
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
                    <span
                      data-search-result-path-like={pathLike ? "true" : undefined}
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        pathLike
                          ? "font-mono text-body text-[color:var(--color-text-tertiary)]"
                          : "text-[color:var(--color-text-primary)]",
                      )}
                    >
                      <HighlightedText text={label} query={isEmptyQuery ? undefined : query} />
                    </span>
                    {node.summary ? (
                      <span className="hidden min-w-0 max-w-[14rem] truncate text-body text-[color:var(--color-text-tertiary)] md:block">
                        {node.summary}
                      </span>
                    ) : null}
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
                  {isEmptyQuery && projectSize > projectResults.length ? ` / ${projectSize}` : ""}
                </span>
              }
            >
              {projectResults.map(({ project }) => (
                <Command.Item
                  key={`project:${project.slug}`}
                  value={`project:${project.slug}`}
                  onSelect={() => {
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
                  <span className="min-w-0 flex-1 truncate text-[color:var(--color-text-primary)]">
                    {project.name}
                  </span>
                  <span className="hidden shrink-0 font-mono text-caption text-[color:var(--color-text-tertiary)] md:inline">
                    {project.slug}
                  </span>
                  <span className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-tertiary)]">
                    {project.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}
        </Command.List>

        <div className="flex items-center justify-between gap-3 border-t border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-2 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
          {/*
           * **The count and the scope travel together** (owner report, 2026-09-04).
           *
           * The dialog title ("Search this map") is visually hidden for Radix, so the
           * only place the scope was ever written was the zero-result sentence. A
           * visitor reading "0 MATCHES" under a palette that names nothing read it as
           * a broken search rather than as a sample that does not contain the word.
           * A visible title bar was rejected — it pushes the input down — so the name
           * joins the number that is already permanent, in every state.
           *
           * `scopeName` is the loaded project when there is exactly one; with several
           * there is no honest single name, so the copy falls back to "this map".
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
              {scopeName ?? t('scopeFallback')}
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
