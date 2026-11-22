'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

/**
 * One row over the leads: how many passages were found, the scope glyph and the report action.
 * Under a report the row only names what follows, since the report carries scope and actions.
 */
export function DeskResultsHead({ count, underReport, coverageInfo, reportAction }: {
  count: number;
  underReport: boolean;
  coverageInfo: ReactNode;
  reportAction: ReactNode;
}) {
  const t = useTranslations('library.questionDesk');
  return <div data-testid="question-desk-results-head" className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[color:var(--color-border-soft)] pb-3">
    <div className="flex min-w-0 items-center gap-1.5">
      <h3 aria-live="polite" className="text-body font-[var(--font-weight-strong)] leading-body text-[color:var(--color-text-primary)]">
        {underReport ? t('passagesUnderReport') : t('resultsHead', { count })}
      </h3>
      {underReport ? null : coverageInfo}
    </div>
    {underReport ? null : reportAction}
  </div>;
}
