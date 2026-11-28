import { useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { formatSize } from '@/shared/lib/format-size';
import { useByteRate } from '../lib/use-byte-rate';
import { useReadFeed } from '../lib/use-read-feed';
import type { RunStage, RunStep } from '../model/stage/run-stage';

const STEP_KEY: Record<RunStep, 'stepDownload' | 'stepFit' | 'stepRead'> = {
  download: 'stepDownload',
  fit: 'stepFit',
  read: 'stepRead',
};

type Clip = 'think' | 'compare' | 'read' | 'waiting' | 'success';

function clipOf(step: RunStep | null, done: boolean): Clip {
  if (done) return 'success';
  if (step === 'download') return 'think';
  if (step === 'fit') return 'compare';
  if (step === 'read') return 'read';
  return 'waiting';
}

/** The native 128px cell at half size, so a 2x screen draws every pixel of it. */
function StageMoru({ clip }: { clip: Clip }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<Clip>(clip);
  // A finishing gesture plays once, then he rests; a new step waits for the running loop's end.
  const next = clip === 'success' && shown === 'waiting' ? 'waiting' : clip;
  if (reduced && shown !== next) setShown(next);
  return (
    <span aria-hidden data-testid="meaning-stage-moru" data-moru-clip={shown} className="flex size-16 flex-none items-end justify-center">
      <span className="flex [zoom:0.5]">
        <BrandWaitingMark
          active
          scale={2}
          motion={shown}
          initialVisibility="visible"
          onLoopEnd={() => {
            if (shown === 'success') setShown('waiting');
            else if (shown !== next) setShown(next);
          }}
        />
      </span>
    </span>
  );
}

function Steps({ stage, done }: { stage: RunStage; done: boolean }) {
  const t = useTranslations('library.questionDesk.meaning');
  return (
    <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label" data-testid="meaning-stage-steps">
      {stage.steps.map(({ step, state: live }, index) => {
        const state = done ? 'done' : live;
        return (
          <li key={step} data-step={step} data-step-state={state} className="flex min-w-0 items-center gap-2">
            {index > 0 ? <span aria-hidden className={cn('h-px w-4 flex-none transition-colors', state === 'next' ? 'bg-[color:var(--color-overlay-3)]' : 'bg-[color:var(--color-indigo-line-a40)]')} /> : null}
            <span className="relative grid size-3.5 flex-none place-items-center">
              {state === 'done' ? (
                <span className="grid size-3.5 place-items-center rounded-full bg-[color:var(--color-indigo-a24)] text-[color:var(--color-indigo-pale-a92)]">
                  <Check aria-hidden className="size-2.5" strokeWidth={3} />
                </span>
              ) : (
                <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 overflow-visible">
                  {state === 'now' ? <circle cx={7} cy={7} r={4} fill="var(--color-indigo-a40)" className="motion-run-pulse" /> : null}
                  <circle cx={7} cy={7} r={state === 'now' ? 3.5 : 3} fill={state === 'now' ? 'var(--color-indigo-accent)' : 'none'} stroke={state === 'now' ? 'none' : 'var(--color-overlay-3)'} strokeWidth={1.5} />
                </svg>
              )}
            </span>
            <span className={cn('truncate transition-colors', state === 'now' ? 'text-[color:var(--color-text-primary)]' : state === 'done' ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-tertiary)]')}>
              {t(STEP_KEY[step])}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function StageBar({ fraction, measure, label, done }: { fraction: number | null; measure: 'bytes' | 'files' | null; label: string; done: boolean }) {
  const shown = done ? 1 : fraction ?? 1;
  const counted = done || fraction !== null;
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={counted ? Math.floor(shown * 100) : undefined}
      data-testid="meaning-desk-ring"
      data-ring-measure={measure ?? undefined}
      data-ring-value={counted ? shown.toFixed(4) : undefined}
      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]"
    >
      <span
        data-testid="meaning-desk-ring-arc"
        style={{ transform: `scaleX(${shown})` }}
        className={cn(
          'motion-work-fill absolute inset-0 rounded-full bg-gradient-to-r from-[color:var(--color-indigo-a46)] to-[color:var(--color-indigo-accent)]',
          !counted && 'opacity-40',
        )}
      >
        {done ? (
          <span aria-hidden className="motion-progress-light absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[color:var(--color-indigo-pale-a82)] to-transparent" />
        ) : (
          <span aria-hidden className="motion-work-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[color:var(--color-indigo-pale-a28)] to-transparent" />
        )}
      </span>
    </span>
  );
}

/** Passages are recorded in batches across files, so the count is the folder's, never one file's. */
function ReadFeed({ stage }: { stage: RunStage }) {
  const t = useTranslations('library.questionDesk.meaning');
  const reduced = usePrefersReducedMotion();
  const feed = useReadFeed(stage.readingPath);
  // The chips already there make room first; the new one appears in the room, never over them.
  const still = { duration: 0 };
  const motionOf = reduced
    ? { layout: still, opacity: still, x: still }
    : { layout: MOTION.slow, opacity: { ...MOTION.slow, delay: MOTION.base.duration }, x: { ...MOTION.slow, delay: MOTION.base.duration } };
  return (
    <div className="flex h-6 min-w-0 items-center gap-3">
      <ul aria-label={t('feedLabel')} data-testid="meaning-stage-feed" className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {feed.map((item, index) => (
            <motion.li
              key={item.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0, x: -8 }}
              animate={{ opacity: index === 0 ? 1 : index === 1 ? 0.62 : 0.34, x: 0 }}
              exit={{ opacity: 0, transition: reduced ? still : MOTION.fast }}
              transition={motionOf}
              title={item.path}
              className="flex min-w-0 max-w-[12rem] flex-none items-center gap-1.5 rounded-chip border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-indigo-a08)] px-2 py-0.5 text-label leading-label"
            >
              <Check aria-hidden className="size-3 flex-none text-[color:var(--color-indigo-pale-a82)]" strokeWidth={2.5} />
              <span className="min-w-0 truncate text-[color:var(--color-text-secondary)]">{item.path.split('/').pop()}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <span data-testid="meaning-stage-passages" className="flex-none text-label leading-label tabular-nums text-[color:var(--color-indigo-pale-a92)]">
        {t('passagesRecorded', { count: stage.passagesDone })}
      </span>
    </div>
  );
}

const SECONDS_PER_MINUTE = 60;

function DownloadRate({ download }: { download: { doneBytes: number; totalBytes: number; checking: boolean } | null }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  // Hashing what an earlier download kept is the disk's speed, never the network's.
  const rate = useByteRate(download && !download.checking ? download.doneBytes : null);
  if (download?.checking) {
    return <span data-testid="meaning-stage-rate" className="flex h-6 items-center text-label leading-label text-[color:var(--color-text-tertiary)]">{t('downloadChecking')}</span>;
  }
  const measured = rate !== null && rate > 0 && download !== null && download.totalBytes > 0;

  return (
    <span data-testid="meaning-stage-rate" className="flex h-6 items-center gap-x-1.5 text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
      {measured ? <>
        <span>{t('perSecond', { size: formatSize(rate, locale) })}</span>
        <span aria-hidden>·</span>
        <span data-testid="meaning-stage-download-minutes">{t('minutesLeft', { minutes: Math.ceil(Math.max(0, download.totalBytes - download.doneBytes) / rate / SECONDS_PER_MINUTE) })}</span>
      </> : null}
    </span>
  );
}

export function MeaningRunStage({
  stage,
  done,
  download,
  measure,
  facts,
  onAsk,
  onDismiss,
}: {
  stage: RunStage;
  done: { passages: number; files: number } | null;
  download: { doneBytes: number; totalBytes: number; checking: boolean } | null;
  measure: 'bytes' | 'files' | null;
  facts: ReactNode;
  onAsk: () => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('library.questionDesk.meaning');
  const finished = done !== null;

  return (
    <section
      aria-label={t('stageLabel')}
      data-testid="meaning-run-stage"
      data-stage-step={finished ? 'done' : stage.step ?? 'waiting'}
      className="relative mt-1 flex items-start gap-3 overflow-hidden rounded-panel border border-[color:var(--color-indigo-line-a22)] bg-[color:var(--color-panel)] p-3"
    >
      <span aria-hidden className="pointer-events-none absolute -left-10 -top-12 size-40 rounded-full bg-[radial-gradient(closest-side,var(--color-indigo-a14),transparent)]" />
      <StageMoru clip={clipOf(stage.step, finished)} />
      <div className="relative flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Steps stage={stage} done={finished} />
          {finished ? (
            <button type="button" aria-label={t('stageDismiss')} onClick={onDismiss} data-testid="meaning-stage-dismiss" className={controlClass({ shape: 'icon', size: 'xs', tone: 'muted', className: 'flex-none' })}>
              <X aria-hidden className="size-3.5" />
            </button>
          ) : null}
        </div>
        <StageBar fraction={stage.fraction} measure={measure} label={t('ringLabel')} done={finished} />
        {finished ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <p className="min-w-0 text-body leading-body text-[color:var(--color-text-primary)]" data-testid="meaning-stage-done">
              <span className="font-[var(--font-weight-strong)]">{t('stageDoneTitle')}</span>
              <span className="text-[color:var(--color-text-secondary)]"> · {t('stageDoneFacts', { passages: done.passages, files: done.files })}</span>
            </p>
            <Button size="sm" variant="primary" onClick={onAsk} data-testid="meaning-stage-ask" className="flex-none">{t('stageTryAsk')}</Button>
          </div>
        ) : (
          <>
            {facts}
            {stage.step === 'read' ? <ReadFeed stage={stage} /> : stage.step === 'download' ? <DownloadRate download={download} /> : <span className="flex h-6 items-center text-label leading-label text-[color:var(--color-text-tertiary)]">{stage.step === null ? t('stageWaiting') : null}</span>}
          </>
        )}
      </div>
    </section>
  );
}
