'use client';

import { useTranslations } from 'next-intl';

import { formatValue, FormattedValueView } from '@/features/ontology-change-review';

import type { TaskMeaningReviewController } from '../../../../model/use-task-meaning-review';
import { formatReviewValue, type summarizeProposal } from './meaning-units';
import { ReviewFieldLabel } from './ReviewFieldLabel';

/**
 * Before and after of each field when the earlier text could be read; otherwise the proposed values
 * alone, with the reasons the earlier text is unavailable.
 */
export function TaskReviewCompare({
  taskReview,
  summary,
  coverageLine,
}: {
  taskReview?: TaskMeaningReviewController;
  summary: ReturnType<typeof summarizeProposal>;
  coverageLine: string;
}) {
  const t = useTranslations('acpChat.permission');
  const { visibleValueFields, visibleMeaningUnits } = summary;
  return taskReview?.status === 'ready' ? (
    <div data-testid="task-review-compare" className="grid gap-2">
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('taskReview.comparisonCoverage', {
          inspected: taskReview.coverage.inspected,
          total: taskReview.coverage.total,
          omitted: taskReview.coverage.omitted,
        })}
      </p>
      {taskReview.items.map((item) => (
        <div key={item.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2 first:border-t-0 first:pt-0">
          <div className="flex items-center justify-between gap-2 text-label leading-label">
            <span className="font-mono text-[color:var(--color-text-tertiary)]">{item.field}</span>
            <span className="text-[color:var(--color-text-tertiary)]">{t(`taskReview.delta.${item.kind}`)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-secondary)]">
            <span className="mr-1.5 text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.before')}</span>
            {item.before.present ? formatReviewValue(item.before.value) : t('taskReview.absent')}
          </p>
          <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
            <span className="mr-1.5 text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
            {item.after.present ? formatReviewValue(item.after.value) : t('taskReview.absent')}
          </p>
        </div>
      ))}
    </div>
  ) : (
    <div data-testid="task-review-compare" className="grid gap-2">
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t('taskReview.beforeUnavailable')}
      </p>
      {taskReview?.status === 'unavailable' && taskReview.reasons.length > 0 ? (
        <ul className="grid gap-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
          {taskReview.reasons.map((reason) => <li key={reason}>{t(`taskReview.reason.${reason}`)}</li>)}
        </ul>
      ) : null}
      {visibleValueFields.map((field) => (
        <div key={field.key} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2">
          <span className="text-label leading-label"><ReviewFieldLabel fieldKey={field.key} /></span>
          <div className="text-body leading-prose text-[color:var(--color-text-primary)]">
            <span className="text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
            <FormattedValueView value={formatValue(field.after)} />
          </div>
        </div>
      ))}
      {visibleMeaningUnits.map((unit) => (
        <div key={unit.id} className="grid gap-1 border-t border-[color:var(--color-divider)] pt-2">
          <span className="break-words font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">{unit.label}</span>
          <div className="text-body leading-prose text-[color:var(--color-text-primary)]">
            <span className="text-label text-[color:var(--color-text-tertiary)]">{t('taskReview.after')}</span>
            {unit.value ? <FormattedValueView value={unit.value} /> : <p className="whitespace-pre-wrap break-words">{unit.displayText}</p>}
          </div>
        </div>
      ))}
      {coverageLine ? (
        <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {coverageLine}
        </p>
      ) : null}
    </div>
  );
}
