"use client";

import type { useTranslations } from "next-intl";
import { BookText, FileText, FolderOpen, Download, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  formatSourceBytes,
  type LibrarySourceRow,
  type LibraryWriteUpLink,
} from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import type { SourceOutline, SourceUnit } from "@/shared/lib/source-passage";
import { RowButton } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { CitedPassageState } from "../../lib/use-cited-passage";
import type { SourceOutlineState } from "../../lib/use-source-outline";
import { elideHashMiddle } from "../../lib/elide-hash";
import { passageLabelText } from "../../lib/passage-label";
import { AgentDoor } from "./AgentDoor";

/**
 * The heading that names the passage section to a screen reader, through the
 * `aria-labelledby` on the section itself.
 *
 * The section's own `id` went with the landing's `getElementById` on 2026-09-11: the
 * effect that needed it now holds the section by ref, and an id nothing resolves is a
 * hook that lies about having a consumer.
 */
const SOURCE_PASSAGE_HEADING_ID = "library-source-passage-heading";

/*
 * `passageLabel` moved to `../../lib/passage-label.ts` in slice U2: the index column's
 * search caption names the same place this section does, and one fact in two voices is
 * how one locale's "line 11" and another's would end up side by side on one screen.
 */

/** Names the outline section (`source.outline.title`) to a screen reader, through its own `aria-labelledby`. */
const SOURCE_OUTLINE_HEADING_ID = "library-source-outline-heading";

/**
 * **The file's shape as lines a person reads — only what the reader can actually back.**
 *
 * The per-format table is not a style choice; it is the list of things U1's reader really
 * returns, and the gap between that and what slice U2's brief asked for is reported
 * rather than papered over:
 *
 * | format | what this prints | why |
 * |---|---|---|
 * | DOCX | every heading, by name, pressable | the extractor mints `h:<slug>` anchors for them, so these are real addresses and the press opens the passage |
 * | XLSX | each sheet with its row count | `s<i>r<n>` carries the sheet, and "row 3" in a two-sheet workbook is ambiguous |
 * | CSV / TSV | the record count | records are the unit, and `r<n>` is their address |
 * | Markdown, text, HTML | nothing; the section says it cannot outline the shape | ⚠️ see below |
 * | PDF, anything else | nothing; the same sentence | zero units and no page count. A page count needs a PDF parser, which this slice excludes by name |
 *
 * A `paragraph` count rides along for DOCX because the headings alone would describe a
 * document of eight units as a document of four.
 *
 * ⚠️ **Markdown, text and HTML print no count at all** (design-lead, council 2026-09-11).
 * They used to print "18 lines", and a line count is not a structure: nobody can act on
 * it, it is not what this section promised, and it contradicted the neighbouring sentence
 * that says these formats *cannot* be outlined — a `##` line is a `line` unit to this
 * reader and its tags are stripped before units exist. So they take the same honest
 * sentence a PDF takes, and deriving Markdown headings stays its own decision.
 */
function outlineRows(
  outline: SourceOutline,
  t: ReturnType<typeof useTranslations<"library">>,
): { rows: Array<{ text: string; anchor?: string }>; count: string | null } {
  const rows: Array<{ text: string; anchor?: string }> = [];
  for (const sheet of outline.sheets) {
    rows.push({ text: t("source.outline.sheet", { sheet: sheet.sheet, rows: sheet.rows }) });
  }
  for (const heading of outline.headings) {
    rows.push({ text: heading.title, anchor: heading.anchor });
  }
  /*
   * ⚠️ **A count is not a row** (owner, 2026-09-12: *"this got very strange, and not
   * refined"*). The paragraph and record totals were pushed into this list beside the
   * headings, so a DOCX outline ended in a `text-body` primary line that looked like one
   * more heading a reader could press and could not — the list had two grammars and its
   * last row was the wrong one. The total is a fact about the whole section, so it rides
   * on the section's own label instead (`source.outline.title` plus the count), leaving the
   * list to hold
   * addresses only.
   */
  const paragraphs = outline.unitCount - outline.headings.length;
  const count =
    outline.format === "docx" && paragraphs > 0
      ? t("source.outline.paragraphs", { count: paragraphs })
      : outline.format === "csv"
        ? t("source.outline.records", { count: outline.unitCount })
        : null;
  return { rows, count };
}

/**
 * One unit of the file's own text, verbatim. Context is quieter; the cited unit is not.
 *
 * ⚠️ The context units were `text-caption` (9.5px) for half a day, which design-lead
 * measured as decoration contradicting its own reason for existing: the two units either
 * side are there because a hard-wrapped line ends mid-sentence — `#l14` of the fixture
 * policy ends at "A settlement that" — so the sentence a person is checking finishes in
 * the *context*, which makes it reading text. `--text-caption` is documented as micro
 * labels and legends, and `.claude/rules/design.md` records the 2026-08-09 finding that
 * data a person had to inspect at 9.5px was a defect. Separation is now three ink steps
 * (primary → tertiary) plus the leading pair (23.8 vs 20), because a 1.5px size step
 * alone would not carry one winner.
 */
