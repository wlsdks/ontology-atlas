'use client';

import { useTranslations } from 'next-intl';

import { Disclosure } from '@/shared/ui';

import type { splitTask } from './meaning-units';

/** The task the person gave the agent: its first paragraph, and the rest behind a disclosure. */
export function TaskReviewTask({ task }: { task: ReturnType<typeof splitTask> }) {
  const t = useTranslations('acpChat.permission');
  const restLines = task.rest ? task.rest.split('\n').filter((line) => line.trim().length > 0).length : 0;
  return (
    <div data-testid="task-review-task" className="grid gap-1">
      <p data-testid="task-review-heading" className="text-label leading-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">
        {t('taskReview.eyebrow')}
      </p>
      <p data-testid="task-review-outcome-compact" className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
        {task.lead}
      </p>
      {task.rest ? (
        <Disclosure summary={t('taskReview.taskRest', { count: restLines })} summaryTestId="task-review-task-toggle">
          <div className="grid gap-1.5 pt-1">
            <p data-testid="task-review-outcome" className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
              {task.rest}
            </p>
            <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('taskReview.nonGoalsUnstructured')}</p>
          </div>
        </Disclosure>
      ) : null}
    </div>
  );
}
