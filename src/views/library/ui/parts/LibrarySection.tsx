"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { BookText, Check, CloudDownload, FilePlus2, FileText, ListFilter, PencilLine, Search, Sparkles, Stethoscope } from "lucide-react";

import { formatSourceBytes, type LibrarySourceRow } from "@/entities/docs-vault";
import { humanPageSlug } from "@/features/library";
import { writerLabel } from "../../lib/writer-label";
import { cn } from "@/shared/lib/cn";
import { BrandMark } from "@/shared/ui/brand-mark";
import { controlClass } from "@/shared/ui/control-class";
import { Button, Chip, Dialog, RowButton, Tooltip } from "@/shared/ui";
import { AgentMissingNotice } from "./AgentMissingNotice";
import { Input } from "@/shared/ui/input";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import {
  readLibraryIndexQuery,
  writeLibraryIndexQuery,
  writeLibraryIndexSegment,
  type LibraryIndexSegment,
} from "@/shared/lib/appearance-preferences";

import { isAdvisoryWikiCode, isWikiFolderCode, libraryOffTemplateCount, passageLabelText } from "@/features/library";
import { captionWindow } from "../../lib/caption-window";
import { useSourceSearch } from "../../lib/use-source-search";
import { LibraryShelf } from "./LibraryShelf";
import { useRovingRows } from "@/shared/lib/use-roving-rows";
import { useWindowedRows } from "@/shared/lib/use-windowed-rows";
import { StateBadge } from "./StateBadge";
import { IndexGlyph } from "./IndexGlyph";

/** A source row before it is measured: one line of `text-body` in `RowButton` with its inset. */
const SOURCE_ROW_ESTIMATE_PX = 36;
/** One screen of index rows: past this, a pill repeated on every row is texture and folds into the head. */
const SOURCE_STATE_FOLDS_FROM = 12;
/** The order the head counts states in: what to act on first, what is done last. */
const SOURCE_STATE_ORDER: readonly LibrarySourceRow["state"][] = ["stale", "partial", "not-compiled", "compiled", "checking"];
import type { LibraryUiModel } from "@/features/library";
import { WIKI_SECTION_ORDER } from "@/shared/lib/wiki-page-schema";

const WIKI_SECTION_PREVIEW_KEYS = {
  Summary: "summary",
  Facts: "facts",
  Decisions: "decisions",
  "Open questions": "openQuestions",
  "Not in sources": "notInSources",
} as const;

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
  /**
   * Where the search field stands when the column's head offers a place for it. With the
   * list switch gone to the Library header (2026-09-14), the head's own title repeated the
   * active tab word for word one row below it; the field takes that seat instead, and
   * this component keeps owning its state through a portal (owner, 2026-09-17).
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
   * The Check results page: how many findings and names it holds, whether it is the open
   * page, and the press that opens it. Null when the wiki was never checked — the row is
   * the index's one line about the check, and an unchecked wiki has none (design-lead,
   * council 2026-09-07: the report's door must survive a page being open, which the
   * canvas header does not).
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
   * **Why the agent-only doors above cannot run — one label line, or nothing** (2026-09-12).
   *
   * This slot carried the four-line transfer disclosure until 2026-09-12. Measured on the
   * owner's folder at 1512 it was **four wrapped lines of 11px** standing between the
   * button group and the list, and the owner read it as part of the group's alignment
   * problem rather than as a disclosure. It moves to the agent moment that already prints
   * it (the composer's own note, and step two while the stage is drawn); what stays here is
   * the one fact a dead control owes a person — the reason, at the grade the landing gives
   * the same sentence.
   *
   * `null` while the landing is drawn: the stage prints the landing's one reason and
   * `agentReasonPrintedId` says which card, so a reason still prints exactly once per
   * screen. `LibraryPage` owns that decision, as it owns the landing's.
   */
  actionsNote: string | null;
  /** True in the installed app. On the web, Compile has no runtime at all. */
  inApp: boolean;
  /**
   * The installed app looked for a coding agent and found none. With both agent doors dead
   * for that reason, the column draws one notice with a door to the agents page instead
   * of two disabled chips (design sweep, 2026-09-25).
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

/**
 * **A row used to split the column edge with its list: fill at 68, glyph at 76** (2026-09-12).
 * That kept a glyph on the field's edge but left row words at 96 beside door words at 105
 * and card words at 89. `INDEX_ROW_INSET` below replaced it on 2026-09-25: every box on 76,
 * every word on one line after the shared glyph slot.
 */
