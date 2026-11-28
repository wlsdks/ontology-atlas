import { useTranslations } from 'use-intl';

import { formatValue, FormattedValueView } from '@/features/ontology-change-review';

import { ReviewFieldLabel } from './ReviewFieldLabel';
import type { summarizeProposal } from './meaning-units';

/** The shallowest look at a proposed change: its values and meaning units, and what was left out. */
export function TaskReviewSummary({
  summary,
  coverageLine,
  itemCount,
}: {
  summary: ReturnType<typeof summarizeProposal>;
  coverageLine: string;
  itemCount: number;
}) {
  const t = useTranslations('acpChat.permission');
  const tChange = useTranslations('ontologyChangeReview');
  const { visibleValueFields, omittedValueFields, visibleMeaningUnits } = summary;
  return (
    <div data-testid="task-review-summary" className="grid gap-3">
      {visibleValueFields.length > 0 ? (
        <dl data-testid="task-review-values" className="grid gap-2">
          {visibleValueFields.map((field) => (
            <div key={field.key} data-testid="task-review-value" data-field-key={field.key} className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3">
              <dt className="break-words text-label leading-label"><ReviewFieldLabel fieldKey={field.key} /></dt>
              <dd className="min-w-0 text-body leading-prose text-[color:var(--color-text-primary)]">
                <FormattedValueView value={formatValue(field.after)} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {omittedValueFields > 0 ? (
        <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {tChange('moreFields', { count: omittedValueFields })}
        </p>
      ) : null}
      {visibleMeaningUnits.length > 0 ? (
        <div className="grid gap-2">
          {visibleMeaningUnits.map((unit, index) => (
            <div key={unit.id} data-testid={`task-review-meaning-unit-${index}`} className="grid gap-0.5">
              <span className="break-words font-mono text-label leading-label text-[color:var(--color-text-tertiary)]">{unit.label}</span>
              {unit.value ? (
                <FormattedValueView value={unit.value} className="text-body leading-prose" />
              ) : (
                <p className="whitespace-pre-wrap break-words text-body leading-prose text-[color:var(--color-text-primary)]">
                  {unit.displayText}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {coverageLine ? (
        <p data-testid="task-review-coverage" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {coverageLine}
        </p>
      ) : null}
      {itemCount > 1 ? (
        <p data-testid="task-review-batch-remaining" className="text-label leading-label text-[color:var(--color-text-tertiary)]">
          {t('taskReview.batchRemaining', { count: itemCount - 1 })}
        </p>
      ) : null}
    </div>
  );
}
