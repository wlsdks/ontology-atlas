"use client";

import type { useTranslations } from "next-intl";

import { libraryStepStates } from "../../lib/stage-steps";
import type { LibraryUiModel } from "../../lib/use-library-model";

/**
 * **Where the folder stands, on the row the picture already has.**
 *
 * The three steps left the pane for a popup on 2026-09-06, and a guide behind a chip is a
 * guide nobody opens twice. What must survive that move is not the shelf's copy but its
 * **verdict**: which step is done, which one is next, and the two counts that decide it.
 * Those fit on one `text-label` line beside the caption, so the answer to "where am I"
 * stays on screen while the answer to "how do I do it" moves one press away.
 *
 * Every word here comes from `libraryStepStates`, the same function the shelf's badges
 * read, so the strip and the panel behind the chip cannot disagree — and every number is
 * one the folder can be checked against, never a summary of prose.
 */
export function LibraryStatusStrip({
  model,
  t,
}: {
  model: LibraryUiModel;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  const states = libraryStepStates(model);
  const parts = [
    t("stage.status", { step: t("stage.gather.title"), state: t(`stage.state.${states.gather}`) }),
    t("stage.status", { step: t("stage.compile.title"), state: t(`stage.state.${states.compile}`) }),
    t("stage.status", { step: t("stage.read.title"), state: t(`stage.state.${states.read}`) }),
  ];
  // Only the counts that are true of this folder. A run of zeroes is not a status; it is
  // three ways of saying "nothing is wrong", which is what the step words already said.
  if (model.needsCompileCount > 0) {
    parts.push(t("stage.statusWaiting", { count: model.needsCompileCount }));
  }
  if (model.offTemplateCount > 0) {
    parts.push(t("stage.statusOffTemplate", { count: model.offTemplateCount }));
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