/**
 * **A door whose label is a sentence takes the whole row.**
 *
 * The group is a two-column grid, which is right for the source half's three short labels
 * (Add files / Find documents / Import from a service). The wiki half's two are the
 * plain-language names the owner asked for on 2026-09-12 — *"I don't understand what
 * 'check' is and what 'start compiling' is"* — and at 11px `wiki.compile` needs about 119px
 * of a 125px cell, so half a 255px column truncated its label mid-word: a clearer name made
 * unreadable by
 * the box it was put in. Each therefore spans the row. Both halves still fill the column
 * exactly, which is what the rule asks for (`docs/DESIGN-SYSTEM.md`, "Control groups fill
 * their column").
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
 * **One box edge and one text line, for every control in the column** (design sweep,
 * 2026-09-25). The split above put row fills at 68 while the door chips, the wiki cards and
 * the search field stood at 76, and it put row text at 96, chip text at 105 and card text at
 * 89 — four start lines in one 255px column. Now every box stands on the column's `px-3`
 * edge (76 at 1512), and every control's content starts after the same 1px edge, 10px pad
 * and 16px glyph slot (`IndexGlyph`), so the words start on one line (109 at 1512) whether
 * the box is a door, a row or a card. The row carries a transparent edge so its inset is the
 * chip's inset to the pixel.
 */
const INDEX_LIST_INSET = "px-3";
const INDEX_ROW_INSET = "gap-1.5 border border-transparent px-2.5 py-1.5";
/**
 * **A caption with no glyph of its own still starts on the text line** (design sweep round
 * 2, 2026-09-25). The captions under the search field and above the source list stood on
 * the box edge at 76 — a second text line beside the rows' 109. They take a control's
 * transparent edge, pad and gap, and lead with an empty `IndexGlyph`, so their words land
 * where a row's do and the two are built from the same steps.
 */
const INDEX_TEXT_LINE = "flex gap-1.5 border-x border-transparent px-2.5";

