"use client";

import type { RefObject } from "react";
import type { useTranslations } from "next-intl";

import { controlClass } from "@/shared/ui/control-class";

import { libraryDanglingLinkCount, libraryOffTemplateCount, selectCompileTargets } from "@/features/library";
import { libraryStepStates } from "../../lib/stage-steps";
import type { LibraryUiModel } from "@/features/library";

/**
 * **One verdict, or nothing at all.**
 *
 * The strip shipped on 2026-09-06 as all three step states at once — *Gather next ·
 * Compile waiting · Read waiting* — and the owner read that header on an empty folder as
 * part of a screen that "looks broken". A run of turns-not-yet-come is not a status: it
 * is three ways of saying nothing has happened, printed beside a caption that already
 * said *0 sources · 0 pages · 0 concepts*.
 *
 * So this says **which step is next**, and then only the counts that are true of this
 * folder — *Compile next · 5 waiting*. When every source is written up it says so in one
 * clause; when there is nothing to report it renders nothing and the header keeps the
 * caption alone. A header that is sometimes quiet is what makes it worth reading when it
 * is not.
 *
 * Every word comes from `libraryStepStates`, the same function the stepper's rows read,
 * so the header and the panel behind the chip cannot disagree.
 */
export function LibraryStatusStrip({
  model,
  indexShowsSourceStates = false,
  onCompileNext,
  compileAnchorRef,
  compileOpen,
  t,
}: {
  model: LibraryUiModel;
  /**
   * The index beside this strip is the Sources list, whose head already counts the
   * not-compiled rows. The strip then leaves that clause out, so one fact is said once on
   * the screen rather than twice, 300px apart (design sweep, 2026-09-25).
   */
  indexShowsSourceStates?: boolean;
  /** Opens the Compile popover, the home clause's own press; absent, the clause is text. */
  onCompileNext?: () => void;
  /** Where that popover hangs while this strip, not the home's, is on screen. */
  compileAnchorRef?: RefObject<HTMLButtonElement | null>;
  compileOpen?: boolean;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const states = libraryStepStates(model);
  const titles = [t("stage.gather.title"), t("stage.compile.title"), t("stage.read.title")];
  const parts: string[] = [];
  /*
   * **"Compile next" names what is next** (design sweep, 2026-09-25). The home strip says
   * *Compile next: chargeback-runbook.md*; this strip said *Compile next* and stopped — a
   * label with its object cut off. Both read the file `selectCompileTargets` would start
   * on, which is what the press itself runs.
   */
  const compileTarget = states.leadIndex === 1 ? (selectCompileTargets(model.sources)[0] ?? null) : null;
  if (compileTarget) {
    parts.push(t("home.compileNext", { source: compileTarget.path.replace(/^sources\//, "") }));
  } else if (states.leadIndex >= 0) {
    parts.push(
      t("stage.status", {
        step: titles[states.leadIndex] as string,
        state: t("stage.state.next"),
      }),
    );
  } else if (states.checkingCount > 0) {
    /*
     * ⚠️ **Nothing is next and nothing is finished either.** Hashing is lazy, so a folder
     * whose sources have been listed but not measured has `needsCompileCount === 0`
     * without anything being known to be written up. Printing "every source is written
     * up" there was the header's half of a three-way contradiction the owner read on the
     * merged build; the rows said `checking` and step three said 0 of 7.
     */
    parts.push(t("stage.statusChecking", { count: states.checkingCount }));
  } else if (model.wikiPages.length > 0) {
    // No step is next, nothing is still being measured, and pages exist, so the sequence
    // really is finished. Saying so is the one case where a verdict with no number is
    // worth a line.
    parts.push(t("stage.statusReady"));
  }
  /*
   * **The same two numbers the home prints, in the same words** (2026-09-19).
   *
   * This strip summed what was waiting into one figure — *Compile next · 12 waiting* —
   * while the home strip a press away said *10 sources changed* beside an index chip
   * saying *not compiled 2*, and the how-to panel said *2 not written up yet · 10 source
   * versions need review*. Twelve is the sum of two and ten, but a person reading the
   * reader's header after the home's counts twelve where they just counted ten, and the
   * word *waiting* names neither piece of work. So the clauses here are the home's own:
   * the not-compiled count under the index chip's word, the changed count under the home
   * strip's, and the part-read count in its own clause as before.
   *
   * `needsCompileCount` also counts a compiled source whose citing pages need review;
   * that remainder keeps the old waiting word so the arithmetic still closes, and it is
   * zero on every folder where the three states are the whole story.
   */
  /*
   * ⚠️ **One not-compiled file that the lead clause already names is said once** (2026-09-25).
   * *Compile next: new-uncompiled-notes.md · 1 not compiled* stated the same single file
   * twice, and the home strip, which carries no such clause, read differently for the same
   * folder. At two or more the count adds what the name cannot, so it stays.
   */
  const leadNamesTheOnlyOne =
    compileTarget !== null && model.notCompiledCount === 1 && compileTarget.state === "not-compiled";
  if (model.notCompiledCount > 0 && !indexShowsSourceStates && !leadNamesTheOnlyOne) {
    parts.push(t("stage.statusNotCompiled", { count: model.notCompiledCount }));
  }
  if (model.staleCount > 0) parts.push(t("home.staleClause", { count: model.staleCount }));
  if (model.partialCount > 0) {
    parts.push(t("stage.statusPartial", { count: model.partialCount }));
  }
  const reviewOnly =
    model.needsCompileCount - model.notCompiledCount - model.staleCount - model.partialCount;
  if (reviewOnly > 0) parts.push(t("stage.statusWaiting", { count: reviewOnly }));
  /*
   * **The header counts what the rows draw, or it is a third opinion** (2026-09-07).
   *
   * Both clauses are derived the way the row derives its two marks — a page's own shape,
   * and a folder finding a person can act on — and since the graph became the Library's
   * home a third surface prints the same two numbers, so the arithmetic itself moved to
   * `merge-wiki-verdict.ts`. Its own comments carry why a page is the unit for one and a
   * link is the unit for the other; the advisory findings are counted by neither.
   */
  const offTemplate = libraryOffTemplateCount(model.verdicts);
  const unlinked = libraryDanglingLinkCount(model.verdicts);
  if (offTemplate > 0) parts.push(t("stage.statusOffTemplate", { count: offTemplate }));
  if (unlinked > 0) parts.push(t("stage.statusUnlinked", { count: unlinked }));
  if (parts.length === 0) return null;

  /*
   * ⚠️ **The next file is a press here too** (2026-09-25). The home strip draws
   * *Compile next: chargeback-runbook.md* as an accent link that opens the Compile
   * popover; this strip printed the same words as plain text, so one fact wore two
   * grammars a press apart and a person could not tell whether either was pressable. With
   * `onCompileNext` the clause is the home's link, with the home's popover behind it.
   */
  if (compileTarget && onCompileNext) {
    const rest = parts.slice(1);
    return (
      <p
        data-testid="library-status-strip"
        className="flex min-w-0 items-center gap-x-1.5 text-label leading-body text-[color:var(--color-text-secondary)]"
      >
        <button
          type="button"
          ref={compileAnchorRef}
          onClick={onCompileNext}
          data-testid="library-status-compile"
          aria-expanded={compileOpen}
          className={controlClass({
            shape: "link",
            tone: "accent",
            hoverInk: "strong",
            active: compileOpen === true,
            className: "min-w-0 max-w-full",
          })}
        >
          <span className="min-w-0 truncate">{parts[0]}</span>
        </button>
        {rest.length > 0 ? (
          <>
            <span aria-hidden className="flex-none text-[color:var(--color-text-quaternary)]">
              ·
            </span>
            <span className="min-w-0 truncate">{rest.join(" · ")}</span>
          </>
        ) : null}
      </p>
    );
  }

  return (
    <p
      data-testid="library-status-strip"
      className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-secondary)]"
    >
      {parts.join(" · ")}
    </p>
  );
}
