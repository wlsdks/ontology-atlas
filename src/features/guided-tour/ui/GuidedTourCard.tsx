"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import type { UseGuidedTourResult } from "../model/use-guided-tour";
import type { CardPlacement } from "../model/resolve-anchor-rect";

export interface GuidedTourCardProps {
  tour: UseGuidedTourResult;
  placement: CardPlacement;
  width: number;
  onActivateAnchor?: () => void;
  style?: React.CSSProperties;
}

/**
 * The card — progress dots N/M, title, body, [back][next]/[skip], step 7's
 * (recent) two-way branch, and the interactive (step 4) waiting label are all
 * drawn by this one component. The surface uses only the existing panel tokens:
 * `--color-panel`, `--chrome-border`, `--chrome-shadow`, `--chrome-radius`.
 */
export function GuidedTourCard({
  tour,
  placement,
  width,
  onActivateAnchor,
  style,
}: GuidedTourCardProps) {
  const t = useTranslations("guidedTour");
  const { step, stepIndex, personaSteps, personaStepIndex, back, advance, skip, finishAsDone, chooseDevBranch, hasSelection, devBranchAvailable, isFinalStep } = tour;

  // Focus movement (2026-07-23) — when the `role="dialog"` card opens or the step
  // changes, focus moves to the card (re-announcing the aria-label and giving a
  // keyboard user a Tab starting point). Restoring the trigger on close belongs to
  // `useGuidedTour.start()`/`finish()` (avoiding the child effect running first and
  // polluting the activeElement capture).
  //
  // The focus trap lives in **`GuidedTourOverlay`, not here**
  // (`useDialogFocusTrap`, `initialFocus: "none"`). The overlay contains the card,
  // so its scope is wider and more accurate. Trapping here as well would create two
  // window keydown listeners and one Tab would move focus twice — the 2026-07-28
  // audit nearly introduced exactly that.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stepId = step?.id ?? null;
  useEffect(() => {
    if (stepId) cardRef.current?.focus({ preventScroll: true });
  }, [stepId]);

  if (!step) return null;

  // Progress is measured against the persona's fixed journey (`personaSteps`),
  // not the momentarily resolvable `visibleSteps`, so the denominator does not
  // fluctuate within one tour. A skipped step looks like a dot passed over.
  // Navigation (including whether [back] is enabled) still uses `visibleSteps` indices.
  const total = personaSteps.length;
  const current = personaStepIndex + 1;
  const isFirst = stepIndex <= 0;
  const isBranchStep = step.id === "recent";
  const isInteractive = Boolean(step.interactive);

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      data-testid="guided-tour-card"
      data-tour-card-side={placement.side}
      role="dialog"
      aria-modal="true"
      aria-label={t(`steps.${step.copyKey}.title`)}
      className={cn(
        "fixed z-[var(--z-tour-card)] rounded-[var(--chrome-radius)] border border-[color:var(--chrome-border)] bg-[color:var(--color-panel)] p-4 shadow-[var(--chrome-shadow)]",
        "transition-opacity duration-[var(--topology-tour-transition-ms)] ease-[var(--topology-motion-ease-out)] motion-reduce:transition-none",
        // Step-transition entrance — the overlay remounts via `key={step.id}`, so
        // this keyframe (the opacity-only `panelCrossfadeIn`) runs once per step.
        //
        // 2026-07-28: promoted from an inline arbitrary
        // `animate-[…] motion-reduce:animate-none` **to a named class**. Inline,
        // globals.css's reduced-motion registry had no selector to point at, so a
        // reduced-motion user got only the global kill rule and no equivalent at
        // all — step transitions were entirely hard cuts. The registry list is the
        // reach.
        "guided-tour-card-in",
        "focus:outline-none",
      )}
      style={{ width, ...style }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          data-testid="guided-tour-progress"
          className="font-mono text-caption tracking-caption text-[color:var(--color-text-quaternary)]"
        >
          {t("progressLabel", { current, total })}
        </p>
        {/* One button grammar for every action in the card (2026-09-25): `<Button>` at
            `sm`, ghost for the quiet ones, outline for the stand-in press and primary
            for going forward. The card used to mix three shapes in one surface — a
            dashed 326x32 chip, a 46x32 segment and a 39x24 text link. The skip sits in
            the header row, pulled into its corner so its label keeps the padding line. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={skip}
          data-testid="guided-tour-skip"
          className="-mr-2 -mt-1"
        >
          {t("skipLabel")}
        </Button>
      </div>

      <div className="mb-2 flex items-center gap-1" aria-hidden>
        {personaSteps.map((s, i) => (
          <span
            key={s.id}
            data-testid="guided-tour-dot"
            data-active={i === personaStepIndex ? "true" : "false"}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              i === personaStepIndex
                ? "bg-[color:var(--color-indigo-brand)]"
                : "bg-[color:var(--color-border-strong)]",
            )}
          />
        ))}
      </div>

      <h2 className="mb-1.5 text-body-lg tracking-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        {t(`steps.${step.copyKey}.title`)}
      </h2>
      <p className="mb-3 text-body tracking-body leading-body text-[color:var(--color-text-secondary)]">
        {t(`steps.${step.copyKey}.body`)}
      </p>

      {isInteractive ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onActivateAnchor}
          disabled={!onActivateAnchor || hasSelection}
          data-testid="guided-tour-activate-target"
          /* `justify-center` / `text-center` mean nothing without a width. The card
             is not a flex container, so this button was shrink-to-fit and those two
             centring declarations **had never once applied** — it sat left-aligned
             while claiming to be centred (measured 2026-07-29). Filling the width is
             also what lines its left edge up with "Previous" on the same row. */
          className="w-full"
        >
          <span data-testid={hasSelection ? "guided-tour-success" : "guided-tour-waiting"}>
            {hasSelection ? t("clickSuccessLabel") : t("waitingForClickLabel")}
          </span>
        </Button>
      ) : null}

      {/**
       * **[back] does not disappear on any step** (dogfooding 2026-07-29).
       *
       * The draft wrapped the whole back/next row in `!isInteractive`, so on 4/7
       * ("try clicking it yourself") and the final branch step **[back] vanished
       * entirely** — a control that had been at the bottom left for five steps
       * silently disappeared on the sixth. The user then has to relearn whether
       * this tour can go back at all.
       *
       * How to go forward may differ per step (next, try it, choose a branch).
       * **There is no reason for how to go back to differ.** So [back] is lifted
       * out of the three branches and stands in the same place always, and only
       * the forward control is chosen by the step.
       */}
      {isBranchStep ? (
        <div className="mt-1 flex flex-col gap-2">
          {/* The branch's two buttons are **one set** stacked vertically, one height. */}
          <Button
            variant="outline"
            size="sm"
            onClick={finishAsDone}
            data-testid="guided-tour-finish-tour"
            className="w-full"
          >
            {t("finishTourAction")}
          </Button>
          {/* When step 8's anchor (the first-run card) has already been dismissed and
              cannot resolve, the branch button is hidden — a button with nowhere to go
              was the welcome reset loop (measured correction 2026-07-23). */}
          {devBranchAvailable ? (
            <Button
              variant="primary"
              size="sm"
              onClick={chooseDevBranch}
              data-testid="guided-tour-dev-branch"
              className="w-full"
            >
              {t("devBranchAction")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-1 flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={back}
          disabled={isFirst}
          data-testid="guided-tour-back"
        >
          {t("prevLabel")}
        </Button>
        {/* Only the forward control is chosen by the step — on an interactive step the
            anchor click does that job, and on the branch step the two choices above do. */}
        {!isInteractive && !isBranchStep ? (
          <Button
            variant="primary"
            size="sm"
            onClick={isFinalStep ? finishAsDone : advance}
            data-testid={isFinalStep ? "guided-tour-finish" : "guided-tour-next"}
          >
            {isFinalStep ? t("finishLabel") : t("nextLabel")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
