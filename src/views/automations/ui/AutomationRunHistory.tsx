'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { RoundPassEntry } from '@/entities/library-round';
import { Link } from '@/i18n/navigation';
import { Disclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';

export function AutomationRunHistory({ entries }: { entries: readonly RoundPassEntry[] }) {
  const t = useTranslations('automations');
  const recent = [...entries].reverse();
  return (
    <section data-testid="automations-history" className="space-y-3">
      <h3 className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('historyTitle')}</h3>
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
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{t(`outcome.${entry.outcome}`)}</span>
                <time dateTime={entry.endedAt} className="text-body text-[color:var(--color-text-tertiary)]">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.endedAt))}</time>
              </div>
              <p className="mt-2 break-words text-body-lg text-[color:var(--color-text-secondary)]">{entry.summary || (entry.checked > 0 ? t('checked', { count: entry.checked }) : t('noSummary'))}</p>
              {entry.stale.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{t('stalePages', { pages: entry.stale.join(', ') })}</p> : null}
              {entry.written.length > 0 ? <p className="mt-2 break-words text-body text-[color:var(--color-text-secondary)]">{t('writtenFiles', { files: entry.written.join(', ') })}</p> : null}
              {pages.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">
                {pages.map((slug) => <Link key={slug} href={`/docs/?slug=${encodeURIComponent(slug)}`}
                  aria-label={pageText('openPage', { page: slug.replace(/^wiki\//, '') })}
                  className={controlClass({ shape: 'link', tone: 'secondary', className: 'max-w-full break-all' })}>
                  {slug.replace(/^wiki\//, '')}
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
