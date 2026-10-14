"use client";

import type { useTranslations } from "next-intl";
import { BookText, FolderOpen, Download, Hash, Sparkles } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  formatSourceBytes,
  type LibrarySourceRow,
  type LibraryWriteUpLink,
} from "@/entities/docs-vault";
import { passageLabelText } from "@/features/library";
import { cn } from "@/shared/lib/cn";
import type { SourceOutline, SourceUnit } from "@/shared/lib/library/source-passage";
import { RowButton } from "@/shared/ui";
import { controlClass } from "@/shared/ui/control-class";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import type { CitedPassageState } from "../../lib/use-cited-passage";
import type { SourceOutlineState } from "../../lib/use-source-outline";
import { elideHashMiddle } from "../../lib/elide-hash";
import { AgentDoor } from "./AgentDoor";

const SOURCE_PASSAGE_HEADING_ID = "library-source-passage-heading";

/**
 * A source's format is its extension (`vaultSourceFormat`), so a name that ends in it
 * already says it in the headline. Only a file with no extension leaves the format a fact
 * the headline does not state.
 */
function nameCarriesFormat(row: LibrarySourceRow): boolean {
  return row.format !== "" && row.name.toLowerCase().endsWith(`.${row.format.toLowerCase()}`);
}

/*
 * `passageLabel` moved out of this file in slice U2 (`@/features/library`,
 * `passageLabelText`): the index column's search caption names the same place this section
 * does, and one fact in two voices is how one locale's "line 11" and another's would end up
 * side by side on one screen. The citations inside a page's body use it too.
 */

/** Names the outline section (`source.outline.title`) to a screen reader, through its own `aria-labelledby`. */
const SOURCE_OUTLINE_HEADING_ID = "library-source-outline-heading";

/** Outline rows preserve the source reader's addresses. Markdown headings use
 * original line anchors; DOCX headings keep h: anchors. Unsupported formats
 * state the limitation instead of inventing counts or searchable text. */
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
  /* The count rides on the section label, not in the list, so the list holds pressable addresses only. */
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
 * One unit of the file's own text, verbatim. Context is quieter than the cited unit but not
 * `text-caption`: a hard-wrapped line ends mid-sentence, so context finishes what is being checked.
 */
/**
 * The list carries the negative margin and each row keeps its own `px-2.5`: `shape: "row"` emits
 * `w-full`, and a `-mx` on a full-width row bleeds left while staying put on the right.
 */
const PANE_LIST_BLEED = "-mx-2.5";
const PANE_ROW_INSET = "px-2.5";

