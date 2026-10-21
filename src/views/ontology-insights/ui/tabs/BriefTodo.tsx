'use client';

import { useTranslations } from 'next-intl';
import { buttonVariants } from '@/shared/ui';
import { cn } from '@/shared/lib/cn';
import { parseInsightsTabHref, type InsightsTab } from '../../lib/insights-tab-state';
import type { BriefRow } from '../../lib/brief/brief-rows';
import { briefRowHref } from '../../lib/brief/brief-todo';
import type { InsightsBrief } from '../../lib/brief/use-insights-brief';
import { DestinationLink, EMPTY_DETAILS, LineDisclosure, STATE_MARK } from './BriefLineParts';

const PLACE_KEY: Record<string, 'map' | 'architecture' | 'library' | 'agents' | 'git'> = {
  '/topology/': 'map',
  '/architecture/': 'architecture',
  '/library/': 'library',
  '/agents/': 'agents',
  '/git/': 'git',
};

export function BriefTodo({
  rows,
  details,
  nowMs,
  counting,
  onAskAgent,
  onOpenTab,
}: {
  rows: readonly BriefRow[];
  details: InsightsBrief['details'];
  nowMs: number;
  counting: boolean;
  onAskAgent?: (request: string) => void;
  onOpenTab?: (tab: InsightsTab) => void;
}) {
  const t = useTranslations('ontologyPages.insights.brief');
  const nav = useTranslations('navRail');
  const actionLabel = (href: string): string => {
    if (parseInsightsTabHref(href)) return t('todoAction.check');
    if (href === '/download/') return t('getApp');
    if (href === '/architecture/?view=guides') return t('todoAction.compare');
    const place = PLACE_KEY[href.split('?')[0]];
    return place ? t('todoAction.view', { place: nav(place) }) : t('open');
  };
  return (
    <div className="flex flex-col gap-3" aria-busy={counting || undefined}>
      <h3 className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-tertiary)]">{t('todoTitle')}</h3>
      <ol
        data-testid="brief-todo"
        className="insights-disclosure-in divide-y divide-[color:var(--color-divider)] rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-[var(--card-pad)]"
      >
        {rows.map((row, index) => {
          if (row.kind !== 'line') return null;
          const { line, core, total } = row;
          const href = briefRowHref(row, false);
          const lineDetails = details.get(line.id) ?? EMPTY_DETAILS;
          const sentenceClass = 'min-w-0 text-body-lg text-[color:var(--color-text-primary)] sm:max-w-[var(--measure-doc-column)]';
          return (
            <li key={line.id} data-brief-todo={line.id} data-brief-line={line.id} data-brief-state={line.state} data-brief-core={core} className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4 sm:flex">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-overlay-2)]">
                <span className="text-label tabular-nums font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">{index + 1}</span>
              </span>
              <div className="flex min-w-0 flex-col gap-1 sm:flex-1">
                <div className="flex items-center gap-2 text-label text-[color:var(--color-text-tertiary)]">
                  <span aria-hidden="true" className="flex w-2.5 shrink-0 justify-center [&>span]:mt-0">
                    <span className={STATE_MARK[line.state]} />
                  </span>
                  <span>{t(`core.${core}`)}</span>
                  {total !== undefined ? (
                    <span className="tabular-nums" data-brief-numeral="">
                      {line.count} / {total}
                    </span>
                  ) : null}
                </div>
                {lineDetails.length > 0 ? (
                  <LineDisclosure line={line} details={lineDetails} href={href} nowMs={nowMs} onAskAgent={onAskAgent} onOpenTab={onOpenTab} className={sentenceClass} />
                ) : (
                  <p className={sentenceClass}>{t(`line.${line.id}`, { count: line.count })}</p>
                )}
              </div>
              {href ? (
                <div className="col-start-2 justify-self-start sm:w-40 sm:shrink-0">
                  <DestinationLink
                    href={href}
                    button
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'atlas-touch-floor w-full')}
                    onOpenTab={onOpenTab}
                  >
                    {actionLabel(href)}
                  </DestinationLink>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
