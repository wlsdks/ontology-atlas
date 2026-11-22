'use client';

import { useTranslations } from 'next-intl';

/**
 * One line per answer the card offers, saying what it does. The buttons point here through
 * `aria-describedby` ids built from `legendId`.
 */
export function TaskReviewAnswerLegend({
  legendId,
  canCorrect,
  canDefer,
  allowEffect,
}: {
  legendId: string;
  canCorrect: boolean;
  canDefer: boolean;
  allowEffect: string;
}) {
  const t = useTranslations('acpChat.permission');
  return (
    <dl data-testid="task-review-answer-legend" className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t border-[color:var(--color-divider)] pt-3 text-label leading-label">
      {canCorrect ? (
        <>
          <dt className="text-[color:var(--color-text-tertiary)]">{t('taskReview.correct')}</dt>
          <dd id={`${legendId}-correct`} className="min-w-0 text-[color:var(--color-text-secondary)]">{t('taskReview.correctEffect')}</dd>
        </>
      ) : null}
      {canDefer ? (
        <>
          <dt className="text-[color:var(--color-text-tertiary)]">{t('taskReview.defer')}</dt>
          <dd id={`${legendId}-defer`} className="min-w-0 text-[color:var(--color-text-secondary)]">{t('taskReview.deferEffect')}</dd>
        </>
      ) : null}
      <dt className="text-[color:var(--color-text-tertiary)]">{t('allowOnce')}</dt>
      <dd id={`${legendId}-allow`} data-testid="task-review-allow-scope" className="min-w-0 text-[color:var(--color-text-secondary)]">{allowEffect}</dd>
    </dl>
  );
}
