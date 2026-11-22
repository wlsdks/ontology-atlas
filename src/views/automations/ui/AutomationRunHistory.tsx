'use client';

import { useId, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { RoundPassEntry } from '@/entities/library-round';
import { type RoundUnrecorded, undoneReasonKey } from '@/features/library-rounds';
import { Link } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { Chip, CloseButton, Dialog, DialogBody } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { LANDED, useLandOnce } from '@/widgets/round-ledger';
import { runsNewestFirst } from '../model/run-order';
import { automationDate } from './automation-date';
import listStyles from './automation-list-frame.module.css';

export const WARNING_INK = 'text-[color:var(--color-amber-source-a90)]';

const RUNS_PER_PAGE = 10;

interface RunLead {
  text: string;
  note: RoundPassEntry['note'] | null;
  warning: boolean;
}

export function useRunLead(): (entry: RoundPassEntry) => RunLead & { undone: string | null; noteText: string | null } {
  const t = useTranslations('automations');
  const ledgerText = useTranslations('library.rounds.ledger');
  return (entry) => {
    const noteText = entry.note === 'no-agent'
      ? entry.kind === 'ontology' ? t('noAgentReview') : ledgerText('noAgent')
      : entry.note === 'stopped' ? t('runStopped') : null;
    const undoneLines = (entry.undone ?? []).map((item) =>
      `${item.action === 'left' ? t('leftAsIs', { page: item.path }) : t(`undone.${item.action}`, { page: item.path })} ${ledgerText(`undoneReason.${undoneReasonKey(item.reason)}`, { key: item.key ?? '' })}${item.copy ? ` ${ledgerText('undoneCopy', { copy: item.copy })}` : ''}`);
    const undone = undoneLines.length > 0 ? undoneLines.join(' ') : null;
    const failure = undone ?? (entry.outcome === 'failed' && entry.summary
      ? entry.summary === 'no-manifest' ? t('failedFolderNotRead') : t('failedError', { detail: entry.summary })
      : null);
    const own = failure ?? (entry.summary || (entry.checked > 0 ? t('checked', { count: entry.checked }) : ''));
    const noteLeads = !own && noteText !== null;
    const text = own || noteText || (entry.outcome === 'failed' ? t('failedNoResult') : t('noSummary'));
    return {
      text,
      note: noteLeads ? entry.note ?? null : null,
      warning: (noteLeads && entry.note === 'no-agent') || undone !== null,
      undone,
      noteText,
    };
  };
}

export function useUnrecordedText(): (unrecorded: RoundUnrecorded) => string {
  const t = useTranslations('automations');
  const locale = useLocale();
  return (unrecorded) => unrecorded.files.map((file) =>
    t(file.endsWith('.jsonl') ? 'unrecorded.ledger' : 'unrecorded.schedule', { time: automationDate(locale, unrecorded.endedAt), file })).join(' ');
}

export function AutomationUnrecorded({ unrecorded }: { unrecorded: readonly RoundUnrecorded[] }) {
  const text = useUnrecordedText();
  if (unrecorded.length === 0) return null;
  return <p data-testid="automations-unrecorded" role="status" className={cn('break-words text-body', WARNING_INK)}>
    {unrecorded.map(text).join(' ')}
  </p>;
}

export function AutomationHistoryHeading({ name, onShowAll }: { name: string | null; onShowAll: () => void }) {
  const t = useTranslations('automations');
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
    <h2 id="automations-run-ledger-title" className={cn(listStyles.panelTitle, 'min-w-0 break-words')}>
      {t('historyTitle')}
      {name ? <span className="font-normal text-[color:var(--color-text-tertiary)]"> · {name}</span> : null}
    </h2>
    {name ? <Chip size="md" hoverInk="strong" hoverSurface="lift" onClick={onShowAll} data-testid="automations-history-all"
      className="atlas-touch-floor">{t('showAll')}</Chip> : null}
  </div>;
}

export function AutomationRunHistory({ entries, named, landedRunId = null }: {
  entries: readonly RoundPassEntry[];
  named: boolean;
  landedRunId?: string | null;
}) {
  const t = useTranslations('automations');
  const recent = runsNewestFirst(entries.filter((entry) => entry.outcome !== 'asleep'));
  const landedIndex = landedRunId ? recent.findIndex((entry) => entry.id === landedRunId) : -1;
  const [shown, setShown] = useState(() => Math.max(RUNS_PER_PAGE, Math.ceil((landedIndex + 1) / RUNS_PER_PAGE) * RUNS_PER_PAGE));
  const landOn = useLandOnce();
  if (recent.length === 0) return <p className="text-body text-[color:var(--color-text-tertiary)]">{t('noRuns')}</p>;
  const more = recent.length - shown;
  return (
    <div className="flex flex-col gap-2">
      <ol data-testid="automations-history" className="divide-y divide-[color:var(--color-divider)] border-y border-[color:var(--color-divider)]">
        {recent.slice(0, shown).map((entry, index) => <RunEntry key={entry.id} entry={entry} named={named} latest={index === 0}
          landOn={entry.id === landedRunId ? landOn : null} />)}
      </ol>
      {more > 0 ? <div>
        <button type="button" onClick={() => setShown((count) => count + RUNS_PER_PAGE)} data-testid="automations-history-more"
          className={cn(controlClass({ shape: 'link', size: 'lg', tone: 'secondary', hoverInk: 'strong' }), 'atlas-touch-floor')}>
          {t('showMoreRuns', { count: Math.min(more, RUNS_PER_PAGE) })}
        </button>
      </div> : null}
    </div>
  );
}

function RunEntry({ entry, named, latest, landOn }: {
  entry: RoundPassEntry;
  named: boolean;
  latest: boolean;
  landOn: ((element: HTMLElement | null) => void) | null;
}) {
  const t = useTranslations('automations');
  const locale = useLocale();
  const lead = useRunLead()(entry);
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsTitleId = useId();
  const tools = entry.refused.length > 0 || entry.called.length > 0;
  return (
    <li data-testid={latest ? 'automations-last-run' : undefined} data-run-id={entry.id} ref={landOn ?? undefined}
      tabIndex={landOn ? -1 : undefined} data-landed={landOn ? '' : undefined} className={cn('py-4', landOn && cn(LANDED, '-mx-3 px-3'))}>
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {named && entry.roundName ? <span className="min-w-0 truncate text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{entry.roundName}</span> : null}
        <span className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-secondary)]">{t(`outcome.${entry.outcome}`)}</span>
        <time dateTime={entry.endedAt} className="text-label text-[color:var(--color-text-tertiary)]">{automationDate(locale, entry.endedAt)}</time>
      </div>
      <p data-run-note={lead.note ?? undefined} className={cn('break-words text-body', lead.warning ? WARNING_INK : 'text-[color:var(--color-text-secondary)]')}>{lead.text}</p>
      {entry.leftAsIs?.length ? <p data-testid="automations-left-as-is" className="mt-2 break-words text-body text-[color:var(--color-text-tertiary)]">
        {entry.leftAsIs.map((page) => t('leftAsIs', { page })).join(' ')}
      </p> : null}
      {entry.stale.length > 0 || entry.written.length > 0 ? <dl className="mt-3 space-y-2">
        {entry.stale.length > 0 ? <FileGroup label={t('staleLabel')} paths={entry.stale} page={() => true} /> : null}
        {entry.written.length > 0 ? <FileGroup label={t('writtenLabel')} paths={entry.written} page={(path) => path.startsWith('wiki/')} /> : null}
      </dl> : null}
      {lead.noteText && !lead.note ? <p data-run-note={entry.note} className={cn('mt-2 break-words text-body', entry.note === 'no-agent' ? WARNING_INK : 'text-[color:var(--color-text-tertiary)]')}>{lead.noteText}</p> : null}
      {latest && entry.note === 'no-agent' ? <div className="mt-2">
        <Link href={DESTINATION_HREF.agents} className={cn(controlClass({ shape: 'link', size: 'lg', tone: 'accent' }), 'atlas-touch-floor')}>{t('openAgents')}</Link>
      </div> : null}
      {entry.refused.length > 0 ? <p className="mt-2 text-body text-[color:var(--color-text-secondary)]">{t('blockedActions', { count: entry.refused.length })}</p> : null}
      {tools ? <div className="mt-2">
        <Chip size="md" hoverInk="strong" hoverSurface="lift" onClick={() => setToolsOpen(true)} data-testid="automations-tool-activity"
          className="atlas-touch-floor">
          {t('toolActivity')}
        </Chip>
        <Dialog open={toolsOpen} onClose={() => setToolsOpen(false)} labelledBy={toolsTitleId} size="md" testId="automations-tool-activity-dialog">
          <DialogHeading id={toolsTitleId} onClose={() => setToolsOpen(false)}
            subtitle={`${entry.roundName ? `${entry.roundName} · ` : ''}${automationDate(locale, entry.endedAt)}`}>
            {t('toolActivity')}
          </DialogHeading>
          <DialogBody className="mt-4 space-y-2">
            {entry.refused.length > 0 ? <p className="break-words text-body text-[color:var(--color-text-secondary)]">{t('refused', { tools: entry.refused.join(', ') })}</p> : null}
            {entry.called.length > 0 ? <p className="break-words text-body text-[color:var(--color-text-tertiary)]">{t('called', { tools: entry.called.join(', ') })}</p> : null}
          </DialogBody>
        </Dialog>
      </div> : null}
    </li>
  );
}

function DialogHeading({ id, subtitle, onClose, children }: { id: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  const t = useTranslations('automations');
  return <div className="flex items-start gap-3">
    <div className="min-w-0 flex-1">
      <h2 id={id} className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h2>
      <p className="mt-1 break-words text-body text-[color:var(--color-text-tertiary)]">{subtitle}</p>
    </div>
    <CloseButton label={t('close')} onClick={onClose} className="-mr-1 -mt-1 flex-none" />
  </div>;
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