function PassageLine({ unit, cited }: { unit: SourceUnit; cited: boolean }) {
  return (
    <p
      data-testid={cited ? "library-source-passage-cited" : "library-source-passage-context"}
      className={cn(
        "whitespace-pre-wrap [overflow-wrap:break-word] [word-break:keep-all]",
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
 * Shows what Atlas holds about a raw source without opening it; text is read only when a person
 * presses a citation, never converted, and dropped on close (`docs/DECISIONS.md`).
 * The door reveals in Finder in the app (never opens) and hands over the bytes in a browser.
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
  indexShowsState = false,
  busy,
  t,
}: {
  row: LibrarySourceRow;
  /** The measured sha256, or null when nothing has asked for one yet. */
  hash: string | null;
  /** The passage a citation named; `null` when the file was opened from the index and never read. */
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
  /** Opens this pane at one address inside the file; sets the same `{path, anchor}` as a citation. */
  onOpenPassage?: (anchor: string) => void;
  onOpenWiki: (slug: string) => void;
  onCompile: () => void;
  /** The one fact true of pressing Compile: why it cannot run, or what leaves this computer. */
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
  /**
   * The index beside this pane is the Sources list, whose row for this file already
   * wears its state badge at `lg` and up; the pane's own state fact steps aside there.
   */
  indexShowsState?: boolean;
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
    wideHidden?: boolean;
  }> = [
    { key: "path", label: t("source.path"), value: row.path, mono: true },
    /*
     * Each fact appears once: the format row is omitted when the name carries the extension; the
     * state row hides at `lg`, where the Sources list badge sits beside this pane.
     */
    ...(nameCarriesFormat(row)
      ? []
      : [
          {
            key: "format",
            label: t("source.format"),
            value: row.format ? row.format.toUpperCase() : t("sources.noFormat"),
          },
        ]),
    { key: "size", label: t("source.size"), value: formatSourceBytes(row.bytes) },
    {
      key: "state",
      label: t("source.state"),
      value: t(`sources.state.${row.state}.label`),
      wideHidden: indexShowsState,
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
      /* The middle is elided so the row stays one line; `title` carries the whole value. */
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
   * Landing waits for the read (`landingKey` is null while reading); before that nothing can scroll.
   * `key={passageKey}` makes each citation a new node, so re-pressing fires `focusin`.
   * Scroll is immediate; no ring, since the `app/globals.css` floor rule skips `[tabindex="-1"]`.
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
      /* `pb-8` mirrors `pt-8` so the last block is not flush with the bottom of the window. */
      className="mx-auto w-full max-w-[var(--measure-doc-column)] px-6 pb-8 pt-8 md:px-10"
    >
      <h2 className="break-all text-display font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] text-[color:var(--color-text-primary)]">
        {row.name}
      </h2>
      {/* `ch` resolves at the element's own size, so `max-w-[var(--measure-prose)]` here would cut the line
         short of the table's right edge. */}
      <p
        data-testid="library-source-opened-state"
        className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
      >
        {t(openedSentence)}
      </p>

      <dl className="mt-5 flex flex-col gap-2 border-t border-[color:var(--color-border-soft)] pt-4">
        {facts.map((fact) => (
          <div
            key={fact.key}
            data-fact={fact.key}
            className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-0.5", fact.wideHidden && "lg:hidden")}
          >
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
                  {/* Not yet measured is a third answer, not a quieter `behind`; it must match the STATE row. */}
                  <span
                    className={cn(
                      "flex-none",
                      page.freshness === "current" &&
                        "text-[color:var(--color-success-text-a90)]",
                      /* Same amber as the index chip; the word, not the colour, separates `partial` from `behind`. */
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
            <p className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
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
              <p
                data-testid="library-transfer"
                className="text-label leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
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
      {/* The availability block stands above Structure and the passage so the forward press stays in view. */}
      {/* Counts and names only, never bodies: a pane rendering whole documents would be a converted copy
         (`docs/DECISIONS.md`). */}
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
             * untrue fact, and the kind of number a person would believe. A heading-free text or
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
                    /* A heading is an address, so it is a press; neutral ink with a `#` glyph matches the write-up rows. */
                    <button
                      type="button"
                      data-testid={`library-source-outline-row-${line.anchor}`}
                      data-anchor={line.anchor}
                      onClick={() => onOpenPassage(line.anchor!)}
                      className={controlClass({
                        shape: "row",
                        size: "xs",
                        tone: "muted",
                        hoverInk: "strong",
                        hoverSurface: "lift",
                        className: `atlas-touch-floor w-full gap-2 ${PANE_ROW_INSET} text-body`,
                      })}
                    >
                      <Hash size={ICON_SIZE.sm} className="flex-none opacity-60" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-left">{line.text}</span>
                    </button>
                  ) : (
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
              className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
            >
              {passage.error
                ? t("source.passage.unreadable", { reason: passage.error })
                : t("source.passage.unreadableUnknown")}
            </p>
          ) : null}

          {passage.phase === "ready" && passage.passage?.state === "resolved" ? (
            <div className="mt-2 flex flex-col gap-1.5 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
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
              {/* Atlas's own answer wears neither the quote's voice (`text-reading`) nor the facts' (`text-label`).
                 `[overflow-wrap:break-word]` is needed: the interpolated address may have no break opportunity. */}
              <p
                data-testid="library-source-passage-missing"
                className="text-body leading-body text-[color:var(--color-text-primary)] [overflow-wrap:break-word] [word-break:keep-all]"
              >
                {t("source.passage.missing", { anchor: passage.anchor })}
              </p>
              {/* The one alternative Atlas is allowed to name: the extractor itself
                  reported this heading occurring more than once, so the addresses its
                  occurrences carry today are a measurement, not a guess. */}
              {passage.passage.candidates.length > 0 ? (
                <p
                  data-testid="library-source-passage-ambiguous"
                  className="text-caption leading-body text-[color:var(--color-text-quaternary)] [overflow-wrap:break-word] [word-break:keep-all]"
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
              className="mt-2 text-label leading-body text-[color:var(--color-text-tertiary)] [overflow-wrap:break-word] [word-break:keep-all]"
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