/**
 * **A row's text starts on the reading column's one text edge; only its fill steps past it.**
 *
 * This pane is a document column: the file's name, the `LABEL / value` facts table, the
 * two section labels and the passage all begin at one x (677.8 at 1512). Its pressable
 * rows did not — measured in the installed app (baseline
 * `.claude/shots-2026-09-12/library-inspection/07-docx-pane.png`): the write-up rows'
 * glyphs stood at 687 and the outline rows' text at 686, eight to ten pixels inside the
 * labels that name them, because each row was paying for its own hover fill out of the
 * column's edge. The row gives that padding back as a negative margin, which the 40px
 * column gutter has room for — the list carries the negative margin and the row keeps its
 * own `px-2.5`, because `shape: "row"` emits `w-full` and a `-mx` on a full-width row
 * bleeds left while staying put on the right. `docs/DESIGN-SYSTEM.md`, "One text edge per
 * column".
 */
const PANE_LIST_BLEED = "-mx-2.5";
const PANE_ROW_INSET = "px-2.5";

function PassageLine({ unit, cited }: { unit: SourceUnit; cited: boolean }) {
  return (
    <p
      data-testid={cited ? "library-source-passage-cited" : "library-source-passage-context"}
      className={cn(
        "max-w-[var(--measure-prose)] whitespace-pre-wrap [overflow-wrap:break-word] [word-break:keep-all]",
        cited
          ? "text-reading leading-prose text-[color:var(--color-text-primary)]"
          : "text-body leading-body text-[color:var(--color-text-tertiary)]",
      )}
    >
      {unit.text}
    </p>
  );
}

/**
 * **What the reader can honestly show for a file nobody asked it to open.**
 *
 * A raw source is kept verbatim and is never converted, so there is no body to render by
 * default — a PDF, a spreadsheet and an exported page have nothing in common that a
 * Markdown reader could draw. Rendering "nothing" would be the wrong answer twice over:
 * it looks broken, and it hides the four facts Atlas really does hold about the file.
 *
 * So the pane states them: what it is called, what it is, how big it is, whether the
 * bytes still match what anybody wrote up, and which pages cite it. Every one of those
 * came from the directory listing or from a hash Atlas measured; none required opening
 * the file.
 *
 * ⚠️ This header said "never opened" and "deliberately never parsed" until slice U1
 * (2026-09-11), and both halves needed narrowing rather than deleting. A **citation**
 * names one passage in one document, and pressing it used to land here: path, format,
 * size, sha256 and the sentence that Atlas had never opened the file — so the only way
 * to check the fact was to leave the app and count to line 14. Now that press reads that
 * one file and renders the unit its anchor names (`passage`, below). What is unchanged is
 * the part that matters: no converted copy is written, the text is dropped when the pane
 * closes, and nothing is read that a person did not name by pressing its address
 * (`docs/DECISIONS.md` 2026-09-07, and 2026-09-06's falsifier — "a reader who follows a
 * citation and finds nothing there").
 *
 * The one door is **put the person in front of the file**, and it differs by surface for
 * a reason rather than by convenience: the app reveals it in Finder — reveal, never open,
 * because Atlas launches no program on somebody's behalf — while a browser has no Finder
 * and no absolute path, so it hands over the bytes it was already granted.
 *
 * ## The second door: what was made of it (owner, 2026-09-06)
 *
 * The original and the write-up must be separate things a person can move between, and
 * this pane held only one half of that: `Cited by` was a fact in a list, spelled as
 * slugs, that a reader could not press. It is now the row **View write-up**, and each
 * page says whether it still matches these bytes — a write-up citing an older version of
 * this file is exactly the case where following the link matters most, and the one a
 * plain list of names cannot tell apart.
 *
 * When nothing cites the file, the row is **Compile** instead, because "no wiki page yet"
 * describes a gap whose cure is one press. It is disabled with its own reason wherever
 * that press cannot happen, never silently absent: on this pane the person arrived by
 * choosing this very file, so a missing step is a dead end rather than tidiness.
 */
