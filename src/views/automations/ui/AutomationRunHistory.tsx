'use client';

import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoundPassEntry } from '@/entities/library-round';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
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

/** No agent is a warning a person can act on (sign in), in the Library ledger's ink wherever it stands. */
const WARNING_INK = 'text-[color:var(--color-amber-source-a90)]';

function RunEntry({ entry, latest = false }: { entry: RoundPassEntry; latest?: boolean }) {
  const t = useTranslations('automations');
  const ledgerText = useTranslations('library.rounds.ledger');
  const locale = useLocale();
  /*
   * **Why a pass did less than its round asked, in the Library's own words.** Both screens read
   * one `rounds-ledger.jsonl`. The Library explained `note` under the pass ("no coding agent was
   * ready", "you paused it"); this history never read it, so a person who only opened
   * Automations saw "Failed" or a count and no reason (probe, 2026-09-25). A review never
   * redrafts anything, so its no-agent line says the review did not run instead.
   */
  const note = entry.note === 'no-agent'
    ? entry.kind === 'ontology' ? t('noAgentReview') : ledgerText('noAgent')
    : entry.note === 'stopped' ? ledgerText('stopped') : null;
  /*
   * The pass's own words, else what it checked. With neither, the reason leads; a failed pass
   * with no reason says it left no result — never the "finished" filler, which read as success
   * under the word "Failed".
   */
  const own = entry.summary || (entry.checked > 0 ? t('checked', { count: entry.checked }) : '');
  const noteLeads = !own && note !== null;
  const lead = own || note || (entry.outcome === 'failed' ? t('failedNoResult') : t('noSummary'));
  /* A stopped pass was the person's own press: leading, it reads as the lead; under a lead, it is quiet. */
  const leadInk = noteLeads && entry.note === 'no-agent' ? WARNING_INK
    : latest ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]';
  return (
            <li data-testid={latest ? 'automations-last-run' : undefined} className="py-3 first:pt-0">
              {/* The row header already states the latest outcome and its time; saying it again
                  here, in a second date format, doubled the line. Earlier runs keep theirs. */}
              {latest ? null : <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t(`outcome.${entry.outcome}`)}</span>
                <time dateTime={entry.endedAt} className="text-body text-[color:var(--color-text-tertiary)]">{automationDate(locale, entry.endedAt)}</time>
              </div>}
              <p data-run-note={noteLeads ? entry.note : undefined} className={cn('break-words', latest ? 'text-body-lg' : 'text-body', leadInk)}>{lead}</p>
              {/* Each file is said once: a wiki page is its own link, anything else its path.
                  A sentence listing the paths and a chip row for the same pages said it twice. */}
              {entry.stale.length > 0 || entry.written.length > 0 ? <dl className="mt-3 space-y-2">
                {entry.stale.length > 0 ? <FileGroup label={t('staleLabel')} paths={entry.stale} page={() => true} /> : null}
                {entry.written.length > 0 ? <FileGroup label={t('writtenLabel')} paths={entry.written} page={(path) => path.startsWith('wiki/')} /> : null}
              </dl> : null}
              {note && !noteLeads ? <p data-run-note={entry.note} className={cn('mt-2 break-words text-body', entry.note === 'no-agent' ? WARNING_INK : 'text-[color:var(--color-text-tertiary)]')}>{note}</p> : null}
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

function FileGroup({ label, paths, page }: { label: string; paths: readonly string[]; page: (path: string) => boolean }) {
  const pageText = useTranslations('library.rounds.since');
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <dt className="text-body text-[color:var(--color-text-tertiary)]">{label}</dt>
      {paths.map((path) => {
        const slug = path.replace(/\.md$/, '');
        const name = slug.replace(/^wiki\//, '');
        return <dd key={path} className="min-w-0 max-w-full">
          {page(path) ? <Link href={`/docs/?slug=${encodeURIComponent(slug)}`}
            aria-label={pageText('openPage', { page: name })}
            className={controlClass({ shape: 'chip', size: 'lg', tone: 'secondary', hoverInk: 'strong', hoverSurface: 'lift', hoverBorder: 'strong', className: 'max-w-full break-all' })}>
            <FileText size={ICON_SIZE.sm} className="flex-none" aria-hidden />{name}
          </Link> : <span className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{path}</span>}
        </dd>;
      })}
    </div>
  );
}
