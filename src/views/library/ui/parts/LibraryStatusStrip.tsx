"use client";

import type { useTranslations } from "next-intl";

import { libraryDanglingLinkCount, libraryOffTemplateCount } from "../../lib/merge-wiki-verdict";
import { libraryStepStates } from "../../lib/stage-steps";
import type { LibraryUiModel } from "../../lib/use-library-model";

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
  t,
}: {
  model: LibraryUiModel;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const states = libraryStepStates(model);
  const titles = [t("stage.gather.title"), t("stage.compile.title"), t("stage.read.title")];
  const parts: string[] = [];
  if (states.leadIndex >= 0) {
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
   * **Two clauses that add up.** `needsCompileCount` includes the part-read sources, so
   * printing it whole beside its own subset gave *2 waiting · 1 read in part* over a
   * two-row list — a person counting three where the folder holds two. The waiting clause
   * therefore names what is left after the subset, and disappears when the subset is all
   * there is, which is exactly when "read in part" is the whole answer.
   */
  const plainlyWaiting = model.needsCompileCount - model.partialCount;
  if (plainlyWaiting > 0) parts.push(t("stage.statusWaiting", { count: plainlyWaiting }));
  if (model.partialCount > 0) {
    parts.push(t("stage.statusPartial", { count: model.partialCount }));
  }
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

  return (
    <p
      data-testid="library-status-strip"
      className="min-w-0 truncate text-label leading-body text-[color:var(--color-text-secondary)]"
    >
      {parts.join(" · ")}
    </p>
  );
}
