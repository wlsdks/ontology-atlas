import type { ReactNode } from 'react';
import { InsightsSectionTitle } from '../parts/InsightsSectionTitle';
import { INSIGHTS_HEADLINE } from './insights-headline';

/** The tab's real state above its example: what to do, and the action under it. */
export function PreviewLead({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0 max-w-[var(--measure-prose)]">
        <InsightsSectionTitle level={2} className={INSIGHTS_HEADLINE}>{title}</InsightsSectionTitle>
        <p className="mt-2 break-keep text-body text-[color:var(--color-text-secondary)]">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}
