"use client";

import { useMemo, type ReactNode } from "react";
import type { useTranslations } from "next-intl";

import type { LibraryWikiPage } from "@/entities/docs-vault";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui/control-class";
import { spineFreshness } from "../../lib/spine-shape";
import type { LibraryUiModel } from "../../lib/use-library-model";
import { isWikiFolderCode } from "../../lib/merge-wiki-verdict";
import { writerLabel } from "../../lib/writer-label";

/**
 * **The wiki index: what the folder holds, and how much of it is still true.**
 *
 * The index used to draw wiki pages as a column of identical rows. Every row carried the
 * same glyph, the same ink and the same height, so *"which of these has fallen behind the
 * file it was written from"* — the one question a wiki over a folder of documents keeps
 * asking — could only be answered by opening pages one at a time. The freshness was in
 * the folder the whole time: `source_hash` is exactly that fact, and `vault-library.ts`
 * has derived it per page since the pairing shipped. Nothing on screen spent it.
 *
 * The resting state is a readable row for each page: title first, then a short
 * source-state caption. The full source/currentness explanation remains in the row's
 * accessible name and title so the compact caption never has to carry the whole claim.
 *
 * | What the eye sees | What it is |
 * |---|---|
 * | title | the page a person can open without hover |
 * | caption | source matches, needs review, or has not been checked |
 * | top/bottom marker | source or page-shape problem, with the exact reason in words |
 * | indigo row | the page currently open in the reader |
 *
 * ⚠️ **The two ambers are not one state drawn twice.** The head is about the *source*
 * (compile it again); the foot is about the *page's own bytes* (fix the sections). They
 * sit at opposite ends because they are fixed in different places, and the accessible
 * name says which is which in words — a colour is never the only carrier.
 *
 * ⚠️ **Selection and staleness must not be confusable**, which is why they use different
 * hues, different edges and different fills rather than two weights of one mark: an open
 * page is an indigo body with an indigo border, a stale page is a neutral body with an
 * amber rim on its head. A page that is both draws both, and reads as both.
 *
 * ## Search is still a list
 *
 * Search and resting states share this row grammar so a page does not become harder to
 * identify when a query is cleared.
 *
 * ## Compile marks the shelf, not a spine
 *
 * While Compile runs, the thing being worked on is the shelf: the board under the books
 * takes the indigo and a line says so in words. A light that stepped from spine to spine
 * shipped here first and the design council cut it the same day (2026-09-08) — it
 * measured 1.29:1 against the open page's own fill, so a still frame could not say which
 * of the two a lit spine was, and resting on one book at a time read as *this page now*,
 * which is a fact nothing on this screen holds. Nothing here knows which page the agent
 * is on, so nothing here points at one.
 */

