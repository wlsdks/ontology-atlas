'use client';

import { useTranslations } from 'next-intl';

import type { HarnessScanProgress } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';

/**
 * **The wait is a screen, and this one shows the work rather than standing in for it.**
 *
 * What it replaced was the word "Reading" at body size in the top-left corner of an otherwise black
 * window, held for as long as the read took. That is the worst shape a wait can have: it tells the
 * reader nothing about what is happening, nothing about how much is left, and gives the impression
 * the screen has stalled.
 *
 * What it must not become is the other failure. This surface exists because every comparable tool
 * asserts a number the files cannot support, and a progress bar animating toward an invented
 * percentage would be exactly that mistake wearing a different hat. So:
 *
 * - **Each pass names itself** — root guides, nested `AGENTS.md`, agent directories, hook configs,
 *   authored documents, the citations between them, the declared path scopes. These are the real
 *   passes `scanHarness` runs, reported as they run.
 * - **A bar fills only where the denominator was known before the pass started.** Seven root files,
 *   eight agent directories, two hook configs, N documents to read for citations, N recorded paths
 *   to resolve: all counted, all determinate.
 * - **A pass whose length nobody knows draws a sweep, not a fill.** The walk across the checkout
 *   for authored Markdown has no directory count before it runs, so the bar says "we do not know
 *   how many" by moving rather than by filling to a number nobody measured.
 *
 * **Motion route** (owner's bar, 2026-09-13): this screen passes on *motion*. Two still frames of a
 * scan cannot distinguish "running" from "stalled", and the sweep is the one mark that can. Its
 * reduced-motion equivalent fills the track at a fixed intensity and keeps the stage name and the
 * running count, so nothing a reader needs is carried by the movement alone. Nothing here moves at
 * rest, because the element only exists while a read is in flight.
 */
const STAGE_LABEL: Readonly<Record<HarnessScanProgress['stage'], string>> = {
  roots: 'loadingStageRoots',
  nested: 'loadingStageNested',
  'agent-directories': 'loadingStageAgentDirectories',
  hooks: 'loadingStageHooks',
  documents: 'loadingStageDocuments',
  citations: 'loadingStageCitations',
  coverage: 'loadingStageCoverage',
};

/** The order the passes run in, so the list reads as a route rather than as a jumping cursor. */
const STAGE_ORDER: ReadonlyArray<HarnessScanProgress['stage']> = [
  'roots',
  'nested',
  'agent-directories',
  'hooks',
  'coverage',
  'documents',
  'citations',
];

export function HarnessScanProgressPanel({ progress }: { progress: HarnessScanProgress | null }) {
  const t = useTranslations('harness');
  const activeIndex = progress ? STAGE_ORDER.indexOf(progress.stage) : -1;
  const determinate = progress?.total != null && progress.total > 0;
  const ratio = determinate ? Math.min(1, (progress!.done + 1) / progress!.total!) : 0;

  return (
    <div
      className="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-4 py-10"
      data-testid="harness-scan-progress"
      role="status"
      aria-live="polite"
      aria-label={
        progress
          ? t('loadingAria', { stage: t(STAGE_LABEL[progress.stage]) })
          : t('loadingTitle')
      }
    >
      <p className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {t('loadingTitle')}
      </p>

      <div className="w-full max-w-[26rem]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-body text-[color:var(--color-text-secondary)]">
            {progress ? t(STAGE_LABEL[progress.stage]) : t('loadingStageRoots')}
          </span>
          <span className="text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
            {determinate
              ? t('loadingCounted', { done: progress!.done + 1, total: progress!.total! })
              : t('loadingCounting')}
          </span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]">
          {determinate ? (
            <div
              className="h-full rounded-micro bg-[color:var(--color-indigo-a60)] transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)]"
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          ) : (
            /* No width the screen could honestly claim, so the mark moves instead of filling. */
            <div className="harness-scan-sweep h-full w-1/3 rounded-micro bg-[color:var(--color-indigo-a60)]" />
          )}
        </div>
      </div>

      {/* The whole route, so the reader can see what is behind and what is still ahead. */}
      <ol className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {STAGE_ORDER.map((stage, index) => (
          <li
            key={stage}
            data-harness-stage={stage}
            data-harness-stage-state={
              index < activeIndex ? 'done' : index === activeIndex ? 'running' : 'ahead'
            }
            className={cn(
              'text-caption',
              index < activeIndex
                ? 'text-[color:var(--color-text-tertiary)]'
                : index === activeIndex
                  ? 'text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-quaternary)]',
            )}
          >
            {t(STAGE_LABEL[stage])}
          </li>
        ))}
      </ol>
    </div>
  );
}
