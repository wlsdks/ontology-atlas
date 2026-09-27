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
 * The tour card: progress dots, title, body, back/next/skip, the step 7 branch and the step 4
 * waiting label, on the existing panel tokens only.
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

  // Focus moves to the card on open and on each step, re-announcing it and giving keyboard users
  // a Tab start. Trigger restore belongs to `useGuidedTour.start()`/`finish()`. The focus trap
  // lives in `GuidedTourOverlay`; a second trap here would move focus twice per Tab.
  const cardRef = useRef<HTMLDivElement | null>(null);
  const stepId = step?.id ?? null;
  useEffect(() => {
    if (stepId) cardRef.current?.focus({ preventScroll: true });
  }, [stepId]);

  if (!step) return null;

  // Progress counts against the fixed `personaSteps`, so the denominator does not fluctuate;
  // navigation, including [back], still uses `visibleSteps` indices.
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
        // The overlay remounts via `key={step.id}`, so this opacity-only keyframe runs once per step.
        // A named class, so globals.css's reduced-motion registry can give it an equivalent.
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
        {/*
         * One button grammar for every card action: `<Button>` at `sm`, ghost for quiet ones,
         * outline for the stand-in press, primary for forward. Skip sits in the header corner.
         */}
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
          /*
           * The card is not a flex container, so the centring classes need a full width;
           * it also aligns the left edge with "Previous".
           */
          className="w-full"
        >
          <span data-testid={hasSelection ? "guided-tour-success" : "guided-tour-waiting"}>
            {hasSelection ? t("clickSuccessLabel") : t("waitingForClickLabel")}
          </span>
        </Button>
      ) : null}

      {/**
       * [back] stands in the same place on every step; only the forward control (next, try
       * it, choose a branch) varies.
       */}
      {isBranchStep ? (
        <div className="mt-1 flex flex-col gap-2">
          {/* The branch's two buttons are one set stacked vertically, one height. */}
          <Button
            variant="outline"
            size="sm"
            onClick={finishAsDone}
            data-testid="guided-tour-finish-tour"
            className="w-full"
          >
            {t("finishTourAction")}
          </Button>
          {/*
           * Hidden when step 8's anchor (the first-run card) cannot resolve, or the button would
           * reset to welcome.
           */}
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
        {/*
         * No [back] on the first step; an empty slot holds its place so [next] does not move.
         */}
        {isFirst ? (
          <span aria-hidden data-testid="guided-tour-back-slot" />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={back}
            data-testid="guided-tour-back"
          >
            {t("prevLabel")}
          </Button>
        )}
        {/*
         * On an interactive step the anchor click moves forward, on the branch step the two
         * choices above do.
         */}
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
