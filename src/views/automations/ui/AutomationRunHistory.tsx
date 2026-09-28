'use client';

import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoundPassEntry } from '@/entities/library-round';
import { type RoundUnrecorded, undoneReasonKey } from '@/features/library-rounds';
import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { Disclosure } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { automationDate } from './automation-date';

export function AutomationRunHistory({ entries, unrecorded }: { entries: readonly RoundPassEntry[]; unrecorded?: RoundUnrecorded }) {
  const t = useTranslations('automations');
  const locale = useLocale();
  const recent = [...entries].reverse();
  return (
    <section data-testid="automations-history" className="space-y-3">
      <h3 className="text-label font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('historyTitle')}</h3>
      {unrecorded ? <p data-testid="automations-unrecorded" role="status" className={cn('break-words text-body', WARNING_INK)}>
        {unrecorded.files.map((file) => t(file.endsWith('.jsonl') ? 'unrecorded.ledger' : 'unrecorded.schedule', { time: automationDate(locale, unrecorded.endedAt), file })).join(' ')}
      </p> : null}
      {entries.length === 0 ? unrecorded ? null : <p className="text-body text-[color:var(--color-text-tertiary)]">{t('noRuns')}</p> : (
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
  const note = entry.note === 'no-agent'
    ? entry.kind === 'ontology' ? t('noAgentReview') : ledgerText('noAgent')
    : entry.note === 'stopped' ? ledgerText('stopped') : null;
  const undone = (entry.undone ?? []).map((item) =>
    `${item.action === 'left' ? t('leftAsIs', { page: item.path }) : t(`undone.${item.action}`, { page: item.path })} ${ledgerText(`undoneReason.${undoneReasonKey(item.reason)}`, { key: item.key ?? '' })}${item.copy ? ` ${ledgerText('undoneCopy', { copy: item.copy })}` : ''}`);
  const failure = undone.length > 0 ? undone.join(' ') : entry.outcome === 'failed' && entry.summary
    ? entry.summary === 'no-manifest' ? t('failedFolderNotRead') : t('failedError', { detail: entry.summary })
    : null;
  const own = failure ?? (entry.summary || (entry.checked > 0 ? t('checked', { count: entry.checked }) : ''));
  const noteLeads = !own && note !== null;
  const lead = own || note || (entry.outcome === 'failed' ? t('failedNoResult') : t('noSummary'));
  const leadInk = (noteLeads && entry.note === 'no-agent') || undone.length > 0 ? WARNING_INK
    : latest ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]';
  return (
            <li data-testid={latest ? 'automations-last-run' : undefined} className="py-3 first:pt-0">
              {latest ? null : <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]">{t(`outcome.${entry.outcome}`)}</span>
                <time dateTime={entry.endedAt} className="text-body text-[color:var(--color-text-tertiary)]">{automationDate(locale, entry.endedAt)}</time>
              </div>}
              <p data-run-note={noteLeads ? entry.note : undefined} className={cn('break-words', latest ? 'text-body-lg' : 'text-body', leadInk)}>{lead}</p>
              {entry.leftAsIs?.length ? <p data-testid="automations-left-as-is" className="mt-2 break-words text-body text-[color:var(--color-text-tertiary)]">
                {entry.leftAsIs.map((page) => t('leftAsIs', { page })).join(' ')}
              </p> : null}
              {entry.stale.length > 0 || entry.written.length > 0 ? <dl className="mt-3 space-y-2">
                {entry.stale.length > 0 ? <FileGroup label={t('staleLabel')} paths={entry.stale} page={() => true} /> : null}
                {entry.written.length > 0 ? <FileGroup label={t('writtenLabel')} paths={entry.written} page={(path) => path.startsWith('wiki/')} /> : null}
              </dl> : null}
              {note && !noteLeads ? <p data-run-note={entry.note} className={cn('mt-2 break-words text-body', entry.note === 'no-agent' ? WARNING_INK : 'text-[color:var(--color-text-tertiary)]')}>{note}</p> : null}
              {latest && entry.note === 'no-agent' ? <div className="mt-2">
                <Link href={DESTINATION_HREF.agents} className={cn(controlClass({ shape: 'link', size: 'lg', tone: 'accent' }), 'atlas-touch-floor')}>{t('openAgents')}</Link>
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