export interface LibraryShelfProps {
  model: LibraryUiModel;
  pages: readonly LibraryWikiPage[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  /** The writer named on the rows that are the exception; null when every page agrees. */
  majorityWriter: string | null;
  /** True while a Compile turn is in flight: the shelf is what that turn is about. */
  compiling: boolean;
  /**
   * *New page* — the hand action drawn in the list's grammar (council 2026-09-07).
   *
   * It sits **under the board**, not on the shelf: it is not a page, and a book-shaped
   * control that makes a book would be the one mark on this shelf standing for nothing in
   * the folder. Under the board it is still the last thing in the list and still in the
   * list's tab order.
   */
  trailing?: ReactNode;
  t: ReturnType<typeof useTranslations<"library">>;
}

export function LibraryShelf({
  model,
  pages,
  selectedSlug,
  onSelect,
  majorityWriter,
  compiling,
  trailing,
  t,
}: LibraryShelfProps) {
  const spines = useMemo(
    () =>
      pages.map((page) => {
        const problems = model.verdicts.get(page.slug)?.problems ?? [];
        return {
          page,
          freshness: spineFreshness({ page, writeUpsBySource: model.pairing.writeUpsBySource }),
          /** The page's own shape, not the folder's opinion of where it sits. */
          ownProblem: problems.find((problem) => !isWikiFolderCode(problem.code)) ?? null,
        };
      }),
    [model.pairing.writeUpsBySource, model.verdicts, pages],
  );

  return (
    <div
      data-testid="library-wiki-list"
      data-compiling={compiling ? "board" : undefined}
    >
      <ul
        data-testid="library-wiki-shelf"
        aria-label={t("shelf.listAria")}
        aria-busy={compiling || undefined}
      className="flex flex-col gap-1 px-3 pb-1 pt-2"
      >
        {spines.map(({ page, freshness, ownProblem }) => {
          const active = page.slug === selectedSlug;
          const answerVersion = model.answerVersions?.get(page.slug);
          const writer = (page.createdBy ?? "") !== majorityWriter ? writerLabel(page.createdBy, t) : null;
          /*
           * Everything the spine cannot draw at 26px wide is said here, so the mark and
           * the sentence carry the same facts and neither is the only copy: the whole
           * title (a spine truncates), the freshness in words, the template problem's
           * own code, and the writer where it is the exception.
           */
          /*
           * ⚠️ **The dot marks the page's own defect, and nothing else** (guardian,
           * 2026-09-09). It shipped as `stale || ownProblem`, and on the owner's folder
           * that put the warning ink — `--color-amber-source-a90` is the same value as
           * `--color-status-warning` — on 3 of 3 rows. A mark every row wears carries
           * nothing, and 3/3 was not a small sample: staleness is the *resting* state of
           * a folder somebody is working in, so a union with it trends to every row on
           * any live shelf.
           *
           * `stale` is not dropped; it is said in words on the caption below, where it
           * always was, and in the accessible name. The dot is pointed at the one fact
           * that line can lose: it reads `<source state> · <off-template>` inside
           * `truncate`, so only the trailing off-template segment can be clipped, and the
           * dot is what survives the clip. `unverified` still gets no dot for the older
           * reason — nothing is wrong there and nobody has started, which is why its row
           * keeps the quiet border rather than a tinted one.
           */
          const needsAttention = Boolean(ownProblem);
          const facts = [
            page.title,
            answerVersion ? t(`answers.version.${answerVersion}`) : null,
            t(`shelf.freshness.${freshness}`),
            ownProblem ? t("wiki.offTemplateReason", { code: ownProblem.code }) : null,
            writer ? t("wiki.writtenBy", { author: writer }) : null,
          ].filter((fact): fact is string => Boolean(fact));
          return (
            <li key={page.slug} className="flex">
              <button
                type="button"
                data-testid={`library-wiki-${page.slug}`}
                data-freshness={freshness}
                aria-current={active ? "true" : undefined}
                aria-label={facts.join(" · ")}
                title={facts.join("\n")}
                onClick={() => onSelect(page.slug)}
                /*
                 * **The value layer owns what a control is; this file owns what a spine
                 * is.** `tile` is the one vertical shape in `control-class.ts` — a box
                 * with its label stacked inside it — so the spine takes its border,
                 * radius, focus ring, disabled state and ink tone from there. What the
                 * shape cannot know is the geometry of a book: the width ramp, the one
                 * height, and a foot that is square because the book stands on a board.
                 * Those come from `--library-spine-*` and override the tile's own
                 * padding, which is written for a tile with an icon in it.
                 *
                 * ⚠️ **One ink ladder, four rungs, measured on the panel.** A book with a
                 * body is a book somebody has checked; a body that is only an outline is
                 * a page nothing has been able to check. The first build gave every spine
                 * `--color-overlay-1` (2% white) and the fresh ones disappeared beside
                 * the amber ones — a state that cannot be seen is not a state.
                 *
                 * ⚠️ **The open page's edge is the solid accent, not an alpha step.**
                 * Measured on the panel: the stale head rim is 8.7:1 while a selected
                 * `--color-indigo-line-a35` edge was 1.4 — the page a person had open was
                 * the quietest thing on its own shelf, and WCAG 1.4.11 asks 3:1 of a mark
                 * identifying a state. `--color-indigo-accent` measures 4.96:1 there, on
                 * all four edges, against a 2px cap at one end (ΔE 109.9 between them).
                 */
                className={controlClass({
                  shape: "row",
                  size: "md",
                  tone: active ? "strong" : freshness === "unverified" ? "default" : "secondary",
                  /* The ink step under the cursor is the layer's axis, not a hand-written
                     `hover:text-*` — the same rule that keeps 303 other hovers countable. */
                  hoverInk: "strong",
                  className: cn(
                    "group relative min-h-0 items-start justify-start overflow-hidden border px-3 py-2.5 text-left",
                    "transition-[box-shadow,background-color,border-color,color]",
                    "hover:shadow-[var(--shadow-control-press)]",
                    active
                      ? "border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-a22)]"
                      : freshness === "unverified"
                        ? "border-[color:var(--color-border-soft)] bg-transparent"
                        : "border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-2)]",
                  ),
                })}
              >
                {/*
                  ⚠️ **The coloured bar is gone, and this is the second attempt at it.**

                  It shipped as a full-bleed amber rim across the head of the card, over an
                  amber border around the whole card, and the owner read it exactly right
                  (2026-09-09): *"that yellow line on top looks so AI."* The first repair
                  moved the same bar to the row's leading edge — and the owner read that
                  too: *"what even is that line on the left… don't design it AI-ish, do it
                  our way."*

                  Our way was already written down. `docs/DESIGN-SYSTEM.md` lists
                  **full-height coloured rails** among the canonical Don'ts, beside
                  kind-coloured card backgrounds, and prescribes the replacement in the same
                  breath: *a neutral surface with a small marker and a label*. Moving a rail
                  from the top edge to the start edge is still a rail. So the bar is gone in
                  both places, and the fact it carried moves into the line that was already
                  under the title saying it in words.

                  Both states still reach the eye, and they are still two states: the source
                  moved (fix it by compiling again) and the page's own shape misses the
                  template (fix it in the page). They now read as two words on one line
                  rather than as two ends of a coloured edge, and the dot is the "small
                  marker" the rule asks for — spent on the rarer of the two, because a
                  marker on the state a working folder rests in marks nothing.
                */}
                {/*
                  The title runs down the book. Its ink is the control's `tone`, so the
                  three states are one ladder the value layer owns rather than three
                  colours written here: strong open, secondary checked, tertiary
                  unverified — 14.3, 11.4 and 5.9 on their own fills, all over the 4.5
                  text floor. A spine truncates in the middle of a long name, so the whole
                  title is in the accessible name above.
                */}
                <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 break-keep text-body leading-body">
                    {page.title}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-label leading-label text-[color:var(--color-text-tertiary)]">
                    {needsAttention ? (
                      <span
                        aria-hidden
                        data-testid="library-spine-attention-dot"
                        className="size-1.5 flex-none rounded-full bg-[color:var(--color-amber-source-a90)]"
                      />
                    ) : null}
                    <span className="min-w-0 truncate">
                      {answerVersion
                        ? `${t(`answers.version.${answerVersion}`)} · `
                        : ''}
                      {ownProblem
                        ? `${t(`shelf.state.${freshness}`)} · ${t("wiki.offTemplate")}`
                        : t(`shelf.state.${freshness}`)}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {/*
        **The board the books stand on.** It is drawn rather than implied because the
        spines are the only thing on this column that does not fill its width: without a
        line under them a short shelf reads as a row of floating boxes, which is the
        `floating-box soup` the Don'ts refuse. It takes `--color-border-strong` rather
        than the soft step the rest of this column uses: measured at 1512, a 6% rule under
        a 6% spine edge was the same value twice and the books read as standing on
        nothing. While Compile runs it takes the indigo the
        light carries, so the reduced-motion reader — for whom nothing travels — still has
        the shelf itself marked as the thing being worked on.
      */}
      <div
        aria-hidden
        data-testid="library-shelf-board"
        className={cn(
          "mx-2 h-px transition-colors",
          compiling ? "bg-[color:var(--color-indigo-a40)]" : "bg-[color:var(--color-border-strong)]",
        )}
      />
      {compiling ? (
        <p
          role="status"
          data-testid="library-shelf-compiling"
          className="px-3 pt-1.5 text-caption leading-body text-[color:var(--color-text-tertiary)] [word-break:keep-all]"
        >
          {t("shelf.compiling")}
        </p>
      ) : null}
      {trailing ? <div className="px-1 pt-1.5">{trailing}</div> : null}
    </div>
  );
}
