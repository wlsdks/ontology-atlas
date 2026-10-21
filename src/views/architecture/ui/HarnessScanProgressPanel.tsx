'use client';

import { useTranslations } from 'next-intl';

import type { HarnessScanProgress } from '@/entities/agent-files';
import { PAGE_WAIT_LIFT } from '@/shared/ui/tokens/page-frame';
import { WaitStage, type WaitStep } from '@/shared/ui/status/wait-stage';

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
  const steps: WaitStep[] = STAGE_ORDER.map((stage, index) => ({
    id: stage,
    label: t(STAGE_LABEL[stage]),
    state: index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'pending',
    attributes: {
      'data-harness-stage': stage,
      'data-harness-stage-state': index < activeIndex ? 'done' : index === activeIndex ? 'running' : 'ahead',
    },
  }));

  const count = determinate
    ? t('loadingCounted', { done: progress?.done ?? 0, total: progress?.total ?? 0 })
    : t('loadingCounting');

  return (
    <WaitStage
      data-testid="harness-scan-progress"
      className={PAGE_WAIT_LIFT}
      mark="mascot"
      title={t('loadingTitle')}
      detail={t('loadingDetail')}
      announce={progress ? t('loadingAria', { stage: t(STAGE_LABEL[progress.stage]) }) : t('loadingTitle')}
      progress={{
        stage: progress ? t(STAGE_LABEL[progress.stage]) : t('loadingStageRoots'),
        counter: (
          <span className="relative shrink-0 whitespace-nowrap tabular-nums">
            <span className="invisible" aria-hidden>
              {t('loadingCounted', { done: WIDEST_COUNT, total: WIDEST_COUNT })}
            </span>
            <span className="absolute inset-0 text-right">
              <span key={count}>{count}</span>
            </span>
          </span>
        ),
        done: progress?.done ?? 0,
        total: determinate ? progress!.total! : null,
        label: t('loadingTitle'),
      }}
      steps={steps}
    />
  );
}
