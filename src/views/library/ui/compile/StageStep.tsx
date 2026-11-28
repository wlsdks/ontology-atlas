import type { ReactNode } from "react";
import type { useTranslations } from "use-intl";

import { cn } from "@/shared/lib/cn";
import type { LibraryStepState } from "../../lib/compile/stage-steps";

/**
 * One row of the stage. The shell is identical for all three, which is what makes the heights match:
 * head line, exactly one caption line, and one action row with a reserved height.
 */
export function StageStep({
  index,
  title,
  caption,
  state,
  lead,
  action,
  extra,
  testId,
  t,
}: {
  index: number;
  title: string;
  /** One line, always present. A row whose caption is optional moves the rows under it. */
  caption: string;
  state: LibraryStepState;
  /**
   * Whether this is the **first** step that is next. Two steps can honestly be next at
   * once, but two indigo edges is no emphasis at all, so the edge goes to the earliest.
   */
  lead: boolean;
  action: ReactNode;
  /** Step two's own state: the blocked reason, the runner's card, the transfer sentence. */
  extra?: ReactNode;
  testId: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  /**
   * Only the lead step prints the `next` word; a later step that is not done prints `waiting`.
   * `data-step-state` keeps the derived state, so `libraryStepStates` (read by the header strip too)
   * is untouched.
   */
  const word: LibraryStepState = !lead && state === "next" ? "waiting" : state;
  return (
    <li
      data-testid={testId}
      data-step-state={state}
      className={cn(
        /* `library-spine-step` is the fold's handle: inside a short
           `@container library-landing` a `done` step keeps this head line and drops the
           parts marked `library-spine-fold-away` (`app/globals.css`). */
        "library-spine-step flex flex-col rounded-panel border bg-[color:var(--color-panel)] px-3 py-2.5",
        lead
          ? /* Solid accent edge: an alpha border falls under the 3:1 WCAG 1.4.11 asks. */
            "border-[color:var(--color-indigo-accent)]"
          : "border-[color:var(--color-border-soft)]",
      )}
    >
      <div data-testid="library-step-core" className="flex flex-col gap-1">
        <div className="flex items-baseline gap-2">
          <span className="flex-none font-mono text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
            {index}
          </span>
          <h3 className="min-w-0 flex-1 truncate text-body font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">
            {title}
          </h3>
          {/* The step's word is in ink rather than a badge, so the row does not stack bordered boxes on one
             line. `next` keeps the one indigo the row's edge already carries. */}
          <span
            data-testid={`library-stage-state-${word}`}
            /*
             * The word stays true and only the emphasis is singular: two steps can honestly be next, but painting
             * both indigo put two accents in a 360px panel and the eye found neither, so the ink follows the lead edge.
             */
            className={cn(
              "flex-none text-label leading-body tabular-nums",
              lead
                ? "text-[color:var(--color-indigo-text-soft)]"
                : "text-[color:var(--color-text-quaternary)]",
            )}
          >
            {t(`stage.state.${word}`)}
          </span>
        </div>
        <p className="library-spine-fold-away truncate text-label leading-body text-[color:var(--color-text-tertiary)]">
          {caption}
        </p>
      </div>
      {/*
         `min-h-8` is the chip's height, reserved even when this row has no control (the read step has none
         until a page exists): a slot that disappears moves everything under it.
       */}
      <div className="library-spine-fold-away mt-2 flex min-h-8 flex-wrap items-center gap-2">
        {action}
      </div>
      {/*
         `extra` is never folded away: step three's saved questions are the reason the fold exists, and step
         three is `done` on exactly the folder that has them. Only finished work (caption, action row) folds.
       */}
      {extra}
    </li>
  );
}
