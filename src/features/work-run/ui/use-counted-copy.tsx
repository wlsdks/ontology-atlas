'use client';

import { useId, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { CountedProgress, CountedRun } from '../model/counted-run';

const PLACEHOLDER = '\u0000';
const BYTES_PER_GIGABYTE = 1_000_000_000;
/** The end of a file name kept whole when its middle gives way: a word and the extension. */
const KEPT_NAME_END = 12;

/** How a surface sets the figure that leads: the card rolls it, the dialog writes it. */
export type CountedFigure = (value: number, format: (value: number) => string) => ReactNode;

const PLAIN_FIGURE: CountedFigure = (value, format) => format(value);

export interface CountedCopy {
  title: string;
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

/** The file's name alone, its middle giving way first; the full path is its title. */
export function MiddleCutName({ path }: { path: string }) {
  const pathId = useId();
  const name = path.split('/').pop() || path;
  const cut = Math.max(0, name.length - KEPT_NAME_END);
  return (
    <>
      <span className="flex min-w-0" title={path} aria-describedby={pathId} data-testid="work-run-file">
        <span className="min-w-0 truncate">{name.slice(0, cut)}</span>
        <span className="flex-none whitespace-pre">{name.slice(cut)}</span>
      </span>
      <span id={pathId} hidden>{path}</span>
    </>
  );
}

function Separator() {
  return <span aria-hidden className="flex-none px-1.5 text-[color:var(--color-text-quaternary)]">·</span>;
}

/** The desk line's sentence for a failure, with the coded detail in words as the desk says it. */
function useFailureSentence(run: CountedRun): string {
  const tDesk = useTranslations('library.questionDesk.meaning');
  const failure = run.failure;
  if (!failure) return '';
  const message = failure.message as Parameters<typeof tDesk>[0];
  const raw = typeof failure.values.detail === 'string' ? failure.values.detail : '';
  if (failure.message === 'modelDownloadFailed' || failure.message === 'modelFailed' || failure.message === 'writeFailed') {
    return tDesk(message, { detail: tDesk('failureDetail', { code: raw.replaceAll('-', '_'), raw }) });
  }
  return tDesk(message, failure.values as Record<string, string | number>);
}

/** The words of a counted run in the seat: the counts it has, and the desk's own sentences. */
export function useCountedCopy(run: CountedRun, progress: CountedProgress | null, figure: CountedFigure = PLAIN_FIGURE): CountedCopy {
  const t = useTranslations('workCard.meaning');
  const tDesk = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const failure = useFailureSentence(run);
  const whole = (value: number) => new Intl.NumberFormat(locale).format(value);
  const tenths = (value: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);
  const filesDone = progress?.filesDone ?? 0;
  const filesTotal = progress?.filesTotal ?? 0;
  const title = t('title');

  switch (run.phase) {
    case 'modelDownloading': {
      const bytes = progress?.bytes ?? null;
      const done = Math.floor(((bytes?.done ?? 0) / BYTES_PER_GIGABYTE) * 10) / 10;
      const total = tenths((bytes?.total ?? 0) / BYTES_PER_GIGABYTE);
      return {
        title,
        lead: bytes && bytes.total > 0 ? withFigure(t('modelBytes', { done: PLACEHOLDER, total }), figure(done, tenths)) : null,
        line: t('downloading'),
        bar: bytes && bytes.total > 0 ? { done: bytes.done, total: bytes.total } : null,
      };
    }
    case 'modelConverting':
      return { title, lead: null, line: t('converting'), bar: { done: 1, total: 1 } };
    case 'waitingTurn':
      return { title, lead: null, line: tDesk('waitingTurn'), bar: null };
    case 'preparing': {
      const reading = progress?.reading ?? null;
      const minutes = progress?.minutesLeft ?? null;
      const [readingBefore, readingAfter] = tDesk('readingNow', { file: PLACEHOLDER }).split(PLACEHOLDER);
      return {
        title,
        lead: withFigure(t('files', { done: PLACEHOLDER, total: filesTotal }), figure(filesDone, whole)),
        line: (
          <span className="flex min-w-0 items-center whitespace-pre">
            {reading ? (
              <>
                <span className="flex-none">{readingBefore}</span>
                <MiddleCutName path={reading} />
                <span className="flex-none">{readingAfter}</span>
              </>
            ) : null}
            {reading && minutes !== null ? <Separator /> : null}
            {minutes !== null ? <span className="flex-none" data-testid="work-run-minutes">{t('minutesLeft', { minutes })}</span> : null}
          </span>
        ),
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
      return { title, lead, line: t('ready'), bar: null };
    }
    case 'failed':
    case 'stopped':
      return { title, lead: null, line: failure, bar: null };
  }
}
