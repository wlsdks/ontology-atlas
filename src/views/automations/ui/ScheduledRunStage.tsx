"use client";

import { useTranslations } from "next-intl";

import {
  RollingCount,
  useScheduledRunCopy,
  useWorkRunElapsed,
  workRuns,
  WorkRunMoru,
  type ScheduledRun,
  type WorkRunMarks,
} from "@/features/work-run";
import { cn } from "@/shared/lib/cn";
import { WorkProgress } from "@/shared/motion/work-progress";
import { Button } from "@/shared/ui/controls/button";

const STAGE_MARKS: WorkRunMarks = {
  page: (name) => name,
  count: (value) => (
    <RollingCount value={value} className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />
  ),
};

export function ScheduledRunStage({ run }: { run: ScheduledRun }) {
  const t = useTranslations("automations");
  const tCard = useTranslations("workCard");
  const elapsed = useWorkRunElapsed(run);
  const copy = useScheduledRunCopy(run, elapsed, STAGE_MARKS);
  return (
    <section
      aria-label={t("stage.label")}
      data-testid="automations-run-stage"
      data-run-id={run.id}
      className="relative flex min-h-44 items-center overflow-clip rounded-card bg-[color:var(--color-overlay-1)] py-4 pr-4"
    >
      <WorkRunMoru run={copy.moru} />
      <div className="ml-[9rem] grid min-w-0 flex-1 max-sm:ml-[5rem]">
        <p data-testid="automations-run-stage-title" className="truncate text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">
          {copy.title}
        </p>
        <div aria-live="off" className="grid min-w-0">
          <p
            data-testid="automations-run-stage-line"
            title={run.document ?? undefined}
            className={cn(
              "mt-1 truncate text-display leading-display-tight",
              run.document ? "font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-secondary)]",
            )}
          >
            {copy.line}
          </p>
          <p data-testid="automations-run-stage-figures" className="mt-1 truncate text-body leading-body tabular-nums text-[color:var(--color-text-tertiary)]">
            {copy.figures}
          </p>
        </div>
        <div className="mt-3 flex h-8 min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <WorkProgress phase="running" done={run.checkedCount} total={null} label={tCard("progressLabel", { title: copy.title })} />
          </div>
          <Button size="sm" variant="outline" onClick={() => workRuns.stopRun(`scheduled:${run.id}`)} data-testid="automations-run-stage-stop">
            {tCard("stop")}
          </Button>
        </div>
        <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t("stage.note")}</p>
      </div>
    </section>
  );
}
