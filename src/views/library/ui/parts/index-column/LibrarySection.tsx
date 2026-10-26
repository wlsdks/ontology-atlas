"use client";

import { ActionFeedbackGlyph, type ActionFeedbackState } from '@/shared/motion/action-feedback-glyph';
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { BookText, Check, CloudDownload, FilePlus2, FileText, ListFilter, PencilLine, Search, Sparkles, Stethoscope } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { humanPageSlug } from "@/features/library";
import { writerLabel } from "../../../lib/wiki/writer-label";
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui/marks/brand-mark";
import { controlClass } from "@/shared/ui/control-class";
import { Button, Chip, Dialog, RowButton, Tooltip } from "@/shared/ui";
import { AgentMissingNotice } from "../agent/AgentMissingNotice";
import { Input } from "@/shared/ui/fields/input";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import {
  readLibraryIndexQuery,
  writeLibraryIndexQuery,
  writeLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/preferences/appearance-preferences";

import { isAdvisoryWikiCode, isWikiFolderCode, libraryOffTemplateCount, passageLabelText } from "@/features/library";
import { captionWindow } from "../../../lib/sources/caption-window";
import { useSourceSearch } from "../../../lib/sources/use-source-search";
import { LibraryShelf } from "./LibraryShelf";
import { useRovingRows } from "@/shared/lib/list-rows/use-roving-rows";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import { useWindowedRows } from "@/shared/lib/list-rows/use-windowed-rows";
import { StateBadge } from "./StateBadge";
import { IndexGlyph } from "./IndexGlyph";

/** A source row before it is measured: one line of `text-body` in `RowButton` with its inset. */
const SOURCE_ROW_ESTIMATE_PX = 36;
/** One screen of index rows: past this, a pill repeated on every row is texture and folds into the head. */
const SOURCE_STATE_FOLDS_FROM = 12;
/** The order the head counts states in: what to act on first, what is done last. */
const SOURCE_STATE_ORDER: readonly LibrarySourceRow["state"][] = ["stale", "partial", "not-compiled", "compiled", "checking"];
import type { LibraryUiModel } from "@/features/library";
import { WIKI_SECTION_ORDER } from "@/shared/lib/library/wiki-page-schema";

const WIKI_SECTION_PREVIEW_KEYS = {
  Summary: "summary",
  Facts: "facts",
  Decisions: "decisions",
  "Open questions": "openQuestions",
  "Not in sources": "notInSources",
} as const;

/**
 * The index draws one list at a time, Sources or Wiki, chosen by the control `LibraryPage` draws;
 * the inactive list renders nothing, so its rows and doors leave the tab order. Source states: not
 * compiled (quiet chip), compiled (a check), stale (amber chip), checking (a quiet word).
 */

/** Candidate rows drawn before the list folds; the rail's height at 14 inches fits five with the wiki list above. */

export interface LibrarySectionProps {
  model: LibraryUiModel;
  /**
   * Where the search field stands when the column's head offers a place for it; this component keeps
   * owning its state through a portal.
   */
  searchHost?: HTMLElement | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /**
   * Opens a raw source in the reading pane.
   *
   * `anchor` arrives only from a search hit's caption, and means *open this file at this
   * unit* — the same `{path, anchor}` a pressed citation sends, so one press lands on
   * U1's passage section rather than at the top of the pane (slice U2).
   */
  onOpenSource: (row: LibrarySourceRow, anchor?: string) => void;
  /** The source the reader is showing, so the selected row differs from a resting one. */
  selectedSourcePath: string | null;
  /**
   * The anchor the reader is standing on, when the pane was opened at one. A caption lights only for a
   * passage opened, not for a file opened plainly.
   */
  selectedSourceAnchor?: string | null;
  /**
   * The folder walk's own handles, so a search can read the words inside a source.
   *
   * The column asks for these rather than receiving finished results because the query
   * lives here: the field, its state and the rows it filters are one unit, and lifting
   * the query to `LibraryPage` to hand back matches would put the input's state a pane
   * away from the input.
   */
  sourceHandles: Map<string, FileSystemFileHandle>;
  /**
   * The open folder's session identity, which keys the units a search keeps.
   *
   * Two browser folders can carry the same name, so the scope — not the path — is what
   * stops one folder's text from answering another folder's search.
   */
  vaultScope: string;
  /** The one-click "add files" door. */
  onAddFiles: () => void;
  addFilesFeedback?: ActionFeedbackState;
  /** Proposes candidates from the open folder and any bound project root. */
  onFindDocuments: () => void;
  /**
   * The third door: documents that are not on this computer yet. It sits third because it is the one
   * that reaches outside.
   */
  onImportFromService: () => void;
  /** Starts one in-app agent turn that writes the pages. Absent when no agent can run. */
  onCompile: (() => void) | null;
  /** Starts the report-only health check; null where no agent can run, like Compile. */
  onLint: (() => void) | null;
  /** Names the last check found with no page of their own — offered as ontology node candidates. */
  /** What the last check found under its first three categories, each with a door to fix it. */
  /** Starts one agent turn that proposes the candidate through the ontology-write card; null like the others. */
  /** Whether `wiki/_template.md` exists: without it the empty state says how to get one. */
  hasWikiTemplate?: boolean;
  /** How an agent's wiki page write is handled: lands when it fits, or asks each time. */
  /** Files the last answer the agent gave as a wiki page; null when there is none. */
  /** Starts a page a person writes by hand, from a title. Null where the folder cannot be written. */
  onNewPage?: ((title: string) => void | Promise<boolean>) | null;
  /**
   * The Check results page: findings and names it holds, whether it is the open page, and the press
   * that opens it. Null when the wiki was never checked.
   */
  report?: {
    count: number;
    open: boolean;
    onOpen: () => void;
    /** A check is in flight right now. The row says so live, rather than wearing a label. */
    running?: boolean;
    /** A check finished and this person has not opened the report since. */
    unseen?: boolean;
  } | null;
  /**
   * The brain picker, when this computer offers two and Compile can therefore be pointed
   * at either. Null draws nothing: with one brain there is no choice to make.
   */
  brainControl?: ReactNode;
  /**
   * Why the agent-only doors cannot run: one label line, or nothing. `null` while the landing is
   * drawn, since the stage prints the one reason and `agentReasonPrintedId` says which card, so a
   * reason prints once per screen.
   */
  actionsNote: string | null;
  /** True in the installed app. On the web, Compile has no runtime at all. */
  inApp: boolean;
  /**
   * The installed app looked for a coding agent and found none. With both agent doors dead for that
   * reason, the column draws one notice with a door to the agents page instead of two disabled chips.
   */
  agentMissing?: boolean;
  /**
   * Which of the two lists this column is showing. There is no "both": the switch above
   * is exclusive, and rendering the inactive list `hidden` would leave its rows in the tab
   * order and its doors reachable from the keyboard while nothing on screen names them.
   */
  segment: LibraryIndexSegment;
  busy: boolean;
  /**
   * True while a **Compile** turn is in flight.
   *
   * Separate from `busy`, which disables the doors for every kind of work this column
   * can start. Only Compile acts on the shelf, so only Compile earns the shelf's own
   * progress; a Check or an Ask running would otherwise light a row of pages nothing is
   * writing.
   */
  compiling?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}

/**
 * The doors and nothing that repeats the switch: the segmented control at the top is the column's
 * head, so no second eyebrow is drawn.
 */
/**
 * A search whose matches all sit on the other half of the switch names where they are and switches
 * there, instead of an empty list under a count.
 */
function OtherHalf({
  count,
  segment,
  t,
}: {
  count: number;
  segment: LibraryIndexSegment;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <>
      {t("search.noneHere")}{" "}
      <button
        type="button"
        data-testid="library-search-other-half"
        onClick={() => writeLibraryIndexSegment(segment)}
        /*
         * Accent, not muted: in a quaternary caption a muted link reads as more caption, and this is the one
         * way out of the dead end.
         */
        className={controlClass({ shape: "link", size: "sm", tone: "accent", hoverInk: "strong", className: "atlas-touch-floor" })}
      >
        {t(segment === "wiki" ? "search.showPages" : "search.showSources", { count })}
      </button>
    </>
  );
}

/**
 * A door whose label is a sentence takes the whole row: at 11px `wiki.compile` needs about 119px of
 * a 125px cell, so a half-width cell would truncate it mid-word. Both halves still fill the column
 * (`docs/DESIGN-SYSTEM.md`, "Control groups fill their column").
 */
const AGENT_DOOR_SPAN = "col-span-2";

/** The one line under the index's button group, so a dead door can point at its reason. */
const SECTION_ACTIONS_NOTE_ID = "library-actions-blocked";

/**
 * Where an index chip's explanation opens: **into the reader, wrapped.**
 *
 * The shared panel has no measure of its own, so a sentence rendered as one line —
 * measured 449px for "Find documents", from x 44 across the 0–64 nav rail and the
 * bottom 8px of the search box above. `right` + `start` hangs it off the chip's own
 * row into the free reader beside the column; the cap keeps it a short paragraph.
 */
const INDEX_CHIP_TIP = {
  side: "right",
  align: "start",
  panelClassName: "max-w-[min(20rem,calc(100vw-2rem))] [word-break:keep-all]",
} as const;

/**
 * The same, for a chip in the **left** cell of `SectionActions`' two-column grid.
 *
 * Hung from that chip's own right edge the panel landed on its neighbour, measured at
 * x 208 over *Find documents*. The margin carries it across the right cell and the
 * column gap to the column's edge, derived from `SectionActions`' `px-3` and `gap-1`,
 * so it opens where the full-width chips' panels open: beside the column, not on it.
 */
const INDEX_LEFT_CELL_TIP = {
  ...INDEX_CHIP_TIP,
  panelClassName: `${INDEX_CHIP_TIP.panelClassName} ml-[calc((var(--docs-list-width)-1.75rem)/2+0.25rem)]`,
} as const;

/*
 * One box edge and one text line for every control in the column: boxes stand on the column's `px-3`
 * edge, and content starts after the same 1px edge, 10px pad and 16px glyph slot (`IndexGlyph`). The
 * row carries a transparent edge so its inset matches the chip's.
 */
const INDEX_LIST_INSET = "px-3";
const INDEX_ROW_INSET = "gap-1.5 border border-transparent px-2.5 py-1.5";
/**
 * A caption with no glyph of its own still starts on the text line: it takes a control's transparent
 * edge, pad and gap and leads with an empty `IndexGlyph`.
 */
const INDEX_TEXT_LINE = "flex gap-1.5 border-x border-transparent px-2.5";

/**
 * The button group is a two-column grid: every control is `w-full` and a lone or odd last control
 * spans the row. The odd-child span is a selector because the children are written by the two
 * segments and their number depends on the route.
 */
function SectionActions({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div className="grid grid-cols-2 gap-1 px-3 pb-2 [&>*:last-child:nth-child(odd)]:col-span-2">
      {children}
    </div>
  );
}

/** The log's ISO stamp as a person reads it; the raw stamp when it does not parse. */

/**
 * How long the search reads before the screen says it is reading: the threshold under which a state
 * is a flicker rather than a message. Pinned by `LibrarySection.search.test.tsx`.
 */
const READING_TEXT_DELAY_MS = 200;

/** One line of counting under a list. `text-caption`, because it is a footnote to rows. */
function ListNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <p
      data-testid={testId}
      className="px-3 pt-1 text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
    >
      {children}
    </p>
  );
}

