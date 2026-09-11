"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { BookText, Check, CloudDownload, FilePlus2, FileText, PencilLine, Search, Sparkles, Stethoscope } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { writerLabel } from "../../lib/writer-label";
import { controlClass } from "@/shared/ui/control-class";
import { Chip, RowButton, Tooltip } from "@/shared/ui";
import { BrandWaitingMark } from "@/shared/ui/brand-waiting-mark";
import { Input } from "@/shared/ui/input";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import {
  readLibraryIndexQuery,
  writeLibraryIndexQuery,
  writeLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/appearance-preferences";

import { isAdvisoryWikiCode, isWikiFolderCode } from "../../lib/merge-wiki-verdict";
import { captionWindow } from "../../lib/caption-window";
import { passageLabelText } from "../../lib/passage-label";
import { useSourceSearch } from "../../lib/use-source-search";
import { LibraryShelf } from "./LibraryShelf";
import { StateBadge } from "./StateBadge";
import { libraryWaitingLine } from "../../lib/stage-steps";
import type { LibraryUiModel } from "../../lib/use-library-model";

/**
 * The library's index: **Sources** or **Wiki**, one of them at a time.
 *
 * A vault holds three kinds of file and only one is the graph (`docs/DECISIONS.md`,
 * 2026-09-05). Docs draws the third kind; this column draws the other two, in the order of
 * the work — what a person brought in, then what was made of it.
 *
 * ## Why it is a switch and not a scroll (owner, 2026-09-07)
 *
 * > *"I hate this structure: sources on top, wiki underneath, one long scroll. A switch at
 * > the top is better."*
 *
 * The stacking survived two redesigns. On 2026-09-06 the two lists stopped owning separate
 * overflows and became one scroller with sticky heads, which fixed the cut rows; it did not
 * fix what the owner was actually reading, because a folder of seven sources and seven
 * pages is still 14 rows plus two heads plus five chips plus three captions in a 280px
 * column — measured on the installed app, reaching the wiki list meant scrolling past
 * everything about sources, and the Compile press was off screen from the source rows it
 * acts on.
 *
 * So the column names both lists once, with their counts, in one segmented control at its
 * top (`LibraryPage` draws it) and this file draws **one** of them. Nothing about the
 * inactive list is rendered — not its rows, not its head, not its doors — so the column's
 * whole height belongs to the list a person chose, and the doors on screen are the ones
 * that act on it.
 *
 * ⚠️ **The section head lost its label row.** With the switch naming the list and its
 * count directly above, an eyebrow repeating *SOURCES · 7* under a segment reading
 * *Sources 7* is the same fact twice in 28px. What stays is the actions row, because the
 * doors are not named anywhere else.
 *
 * ⚠️ This also retires the `lg` / below-`lg` split. The narrow layout had already been
 * forced onto one scroller in 2026-09-06 (two lists in half a phone measured 30px and
 * **zero**); the switch is the same answer at every width, which is one answer instead of
 * two.
 *
 * **Sources is the only list here whose rows are not documents.** A row is a file Atlas
 * has never opened: its name, its format, its size, and one word about whether anybody has
 * written it up. That last word is the whole reason the section exists — a folder of PDFs
 * with no state is a folder of PDFs.
 *
 * | State | Means | How it is drawn |
 * |---|---|---|
 * | not compiled | no wiki page cites it | a quiet chip: it is work still to do |
 * | compiled | a page cites it and its sha256 still matches | a **check**, no chip |
 * | stale | the hashes disagree, or a page cites it with no hash | an amber chip: it needs attention |
 * | checking | cited, hash recorded, not yet measured | a quiet word; a claim nothing has verified is not shown as verified |
 *
 * ⚠️ **`compiled` lost its chip on 2026-09-06** and that is the point of the table. It
 * carried the success tone, and on the owner's folder every one of seven rows wore the
 * same green pill — a badge that never varies is not a state, it is a texture, and it was
 * the loudest thing in the column. A chip is now spent only where a person can act:
 * stale, off-template, not yet written up. Success is a check in the row's own ink.
 */

/** Candidate rows drawn before the list folds; the rail's height at 14 inches fits five with the wiki list above. */

export interface LibrarySectionProps {
  model: LibraryUiModel;
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
  /**
   * The source the reader is showing, if any.
   *
   * Measured 2026-09-06 (design-interaction): a selected source row was byte-identical to
   * a resting one — same ink, no fill, no `aria-current` — while the reader beside it was
   * showing that very file.
   */
  selectedSourcePath: string | null;
  /**
   * The anchor the reader is standing on, when the pane was opened at one.
   *
   * The row above says *this file is open*; this says *this passage is open*, which is a
   * different fact and the caption's own. Without it a caption would light up for a file
   * somebody opened plainly, marking a place nobody went to (design-interaction, council
   * 2026-09-11).
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
  /** Proposes candidates from the open folder and any bound project root. */
  onFindDocuments: () => void;
  /**
   * The third door: **documents that are not on this computer yet.**
   *
   * Owner, 2026-09-07: *"connecting a service is mostly for the Library anyway — people want the
   * things they already wrote somewhere else."* Add files and Find documents both assume the
   * document is already on disk, and for a person whose notes live in Notion neither one is a
   * door at all. It sits third because it is the one that reaches outside.
   */
  onImportFromService: () => void;
  /** Starts one in-app agent turn that writes the pages. Absent when no agent can run. */
  onCompile: (() => void) | null;
  /** Starts the report-only health check; null where no agent can run, like Compile. */
  onLint: (() => void) | null;
  /**
   * Why the check cannot run here. Given, the chip is drawn **disabled beside its reason**
   * rather than removed: a feature the product has is always on screen, and availability
   * is a state with its reason (`docs/DECISIONS.md` 2026-09-11). Slice 1 applied that rule
   * on the landing; this column and the report page still hid the chip entirely, so on a
   * no-agent route two of the three places the product offers the check said nothing at
   * all (measured 2026-09-12).
   */
  lintBlockedReason?: string | null;
  /** Names the last check found with no page of their own — offered as ontology node candidates. */
  /** What the last check found under its first three categories, each with a door to fix it. */
  /** Starts one agent turn that proposes the candidate through the ontology-write card; null like the others. */
  /** Whether `wiki/_template.md` exists: without it the empty state says how to get one. */
  hasWikiTemplate?: boolean;
  /** How an agent's wiki page write is handled: lands when it fits, or asks each time. */
  /** Files the last answer the agent gave as a wiki page; null when there is none. */
  /** Starts a page a person writes by hand, from a title. Null where the folder cannot be written. */
  onNewPage?: ((title: string) => void) | null;
  /**
   * The Check results page: how many findings and names it holds, whether it is the open
   * page, and the press that opens it. The row is the index's one line about the check,
   * and it must survive a page being open, which the canvas header does not (design-lead,
   * council 2026-09-07).
   *
   * ⚠️ **No longer null on an unchecked wiki.** It used to be, because every row on that
   * page came from an agent turn — so a person with no agent reached no door, and the one
   * screen that could have shown them their folder's own structural findings was
   * unreachable (measured 2026-09-12). Half the report is now computed from the folder, so
   * the door is open whenever there is a wiki to report on.
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
   * **One caption under the Compile button, and only one** (2026-09-06).
   *
   * The column used to end with the transfer sentence, pinned under a cut-off list, three
   * hundred pixels from the button it described. The rule that replaces it is the one
   * `.claude/rules/local-first.md` actually asks for: the disclosure sits where Compile can
   * be pressed. So this slot carries whichever single fact is true of pressing it here —
   * the reason it cannot run, or what leaves this computer when it does — and it is empty
   * while the guide is open, because step two is then the surface a person is reading and
   * exactly one of the two may print it.
   */
  compileNote: string | null;
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
 * **The doors, and nothing that repeats the switch** (2026-09-05, 2026-09-06, 2026-09-07).
 *
 * The first build put the label and both action chips on one row. At the column's 280px
 * the two chips took the width and the eyebrow truncated to `SO…` — the section lost its
 * name to its buttons. Actions therefore sat on a second row under a `sticky` eyebrow.
 *
 * The eyebrow is gone with the stacking (2026-09-07). The segmented control at the top of
 * the column is the head now: it names the list and carries its count, it is the control a
 * person just pressed to get here, and it does not scroll away, so a second head 28px under
 * it printed the same fact twice and spent the height on it. `sticky` goes with it — there
 * is nothing left to pin.
 */
/**
 * A search whose matches all sit on the other half of the switch used to end in an empty
 * list under a line that counted them — "sources 0 · pages 6" over nothing (browser
 * walkthrough, 2026-09-07). The list names where the matches are and switches there.
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
        /* Accent, not muted: in a quaternary caption a muted link read as more caption
           (browser walkthrough, 2026-09-07), and this is the one way out of the dead end. */
        className={controlClass({ shape: "link", size: "sm", tone: "accent", hoverInk: "strong", className: "atlas-touch-floor" })}
      >
        {t(segment === "wiki" ? "search.showPages" : "search.showSources", { count })}
      </button>
    </>
  );
}

