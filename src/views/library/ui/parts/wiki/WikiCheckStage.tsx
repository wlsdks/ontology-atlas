"use client";

import { useTranslations } from "next-intl";

import {
  RollingCount,
  useWorkRunCopy,
  useWorkRunElapsed,
  WorkRunMoru,
  type WorkRun,
  type WorkRunMarks,
} from "@/features/work-run";
import { cn } from "@/shared/lib/cn";
import { WorkProgress } from "@/shared/motion/work-progress";
import { Button } from "@/shared/ui/controls/button";

/** The count is the stage's largest figure; the page being read is the word that stands out. */
const STAGE_MARKS: WorkRunMarks = {
  page: (name) => <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{name}</span>,
  count: (value) => (
    <RollingCount
      value={value}
      className="mr-1 text-hero leading-display-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
    />
  ),
};

/**
 * The running check where it was started: the same facts the card carries elsewhere, at the
 * section's scale, with what a check does underneath. No total is drawn, because the agent
 * picks how many pages it reads.
 */
export function WikiCheckStage({
  run,
  onStop,
  onReview,
}: {
  run: WorkRun;
  onStop: () => void;
  onReview: () => void;
}) {
  const t = useTranslations("library");
  const tCard = useTranslations("workCard");
  const elapsed = useWorkRunElapsed(run);
  const copy = useWorkRunCopy(run, elapsed, STAGE_MARKS);
  const asking = run.phase === "asking";
  return (
    <div
      data-testid="library-check-stage"
      data-phase={run.phase}
      className="relative mt-4 flex min-h-44 items-center overflow-clip rounded-card bg-[color:var(--color-overlay-1)] py-4 pr-4"
    >
      <WorkRunMoru run={run} />
      <div className="ml-[9rem] grid min-w-0 flex-1 max-sm:ml-[5rem]">
        <p
          data-testid="library-check-stage-title"
          className="truncate text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]"
        >
          {copy.title}
        </p>
        <div aria-live="off" className="grid min-w-0">
          <p
            data-testid="library-check-stage-figures"
            className="mt-1 truncate text-body leading-hero tabular-nums text-[color:var(--color-text-tertiary)]"
          >
            {copy.figures}
          </p>
          <p
            data-testid="library-check-stage-line"
            className={cn("text-body leading-body text-[color:var(--color-text-secondary)]", !asking && "truncate")}
          >
            {copy.detail}
          </p>
        </div>
        <div className="mt-3 flex h-8 min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <WorkProgress phase="running" done={run.readCount} total={null} label={tCard("progressLabel", { title: copy.title })} />
          </div>
          {asking ? (
            <Button size="sm" onClick={onReview} data-testid="library-check-stage-review">
              {t("check.review")}
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={onStop} data-testid="library-check-stage-stop">
            {tCard("stop")}
          </Button>
        </div>
        <p className="mt-2 text-caption leading-body text-[color:var(--color-text-tertiary)]">
          {t("report.emptyLede")}
        </p>
      </div>
    </div>
  );
}
