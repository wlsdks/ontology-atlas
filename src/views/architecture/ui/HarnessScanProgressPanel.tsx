'use client';

import { useTranslations } from 'next-intl';

import type { HarnessScanProgress } from '@/entities/agent-files';
import { cn } from '@/shared/lib/cn';
import { WorkProgress } from '@/shared/motion/work-progress';
import { WorkStatus } from '@/shared/motion/work-status';

const STAGE_LABEL: Readonly<Record<HarnessScanProgress['stage'], string>> = {
  roots: 'loadingStageRoots',
  nested: 'loadingStageNested',
  'agent-directories': 'loadingStageAgentDirectories',
  hooks: 'loadingStageHooks',
  documents: 'loadingStageDocuments',
  'citation-hops': 'loadingStageCitationHops',
  coverage: 'loadingStageCoverage',
};

const STAGE_ORDER: ReadonlyArray<HarnessScanProgress['stage']> = [
  'roots',
  'nested',
  'agent-directories',
  'hooks',
  'coverage',
  'documents',
  'citation-hops',
];

const WIDEST_COUNT = 999;

export function HarnessScanProgressPanel({ progress }: { progress: HarnessScanProgress | null }) {
  const t = useTranslations('harness');
  const activeIndex = progress ? STAGE_ORDER.indexOf(progress.stage) : -1;
  const determinate = progress?.total != null && progress.total > 0;
  const count = determinate
    ? t('loadingCounted', { done: progress?.done ?? 0, total: progress?.total ?? 0 })
    : t('loadingCounting');

  return (
    <div
      className="flex min-h-[18rem] flex-1 flex-col items-center justify-center gap-4 py-10"
      data-testid="harness-scan-progress"
    >
      {/* The live region carries only the stage name: announcing counts queued one message per file. */}
      <p className="sr-only" role="status" aria-live="polite">
        {progress
          ? t('loadingAria', { stage: t(STAGE_LABEL[progress.stage]) })
          : t('loadingTitle')}
      </p>
      <p className="text-title font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">
        {t('loadingTitle')}
      </p>

      <div className="w-full max-w-[26rem]">
        <div className="flex items-baseline justify-between gap-3" aria-hidden>
          <span className="min-w-0 truncate text-body text-[color:var(--color-text-secondary)]">
            {progress ? t(STAGE_LABEL[progress.stage]) : t('loadingStageRoots')}
          </span>
          <span className="relative shrink-0 whitespace-nowrap text-caption tabular-nums text-[color:var(--color-text-quaternary)]">
            <span className="invisible">
              {t('loadingCounted', { done: WIDEST_COUNT, total: WIDEST_COUNT })}
            </span>
            <span className="absolute inset-0 text-right">
              <span key={count}>{count}</span>
            </span>
          </span>
        </div>
        <div className="mt-2" aria-hidden>
          <WorkProgress
            phase="running"
            done={progress?.done ?? 0}
            total={determinate ? progress!.total! : null}
            label={t('loadingTitle')}
          />
        </div>
      </div>

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
            <WorkStatus
              phase={index < activeIndex ? 'done' : index === activeIndex ? 'running' : 'waiting'}
              label={t(STAGE_LABEL[stage])}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