export function LibrarySection({
  model,
  searchHost = null,
  selectedSlug,
  onSelect,
  onOpenSource,
  selectedSourcePath,
  selectedSourceAnchor = null,
  sourceHandles,
  vaultScope,
  onAddFiles,
  addFilesFeedback = 'idle',
  onFindDocuments,
  onImportFromService,
  onCompile,
  onLint,
  hasWikiTemplate = true,
  onNewPage = null,
  report = null,
  brainControl,
  actionsNote,
  inApp,
  agentMissing = false,
  segment,
  busy,
  compiling = false,
  t,
}: LibrarySectionProps) {
  /*
   * Five candidate rows show, map kinds first since those carry the list's one door; the rest fold
   * behind a count.
   */
  /*
   * One search over both lists: headers keep the folder's totals and the line under the field says
   * what matched. Sources are read on the keystroke, per file, kept for the session;
   * `use-source-search.ts` owns that read.
   */
  /*
   * The field comes back holding what was typed; `appearance-preferences.ts` owns the slot and why it
   * is scoped to the folder and kept in session storage.
   */
  const [query, setQuery] = useState(() => readLibraryIndexQuery(vaultScope));
  const changeQuery = (next: string) => {
    setQuery(next);
    writeLibraryIndexQuery(vaultScope, next);
  };
  const needle = query.trim().toLowerCase();
  const search = useSourceSearch({
    sources: model.sources,
    sourceHandles,
    vaultScope,
    needle,
    enabled: true,
  });
  /*
   * **Hold the reading sentence back for `READING_TEXT_DELAY_MS`.** Measured on the
   * day-one folder: the six files are read and split in 34 ms, which draws the state for
   * two frames — a flicker, not an explanation. Past the delay the folder really is slow
   * enough for the sentence to be read, which is the only case it is for. `data-phase`
   * stays truthful from the first keystroke regardless; only the words wait.
   */
  const [readingHeld, setReadingHeld] = useState<string | null>(null);
  useEffect(() => {
    if (search.phase !== "reading") return;
    const timer = window.setTimeout(() => setReadingHeld(needle), READING_TEXT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [needle, search.phase]);
  /*
   * Derived, not reset: the state names **which query** waited long enough, so leaving the
   * reading phase or typing another character makes this false without a second
   * `setState` — the cascading-render shape `react-hooks/set-state-in-effect` rejects.
   */
  const readingShown = search.phase === "reading" && readingHeld === needle;
  /*
   * Path **or** text. The path match survives because it is the one that still works
   * while the file is being read, and because a person who types part of a filename
   * means the filename.
   */
  /*
   * An unread row stays until its own read says otherwise: while the phase is `reading`, a file not
   * yet read is neither a match nor a miss, so the list narrows as reads land.
   */
  /*
   * **Memoised on what the list is actually made of.** Recomputed every render, the array was
   * a new identity each time, so the effect below — the one that scrolls the list to the open
   * file — re-fired on renders that had nothing to do with the list and dragged the column
   * back under the person's own scrolling.
   */
  const visibleSources = useMemo(
    () =>
      needle
        ? model.sources.filter(
            (row) =>
              row.path.toLowerCase().includes(needle) ||
              search.hits.has(row.path) ||
              (search.phase === "reading" && !search.read.has(row.path)),
          )
        : model.sources,
    [model.sources, needle, search.hits, search.phase, search.read],
  );
  /**
   * The majority state is said once at the head and rows keep the exceptions, as `majorityWriter` does
   * for the wiki list. `compiled` never folds and `checking` is a moment; below
   * `SOURCE_STATE_FOLDS_FROM` rows nothing folds.
   */
  const stateCounts = useMemo(() => {
    const counts = new Map<LibrarySourceRow["state"], number>();
    for (const row of visibleSources) counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
    return SOURCE_STATE_ORDER.filter((state) => counts.has(state)).map((state) => ({ state, count: counts.get(state)! }));
  }, [visibleSources]);
  const foldedState = (() => {
    if (visibleSources.length < SOURCE_STATE_FOLDS_FROM) return null;
    const candidates = stateCounts.filter(({ state }) => state !== "compiled" && state !== "checking");
    if (candidates.length === 0) return null;
    const best = candidates.reduce((a, b) => (b.count > a.count ? b : a));
    if (candidates.some((c) => c !== best && c.count === best.count)) return null;
    return best.count * 2 > visibleSources.length ? best.state : null;
  })();
  const [sourceWindow, sourceListRef, scrollToSource] = useWindowedRows({ count: visibleSources.length, estimate: SOURCE_ROW_ESTIMATE_PX });
  const sourceRoving = useRovingRows({ count: visibleSources.length, listRef: sourceListRef, scrollToRow: scrollToSource, rendered: sourceWindow });
  const { onRowFocus: sourceRowFocus } = sourceRoving;
  useEffect(() => {
    if (!selectedSourcePath) return;
    const index = visibleSources.findIndex((row) => row.path === selectedSourcePath);
    if (index < 0) return;
    scrollToSource(index);
    sourceRowFocus(index);
  }, [scrollToSource, selectedSourcePath, sourceRowFocus, visibleSources]);
  /* Memoised for the same reason, and because `LibraryShelf` derives its spines from this array. */
  const visiblePages = useMemo(
    () =>
      needle
        ? model.wikiPages.filter(
            (page) =>
              page.title.toLowerCase().includes(needle) ||
              (model.pageTexts.get(page.slug) ?? "").toLowerCase().includes(needle),
          )
        : model.wikiPages,
    [model.pageTexts, model.wikiPages, needle],
  );
  /*
   * The writer label prints only on exception rows: the majority writer is silent and every other
   * writer is named. Two tied writers print both.
   */
  const majorityWriter = useMemo(() => {
    const counts = new Map<string, number>();
    for (const page of model.wikiPages) counts.set(page.createdBy ?? "", (counts.get(page.createdBy ?? "") ?? 0) + 1);
    let best: string | null = null;
    let bestCount = 0;
    let tied = false;
    for (const [writer, count] of counts) {
      if (count > bestCount) { best = writer; bestCount = count; tied = false; }
      else if (count === bestCount) tied = true;
    }
    return tied ? null : best;
  }, [model.wikiPages]);
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPageCreating, setNewPageCreating] = useState(false);
  const closeNewPage = () => {
    setNewPageOpen(false);
    setNewPageTitle("");
  };
  const createNewPage = async () => {
    const title = newPageTitle.trim();
    if (!title || !onNewPage || busy || newPageCreating) return;
    setNewPageCreating(true);
    try {
      const created = await onNewPage(title);
      if (created !== false) closeNewPage();
    } finally {
      setNewPageCreating(false);
    }
  };
  const agentNotice = agentMissing && onLint === null && onCompile === null;
  const hasSources = model.sources.length > 0;
  const hasWiki = model.wikiPages.length > 0;
  /**
   * Pages whose own shape misses the template, counted among the rows on screen. The folder-wide
   * figure stays with the header strip and the home clause.
   */
  const offTemplateRows = libraryOffTemplateCount(
    needle
      ? new Map(visiblePages.flatMap((page) => {
          const verdict = model.verdicts.get(page.slug);
          return verdict ? [[page.slug, verdict] as const] : [];
        }))
      : model.verdicts,
  );
  const newPagePreviewIsExample = newPageTitle.trim() === "";
  const newPagePreviewTitle = newPageTitle.trim() || t("wiki.newPageExampleTitle");
  const newPagePreviewPath = humanPageSlug(newPagePreviewTitle) + ".md";

  /*
   * One field filters whichever list the switch shows, on path, title, page text and source text. The
   * count is provisional while files arrive and the reading line replaces it. The cap (200 files, 20
   * MB) is named where it binds.
   */
  const searchField =
    model.sources.length + model.wikiPages.length > 0 ? (
      <div className={searchHost ? "flex min-w-0 flex-1 flex-col gap-1" : "flex flex-none flex-col gap-1 px-3 pb-2"}>
        {/* The field's words start on the column's text line: the box is drawn here with the chips' edge,
           inset and slot, and the field inside is `bare`. The slot holds a filter mark since the magnifier
           belongs to Find documents. A `div`, not a `label` (`control-adoption-ratchet`). */}
        <div data-testid="library-search-box" className="atlas-touch-floor flex h-7 min-w-0 items-center gap-1.5 rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 transition-colors focus-within:border-[color:var(--color-indigo-a46)]">
          <IndexGlyph>
            <ListFilter size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-text-quaternary)]" />
          </IndexGlyph>
          <Input
            data-testid="library-search"
            frame="bare"
            className="min-w-0 flex-1"
            type="search"
            aria-label={t("search.placeholder")}
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(event) => changeQuery(event.target.value)}
          />
        </div>
        {/* The line is always present, even empty: appearing is a layout event that would push the list on
           the first keystroke. One line is reserved through `--leading-caption`; hosted in the head, the
           head drops its bottom padding so the reserve is the whole gap. */}
        <p
          data-testid="library-search-matches"
          data-phase={search.phase}
          data-reading-shown={readingShown ? "true" : "false"}
          /* Polite, not assertive: the count settling as files land is progress a
             screen reader should hear once it has, not on every published file. */
          aria-live="polite"
          className={`min-h-[var(--leading-caption)] text-caption text-[color:var(--color-text-quaternary)] ${INDEX_TEXT_LINE}`}
        >
          <IndexGlyph />
          {!needle ? null : search.phase === "reading" ? (
            /*
             * ⚠️ **The reading sentence waits, and its counter is not announced.**
             *
             * At first-day size the whole read lands in 34 ms, so printing the state
             * immediately is a one-frame flicker of a sentence nobody can read — a screen
             * that flashes an explanation is worse than one that says nothing for a tenth
             * of a second. And `{read}/{total}` changes once per file: left inside a live
             * region on a capped folder it is **200 utterances** of a number, which buries
             * the two sentences that are worth hearing. So the counter rides in an
             * `aria-hidden` span while the live region carries the stable sentence.
             */
            readingShown ? (
              t.rich("search.reading", {
                read: search.readCount,
                total: search.plannedCount,
                count: (chunks) => <span aria-hidden>{chunks}</span>,
              })
            ) : null
          ) : (
            t("search.matches", {
              sources: visibleSources.length,
              passages: search.passageCount,
              pages: visiblePages.length,
            })
          )}
        </p>
        {/*
         * The cap on its own line, and a persistent one: appended to the line above it
         * wrapped to a second line on one folder and not on the next, which moves the list
         * by a line for a fact that has not changed.
         */}
        {needle && search.capped ? (
          <p
            data-testid="library-search-capped"
            className={`text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all] ${INDEX_TEXT_LINE}`}
          >
            <IndexGlyph />
            {t("search.capped", { count: search.plannedCount })}
          </p>
        ) : null}
      </div>
    ) : null;

  if (segment === "sources") {
    return (
      /* No `min-h-0` and no overflow: the column above owns the one scroller, and a
         section that could shrink is a section that can cut a row in half. */
      <section data-testid="library-sources" className={cn("flex flex-col pb-1", searchHost ? "pt-1.5" : "pt-3")}>
        {searchHost && searchField ? createPortal(searchField, searchHost) : searchField}
        <SectionActions>
          <Tooltip content={t("sources.addTooltip")} {...INDEX_LEFT_CELL_TIP}>
            <Chip
              data-testid="library-add-files"
              aria-busy={addFilesFeedback === 'working' || undefined}
              onClick={onAddFiles}
              disabled={busy}
              tone="muted"
              className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
            >
              <IndexGlyph><ActionFeedbackGlyph state={addFilesFeedback} icon={<FilePlus2 size={ICON_SIZE.sm} aria-hidden />} size={ICON_SIZE.sm} /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.add")}</span>
            </Chip>
          </Tooltip>
          <Tooltip content={t("sources.findTooltip")} {...INDEX_CHIP_TIP}>
            <Chip
              data-testid="library-find-documents"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                onFindDocuments();
              }}
              disabled={busy}
              tone="muted"
              className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
            >
              <IndexGlyph><Search size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.find")}</span>
            </Chip>
          </Tooltip>
          <Tooltip content={t("sources.importTooltip")} {...INDEX_CHIP_TIP}>
            <Chip
              data-testid="library-import-open"
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                onImportFromService();
              }}
              disabled={busy}
              tone="muted"
              className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
            >
              <IndexGlyph><CloudDownload size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.import")}</span>
            </Chip>
          </Tooltip>
        </SectionActions>

        {hasSources ? (
          <>
            {stateCounts.length > 0 ? (
              <p
                data-testid="library-source-states"
                data-folded-state={foldedState ?? undefined}
                aria-label={t("sources.statesAria")}
                className={`pb-2 pt-1 text-caption text-[color:var(--color-text-quaternary)] ${INDEX_LIST_INSET}`}
              >
                <span className={`items-center ${INDEX_TEXT_LINE}`}>
                <IndexGlyph />
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                {stateCounts.map(({ state, count }) =>
                  state === foldedState ? (
                    <StateBadge
                      key={state}
                      tone={state === "stale" || state === "partial" ? "warning" : "neutral"}
                      testId={`library-source-states-${state}`}
                    >
                      {t(`sources.state.${state}.label`)} · {count.toLocaleString()}
                    </StateBadge>
                  ) : (
                    <span key={state} data-testid={`library-source-states-${state}`} className="tabular-nums">
                      {t(`sources.state.${state}.label`)} {count.toLocaleString()}
                    </span>
                  ),
                )}
                </span>
                </span>
              </p>
            ) : null}
            <ul
              ref={sourceListRef}
              onKeyDown={sourceRoving.onKeyDown}
              data-testid="library-source-list"
              /* The list says which phase drew it, so a proof can assert that a finished
                 answer and an unfinished read never share a frame. */
              data-phase={search.phase}
              data-window={`${sourceWindow.start}-${sourceWindow.end}`}
              aria-label={t("sources.listAria")}
              className={`flex flex-col gap-0.5 ${INDEX_LIST_INSET}`}
              /* Only the rows in view are in the DOM (`useWindowedRows`); the pads stand in
                 for the rest so the scroller's height is the whole list's. */
              style={sourceWindow.before || sourceWindow.after ? { paddingTop: sourceWindow.before, paddingBottom: sourceWindow.after } : undefined}
            >
              {visibleSources.slice(sourceWindow.start, sourceWindow.end).map((row, offset) => {
                const rowIndex = sourceWindow.start + offset;
                const active = row.path === selectedSourcePath;
                const stateLabel = t(`sources.state.${row.state}.label`);
                const hit = needle ? search.hits.get(row.path) : undefined;
                /* The pane is open **at this unit** — not merely on this file. */
                const hitOpen = Boolean(hit && active && selectedSourceAnchor === hit.anchor);
                return (
                  <li key={row.path}>
                    <RowButton
                      active={active}
                      aria-current={active ? "true" : undefined}
                      data-testid={`library-source-${row.path}`}
                      data-row-index={rowIndex}
                      tabIndex={sourceRoving.tabIndexOf(rowIndex)}
                      onFocus={() => sourceRoving.onRowFocus(rowIndex)}
                      onClick={() => onOpenSource(row)}
                      // The full name first: a 280px column truncates, and the row's own
                      // hover text is the only place the rest of the name exists.
                      title={`${row.name} · ${formatSourceBytes(row.bytes)}\n${t(`sources.state.${row.state}.hint`, {
                        pages: row.citedBy.join(", ") || t("sources.state.nobody"),
                      })}`}
                      hoverSurface="lift"
                      hoverInk="strong"
                      className={cn("group relative", INDEX_ROW_INSET, active && "bg-[color:var(--color-indigo-a16)]")}
                    >
                      {/* The same leading glyph the tree, pinned and recent rows carry, so
                          the sidebar keeps one left edge from top to bottom. */}
                      <IndexGlyph><FileText size={ICON_SIZE.sm} className="opacity-60" aria-hidden /></IndexGlyph>
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      {/* Format is a fact the directory listing already holds. The tag is drawn only when the name does not
                         already say it, since `row.format` is the name's extension; a name with no extension still gets
                         the word. */}
                      {row.format && row.name.toLowerCase().endsWith(`.${row.format.toLowerCase()}`) ? null : (
                        <span
                          data-testid="library-source-format"
                          className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]"
                        >
                          {row.format ? row.format.toUpperCase() : t("sources.noFormat")}
                        </span>
                      )}
                      {row.state === "compiled" ? (
                        /*
                         * A check, not a pill. The word is still announced — the glyph is
                         * `aria-hidden` and the label rides with it in `sr-only`, so a
                         * screen reader hears "compiled" exactly as it did before, while
                         * the eye is left to find the rows that are **not** done.
                         */
                        <span
                          data-testid="library-source-state-compiled"
                          className="flex flex-none items-center text-[color:var(--color-text-quaternary)]"
                        >
                          <Check size={ICON_SIZE.sm} aria-hidden />
                          <span className="sr-only">{stateLabel}</span>
                        </span>
                      ) : row.state === "checking" ? (
                        /*
                         * The same badge as every other unfinished state; its word tells it from `not compiled` (see
                         * `StateBadge`).
                         */
                        <StateBadge tone="neutral" testId="library-source-state-checking">
                          {stateLabel}
                        </StateBadge>
                      ) : row.state === foldedState ? (
                        /* The head already says this state once; the row keeps the word
                           for a screen reader and shows nothing. */
                        <span data-testid="library-source-state-folded" className="sr-only">
                          {stateLabel}
                        </span>
                      ) : (
                        /*
                         * Amber marks a row to act on, not a wrong page: `partial` is counted with waiting sources and
                         * Compile acts on it. `stale` and `partial` differ by their words; `not-compiled` keeps the quiet
                         * border.
                         */
                        <StateBadge
                          tone={
                            row.state === "stale" || row.state === "partial"
                              ? "warning"
                              : "neutral"
                          }
                          testId={`library-source-state-${row.state}`}
                        >
                          {stateLabel}
                        </StateBadge>
                      )}
                    </RowButton>
                    {hit ? (
                      /*
                       * The passage the search found is its own press under the row: the row opens the file, this opens it
                       * at this unit through the same `{path, anchor}` a citation sends. `text-label`, not `text-caption`,
                       * since these are the document's own words (`.claude/rules/design.md`).
                       */
                      <button
                        type="button"
                        data-testid={`library-source-hit-${row.path}`}
                        /* The address this press opens, readable without pressing it —
                           the marker a proof asserts the landing against. */
                        data-anchor={hit.anchor}
                        onClick={() => onOpenSource(row, hit.anchor)}
                        title={hit.text}
                        /*
                         * ⚠️ **`location`, not `page`.** The pane is already the page; this
                         * says where inside it the reader is standing, which is what
                         * `aria-current="location"` is for — and it is the one state that
                         * tells a returning reader which of several captions they followed.
                         */
                        aria-current={hitOpen ? "location" : undefined}
                        className={controlClass({
                          shape: "row",
                          size: "xs",
                          tone: "secondary",
                          hoverInk: "strong",
                          hoverSurface: "lift",
                          active: hitOpen,
                          /* The touch floor, because this control rests at 28px while the rows above it are 36. */
                          className: `atlas-touch-floor w-full ${INDEX_ROW_INSET} pl-8 text-label`,
                        })}
                      >
                        {/*
                         * ⚠️ **The address is the accent link ink, the document's words are
                         * not.** At rest this control was indistinguishable from a caption —
                         * the same false negative this file already ruled on for the
                         * other-half link, where a muted link read as more caption. One
                         * element carries the affordance; tinting the quoted line as well
                         * would dress the file's own words as a control.
                         */}
                        <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-indigo-accent)]">
                          {passageLabelText(hit.label, hit.anchor, t)}
                        </span>
                        {/* One line, clipped, and windowed onto the phrase when the match
                            sits past what one line shows (`caption-window.ts`). The full
                            unit is the `title` and the pane. */}
                        <span className="min-w-0 flex-1 truncate text-left">
                          {captionWindow(hit.text, needle)}
                        </span>
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {/* Not while reading is unfinished: this note is a finished answer and must not print under a line
               saying `0/6`. */}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length > 0 ? (
              <ListNote testId="library-search-other-half-note">
                <OtherHalf count={visiblePages.length} segment="wiki" t={t} />
              </ListNote>
            ) : null}
            {/* A search that matches nowhere says so in a sentence. This covers both halves empty and waits for
               reading to finish, like the other-half note. */}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length === 0 ? (
              <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
            ) : null}
            {/* The waiting count is not repeated here: the home strip's pressable clause and the header strip
               carry it, and a third copy would say the fact twice in one viewport. */}
          </>
        ) : (
          <p
            data-testid="library-sources-empty"
            className="px-3 pb-1 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {needle && visiblePages.length > 0 ? (
              <OtherHalf count={visiblePages.length} segment="wiki" t={t} />
            ) : (
              t("sources.empty")
            )}
          </p>
        )}
      </section>
    );
  }

  /*
   * A hand-written page is the list's own last row, hoisted here because the list has two shapes, a
   * shelf at rest and rows while searching, and one control cannot be written twice.
   */
  /*
   * Drawn as a door, not a list row: it is an action, so it wears the doors' chip at the head of the
   * column.
   */
  const newPageControl = onNewPage ? (
    <>
      <Chip
        data-testid="library-new-page"
        onClick={() => setNewPageOpen(true)}
        disabled={busy}
        aria-expanded={newPageOpen}
        aria-haspopup="dialog"
        title={t("wiki.newPageTooltip")}
        tone="muted"
        className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
      >
        <IndexGlyph><PencilLine size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
        <span className="min-w-0 flex-1 truncate text-left">{t("wiki.newPage")}</span>
      </Chip>
      <Dialog
        open={newPageOpen}
        onClose={closeNewPage}
        labelledBy="library-new-page-title-heading"
        testId="library-new-page-row"
        size="md"
        className="max-h-[calc(100vh-var(--chrome-inset)*2)] overflow-y-auto flex flex-col gap-4"
      >
        <h2
          id="library-new-page-title-heading"
          className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
        >
          {t("wiki.newPageDialogTitle")}
        </h2>
        <p className="text-body leading-body text-[color:var(--color-text-tertiary)]">
          {t("wiki.newPageDialogBody")}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            createNewPage();
          }}
        >
          <Input
            data-testid="library-new-page-title"
            size="md"
            label={t("wiki.newPageTitle")}
            placeholder={t("wiki.newPageTitleExample")}
            value={newPageTitle}
            onChange={(event) => setNewPageTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !isImeComposing(event)) {
                event.preventDefault();
                void createNewPage();
              }
            }}
          />
          <section
            aria-label={t("wiki.newPagePreviewTitle")}
            className="rounded-panel border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                {t("wiki.newPagePreviewTitle")}
              </h3>
              <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                {t("wiki.newPageFormat")}
              </span>
            </div>
            <p className="mt-2 break-all font-mono text-label text-[color:var(--color-text-secondary)]">
              {newPagePreviewPath}
            </p>
            {/* Held, not removed, once a title is typed: the dialog is centred, so a line leaving the preview
               would move the field under the caret. `invisible` keeps the height. */}
            <p
              data-testid="library-new-page-example-note"
              aria-hidden={!newPagePreviewIsExample || undefined}
              className={cn(
                "mt-1 text-caption text-[color:var(--color-text-quaternary)]",
                !newPagePreviewIsExample && "invisible",
              )}
            >
              {t("wiki.newPagePreviewExample")}
            </p>
            <p className="mt-2 text-caption text-[color:var(--color-text-tertiary)]">
              {t("wiki.newPageMetadata")}
            </p>
            <p className="mt-3 border-t border-[color:var(--color-border-soft)] pt-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
              {t("wiki.newPageStructure")}
            </p>
            <ol className="mt-2 flex flex-col gap-1.5">
              {WIKI_SECTION_ORDER.map((section) => (
                <li
                  key={section}
                  className="flex flex-wrap items-baseline gap-x-2 text-label text-[color:var(--color-text-secondary)]"
                >
                  <span className="font-mono">## {section}</span>
                  <span className="text-[color:var(--color-text-quaternary)]">
                    {t("wiki.newPageSection." + WIKI_SECTION_PREVIEW_KEYS[section])}
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <div className="-mx-4 -mb-4 flex justify-end gap-2 border-t border-[color:var(--color-divider)] px-4 py-3">
            <Button variant="ghost" className="atlas-touch-floor" onClick={closeNewPage}>
              {t("wiki.newPageCancel")}
            </Button>
            <Button
              data-testid="library-new-page-make"
              type="submit"
              className="atlas-touch-floor"
              disabled={busy || newPageCreating || newPageTitle.trim() === ""}
            >
              {t("wiki.newPageCreate")}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  ) : null;

  return (
    <section data-testid="library-wiki" className={cn("flex flex-col pb-1", searchHost ? "pt-1.5" : "pt-3")}>
      {searchHost && searchField ? createPortal(searchField, searchHost) : searchField}
      {agentNotice ? (
        /*
         * No agent on this computer: the two dead doors become one notice ending in the door
         * (`AgentMissingNotice`). While runtimes are still being detected the doors stay drawn.
         */
        <AgentMissingNotice id={SECTION_ACTIONS_NOTE_ID} className="mx-3 mb-2" t={t} />
      ) : null}
      <SectionActions>
        {agentNotice ? null : <>
        {/* Reading before writing, both drawn whether or not they can run: Check page format left, Ask the
           agent to compile right, the geometry `library-lint-dock.spec.ts` measures. The picker is a third
           cell and spans the row. */}
        <Tooltip content={t("wiki.lintTooltip")} {...INDEX_CHIP_TIP}>
          <Chip
            data-testid="library-lint"
            onClick={onLint ?? undefined}
            disabled={busy || onLint === null || model.wikiPages.length < 2}
            aria-describedby={onLint === null && actionsNote ? SECTION_ACTIONS_NOTE_ID : undefined}
            tone="muted"
            className={`w-full justify-start ${AGENT_DOOR_SPAN} hover:text-[color:var(--color-text-primary)]`}
          >
            <IndexGlyph><Stethoscope size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
            <span className="min-w-0 truncate">{t("wiki.lint")}</span>
          </Chip>
        </Tooltip>
        <Tooltip content={t("wiki.compileTooltip")} {...INDEX_CHIP_TIP}>
          <Chip
            data-testid="library-compile"
            onClick={onCompile ?? undefined}
            disabled={busy || onCompile === null || model.needsCompileCount === 0}
            aria-describedby={
              onCompile === null && actionsNote ? SECTION_ACTIONS_NOTE_ID : undefined
            }
            tone="muted"
            className={`w-full justify-start ${AGENT_DOOR_SPAN} hover:text-[color:var(--color-text-primary)]`}
          >
            <IndexGlyph><Sparkles size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
            <span className="min-w-0 truncate">{t("wiki.compile")}</span>
          </Chip>
        </Tooltip>
        {brainControl ? (
          <span data-testid="library-brain-control" className="min-w-0">
            {brainControl}
          </span>
        ) : null}
        </>}
      </SectionActions>

      {/* One line under the group is the reason: `actionsNote`, printed here only while the landing is not
         drawn, else the web's degradation sentence (`.claude/rules/surfaces.md`). One slot prints one
         reason or none. */}
      {agentNotice ? null : actionsNote ? (
        <p
          id={SECTION_ACTIONS_NOTE_ID}
          data-testid="library-actions-blocked"
          className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {actionsNote}
        </p>
      ) : onCompile === null && !inApp ? (
        <p
          data-testid="library-compile-web-limit"
          className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("wiki.compileWebLimit")}{" "}
          {/* Accent, not the sentence's grey, so Get the app does not read as more words of the note; the
             Rounds tab's door to the same page wears this tone. */}
          <Link
            href="/download"
            data-testid="library-compile-web-get-app"
            className={controlClass({
              shape: "link",
              tone: "accent",
              hoverInk: "strong",
              className: "rounded-chip px-1.5 py-0.5",
            })}
          >
            {t("wiki.compileWebGetApp")}
          </Link>
        </p>
      ) : null}

      {report ? (
        /* The index's one line about the check: where its answer is, and how much it holds.
           A row, not a door — pressing it opens a page, it starts nothing. */
        <div className={`${INDEX_LIST_INSET} pb-1`}>
          <RowButton
            data-testid="library-open-report"
            active={report.open}
            aria-current={report.open ? "page" : undefined}
            data-report-state={report.running ? "running" : report.unseen ? "unseen" : undefined}
            onClick={report.onOpen}
            hoverSurface="lift"
            hoverInk="strong"
            className={cn("relative", INDEX_ROW_INSET, report.open && "bg-[color:var(--color-indigo-a16)]")}
          >
            {report.open ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-1 left-0 w-[2px] rounded-full bg-[color:var(--color-indigo-accent)]"
              />
            ) : null}
            <IndexGlyph><Stethoscope size={ICON_SIZE.sm} className="opacity-60" aria-hidden /></IndexGlyph>
            <span className="min-w-0 flex-1 truncate">
              {report.count > 0 ? t("report.open", { count: report.count }) : t("report.title")}
            </span>
            {/* `aria-live` sits on the running word, not the row, so a live label does not re-announce the count
               on every poll. The mark is the inline micro form, since a full-size mark would displace the cards
               below. */}
            {report.running ? (
              <span
                data-testid="library-report-running"
                className="relative flex size-3.5 flex-none items-center"
              >
                <BrandMark
                  detail="micro"
                  alt=""
                  aria-hidden
                  className="atlas-inline-waiting-mark absolute left-1/2 top-1/2 size-4 max-w-none -translate-x-1/2 -translate-y-1/2"
                />
                <span aria-live="polite" className="sr-only">
                  {t("report.running")}
                </span>
              </span>
            ) : report.unseen ? (
              /* A dot, not a word: the row already carries the count, and the one thing
                 this mark adds is "you have not seen this yet". */
              <span data-testid="library-report-unseen" className="flex flex-none items-center">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-[color:var(--color-indigo-brand)]"
                />
                <span className="sr-only">{t("report.unseen")}</span>
              </span>
            ) : null}
          </RowButton>
        </div>
      ) : null}
      {hasWiki ? (
        <>
          {/*
            **The shelf is the resting state; a search is a list.** A shelf is a picture of
            a folder — equal heights, freshness on every spine, comparable at a glance. A
            search result is a ranked answer to a question a person just typed, and an
            answer reads down a column, not across a row of vertical books.
          */}
          {needle ? (
          <ul
            data-testid="library-wiki-list"
            aria-label={t("wiki.listAria")}
            className={`flex flex-col gap-0.5 ${INDEX_LIST_INSET}`}
          >
            {visiblePages.map((page) => {
              const active = page.slug === selectedSlug;
              const verdict = model.verdicts.get(page.slug);
              /*
               * Two kinds of finding, drawn two ways: a page missing the template wears the amber pill because the
               * fix is in its own bytes; folder findings a person can act on are a quiet word. Advisory kinds like
               * `orphan-page` stay in the report (`mergeWikiVerdict`).
               */
              const problems = verdict?.problems ?? [];
              const ownProblem = problems.find((problem) => !isWikiFolderCode(problem.code));
              const folderProblem = problems.find(
                (problem) => isWikiFolderCode(problem.code) && !isAdvisoryWikiCode(problem.code),
              );
              const reason = verdict && problems.length > 0 && verdict.firstProblem
                ? t("wiki.offTemplateReason", { code: verdict.firstProblem })
                : undefined;
              return (
                <li key={page.slug}>
                  <RowButton
                    active={active}
                    aria-current={active ? "true" : undefined}
                    data-testid={`library-wiki-${page.slug}`}
                    onClick={() => onSelect(page.slug)}
                    /*
                     * The pill says one fixed word; **which** rule the page missed lives
                     * here until the page's own block carries it on screen.
                     * `aria-description` rather than a bare title: a screen reader
                     * announces it with the row, so the reason is not reachable only by
                     * a pointer that hovers.
                     */
                    aria-description={reason}
                    title={reason}
                    hoverSurface="lift"
                    hoverInk="strong"
                    className={cn("group relative", INDEX_ROW_INSET, active && "bg-[color:var(--color-indigo-a16)]")}
                  >
                    <IndexGlyph><BookText size={ICON_SIZE.sm} className="opacity-60" aria-hidden /></IndexGlyph>
                    <span className="min-w-0 flex-1 truncate">{page.title}</span>
                    {model.answerVersions?.get(page.slug) ? <span className="flex-none text-caption text-[color:var(--color-text-secondary)]">{t(`answers.version.${model.answerVersions.get(page.slug)}`)}</span> : null}
                    {(page.createdBy ?? "") !== majorityWriter ? (
                      <span
                        data-testid="library-wiki-writer"
                        className="flex-none text-caption text-[color:var(--color-text-quaternary)]"
                      >
                        {writerLabel(page.createdBy, t)}
                      </span>
                    ) : null}
                    {folderProblem ? (
                      <span
                        data-testid="library-wiki-folder-mark"
                        title={folderProblem.message}
                        className="flex-none text-caption text-[color:var(--color-text-quaternary)]"
                      >
                        {t("wiki.folderMark")}
                      </span>
                    ) : null}
                    {ownProblem ? (
                      <StateBadge tone="warning" testId="library-wiki-off-template">
                        {t("wiki.offTemplate")}
                      </StateBadge>
                    ) : null}
                  </RowButton>
                </li>
              );
            })}
            {newPageControl ? <li>{newPageControl}</li> : null}
          </ul>
          ) : (
            <LibraryShelf
              model={model}
              pages={visiblePages}
              selectedSlug={selectedSlug}
              onSelect={onSelect}
              majorityWriter={majorityWriter}
              compiling={compiling}
              trailing={newPageControl}
              t={t}
            />
          )}
          {/* The same count the rows draw and the header strip prints: `offTemplateCount` includes a dangling
             link, which this list marks with a quiet word rather than the amber pill. */}
          {/* The same rule as the sources half: a count still being read is not an answer. */}
          {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length > 0 ? (
            <ListNote testId="library-search-other-half-note">
              <OtherHalf count={visibleSources.length} segment="sources" t={t} />
            </ListNote>
          ) : null}
          {/* Both halves empty: the same sentence the sources half prints, for the same reason. */}
          {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length === 0 ? (
            <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
          ) : null}
          {/* No off-template count under a resting shelf: the header strip and each card already say it. Under
             a search the rows are a subset, so the count stays (see `offTemplateRows`). */}
          {needle && offTemplateRows > 0 ? (
            <ListNote testId="library-off-template-count">
              {t("wiki.offTemplateCount", { count: offTemplateRows })}
            </ListNote>
          ) : null}
        </>
      ) : (
        <>
          <p
            data-testid="library-wiki-empty"
            className="px-3 pb-1 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
          >
            {needle && visibleSources.length > 0 ? (
              <OtherHalf count={visibleSources.length} segment="sources" t={t} />
            ) : hasWikiTemplate ? (
              t("wiki.empty")
            ) : (
              t("wiki.emptyNoTemplate")
            )}
          </p>
          {/* A hand-written page keeps its door on an empty wiki, where the list's last row would not be drawn.
             `buildHumanPage` carries the shape, so it works with or without `wiki/_template.md`. */}
          {newPageControl ? <div className={`${INDEX_LIST_INSET} pb-1`}>{newPageControl}</div> : null}
        </>
      )}

    </section>
  );
}