export function SourceSummary({
  row,
  hash,
  passage,
  outline,
  canReveal,
  writeUps,
  onOpen,
  onOpenPassage,
  onOpenWiki,
  onCompile,
  compileNote,
  compileBlocked,
  agentDoor,
  busy,
  t,
}: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /**
   * The passage a citation named, when the person arrived here by pressing one.
   *
   * `null` is the ordinary case — somebody opened the file from the index — and the pane
   * then says, correctly, that Atlas has never opened it. As soon as this is present the
   * file *has* been opened, once, on their press, so the pane's own sentences change
   * with it rather than keeping a reassurance that stopped being true (po-evidence and
   * po-steward both, 2026-09-11).
   */
  passage: CitedPassageState | null;
  /**
   * The file's own shape, read once when this pane opened.
   *
   * `null` while the folder is not open or the read is not wanted; the section is then
   * absent rather than empty. `use-source-outline.ts` owns the read and the reason it is
   * inside the "nothing is read that a person did not name" clause — choosing this row
   * *is* naming this file.
   */
  outline: SourceOutlineState | null;
  /** True in the installed app, where the door reveals rather than downloads. */
  canReveal: boolean;
  /** Pages citing this file, and whether each still matches its bytes. */
  writeUps: readonly LibraryWriteUpLink[];
  onOpen: () => void;
  /**
   * Opens this same pane **at one address inside this file** — what a heading row in the
   * outline presses.
   *
   * The rows already carried `{anchor, title}` and were the only addresses on the screen a
   * person could not press, while the index column's caption beside them did exactly this
   * (design-interaction hold-or-record, resolved to *do it*, council 2026-09-11). It is the
   * citation path, not a second one: the caller sets the same `{path, anchor}` a pressed
   * citation sets, so the passage section below lands and focuses as it always has.
   */
  onOpenPassage?: (anchor: string) => void;
  onOpenWiki: (slug: string) => void;
  onCompile: () => void;
  /**
   * **The one fact true of pressing Compile here** — the reason it cannot run, or what
   * leaves this computer when it does.
   *
   * ⚠️ It used to be the blocked reason only, and the transfer sentence lived three
   * hundred pixels away in the index column (2026-09-06). That worked while the column
   * always drew the Wiki half's Compile chip; from 2026-09-07 the column draws one list at
   * a time, and with a source open it is drawing Sources — which has no Compile on it. So
   * the disclosure follows the press it describes, which is what
   * `.claude/rules/local-first.md` asks for, and this button is now a press of its own.
   */
  compileNote: string | null;
  /** Whether the press is refused; the note above says why. */
  compileBlocked: boolean;
  /**
   * Whether that refusal earns a door to `/agents` (slice U2).
   *
   * `LibraryPage` decides on the route, not on the sentence, and it is false on the web
   * and while an agent is still being looked for.
   */
  agentDoor: boolean;
  busy: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  /**
   * `oneLine` marks a value whose row must never grow a second line: the fact list is the
   * one fixed-height block in this pane, and a row that wraps when a file has been cited
   * makes the pane's whole rhythm depend on its state. `title` is where the untruncated
   * value stays reachable.
   */
  const facts: Array<{
    key: string;
    label: string;
    value: string;
    mono?: boolean;
    oneLine?: boolean;
    title?: string;
  }> = [
    { key: "path", label: t("source.path"), value: row.path, mono: true },
    {
      key: "format",
      label: t("source.format"),
      value: row.format ? row.format.toUpperCase() : t("sources.noFormat"),
    },
    { key: "size", label: t("source.size"), value: formatSourceBytes(row.bytes) },
    {
      key: "state",
      label: t("source.state"),
      value: t(`sources.state.${row.state}.label`),
    },
    {
      key: "hash",
      label: t("source.hash"),
      /*
       * Never a guess. An unmeasured hash says so rather than showing an empty cell that
       * reads as "no hash", which is a different and untrue fact.
       *
       * A citation's read supplies a third answer. It hashes **the same bytes it showed
       * the passage from**, so the row can stop saying "not measured" — but it says when
       * it was measured, because a hash whose provenance a reader cannot tell apart from
       * the one a write-up recorded is a fact about nothing (brief decision 2).
       */
      /*
       * ⚠️ **The middle is elided so the row stays one line** (2026-09-12). All 64
       * characters plus the provenance clause measured two 16px lines at 1040x720 and at
       * 1512x901 — see `../../lib/elide-hash.ts` for the column measurement and for why
       * the *middle* goes rather than the tail. `title` carries the whole value.
       */
      value:
        hash !== null
          ? elideHashMiddle(hash)
          : passage?.hash
            ? t("source.hashJustRead", { hash: elideHashMiddle(passage.hash) })
            : t("source.hashUnmeasured"),
      title: hash ?? passage?.hash ?? undefined,
      // A hash is an identifier and sits in mono; the sentence that stands in for one is prose.
      mono: hash !== null,
      oneLine: hash !== null || passage?.hash !== undefined,
    },
  ];
  /*
   * **Which sentence about reading is true of this pane right now.**
   *
   * U1 had two states: a citation was pressed, or Atlas had never opened the file. Slice
   * U2 adds a third read — the outline section's — and it fires on *every* source pane,
   * so leaving the sentence as it was would have made the pane claim the file was never
   * opened directly above a list of its own headings. That is the reassurance-that-stopped-
   * being-true failure po-evidence and po-steward both named in U1, and the fix is the
   * same one: the sentence follows the read.
   *
   * The citation wording wins when both happened, because it is the more specific reason
   * and the one the person acted on; the outline read is the ambient one.
   */
  /*
   * The rows once, so the section's marker, its sentence and its list cannot disagree:
   * a format whose shape this reader cannot describe prints the sentence and no list,
   * whether that is because it yielded no units at all (PDF) or because its units carry
   * no structure worth listing (Markdown, text, HTML).
   */
  const outlineReady = outline && outline.phase === "ready" ? outline.outline : null;
  const outlineRead = outlineReady ? outlineRows(outlineReady, t) : { rows: [], count: null };
  const outlineList = outlineRead.rows;
  const outlineUnreadable =
    outlineReady !== null && outlineList.length === 0 && outlineRead.count === null;
  const openedSentence =
    passage !== null
      ? "source.openedForCitation"
      : outline && outline.phase !== "reading"
        ? "source.openedForOutline"
        : "source.neverOpened";
  /*
   * **A citation lands on the passage, not at the top of the card.**
   *
   * The pane opens on a press from a wiki page or from the answer comparison, and the
   * facts table sits above the passage — so without this a person arrives looking at the
   * sha256 row of a file they opened to read one sentence. Focus follows, because the
   * citation is already a button and a keyboard press must land where a pointer press
   * does (brief decision 5).
   *
   * It lives here rather than in the page for a measured reason: `LibraryPage` ran the
   * same effect and found no target, because on the render that first carries the
   * citation the source row has not resolved yet and the section is not in the DOM
   * (measured 2026-09-11 — `focused: false` on all five presses). The component that
   * renders the section is the one that can be sure it exists.
   *
   * ⚠️ Three corrections after the council of 2026-09-11, all measured on the built
   * export at port 3207:
   *
   * 1. **The landing waits for the answer.** Keyed on the citation alone it ran at
   *    `t+28ms` while the phase was still `reading`, when the section is a one-line
   *    placeholder and there is nothing to scroll: `scrollTop 0 max 0`, and by `t+37ms`
   *    the passage had arrived with `max 282` and no second run. The travel measured
   *    **0 of 26 / 79 / 362 / 490 / 589 available pixels** at five widths — a landing
   *    that never landed (design-responsive). `landingKey` is therefore null until the
   *    read has settled, so the effect fires once, after there is a passage to land on.
   * 2. **The section is the target, not its 35×14px label.** Focus moved to the `<h3>`,
   *    a caption-sized word; the section now takes `tabIndex={-1}` with
   *    `aria-labelledby`, so what receives focus is the region that holds the address
   *    and the text, announced by its own heading. Re-pressing a second citation into an
   *    already-open pane fired **0** `focusin` because the same node was refocused, which
   *    is silent for assistive tech; `key={passageKey}` makes each citation a new node,
   *    so the change is an event (design-interaction).
   * 3. **Programmatic travel is immediate.** `.claude/rules/design.md` already decides
   *    this — only user-initiated scrolling keeps its time — and the smooth run was
   *    measurably harmful: 0→102px completing at 158ms, cancellable by a Tab 90ms in,
   *    which left the reader 163px past the promise. The `matchMedia` branch went with
   *    it, because `auto` is already the reduced-motion answer.
   *
   * No ring is drawn on arrival, for the same reason `dialog.tsx` draws none: this is
   * programmatically moved focus on a container, which the 2026-08-04 verdict judged a
   * defect to ring. Without `focus:outline-none` a keyboard press inherited the
   * browser's own `outline: auto 1px rgb(153,200,255)` — the OS accent colour — because
   * the floor rule in `app/globals.css` deliberately excludes `[tabindex="-1"]`.
   */
  const passageSectionRef = useRef<HTMLElement | null>(null);
  const passageKey = passage ? `${passage.path}#${passage.anchor}` : null;
  const landingKey = passage && passage.phase !== "reading" ? passageKey : null;
  useEffect(() => {
    if (!landingKey) return;
    const section = passageSectionRef.current;
    if (!section) return;
    // Optional call: jsdom has no scroller, and a landing is not worth throwing over.
    section.scrollIntoView?.({ behavior: "auto", block: "start" });
    section.focus({ preventScroll: true });
  }, [landingKey]);

  return (
    <div
      data-testid="library-source-summary"
      /*
       * ⚠️ **The document ends with a gutter, not against the window** (2026-09-12).
       *
       * This pane is a document and sizes itself to what it holds — measured on the static
       * export, the box is exactly as tall as its content at both 1512x901 and 1040x720
       * (657px for the DOCX, 523 for the XLSX, 777 for the cited Markdown), with no
       * `min-height`, no centring and no filler anywhere in its chain, and the ground
       * below it is `--color-canvas`, the same ground the landing stands on. That half of
       * the earlier finding was wrong: the empty space under a short source is not a
       * second panel.
       *
       * What was missing is the other end. `pt-8` opened the document and nothing closed
       * it, so at 1040x720 on a cited source — where the content is 777px against a 671px
       * scroller — the last block ended at y=720, **flush with the bottom of the window**,
       * 0px of clearance at the scroll end. The repository already owes that room
       * elsewhere (`tests/e2e/scroll-end-gap.spec.ts` holds a 24px floor, and
       * `DocReadingPane` reserves its pill's clearance); this pane had it only below `lg`,
       * from the bottom-tab reserve on its scroller. `pb-8` is the same gutter `pt-8`
       * opens with, so the last block sits one gutter inside the document's end at every
       * width.
       */
      className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-8 pt-8 md:px-10"
    >
      <div className="flex items-start gap-2">
        <FileText
          size={ICON_SIZE.md}
          aria-hidden
          className="mt-1 flex-none text-[color:var(--color-text-quaternary)]"
        />
        <h2 className="min-w-0 break-all text-body-lg font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
          {row.name}
        </h2>
      </div>
      {/* The line, not the column: `--measure-doc-column` is the box this pane sits in and
          `--measure-prose` is how long a line inside it may run (2026-09-11 calibration —
          see that token's block in `app/globals.css`). */}
      <p
        data-testid="library-source-opened-state"
        className="mt-2 max-w-[var(--measure-prose)] text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
      >
        {t(openedSentence)}
      </p>

      <dl className="mt-5 flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] pt-4">
        {facts.map((fact) => (
          <div key={fact.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            {/* The **same label column as the shelf's steps** (2026-09-06): both are
                label/value pairs in this one pane, and they measured 132 here against 148
                there — two rhythms a person reads one after the other by pressing a row.
                One number, and it is the wider one, which is the one that fits
                `Behind its source` in both locales. */}
            <dt className="w-full flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)] sm:w-[148px]">
              {fact.label}
            </dt>
            <dd
              /* `truncate` rather than a character count alone: the elision is sized for
                 the 1040 column, and below `sm` the value cell drops under its own label
                 and is narrower than any fixed length could allow for. One line at every
                 width, and the whole value on the cell. */
              title={fact.title}
              className={cn(
                "min-w-0 flex-1 text-label text-[color:var(--color-text-secondary)]",
                fact.oneLine ? "truncate" : "break-all",
                fact.mono && "font-mono",
              )}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <div
        data-testid="library-source-writeups"
        className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4"
      >
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
          {t("source.viewWriteUp")}
        </p>
        {writeUps.length > 0 ? (
          /*
           * **A list of documents, drawn the way this screen draws lists of documents**
           * (2026-09-06). These were 32px chips while the index's own rows — the same
           * gesture, opening the same page — were 36px `row` controls, so pressing one
           * moved a person between two heights for one job. `shape: "row"` is the
           * repository's name for "a whole list row that is pressable", and taking it
           * brings the leading glyph, the left alignment and the 36px step with it.
           */
          <ul className={`mt-2 flex flex-col gap-0.5 ${PANE_LIST_BLEED}`}>
            {writeUps.map((page) => (
              <li key={page.slug}>
                <RowButton
                  onClick={() => onOpenWiki(page.slug)}
                  data-testid={`library-source-writeup-${page.slug}`}
                  /*
                   * **The title is what a reader sees; the slug is still the address.**
                   * Every other surface addresses a wiki page by its title, so a row of
                   * slugs here would be a second vocabulary for one thing. But this pane
                   * is the one place a person copies exact vault paths — it prints the
                   * source's own `Path` two rows up — so the page's path stays reachable
                   * rather than becoming information only the index has.
                   */
                  title={page.slug}
                  tone="muted"
                  className={`${PANE_ROW_INSET} hover:bg-[color:var(--color-overlay-1)] hover:text-[color:var(--color-text-primary)]`}
                >
                  <BookText size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{page.title}</span>
                  {/*
                   * Whether the page still describes *these* bytes is the fact that
                   * decides whether following it is worth the reader's time — and
                   * "nothing has measured this file yet" is a third answer, not a
                   * quieter version of "behind". Printing it as behind made this pane
                   * disagree with its own STATE row, which reads `checking` in exactly
                   * that window (PO steward, 2026-09-06).
                   */}
                  <span
                    className={cn(
                      "flex-none",
                      page.freshness === "current" &&
                        "text-[color:var(--color-success-text-a90)]",
                      /* The same amber the row's chip carries (owner, 2026-09-07). This
                         pane and the index must not disagree about whether a part-read
                         write-up is something to act on; the word, not the colour, is what
                         separates it from `behind`. */
                      page.freshness === "partial" &&
                        "text-[color:var(--color-amber-source-a90)]",
                      page.freshness === "behind" &&
                        "text-[color:var(--color-amber-source-a90)]",
                      page.freshness === "unchecked" &&
                        "text-[color:var(--color-text-quaternary)]",
                    )}
                  >
                    {t(`source.writeUp.${page.freshness}`)}
                  </span>
                </RowButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            <p className="max-w-[var(--measure-prose)] text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
              {t("source.citedByNobody")}
            </p>
            <div>
              <button
                type="button"
                onClick={onCompile}
                disabled={busy || compileBlocked}
                data-testid="library-source-compile"
                className={controlClass({ shape: "chip", tone: "muted", className: "gap-1.5" })}
              >
                <Sparkles size={ICON_SIZE.sm} aria-hidden />
                {t("wiki.compile")}
              </button>
            </div>
            {compileNote ? (
              /*
               * ⚠️ **Not 9.5px under a 14px button** (design-lead, council 2026-09-11).
               * This is the sentence that says why the press beside it is refused and
               * where to go instead, and it was set two steps below the control it
               * explains — the same defect `.claude/rules/design.md` records from the
               * 2026-08-09 inventory. It takes the grade `library-source-opened-state`
               * already uses one block up, so the pane has one voice for *what is true of
               * this file*.
               */
              <p
                data-testid="library-transfer"
                className="max-w-[var(--measure-prose)] text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
              >
                {compileNote}
              </p>
            ) : null}
            {/*
             * The door, when that note is the reason a coding agent is missing rather
             * than a disclosure about what leaves this computer (slice U2). `compileNote`
             * carries whichever of the two is true, so the caller says which.
             */}
            {compileNote && compileBlocked && agentDoor ? (
              <div className="flex">
                <AgentDoor testId="library-source-compile-blocked-door" />
              </div>
            ) : null}
          </div>
        )}
      </div>
      {/*
       * ⚠️ **The availability block stands above 「Structure」 and the passage, not under
       * them** (design-responsive, council 2026-09-11).
       *
       * It is the pane's only forward press — the write-ups to read, or Compile with the
       * one reason it cannot run and the door that reason names — and it used to sit last,
       * after two blocks whose height is decided by the document. Measured at the app's
       * own minimum window, 1040×720, on `dispute-handling-standard.docx`: the five-row
       * outline pushed the 「Agents」 door to y=724 with its bottom at 756 against a 720
       * viewport — `doorInViewport: false`. The one press slice U2 exists to give somebody
       * was missing on the file that needed it most, at the size the app ships as its
       * floor.
       *
       * So the order is: the fixed fact list, then the action, then the two variable-length
       * blocks. It is the same rule the comparison dialog's footer follows, and it holds
       * for any outline length rather than for the lengths measured so far.
       */}
      {/*
       * **What the document is made of — the half of it a person could never see.**
       *
       * Above this line is everything Atlas knows *about* the file. This is the file's
       * own shape, and it is the whole of slice U2's second decision: until 2026-09-11 a
       * person with no agent could learn a document's size and its sha256 from this pane
       * and nothing at all about whether it held three headings or three hundred rows.
       * Reading the structure is the one thing they could do for themselves, and it is
       * the thing the pane withheld.
       *
       * It is **counts and names, never bodies** (`docs/DECISIONS.md` 2026-09-07: Atlas
       * keeps no converted copy, and a pane that rendered whole documents would be that
       * copy in all but name). The one place text appears is the passage section below, which a
       * person asked for by pressing an address.
       *
       * It sits above that section because it is the coarser answer: what is in here,
       * then the one passage somebody named.
       */}
      {outline ? (
        <section
          data-testid="library-source-outline"
          data-state={outline.phase === "ready" ? (outlineUnreadable ? "unreadable" : "ready") : outline.phase}
          aria-labelledby={SOURCE_OUTLINE_HEADING_ID}
          className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4"
        >
          <h3
            id={SOURCE_OUTLINE_HEADING_ID}
            className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]"
          >
            {t("source.outline.title")}
            {outlineRead.count ? (
              <span data-testid="library-source-outline-count"> · {outlineRead.count}</span>
            ) : null}
          </h3>
          {outline.phase === "reading" ? (
            <p className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
              {t("source.outline.reading")}
            </p>
          ) : outline.phase === "failed" || !outline.outline ? (
            <p
              data-testid="library-source-outline-failed"
              className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]"
            >
              {t("source.outline.failed")}
            </p>
          ) : outlineUnreadable ? (
            /*
             * **A format whose shape this reader does not know says so, and prints no
             * number.** A PDF yields no units at all; "0 parts" would be a different and
             * untrue fact, and the kind of number a person would believe. A Markdown or
             * HTML file reaches the same sentence by the other road — it has units, and
             * none of them is structure. The Finder door is the honest answer in both
             * cases, which is why it stays.
             */
            <p
              data-testid="library-source-outline-unreadable"
              className="mt-2 text-body leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]"
            >
              {t("source.outline.unreadable")}
            </p>
          ) : (
            <ul data-testid="library-source-outline-list" className={`mt-2 flex flex-col gap-1 ${PANE_LIST_BLEED}`}>
              {outlineList.map((line, index) => (
                <li key={`${index}-${line.anchor ?? line.text}`}>
                  {line.anchor && onOpenPassage ? (
                    /*
                     * **A heading is an address, so it is a press.** The extractor minted
                     * `h:<slug>` for this row and the pane can already show what it names;
                     * leaving it as text made the outline the one list on this screen whose
                     * addresses a person could read and not follow.
                     *
                     * Accent ink, like the index caption's address and unlike the counted
                     * rows beside it: at rest that is what separates *a place you can go*
                     * from *a number about this file*, and a row whose rest state equals
                     * its neighbours' is the false negative this repository has already
                     * ruled on twice.
                     */
                    <button
                      type="button"
                      data-testid={`library-source-outline-row-${line.anchor}`}
                      data-anchor={line.anchor}
                      onClick={() => onOpenPassage(line.anchor!)}
                      className={controlClass({
                        shape: "row",
                        size: "xs",
                        tone: "accent",
                        hoverInk: "strong",
                        hoverSurface: "lift",
                        className: `atlas-touch-floor w-full ${PANE_ROW_INSET} text-body`,
                      })}
                    >
                      <span className="min-w-0 flex-1 truncate text-left">{line.text}</span>
                    </button>
                  ) : (
                    /* No inset: the pressable rows beside it now bleed their own padding,
                       so every line in this list — pressable or not — starts on the
                       column's text edge (it used to match the rows' `px-2` instead,
                       which put the whole list 8px inside its own label). */
                    <span className={`block ${PANE_ROW_INSET} text-body leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:break-word] [word-break:keep-all]`}>
                      {line.text}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/*
       * **The passage the citation named, under the facts it was filed with.**
       *
       * Above this line is everything Atlas knows *about* the file; this is the one part
       * of the file itself, and only ever the part a person asked for by pressing its
       * address. It sits above the Finder door on purpose: the door is what a reader
       * needed when the pane could not answer, and it stays for the cases this section
       * honestly cannot answer — a PDF, a renamed heading, a file that left the folder.
       */}
      {passage ? (
        <section
          key={passageKey ?? undefined}
          ref={passageSectionRef}
          data-testid="library-source-passage"
          data-state={passage.phase === "ready" ? (passage.passage?.state ?? "failed") : passage.phase}
          tabIndex={-1}
          aria-labelledby={SOURCE_PASSAGE_HEADING_ID}
          className="mt-5 border-t border-[color:var(--color-border-soft)] pt-4 focus:outline-none"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3
              id={SOURCE_PASSAGE_HEADING_ID}
              className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]"
            >
              {t("source.passage.title")}
            </h3>
            {/*
             * The address, spelled the way the wiki page spells it, and the extractor's
             * own name for the place it points at. One statement rather than two: this
             * element replaced the separate line the pane used to print above the card,
             * which said the anchor and nothing else.
             */}
            <p
              data-testid="library-source-citation"
              className="min-w-0 font-mono text-caption text-[color:var(--color-text-tertiary)]"
            >
              #{passage.anchor}
              {passage.phase === "ready" && passage.passage?.state === "resolved"
                ? ` · ${passageLabelText(passage.passage.label, passage.anchor, t)}`
                : null}
            </p>
          </div>

          {passage.phase === "reading" ? (
            <p className="mt-2 text-label leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
              {t("source.passage.reading")}
            </p>
          ) : null}

          {passage.phase === "failed" ? (
            <p
              data-testid="library-source-passage-unreadable"
              className="mt-2 max-w-[var(--measure-prose)] text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
            >
              {passage.error
                ? t("source.passage.unreadable", { reason: passage.error })
                : t("source.passage.unreadableUnknown")}
            </p>
          ) : null}

          {passage.phase === "ready" && passage.passage?.state === "resolved" ? (
            <div className="mt-2 flex flex-col gap-1.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
              {/* Two units either side, so a line that ends mid-sentence — which a
                  hard-wrapped policy's `l14` does — is read inside its paragraph
                  instead of as a fragment (po-evidence, 2026-09-11). */}
              {passage.passage.before.map((unit, index) => (
                <PassageLine key={`before-${index}-${unit.anchor}`} unit={unit} cited={false} />
              ))}
              {/* Every unit carrying the anchor. A `h:<slug>` address names a heading
                  *and* the paragraphs under it, so the section is the unit there —
                  showing only the first would offer the word "Records" as the evidence
                  for what the Records section says. */}
              {passage.passage.cited.map((unit, index) => (
                <PassageLine key={`cited-${index}-${unit.anchor}`} unit={unit} cited />
              ))}
              {passage.passage.after.map((unit, index) => (
                <PassageLine key={`after-${index}-${unit.anchor}`} unit={unit} cited={false} />
              ))}
            </div>
          ) : null}

          {passage.phase === "ready" && passage.passage?.state === "unresolved" ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {/* No passage, and no nearest one. The paragraph beside a renamed heading
                  is not the cited paragraph, and a reader shown it would believe a page
                  that lost its address (brief decision 3). */}
              {/*
                * **Atlas's own answer, in neither of the two voices that bracket it**
                * (guardian decision, 2026-09-11 council).
                *
                * Two seats measured this sentence and each prescribed a step that is
                * byte-identical to a different neighbour:
                *
                * - `text-label`/secondary is **11px · 16px · rgb(208,214,224)** — exactly
                *   the facts `dd` two rows up, so the answer to the press reads as another
                *   metadata row and the pane's moment has no winner (design-lead);
                * - `text-reading`/`leading-prose`/primary is **16px · 27.2px ·
                *   rgb(247,248,248) · 629.06px** — exactly `PassageLine cited`, the one
                *   pair this section reserves for the file's own words, so a sentence *about*
                *   a missing passage wears the clothes of quoted evidence
                *   (design-interaction).
                *
                * The second collision is the worse defect and decides the tie: this slice's
                * own falsifier is a reader who believes something the file does not say, and
                * the `unresolved` state exists precisely because nothing may be quoted. An
                * attention deficit is a weaker fault than a voice a person cannot attribute.
                * So the value is neither seat's: **`text-body` · `leading-body` · primary**
                * — 12.5px/20px/rgb(247,248,248). One size step and one ink step above the
                * facts rows, and three channels below the quote: smaller (12.5 vs 16), UI
                * leading rather than prose (20 vs 27.2), and no card. The card stays absent
                * for the reason it always was — a card here would read as a quotation, and
                * there is nothing to quote.
                *
                * `[overflow-wrap:break-word]` is the pair `PassageLine` already carries.
                * With `keep-all` alone this sentence interpolates an address it does not
                * control, and a 40-syllable unspaced Korean slug had **no break
                * opportunity at all**: `scrollWidth 387 / clientWidth 342` at 390 and
                * `387/272` at 320, turning a vertical reading pane into one that slides
                * sideways (`scrollLeft` really reached 21 · 91) — design-responsive.
                */}
              <p
                data-testid="library-source-passage-missing"
                className="max-w-[var(--measure-prose)] text-body leading-body text-[color:var(--color-text-primary)] [overflow-wrap:break-word] [word-break:keep-all]"
              >
                {t("source.passage.missing", { anchor: passage.anchor })}
              </p>
              {/* The one alternative Atlas is allowed to name: the extractor itself
                  reported this heading occurring more than once, so the addresses its
                  occurrences carry today are a measurement, not a guess. */}
              {passage.passage.candidates.length > 0 ? (
                <p
                  data-testid="library-source-passage-ambiguous"
                  className="max-w-[var(--measure-prose)] text-caption leading-body text-[color:var(--color-text-quaternary)] [overflow-wrap:break-word] [word-break:keep-all]"
                >
                  {t("source.passage.ambiguous", {
                    candidates: passage.passage.candidates.map((one) => `#${one}`).join(", "),
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {passage.phase === "ready" && passage.passage?.state === "no-text" ? (
            <p
              data-testid="library-source-passage-no-text"
              className="mt-2 max-w-[var(--measure-prose)] text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
            >
              {t("source.passage.noText", {
                label: passageLabelText(passage.passage.label, passage.anchor, t),
              })}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="mt-5">
        <button
          type="button"
          onClick={onOpen}
          data-testid="library-source-open"
          className={controlClass({ shape: "chip", tone: "muted", className: "gap-2" })}
        >
          {canReveal ? (
            <FolderOpen size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <Download size={ICON_SIZE.sm} aria-hidden />
          )}
          {canReveal ? t("source.reveal") : t("source.download")}
        </button>
      </div>
    </div>
  );
}