/**
 * **The column's button group fills the column** (owner, 2026-09-12: *"why is the
 * alignment of these three buttons like this… make them fill the width, size them properly,
 * two on top and one long one underneath"*).
 *
 * It was an inline wrap. Measured on the installed app at 1512 (baseline
 * `.claude/shots-2026-09-12/library-inspection/01-landing-one-answer.png`): `sources.add`
 * 76–157 and `sources.find` 161–242 ended at 242 of a column that runs to 331, and
 * `sources.import` sat alone under them at 76–195 — three different widths and 89px of
 * ragged edge in a 255px column, beside a search field and a switch that both span it
 * exactly.
 *
 * So the group is a two-column grid: every control is `w-full`, a lone or odd last control
 * spans the row, and the group's right edge is the search field's right edge at every
 * width. `docs/DESIGN-SYSTEM.md`, "Control groups fill their column". The odd-child span is
 * a selector rather than arithmetic in the caller because the children are written by the
 * two segments and their number depends on the route (the brain picker joins the wiki
 * half only when this computer offers two brains).
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
  searchHost = null,
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
   * **The majority state is said once, at the head; the rows keep only the exceptions**
   * (the rule `majorityWriter` below already applies to the wiki list). A folder that was
   * just filled lists 3,000 files, and 1,600 of them wore the same amber pill in a column
   * (installed app, 2026-09-18): a pill on every row is texture, and the eye cannot find
   * the row that differs. So the counts stand under the actions, the most common state is
   * printed there in its own tone, and a row wearing that state carries the word for a
   * screen reader only. `compiled` never folds — its check is already the quiet mark —
   * and `checking` is a moment, not a state to summarise. Below one screen of rows
   * (`SOURCE_STATE_FOLDS_FROM`) every pill is still legible and nothing folds.
   */
  const stateCounts = (() => {
    const counts = new Map<LibrarySourceRow["state"], number>();
    for (const row of visibleSources) counts.set(row.state, (counts.get(row.state) ?? 0) + 1);
    return SOURCE_STATE_ORDER.filter((state) => counts.has(state)).map((state) => ({ state, count: counts.get(state)! }));
  })();
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
  /* The list follows the open file, the way the shelf follows the open page (2026-09-19). */
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
   * Pages whose **own** shape misses the template — the rows that wear the amber pill.
   *
   * Counted among the rows on screen. Under a search the list is the matches, and a foot
   * that still counted the whole folder said *400 pages miss the template* under a list of
   * none (installed app, 3,000 files, 2026-09-19): a number about rows a person cannot see,
   * standing where the list's own count belongs. The whole folder's figure stays with the
   * header strip and the home clause, which are about the folder.
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
      <div className={searchHost ? "flex min-w-0 flex-1 flex-col gap-1" : "flex flex-none flex-col gap-1 px-3 pb-2"}>
        {/*
          ⚠️ **The field's words start on the column's text line** (design sweep round 2,
          2026-09-25). A boxed `sm` field puts its placeholder 9px inside its edge — 85 at
          1512 — while every door, row and card starts its words at 109, after the column's
          one glyph slot. So the box is drawn here, with the chips' edge, inset and slot, and
          the field inside it is `bare` (the `DocsQuickDrawer` search is the same shape). The
          slot holds a filter mark, not a magnifier: this field narrows the list below, and
          the magnifier already belongs to the *Find documents* door. A `div`, not a
          `label`: the field keeps its own `aria-label`, and the box draws no form control
          of its own (`control-adoption-ratchet`).
        */}
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
        {/*
         * ⚠️ **The line is always here, even when it says nothing.** It used to appear on
         * the first keystroke, and appearing is a layout event: measured on the day-one
         * folder, the first character pushed the whole index list **18–19px down under the
         * pointer** — the field's `gap-1` plus one caption line — so the row somebody was
         * about to press moved as they typed (design-interaction, council 2026-09-11). One
         * line is reserved at rest instead, through the same `--leading-caption` this text
         * is set in, and the list never moves.
         *
         * ⚠️ **The reserve is the gap, not an addition to it** (2026-09-25). At rest the
         * empty line sat on top of the head's `pb-2` and the section's `pt-3`: 38px of
         * blank between the field and the first card at 1512, wider than any other gap in
         * the column, and it read as a missing element. Where the field is hosted in the
         * head, the head drops its bottom padding and the section opens on `pt-1.5`, so
         * the reserved line plus that step is the whole gap (24px), and a caption, when
         * there is one, stands in it with 6px below.
         */}
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
              onClick={onAddFiles}
              disabled={busy}
              tone="muted"
              className="w-full justify-start hover:text-[color:var(--color-text-primary)]"
            >
              <IndexGlyph><FilePlus2 size={ICON_SIZE.sm} aria-hidden /></IndexGlyph>
              <span className="min-w-0 truncate">{t("sources.add")}</span>
            </Chip>
          </Tooltip>
          <Tooltip content={t("sources.findTooltip")} {...INDEX_CHIP_TIP}>
            <Chip
              data-testid="library-find-documents"
              onClick={onFindDocuments}
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
              onClick={onImportFromService}
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
                      {/*
                        Format is the fact a directory listing already holds, and the reason
                        the row can exist without opening the file. The size moved into the
                        row's `title` on 2026-09-25: at 280px, "MD · 781 B" plus a badge took
                        ~115px and every longer name truncated even at 1920.

                        ⚠️ **The tag is drawn only when the name does not already say it**
                        (design sweep round 2, 2026-09-25). `row.format` is the name's own
                        extension, so `merchant-onboarding.html  HTML` said one fact twice
                        and the second copy cost the first its tail: the name truncated at
                        1512 and 1920 while the tag beside it repeated the part that was cut.
                        A name with no extension still gets the word, because there the
                        tag is the only place the fact is written.
                      */}
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
                        /* The same badge as every other unfinished state: a column of four
                           rows used to show a 41×20 box and a 27×14 bare word with two left
                           edges (design sweep, 2026-09-25). Its word, not a texture, tells
                           it from `not compiled` (see `StateBadge`). */
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
            {/*
             * **A search that matches nowhere says so in a sentence** (browser walk,
             * 2026-09-19). With no match on either half the list simply emptied under a
             * caption of zeros — "0 sources (0 passages) · 0 pages" over blank space — and
             * a person who mistyped read a folder with nothing in it. The other-half note
             * above covers one half being empty; this covers both, and it waits for the
             * reading to finish for the same reason that one does.
             */}
            {needle && search.phase !== "reading" && visibleSources.length === 0 && visiblePages.length === 0 ? (
              <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
            ) : null}
            {/*
             * ⚠️ **The waiting count is not a footnote under the list any more** (owner,
             * 2026-09-12): *"this 'one source version needs review' line — written like
             * this, who is ever going to look at it? … a different way is needed."*
             *
             * It was a `text-caption` sentence at the quaternary ink, below the last row
             * and above nothing, stating the one fact on this screen a person has to act
             * on. The home strip above the graph now carries it as a **pressable clause**
             * — `1 source changed` lights that citation and its two ends on the canvas —
             * and the header strip keeps printing it while a document is open. A third
             * copy here would be the fact said twice in one viewport, quietest where it
             * matters most.
             *
             * The search status line's own `min-h` reserve (above) is untouched: it is
             * the line that keeps this list from moving under a pointer as somebody
             * types, and it never carried this sentence.
             */}
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
  /*
   * ⚠️ **Drawn as a door, not as a list row** (design sweep, 2026-09-25). A flat row under
   * the bordered page cards read as one more item of the list, the fifth page of four. It is
   * an action, so it wears the doors' chip at the head of the column.
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
              if (event.key === "Enter") {
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
            {/* Held, not removed, once a title is typed: the dialog is centred, so a line
                leaving the preview moved the field 9px under the caret on the first key
                (2026-09-25). `invisible` keeps the height and takes it out of the tree. */}
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
         * No agent on this computer: the two dead doors become the one notice that names
         * what they would do and ends in the door (`AgentMissingNotice`, 2026-09-25). While
         * the runtimes are still being detected the doors stay drawn, because nothing is
         * missing yet.
         */
        <AgentMissingNotice id={SECTION_ACTIONS_NOTE_ID} className="mx-3 mb-2" t={t} />
      ) : null}
      <SectionActions>
        {agentNotice ? null : <>
        {/*
          **Reading before writing, and both drawn whether or not they can run.**
          `Check page format` is the left cell and `Ask the agent to compile` the right —
          the order of the work, and the geometry `library-lint-dock.spec.ts` measures. They
          used to be wrapped in a span that kept them on one line and to disappear with
          their handler; the grid keeps them on one row by construction, and a feature the
          product has stays on screen with the reason it cannot run beneath it
          (`docs/DECISIONS.md`, 2026-09-11, "availability is a state with its reason"). The
          picker joins as a third cell and therefore spans the row: it is what the press
          will run on, not a third door.
        */}
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

      {/*
        **One line under the group, and it is the reason.**
        ① `actionsNote` — the sentence the two dead doors above owe a person, at the grade
           the landing gives the same words. `LibraryPage` prints it here only while the
           landing is not drawn, so a reason still appears once per screen.
        ② The web's own degradation sentence, when there is no reason to print instead:
           why Compile is unavailable, where it works, and what still works here
           (`.claude/rules/surfaces.md`). Only one of the two can be the true one.
        The four-line transfer disclosure is no longer either of them — see `actionsNote`.

        ⚠️ **One slot means one sentence.** `disabled` on Check is a union — a turn in
        flight, a wiki of fewer than two pages, no coding agent. Running is said by the
        report row's own live mark and the agent reason arrives as `actionsNote`; the page
        count reaches a person through the chip's tooltip rather than a second line here,
        because this slot prints one reason or none and nothing may crowd it.
      */}
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
          {/*
            Accent, not the sentence's grey: measured 2026-09-19 on the wiki tab, the door
            wore the tertiary ink of the note it ends and no underline, so "Get the app"
            read as three more words of the sentence — the same dead end the search
            caption's link fell into (2026-09-07, above). The Rounds tab's own door to the
            same page wears this tone; one page, one colour.
          */}
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
            {/*
              `aria-live` on the running word, not on the row: a row whose label is live
              would re-announce the count every time the folder polls. The mark is the
              inline micro form, not the 64px sprite — a full-size waiting mark in a row
              this height displaces every card below it and snaps back (design-interaction,
              council 2026-09-12).
            */}
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
          {/* Both halves empty: the same sentence the sources half prints, for the same reason. */}
          {needle && search.phase !== "reading" && visiblePages.length === 0 && visibleSources.length === 0 ? (
            <ListNote testId="library-search-nothing-note">{t("search.nothing", { needle })}</ListNote>
          ) : null}
          {/*
            ⚠️ **No off-template count under a resting shelf** (design sweep, 2026-09-25).
            The header strip says *2 off-template* and each affected card says it again on
            its own status line; a 9.5px foot saying *2 pages miss the template* under the
            New page door was the third copy, with nothing to press. Under a search it
            stays, because there the rows are a subset and the strip's figure is about the
            whole folder (see `offTemplateRows`).
          */}
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
          {/*
            **A hand-written page keeps its door on an empty wiki** (`docs/DECISIONS.md`,
            2026-09-11). The row is the list's own last row, so with no list it was drawn
            nowhere — and an empty wiki is precisely the folder where writing the first
            page by hand is the available move. `buildHumanPage` carries the shape itself,
            so the door works whether or not `wiki/_template.md` is there yet; the
            paragraph above still says which of those two is true.
          */}
          {newPageControl ? <div className={`${INDEX_LIST_INSET} pb-1`}>{newPageControl}</div> : null}
        </>
      )}

    </section>
  );
}
