'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Button } from '@/shared/ui/controls/button';
import { RowButton } from '@/shared/ui/controls/controls';
import { Dialog } from '@/shared/ui/surfaces/dialog';

import type { CountedRun } from '../model/counted-run';
import type { WorkRun } from '../model/work-run';
import { workRuns } from '../model/work-run-store';
import {
  activeRuns,
  seatRun,
  useCountedProgress,
  useWorkRunElapsed,
  useWorkRunSnapshot,
  type SeatRun,
} from '../model/use-work-run';
import { useCountedCopy } from './use-counted-copy';
import { useWorkRunCopy } from './use-work-run-copy';

interface RunWords {
  title: string;
  /** Count and time, or the count of a total, where the run has them. */
  figures: ReactNode | null;
  line: ReactNode;
  bar: { done: number; total: number | null } | null;
}

function useCheckWords(run: WorkRun): RunWords {
  const elapsed = useWorkRunElapsed(run);
  const copy = useWorkRunCopy(run, elapsed, undefined, 'card');
  return { title: copy.title, figures: copy.figures, line: copy.detail, bar: { done: run.readCount, total: null } };
}

function useMeaningWords(run: CountedRun): RunWords {
  const progress = useCountedProgress();
  const copy = useCountedCopy(run, progress?.runId === run.id ? progress : null);
  const figures = copy.lead && copy.remaining ? <>{copy.lead} · {copy.remaining}</> : copy.lead;
  return { title: copy.title, figures, line: copy.line, bar: copy.bar };
}

function Words({ seat, children }: { seat: SeatRun; children: (words: RunWords) => ReactNode }) {
  return seat.kind === 'check'
    ? <CheckWords run={seat.run}>{children}</CheckWords>
    : <MeaningWords run={seat.run}>{children}</MeaningWords>;
}

function CheckWords({ run, children }: { run: WorkRun; children: (words: RunWords) => ReactNode }) {
  return <>{children(useCheckWords(run))}</>;
}

function MeaningWords({ run, children }: { run: CountedRun; children: (words: RunWords) => ReactNode }) {
  return <>{children(useMeaningWords(run))}</>;
}

const stopRun = (seat: SeatRun) => (seat.kind === 'check' ? workRuns.stop() : workRuns.stopCounted());

/**
 * Every run still working, when there is more than the card can hold: the runs on the left, the
 * chosen one on the right with its facts and its own Stop, which ends that run alone.
 */
export function RunsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('workCard');
  const titleId = useId();
  const snapshot = useWorkRunSnapshot();
  const runs = activeRuns(snapshot);
  const onCard = seatRun(snapshot)?.kind ?? null;
  const [chosenKind, setChosenKind] = useState<SeatRun['kind'] | null>(null);
  const chosen = runs.find((entry) => entry.kind === chosenKind)
    ?? runs.find((entry) => entry.kind !== onCard)
    ?? runs[0]
    ?? null;
  const nothingLeft = open && runs.length === 0;
  useEffect(() => {
    if (nothingLeft) onClose();
  }, [nothingLeft, onClose]);

  return (
    <Dialog open={open && runs.length > 0} onClose={onClose} labelledBy={titleId} size="md" testId="work-runs-dialog">
      <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        {t('runsTitle')}
      </h2>
      <div className="mt-4 grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)] gap-4">
        <ul className="flex min-w-0 flex-col gap-1" data-testid="work-runs-list">
          {runs.map((entry) => {
            const selected = entry.kind === chosen?.kind;
            return (
              <li key={entry.kind}>
                <RowButton
                  size="md"
                  tone="strong"
                  hoverSurface="lift"
                  active={selected}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => setChosenKind(entry.kind)}
                  data-testid={`work-runs-row-${entry.kind}`}
                  className="flex-col items-start gap-0.5 rounded-chip px-2.5 py-2"
                >
                  <Words seat={entry}>
                    {(words) => (
                      <>
                        <span className="w-full truncate text-body leading-body font-[var(--font-weight-strong)]">{words.title}</span>
                        <span className="flex w-full min-w-0 truncate text-label leading-label text-[color:var(--color-text-tertiary)]">{words.line}</span>
                      </>
                    )}
                  </Words>
                </RowButton>
              </li>
            );
          })}
        </ul>
        {chosen ? (
          <section
            key={chosen.kind}
            aria-labelledby={`${titleId}-${chosen.kind}`}
            data-testid="work-runs-detail"
            data-kind={chosen.kind}
            className="motion-swap-in flex min-h-36 min-w-0 flex-col gap-2 rounded-card border border-[color:var(--color-border-soft)] p-3"
          >
            <Words seat={chosen}>
              {(words) => (
                <>
                  <h3 id={`${titleId}-${chosen.kind}`} className="truncate text-body leading-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
                    {words.title}
                  </h3>
                  {words.figures ? <p className="truncate text-label leading-label tabular-nums text-[color:var(--color-text-secondary)]">{words.figures}</p> : null}
                  <div className={cn('flex min-w-0 text-label leading-label text-[color:var(--color-text-secondary)]', words.figures ? 'truncate' : 'line-clamp-2')}>{words.line}</div>
                  {words.bar ? (
                    <WorkProgress phase="running" done={words.bar.done} total={words.bar.total} label={t('progressLabel', { title: words.title })} />
                  ) : null}
                  <div className="mt-auto flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => stopRun(chosen)} data-testid="work-runs-stop">
                      {t('stop')}
                    </Button>
                  </div>
                </>
              )}
            </Words>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
