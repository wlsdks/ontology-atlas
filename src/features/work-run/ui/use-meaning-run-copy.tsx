'use client';

import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { MiddleCutName } from '@/shared/ui/middle-cut-name/middle-cut-name';
import type { MeaningProgress, MeaningRun } from '../model/meaning-run';

const PLACEHOLDER = '\u0000';
const BYTES_PER_GIGABYTE = 1_000_000_000;
/** The end of a file name kept whole when its middle gives way: a word's tail and the extension. */
const KEPT_NAME_END = 8;

/** How a surface sets the figure that leads: the card rolls it, the dialog writes it. */
export type MeaningFigure = (value: number, format: (value: number) => string) => ReactNode;

const PLAIN_FIGURE: MeaningFigure = (value, format) => format(value);

export interface MeaningCopy {
  title: string;
  /** Minutes left, once the job measured its pace; it stands beside the title. */
  remaining: string | null;
  /** The count that leads while it is counted, or the result's size once ready. */
  lead: ReactNode | null;
  /** What it does now, or how it ended. */
  line: ReactNode;
  /** A bar only where a total is known: bytes while downloading, files while preparing. */
  bar: { done: number; total: number } | null;
}

/** A sentence with one figure set inside it, whatever the language puts around it. */
function withFigure(sentence: string, figure: ReactNode): ReactNode {
  const [before, after] = sentence.split(PLACEHOLDER);
  return <>{before}{figure}{after}</>;
}

/** The words of a meaning run in the seat: the counts it has, and the desk's own sentences. */
export function useMeaningRunCopy(run: MeaningRun, progress: MeaningProgress | null, figure: MeaningFigure = PLAIN_FIGURE): MeaningCopy {
  const t = useTranslations('workCard.meaning');
  const tDesk = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const whole = (value: number) => new Intl.NumberFormat(locale).format(value);
  const tenths = (value: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const filesDone = progress?.filesDone ?? 0;
  const filesTotal = progress?.filesTotal ?? 0;
  const title = t('title');
  const minutes = run.phase === 'preparing' ? progress?.minutesLeft ?? null : null;
  const remaining = minutes === null ? null : t('minutesLeft', { minutes });

  switch (run.phase) {
    case 'modelDownloading': {
      const bytes = progress?.bytes ?? null;
      const done = Math.floor(((bytes?.done ?? 0) / BYTES_PER_GIGABYTE) * 10) / 10;
      const total = tenths((bytes?.total ?? 0) / BYTES_PER_GIGABYTE);
      return {
        title,
        remaining,
        lead: bytes && bytes.total > 0 ? withFigure(t('modelBytes', { done: PLACEHOLDER, total }), figure(done, tenths)) : null,
        line: t('downloading'),
        bar: bytes && bytes.total > 0 ? { done: bytes.done, total: bytes.total } : null,
      };
    }
    case 'modelConverting':
      return { title, remaining, lead: null, line: t('converting'), bar: { done: 1, total: 1 } };
    case 'waitingTurn':
      return { title, remaining, lead: null, line: tDesk('waitingTurn'), bar: null };
    case 'preparing': {
      const reading = progress?.reading ?? null;
      const [readingBefore, readingAfter] = tDesk('readingNow', { file: PLACEHOLDER }).split(PLACEHOLDER);
      return {
        title,
        remaining,
        lead: withFigure(t('files', { done: PLACEHOLDER, total: filesTotal }), figure(filesDone, whole)),
        line: reading ? (
          <span className="flex min-w-0 items-center whitespace-pre">
            <span className="flex-none">{readingBefore}</span>
            <MiddleCutName
              path={reading}
              keepEnd={KEPT_NAME_END}
              wholeUpTo={KEPT_NAME_END * 2}
              testId="work-run-file"
              className="overflow-hidden font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
            />
            <span className="flex-none">{readingAfter}</span>
          </span>
        ) : null,
        bar: filesTotal > 0 ? { done: filesDone, total: filesTotal } : null,
      };
    }
    case 'ready': {
      // The plural writes the number itself, so the figure is found in the sentence it wrote.
      const sentence = t('readyLead', { total: filesTotal });
      const written = whole(filesTotal);
      const at = sentence.indexOf(written);
      const lead = at < 0
        ? sentence
        : <>{sentence.slice(0, at)}{figure(filesTotal, whole)}{sentence.slice(at + written.length)}</>;
      return { title, remaining, lead, line: t('ready'), bar: null };
    }
    case 'failed':
    case 'stopped':
      return { title, remaining, lead: null, line: run.failure ?? '', bar: null };
  }
}
