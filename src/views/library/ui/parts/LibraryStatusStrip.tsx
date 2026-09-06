"use client";

import type { useTranslations } from "next-intl";

import { isAdvisoryWikiCode, isWikiFolderCode } from "../../lib/merge-wiki-verdict";
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
  } else if (model.wikiPages.length > 0) {
    // No step is next and pages exist, so the sequence really is finished. Saying so is
    // the one case where a verdict with no number is worth a line.
    parts.push(t("stage.statusReady"));
  }
  if (model.needsCompileCount > 0) {
    parts.push(t("stage.statusWaiting", { count: model.needsCompileCount }));
  }
  /*
   * **The header counts what the rows draw, or it is a third opinion** (2026-09-07).
   *
   * `offTemplateCount` counts every page whose merged verdict is not `ok`, and after PR
   * #1486 that includes a dangling link — a folder finding the row deliberately marks with
   * a quiet word rather than the amber pill. Measured on the owner's seven-page folder, the
   * header said "2 off-template" over one pill and one quiet word. So both clauses are
   * derived here the same way the row derives its two marks: a page's own shape, and a
   * folder finding a person can act on. The advisory findings are counted by neither; they
   * are true of a young wiki rather than of a page, and the Check-the-wiki report is where
   * a judgement about the whole wiki belongs.
   */
  const verdicts = [...model.verdicts.values()];
  const offTemplate = verdicts.filter((verdict) =>
    verdict.problems.some((problem) => !isWikiFolderCode(problem.code)),
  ).length;
  const unlinked = verdicts.filter((verdict) =>
    verdict.problems.some(
      (problem) => isWikiFolderCode(problem.code) && !isAdvisoryWikiCode(problem.code),
    ),
  ).length;
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
