'use client';

import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoundPassEntry } from '@/entities/library-round';
import { Link } from '@/i18n/navigation';
import { Disclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { automationDate } from './automation-date';

export function AutomationRunHistory({ entries }: { entries: readonly RoundPassEntry[] }) {
  const t = useTranslations('automations');
  const recent = [...entries].reverse();
  return (
    <section data-testid="automations-history" className="space-y-3">
      {/* A caption, not a heading: at 14px/650 it outweighed the outcomes it labels. */}
      <h3 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('historyTitle')}</h3>
      {entries.length === 0 ? <p className="text-body text-[color:var(--color-text-tertiary)]">{t('noRuns')}</p> : (
        <div className="space-y-3">
        <ol className="divide-y divide-[color:var(--color-divider)]">
          {recent.slice(0, 1).map((entry, index) => (
            <RunEntry key={entry.id} entry={entry} latest={index === 0} />
          ))}
        </ol>
        {recent.length > 1 ? <Disclosure animated summary={t('earlierRuns', { count: recent.length - 1 })}>
          <ol className="divide-y divide-[color:var(--color-divider)]">
            {recent.slice(1).map((entry) => <RunEntry key={entry.id} entry={entry} />)}
          </ol>
        </Disclosure> : null}
        </div>
      )}
    </section>
  );
}

function RunEntry({ entry, latest = false }: { entry: RoundPassEntry; latest?: boolean }) {
  const t = useTranslations('automations');
  const pageText = useTranslations('library.rounds.since');
  const locale = useLocale();
  const pages = [...new Set([...entry.stale, ...entry.written.filter((path) => path.startsWith('wiki/'))]
    .map((path) => path.replace(/\.md$/, '')))];
  return (
            <li data-testid={latest ? 'automations-last-run' : undefined} className="py-3 first:pt-0">
              {/* The row header already states the latest outcome and its time; saying it again
                  here, in a second date format, doubled the line. Earlier runs keep theirs. */}
              {latest ? null : <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t(`outcome.${entry.outcome}`)}</span>
                <time dateTime={entry.endedAt} className="text-body text-[color:var(--color-text-tertiary)]">{automationDate(locale, entry.endedAt)}</time>
              </div>}
              <p className={`break-words ${latest ? 'text-body-lg text-[color:var(--color-text-primary)]' : 'text-body text-[color:var(--color-text-secondary)]'}`}>{entry.summary || (entry.checked > 0 ? t('checked', { count: entry.checked }) : t('noSummary'))}</p>
              {entry.stale.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{t('stalePages', { pages: entry.stale.join(', ') })}</p> : null}
              {entry.written.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{t('writtenFiles', { files: entry.written.join(', ') })}</p> : null}
              {pages.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">
                {pages.map((slug) => <Link key={slug} href={`/docs/?slug=${encodeURIComponent(slug)}`}
                  aria-label={pageText('openPage', { page: slug.replace(/^wiki\//, '') })}
                  className={controlClass({ shape: 'chip', size: 'lg', tone: 'secondary', hoverInk: 'strong', hoverSurface: 'lift', hoverBorder: 'strong', className: 'max-w-full break-all' })}>
                  <FileText size={ICON_SIZE.sm} className="flex-none" aria-hidden />{slug.replace(/^wiki\//, '')}
                </Link>)}
              </div> : null}
              {entry.refused.length > 0 ? <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('blockedActions', { count: entry.refused.length })}</p> : null}
              {entry.refused.length > 0 || entry.called.length > 0 ? (
                <div className="mt-2"><Disclosure animated summary={t('toolActivity')}>
                  {entry.refused.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{t('refused', { tools: entry.refused.join(', ') })}</p> : null}
                  {entry.called.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-tertiary)]">{t('called', { tools: entry.called.join(', ') })}</p> : null}
                </Disclosure></div>
              ) : null}
            </li>
  );
}