function SectionActions({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <div className="flex flex-wrap items-center gap-1 px-3 pb-2">{children}</div>;
}

/** The log's ISO stamp as a person reads it; the raw stamp when it does not parse. */

/**
 * How long the search reads before the screen says it is reading.
 *
 * Not a motion value and not a CSS one — it is the threshold under which a state is a
 * flicker rather than a message. 34 ms is what the day-one folder measures end to end
 * (design-interaction, council 2026-09-11), so anything near it would flash. Pinned by
 * `LibrarySection.search.test.tsx`.
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
  selectedSlug,
  onSelect,
  onOpenSource,
  selectedSourcePath,
  selectedSourceAnchor = null,
  sourceHandles,
  vaultScope,
  onAddFiles,
  onFindDocuments,
  onImportFromService,
  onCompile,
  onLint,
  hasWikiTemplate = true,
  onNewPage = null,
  lintBlockedReason = null,
  report = null,
  brainControl,
  compileNote,
  segment,
  busy,
  compiling = false,
  t,
}: LibrarySectionProps) {
  /*
   * A long candidate list pushed the wiki pages off the rail (installed app, 2026-09-07:
   * ten names). Five rows show — the map kinds first, since those carry the one door
   * this list has — and the rest fold behind a count a person can open.
   */
  /*
   * One search over both lists (owner direction 2026-09-07; the LLM Wiki pattern reaches
   * for a search tool once the folder grows). The headers keep the folder's totals; the
   * line under the field says what matched.
   *
   * ⚠️ **A source used to match on its path and nothing else** — the whole of slice U2's
   * first decision. Measured 2026-09-11 on a six-file folder with no agent: "T+2" found
   * nothing, though `sources/settlement-policy.md` says it on line 11 and
   * `sources/fee-schedule.csv` says it in three records. The wiki half had always matched
   * page *text*, because the Library already holds those bodies for the contract check;
   * the sources half had no text to hold, and now reads it — on the keystroke, per file,
   * kept for the session only. `use-source-search.ts` owns that read and every
   * local-first clause it has to satisfy.
   */
  /*
   * **The field comes back holding what was typed** (design-interaction, council
   * 2026-09-11). U2's whole point is the door beside a blocked step; measured on the
   * day-one folder, taking that door and returning through the rail left this field empty,
   * so the person paid for the trip with a retype — and on a capped folder with a second
   * read of every file. `appearance-preferences.ts` owns the slot and the reasons it is
   * scoped to the folder and lives in session storage.
   */
  const [query, setQuery] = useState(() => readLibraryIndexQuery(vaultScope));
  const changeQuery = (next: string) => {
    setQuery(next);
    writeLibraryIndexQuery(vaultScope, next);
  };
  const needle = query.trim().toLowerCase();
  const matches = (text: string | null | undefined) => (text ?? "").toLowerCase().includes(needle);
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
   * ⚠️ **An unread row stays until its own read says otherwise** (design-lead, council
   * 2026-09-11). Filtering on `matches || hits` alone drops every row the search has not
   * opened yet, so on the 200-file folder the column stood **empty for most of a second**
   * while the line counted `1/200` — "nothing found" printed before "still reading", which
   * is the one sentence this search exists to avoid. While the phase is `reading` a row
   * whose file has not been read is neither a match nor a miss, so it is still shown and
   * the list *narrows* as the reads land.
   */
  const visibleSources = needle
    ? model.sources.filter(
        (row) =>
          matches(row.path) ||
          search.hits.has(row.path) ||
          (search.phase === "reading" && !search.read.has(row.path)),
      )
    : model.sources;
  const visiblePages = needle
    ? model.wikiPages.filter((page) => matches(page.title) || matches(model.pageTexts.get(page.slug)))
    : model.wikiPages;
  /*
   * The writer label prints on the rows that are the exception. On a folder where nine
   * of ten pages say Claude, nine identical labels are texture and the one that says a
   * person is the fact (design-lead, council 2026-09-07) — so the majority writer is
   * silent and every other writer is named. Two writers tied print both.
   */
  const majorityWriter = (() => {
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
  })();
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const hasSources = model.sources.length > 0;
  const hasWiki = model.wikiPages.length > 0;
  /** What is still waiting, in words — the same line step two's caption prints. */
  const waitingLine = libraryWaitingLine(model, t);
  /** Pages whose **own** shape misses the template — the rows that wear the amber pill. */
  const offTemplateRows = [...model.verdicts.values()].filter((verdict) =>
    verdict.problems.some((problem) => !isWikiFolderCode(problem.code)),
  ).length;

  /*
   * One field, both halves (2026-09-07): it filters whichever list the switch shows, on
   * path, title, page text and — since slice U2 — source text.
   *
   * **The count is provisional while files are still arriving, and says so.** A folder
   * mid-read would otherwise report "0 sources matched" for files it has not opened yet,
   * which is the difference between *not there* and *not read yet* printed as if it were
   * the same fact. The reading line replaces the count rather than sitting beside it,
   * because two numbers under one field is the reader counting instead of reading.
   *
   * **The cap is named where it binds.** 200 files / 20 MB, decided from the listing's
   * own sizes before any byte is read; past it the line says how many were read rather
   * than letting a silent truncation read as "everything".
   */
  const searchField =
    model.sources.length + model.wikiPages.length > 0 ? (
      <div className="flex flex-none flex-col gap-1 px-3 pb-2">
        <Input
          data-testid="library-search"
          size="sm"
          type="search"
          aria-label={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          value={query}
          onChange={(event) => changeQuery(event.target.value)}
        />
        {/*
         * ⚠️ **The line is always here, even when it says nothing.** It used to appear on
         * the first keystroke, and appearing is a layout event: measured on the day-one
         * folder, the first character pushed the whole index list **18–19px down under the
         * pointer** — the field's `gap-1` plus one caption line — so the row somebody was
         * about to press moved as they typed (design-interaction, council 2026-09-11). One
         * line is reserved at rest instead, through the same `--leading-caption` this text
         * is set in, and the list never moves.
         */}
        <p
          data-testid="library-search-matches"
          data-phase={search.phase}
          data-reading-shown={readingShown ? "true" : "false"}
          /* Polite, not assertive: the count settling as files land is progress a
             screen reader should hear once it has, not on every published file. */
          aria-live="polite"
          className="min-h-[var(--leading-caption)] text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
        >
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
            className="text-caption text-[color:var(--color-text-quaternary)] [word-break:keep-all]"
          >
            {t("search.capped", { count: search.plannedCount })}
          </p>
        ) : null}
      </div>
    ) : null;

  if (segment === "sources") {
    return (
      /* No `min-h-0` and no overflow: the column above owns the one scroller, and a
         section that could shrink is a section that can cut a row in half. */
      <section data-testid="library-sources" className="flex flex-col pb-1 pt-3">
        {searchField}
        <SectionActions>
          <Tooltip content={t("sources.addTooltip")}>
            <Chip
              data-testid="library-add-files"
              onClick={onAddFiles}
              disabled={busy}
              tone="muted"
              className="flex-none hover:text-[color:var(--color-text-primary)]"
              aria-label={t("sources.addTooltip")}
            >
              <FilePlus2 size={ICON_SIZE.sm} aria-hidden />
              <span className="min-w-0 truncate">{t("sources.add")}</span>
            </Chip>
          </Tooltip>
          <Tooltip content={t("sources.findTooltip")}>
            <Chip
              data-testid="library-find-documents"
              onClick={onFindDocuments}
              disabled={busy}
              tone="muted"
              className="flex-none hover:text-[color:var(--color-text-primary)]"
              aria-label={t("sources.findTooltip")}
            >
              <Search size={ICON_SIZE.sm} aria-hidden />
              <span className="min-w-0 truncate">{t("sources.find")}</span>
            </Chip>
          </Tooltip>
          <Tooltip content={t("sources.importTooltip")}>
            <Chip
              data-testid="library-import-open"
              onClick={onImportFromService}
              disabled={busy}
              tone="muted"
              className="flex-none hover:text-[color:var(--color-text-primary)]"
              aria-label={t("sources.importTooltip")}
            >
              <CloudDownload size={ICON_SIZE.sm} aria-hidden />
              <span className="min-w-0 truncate">{t("sources.import")}</span>
            </Chip>
          </Tooltip>
        </SectionActions>

        {hasSources ? (
          <>
            <ul
              data-testid="library-source-list"
              /* The list says which phase drew it, so a proof can assert that a finished
                 answer and an unfinished read never share a frame. */
              data-phase={search.phase}
              aria-label={t("sources.listAria")}
              className="flex flex-col gap-0.5 px-2"
            >
              {visibleSources.map((row) => {
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
                      onClick={() => onOpenSource(row)}
                      // The full name first: a 280px column truncates, and the row's own
                      // hover text is the only place the rest of the name exists.
                      title={`${row.name}\n${t(`sources.state.${row.state}.hint`, {
                        pages: row.citedBy.join(", ") || t("sources.state.nobody"),
                      })}`}
                      className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                    >
                      {/* The same leading glyph the tree, pinned and recent rows carry, so
                          the sidebar keeps one left edge from top to bottom. */}
                      <FileText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                      {/* Format and size are the two facts a directory listing already
                          holds, and the reason the row can exist without opening the file. */}
                      <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
                        {row.format ? row.format.toUpperCase() : t("sources.noFormat")} ·{" "}
                        {formatSourceBytes(row.bytes)}
                      </span>
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
                        <span
                          data-testid="library-source-state-checking"
                          className="flex-none text-caption text-[color:var(--color-text-quaternary)]"
                        >
                          {stateLabel}
                        </span>
                      ) : (
                        /*
                         * ⚠️ **Amber marks a row to act on, not a page that is wrong**
                         * (owner, 2026-09-07). `partial` shipped in the quiet border on the
                         * reasoning that the page is right about everything it says — but
                         * the shelf counts it with the waiting sources and Compile will act
                         * on it, and a neutral chip on such a row reads as *nothing to do*.
                         * So it wears the amber `stale` wears, and the two are told apart
                         * by their words (`read in part` against `stale`), which is the
                         * fact rather than a temperature. `not-compiled` keeps the quiet
                         * border: nothing is wrong there and nobody has started.
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
                       * **The passage the search found, under the row that holds it.**
                       *
                       * It is a press of its own rather than part of the row above,
                       * because the two go to different places: the row opens the file,
                       * this opens the file *at this unit* — U1's passage section, reached
                       * through the same `{path, anchor}` a citation press sends. Two
                       * destinations inside one button would be one of them lost.
                       *
                       * `text-label`, not `text-caption` (chief's build note, and the
                       * 2026-08-09 finding `.claude/rules/design.md` records): these are
                       * the document's own words and a person has to read them, which
                       * 9.5px is documented as being the wrong size for. The row's name
                       * stays the row's winner — this is one ink step back and indented
                       * under it.
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
                          /*
                           * The floor, because this is a control and rests at 28px while
                           * the rows above it are 36 — under a finger the two are not the
                           * same target (design-responsive, council 2026-09-11).
                           */
                          className: "atlas-touch-floor w-full pl-7 text-label",
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
            {/*
             * ⚠️ **Not while the reading is unfinished.** This note is a finished answer —
             * *nothing here, they are all on the other list* — and printing it under a line
             * that says `0/6` states a conclusion the search has not reached
             * (design-interaction, council 2026-09-11).
             */}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length > 0 ? (
              <ListNote testId="library-search-other-half-note">
                <OtherHalf count={visiblePages.length} segment="wiki" t={t} />
              </ListNote>
            ) : null}
            {waitingLine ? (
              <ListNote testId="library-needs-compile">{waitingLine}</ListNote>
            ) : null}
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
   * A page a person writes by hand is the list's own last row, not a door beside the two
   * agent turns (council 2026-09-07): a hand action on the list, drawn in the list's
   * grammar, with its own glyph — `FilePlus2` already means "add a file" one switch away
   * and "file the answer" in the dock. It is hoisted here because the list has two shapes
   * now — a shelf at rest, rows while searching — and one control cannot be written twice.
   */
  const newPageControl = onNewPage ? (
    newPageOpen ? (
      <span
        id="library-new-page-row"
        data-testid="library-new-page-row"
        className="flex min-w-0 items-center gap-1 px-1 py-1"
        onKeyDown={(event) => {
          // The row owns Escape: pressed on the Make chip it must not reach the page
          // handler, which would close the open document instead of this row.
          if (event.key === "Escape") {
            event.stopPropagation();
            setNewPageOpen(false);
          }
        }}
      >
        <Input
          data-testid="library-new-page-title"
          size="sm"
          aria-label={t("wiki.newPageTitle")}
          placeholder={t("wiki.newPageTitle")}
          value={newPageTitle}
          autoFocus
          onChange={(event) => setNewPageTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && newPageTitle.trim()) {
              onNewPage(newPageTitle.trim());
              setNewPageTitle("");
              setNewPageOpen(false);
            }
          }}
          className="min-w-0 flex-1"
        />
        <Chip
          data-testid="library-new-page-make"
          tone="muted"
          disabled={busy || newPageTitle.trim() === ""}
          onClick={() => {
            onNewPage(newPageTitle.trim());
            setNewPageTitle("");
            setNewPageOpen(false);
          }}
        >
          {t("wiki.newPageMake")}
        </Chip>
      </span>
    ) : (
      <RowButton
        data-testid="library-new-page"
        onClick={() => setNewPageOpen(true)}
        disabled={busy}
        aria-expanded={false}
        aria-controls="library-new-page-row"
        title={t("wiki.newPageTooltip")}
        className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
      >
        <PencilLine size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t("wiki.newPage")}</span>
      </RowButton>
    )
  ) : null;

  return (
    <section data-testid="library-wiki" className="flex flex-col pb-1 pt-3">
      {searchField}
      <SectionActions>
        {onCompile || onLint || lintBlockedReason ? (
          <>
            {/*
              **The two doors share one line, reading before writing.** The span does not
              wrap, so `Check the wiki` and `Compile` stay on the same row at 280px and the
              check is to the left — the order of the work, and the geometry
              `library-lint-dock.spec.ts` measures. The picker below may take a line of its
              own; it is what the press will run on, not a third door.
            */}
            <span className="flex min-w-0 items-center gap-1">
              {onLint || lintBlockedReason ? (
                // The judgement half of the health check: what `wiki-validate` cannot
                // decide (two pages disagreeing, a claim a later page replaced). Report
                // only, so it needs no page count to be worth pressing — one page has
                // nothing to disagree with, hence two. Drawn disabled with its reason in
                // the tooltip where no agent can run it, so the column names every door
                // the product has.
                <Tooltip content={onLint ? t("wiki.lintTooltip") : (lintBlockedReason ?? t("wiki.lintTooltip"))}>
                  <Chip
                    data-testid="library-lint"
                    onClick={onLint ?? undefined}
                    disabled={busy || onLint === null || model.wikiPages.length < 2}
                    tone="muted"
                    className="flex-none hover:text-[color:var(--color-text-primary)]"
                    aria-label={t("wiki.lint")}
                  >
                    <Stethoscope size={ICON_SIZE.sm} aria-hidden />
                    <span className="min-w-0 truncate">{t("wiki.lint")}</span>
                  </Chip>
                </Tooltip>
              ) : null}
              {onCompile ? (
                <Tooltip content={t("wiki.compileTooltip")}>
                  <Chip
                    data-testid="library-compile"
                    onClick={onCompile}
                    disabled={busy || model.needsCompileCount === 0}
                    tone="muted"
                    className="flex-none hover:text-[color:var(--color-text-primary)]"
                    aria-label={t("wiki.compile")}
                  >
                    <Sparkles size={ICON_SIZE.sm} aria-hidden />
                    <span className="min-w-0 truncate">{t("wiki.compile")}</span>
                  </Chip>
                </Tooltip>
              ) : null}
            </span>
            {/* The picker is what the buttons beside it will run on; a control on its own
                row reads as a setting rather than as part of the press. */}
            {brainControl ? (
              <span data-testid="library-brain-control" className="min-w-[9rem] flex-auto">
                {brainControl}
              </span>
            ) : null}
          </>
        ) : null}
      </SectionActions>

      {/*
        **Compile is app-only, so the web says so instead of describing it.** The
        degradation grammar in `.claude/rules/surfaces.md`: why it is unavailable, where
        it works, and what still works here (the pages read and edit exactly as they do
        in the app). It is the same slot as `compileNote`, and only one can be true.
      */}

      {onCompile === null ? (
        <p
          data-testid="library-compile-web-limit"
          className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("wiki.compileWebLimit")}{" "}
          <Link
            href="/download"
            data-testid="library-compile-web-get-app"
            className={controlClass({
              shape: "link",
              hoverInk: "strong",
              className: "rounded-chip px-1.5 py-0.5",
            })}
          >
            {t("wiki.compileWebGetApp")}
          </Link>
        </p>
      ) : compileNote ? (
        <p
          data-testid="library-transfer"
          className="px-3 pb-1 text-label leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all] [overflow-wrap:anywhere]"
        >
          {compileNote}
        </p>
      ) : null}

      {report ? (
        /*
         * The index's one line about the check: where its answer is, and how much it holds.
         * A row, not a door — pressing it opens a page, it starts nothing.
         *
         * **Three states, because the row is the only thing on screen that can carry them**
         * (owner, 2026-09-12). A check runs in the dock, and a person who started one and
         * went back to reading had nothing telling them it was still going or that it had
         * finished. So: *running* is announced live while the turn is in flight; *unseen*
         * marks a finished check this person has not opened yet and clears when they do;
         * and the count itself is the app's own half plus the agent's, so it moves on every
         * open without anybody pressing anything.
         */
        <div className="px-2 pb-1">
          <RowButton
            data-testid="library-open-report"
            active={report.open}
            aria-current={report.open ? "page" : undefined}
            data-report-state={report.running ? "running" : report.unseen ? "unseen" : undefined}
            onClick={report.onOpen}
            className="hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
          >
            <Stethoscope size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              {report.count > 0 ? t("report.open", { count: report.count }) : t("report.title")}
            </span>
            {/*
              `aria-live` on the running word, not on the row: a row whose label is live
              would re-announce the count every time the folder polls. `BrandWaitingMark`
              is the app's own running mark, so a check reads like every other wait.
            */}
            {report.running ? (
              <span
                data-testid="library-report-running"
                className="flex flex-none items-center"
              >
                <BrandWaitingMark active />
                <span aria-live="polite" className="sr-only">
                  {t("report.running")}
                </span>
              </span>
            ) : report.unseen ? (
              /* A dot, not a word: the row already carries the count, and the one thing
                 this mark adds is "you have not seen this yet". Indigo is the app's own
                 attention tone, and the word behind it is what a screen reader is told. */
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
            className="flex flex-col gap-0.5 px-2"
          >
            {visiblePages.map((page) => {
              const active = page.slug === selectedSlug;
              const verdict = model.verdicts.get(page.slug);
              /*
               * **Two kinds of finding, drawn two ways** (2026-09-07). A page that misses
               * the wiki template wears the amber pill it always has: the fix is in that
               * page's own bytes. A folder finding — a link that goes nowhere, a page
               * nothing links to, a shared source neither page links across — is about
               * where the page sits, and on a young wiki it is true of nearly every row.
               * A pill on every row is the texture the `compiled` badge was removed for
               * one list up, so it is a quiet word instead, and the header strip carries
               * the count once.
               *
               * ⚠️ **Only the folder findings a person can act on reach the row.** With
               * the advisory ones drawn too, the owner's seven-page folder wore the word
               * seven times (measured 2026-09-07) — `orphan-page` is true of every page
               * on a wiki whose pages have not been linked yet, which is the reason
               * `mergeWikiVerdict` already refuses to let it flip `ok`. Those reach a
               * person through the Check-the-wiki report instead, where a judgement
               * about the whole wiki belongs.
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
                    className="group relative hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]"
                  >
                    <BookText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
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
          {/*
            The same count the rows draw and the header strip prints. `offTemplateCount`
            on the model counts every page whose merged verdict is not `ok`, and since PR
            #1486 that includes a dangling link — which this list marks with a quiet word
            rather than the amber pill. Measured on the owner's seven-page folder: the
            foot said 2 over one pill (2026-09-07).
          */}
          {/* The same rule as the sources half: a count still being read is not an answer. */}
          {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length > 0 ? (
            <ListNote testId="library-search-other-half-note">
              <OtherHalf count={visibleSources.length} segment="sources" t={t} />
            </ListNote>
          ) : null}
          {offTemplateRows > 0 ? (
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
          {/*
            **A hand-written page keeps its door on an empty wiki** (`docs/DECISIONS.md`,
            2026-09-11). The row is the list's own last row, so with no list it was drawn
            nowhere — and an empty wiki is precisely the folder where writing the first
            page by hand is the available move. `buildHumanPage` carries the shape itself,
            so the door works whether or not `wiki/_template.md` is there yet; the
            paragraph above still says which of those two is true.
          */}
          {newPageControl ? <div className="px-2 pb-1">{newPageControl}</div> : null}
        </>
      )}

    </section>
  );
}
