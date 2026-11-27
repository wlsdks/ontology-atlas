"use client";

import type { ReactNode } from "react";
import type { useTranslations } from "next-intl";

import { WorkGlyph } from "@/shared/motion/status-glyphs/WorkGlyph";
import { Button } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";

import type { ContinueBatch, ContinueBlocked } from "../../model/sources/continue-batch";

const BLOCKED_ID = "library-progress-blocked";

/**
 * The cell at the band's right: the all-done line, or the Continue press
 * with who writes beside it and the work line under it. Pointing at or focusing Continue is reported
 * so the bar can show how far its sources would take it.
 */
export function ProgressAction({ complete, blocked, batch, running, agentName, workLine, onAimChange, t }: {
  complete: boolean;
  /** Null when Continue can run. */
  blocked: ContinueBlocked | null;
  batch: ContinueBatch;
  running: boolean;
  agentName: string | null;
  workLine: ReactNode | null;
  onAimChange: (aimed: boolean) => void;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <div
      data-testid="library-progress-action"
      className="flex min-w-0 flex-col justify-between gap-y-1.5 max-md:w-full md:flex-none @max-[60rem]:md:w-[17rem] @min-[60rem]:min-h-20 @min-[60rem]:w-[clamp(22.5rem,25vw,27.5rem)]"
    >
      {complete ? (
        <p data-testid="library-progress-done" className="flex min-h-10 items-center gap-2 text-body-lg leading-body-lg text-[color:var(--color-success-text-a94)]">
          <WorkGlyph phase="done" size={ICON_SIZE.md} />
          <span className="min-w-0 truncate">{t("progress.allDone")}</span>
        </p>
      ) : batch.next.length > 0 || running ? (
        /* The press, then who writes beside it; a note too long for the row takes the next line. */
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button
            size="md"
            data-testid="library-progress-continue"
            onClick={batch.start}
            onPointerEnter={() => onAimChange(true)}
            onPointerLeave={() => onAimChange(false)}
            onFocus={() => onAimChange(true)}
            onBlur={() => onAimChange(false)}
            disabled={blocked !== null || running}
            aria-describedby={blocked ? BLOCKED_ID : undefined}
            className="atlas-touch-floor max-w-full"
          >
            {/* No ring in the button while work runs: the work line under it carries the ring. */}
            <span className="min-w-0 truncate">{t("progress.continue", { count: batch.next.length })}</span>
          </Button>
          {blocked?.door ?? null}
          {blocked ? (
            <p id={BLOCKED_ID} title={blocked.reason} data-testid="library-progress-blocked" className="basis-full text-label leading-label text-[color:var(--color-text-tertiary)] @max-[60rem]:line-clamp-1 @min-[60rem]:line-clamp-2">
              {blocked.reason}
            </p>
          ) : batch.returned > 0 && !running ? (
            <p
              title={t("progress.batchReturned", { count: batch.returned })}
              data-testid="library-progress-returned"
              className="min-w-0 basis-full truncate text-label leading-label text-[color:var(--color-text-tertiary)]"
            >
              {t("progress.batchReturned", { count: batch.returned })}
            </p>
          ) : (
            /* How many wait after this press is the Next to write panel's foot, so this line names who writes. */
            <p data-testid="library-progress-writer" className="min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
              {agentName === null
                ? t("progress.writerAnyAgent")
                : t.rich("progress.writer", {
                    agent: agentName,
                    name: (chunks) => (
                      <span data-testid="library-progress-agent" className="font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                        {chunks}
                      </span>
                    ),
                  })}
            </p>
          )}
        </div>
      ) : null}
      {/* A refused press needs its two lines of reason, so the work line waits for the press to run. */}
      {blocked ? null : workLine}
    </div>
  );
}
