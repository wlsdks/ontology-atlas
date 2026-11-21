"use client";

import type { useTranslations } from "next-intl";

import type { SourceCopyJob, SourceCopySkipReason } from "@/features/library";
import { controlClass } from "@/shared/ui/control-class";

type LibraryT = ReturnType<typeof useTranslations<"library">>;

const SKIP_REASONS: readonly SourceCopySkipReason[] = ["same", "notDocument", "secretName", "licence"];
/** The failed line names this many files, then the count says the rest. */
const FAILED_NAMES_SHOWN = 5;

export function skippedByReason(job: SourceCopyJob): { reason: SourceCopySkipReason; count: number }[] {
  return SKIP_REASONS.map((reason) => ({
    reason,
    count: job.skipped.filter((row) => row.reason === reason).length,
  })).filter((row) => row.count > 0);
}

/**
 * One line for one copy: its progress and Stop while it runs, then what was stopped, what failed
 * and what was skipped, each in the person's words. The bar scales on `transform` only.
 */
export function SourceCopyLine({
  job,
  onStop,
  onShowSkipped,
  t,
}: {
  job: SourceCopyJob;
  onStop: () => void;
  onShowSkipped: () => void;
  t: LibraryT;
}) {
  const copying = job.phase === "copying";
  const share = job.total > 0 ? job.done / job.total : 0;
  const reasons = skippedByReason(job);
  const failedNames = job.failed.map((row) => row.name).filter(Boolean);
  return (
    <div data-testid="library-copy-line" data-phase={job.phase} className="flex w-full flex-col gap-2 text-body" aria-live="polite">
      {copying ? (
        <>
          <div className="flex items-center gap-3">
            <span data-testid="library-copy-progress" className="min-w-0 flex-1 text-[color:var(--color-text-secondary)] tabular-nums">
              {t("start.drop.copying", { done: job.done, total: job.total })}
            </span>
            <button
              type="button"
              onClick={onStop}
              data-testid="library-copy-stop"
              className={controlClass({ shape: "chip", size: "md", tone: "secondary", hoverInk: "strong", hoverBorder: "strong" })}
            >
              {t("drop.stop")}
            </button>
          </div>
          <span aria-hidden className="block h-1 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
            <span
              className="block h-full w-full origin-left rounded-full bg-[color:var(--color-indigo-accent)] transition-transform duration-[var(--motion-base)] ease-[var(--motion-ease)]"
              style={{ transform: `scaleX(${share})` }}
            />
          </span>
        </>
      ) : null}
      {job.phase === "stopped" ? (
        <p data-testid="library-copy-stopped" className="text-[color:var(--color-text-secondary)]">
          {t("drop.stopped", { count: job.added })}
        </p>
      ) : null}
      {!copying && job.failed.length > 0 ? (
        <div data-testid="library-copy-failed" className="flex flex-col gap-1 text-[color:var(--color-danger-text)]">
          <p>{t("start.drop.failed", { count: job.failed.length, reason: job.failureReason ?? "" })}</p>
          {failedNames.length > 0 ? (
            <p className="text-label [overflow-wrap:anywhere]">
              {t("start.drop.failedNames", {
                names: failedNames.slice(0, FAILED_NAMES_SHOWN).join(", ")
                  + (failedNames.length > FAILED_NAMES_SHOWN ? ` +${failedNames.length - FAILED_NAMES_SHOWN}` : ""),
              })}
            </p>
          ) : null}
        </div>
      ) : null}
      {!copying && job.skipped.length > 0 ? (
        <button
          type="button"
          onClick={onShowSkipped}
          data-testid="library-copy-skipped"
          data-skipped-count={job.skipped.length}
          className={controlClass({
            shape: "link",
            tone: "secondary",
            hoverInk: "strong",
            className: "flex-wrap justify-start gap-x-2 text-left",
          })}
        >
          <span className="font-[var(--font-weight-emphasis)]">{t("drop.skipped", { count: job.skipped.length })}</span>
          {reasons.map(({ reason, count }) => (
            <span key={reason} className="text-[color:var(--color-text-tertiary)]">
              {t("drop.reasonCount", { reason: t(`drop.skippedReasons.${reason}`), count })}
            </span>
          ))}
          <span className="underline underline-offset-2">{t("drop.skippedShow")}</span>
        </button>
      ) : null}
      {!copying && job.truncatedAt !== null ? (
        <p className="text-label text-[color:var(--color-text-tertiary)]">{t("drop.truncated", { count: job.truncatedAt })}</p>
      ) : null}
    </div>
  );
}
