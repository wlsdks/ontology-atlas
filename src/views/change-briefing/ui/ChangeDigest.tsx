'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { Button, RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { changeBody, changeTitle, directoryCounts, titleWithoutHead, type ChangeDigest as Digest, type DigestChange, type DigestGroup, type NotableReason } from '../model/change-digest';
import { DigestSummarySeat } from './DigestSummarySeat';

const PAGE_SIZE = 40;
const CONCEPTS_SHOWN = 3;
/** A period this small is read faster as its changes than as bars to open. */
const LISTED_OUTRIGHT = 8;
const DIRECTORIES_SHOWN = 4;
const PATHS_SHOWN = 6;

interface ChangeDigestProps {
  digest: Digest;
  /** Changes listed per group key; 0 is closed, and a missing key takes the period's default. */
  shown: Record<string, number>;
  onShown: (next: Record<string, number>) => void;
  /** Newest changes read when the period was cut short; null for a complete read. */
  /** How many changes a cut-short read holds, 'limited' when the read is partial for another reason. */
  partialCount: number | 'limited' | null;
  conceptTitle: (id: string) => string;
  formatTime: (committedAt: string) => string;
  pullUrl: (number: number) => string | null;
  onOpen: (commit: BriefingCommit) => void;
}

export function ChangeDigest({ digest, shown, onShown, partialCount, conceptTitle, formatTime, pullUrl, onOpen }: ChangeDigestProps) {
  const t = useTranslations('changeDigest');
  const headlineId = useId();
  const largest = Math.max(...digest.groups.map(group => group.changes.length));
  const accent = digest.groups.find(group => group.kind !== 'other')?.key;
  const reason = (value: NotableReason) => value.kind === 'revert' ? t('reasonRevert') : value.kind === 'breaking' ? t('reasonBreaking') : value.kind === 'reach' ? t('reasonReach', { count: value.count }) : t('reasonSize', { count: value.count });
  const [detail, setDetail] = useState<string | null>(null);
  const listed = (key: string) => shown[key] ?? (digest.changes <= LISTED_OUTRIGHT ? PAGE_SIZE : 0);
  const toggle = (key: string) => onShown({ ...shown, [key]: listed(key) > 0 ? 0 : PAGE_SIZE });
  const rows = { detail, onDetail: (key: string) => setDetail(detail === key ? null : key), conceptTitle, pullUrl, onOpen };
  return <div data-testid="change-digest" className="space-y-10">
    {partialCount !== null && <p role="status" data-testid="change-digest-partial" className="text-body text-[color:var(--color-status-warning)]">{partialCount === 'limited' ? t('partialOther') : t('partial', { count: partialCount })}</p>}
    <div className="space-y-1">
      <h2 id={headlineId} className="font-mono text-hero font-[var(--font-weight-strong)] tabular-nums">{digest.changes.toLocaleString()}</h2>
      <p className="text-body-lg text-[color:var(--color-text-secondary)]">{t('headline', { count: digest.changes, files: digest.files })}</p>
    </div>
    {digest.notable.length > 0 && <section aria-labelledby={`${headlineId}-notable`} className="space-y-2" data-testid="change-digest-notable">
      <h3 id={`${headlineId}-notable`} className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('notable')}</h3>
      <ul className="-mx-3" data-digest-list="notable">
        {digest.notable.map(({ change, reason: why }) => <li key={change.commit.hash}>
          <ChangeRow change={change} list="notable" lead={reason(why)} leadClassName="basis-full md:basis-auto md:w-48" emphasis {...rows} />
        </li>)}
      </ul>
    </section>}
    <DigestSummarySeat />
    <ul className="-mx-3 border-t border-[color:var(--color-border-soft)]" data-testid="change-digest-groups">
      {digest.groups.map(group => <GroupRow key={group.key} group={group} share={group.changes.length / largest} accent={group.key === accent} compare={digest.groups.length > 1}
        shown={listed(group.key)} onToggle={() => toggle(group.key)} onMore={() => onShown({ ...shown, [group.key]: listed(group.key) + PAGE_SIZE })}
        formatTime={formatTime} rows={rows} />)}
    </ul>
  </div>;
}

interface RowShared extends Pick<ChangeDigestProps, 'conceptTitle' | 'pullUrl' | 'onOpen'> {
  /** The one change whose detail is open, as `list:hash`. */
  detail: string | null;
  onDetail: (key: string) => void;
}

function GroupRow({ group, share, accent, compare, shown, onToggle, onMore, formatTime, rows }: {
  group: DigestGroup; share: number; accent: boolean; compare: boolean; shown: number;
  onToggle: () => void; onMore: () => void; rows: RowShared;
} & Pick<ChangeDigestProps, 'formatTime'>) {
  const { conceptTitle } = rows;
  const t = useTranslations('changeDigest');
  const briefing = useTranslations('changeBriefing');
  const panelId = useId();
  const open = shown > 0;
  const name = group.kind === 'other' ? t('other') : group.name === '.' ? briefing('rootFiles') : group.name;
  const count = group.changes.length;
  const remaining = count - shown;
  return <li className="border-b border-[color:var(--color-border-soft)]">
    <RowButton hoverSurface="lift" hoverInk="strong" aria-expanded={open} aria-controls={panelId} aria-label={t('groupName', { group: name, count })} data-digest-group={group.key} onClick={onToggle}
      className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2 rounded-none px-3 py-3 lg:grid-cols-[12rem_minmax(0,1fr)_3rem_auto]">
      <span className={cn('truncate text-body-lg font-[var(--font-weight-strong)]', group.kind === 'other' ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-primary)]')}>{name}</span>
      <span aria-hidden className="col-span-3 row-start-2 block h-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        {compare && <span className={cn('block h-full min-w-1 rounded-micro', accent ? 'bg-[color:var(--color-indigo-accent)]' : 'bg-[color:var(--color-text-quaternary)]')} style={{ width: `${share * 100}%` }} />}
      </span>
      <span className="text-right font-mono text-body-lg tabular-nums text-[color:var(--color-text-primary)] lg:col-start-3">{count.toLocaleString()}</span>
      <ChevronRight size={ICON_SIZE.md} aria-hidden className={cn('text-[color:var(--color-text-tertiary)] transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
    </RowButton>
    <div id={panelId} hidden={!open} className="space-y-3 pb-5 lg:pl-55">
      {open && <>
        {group.concepts.length > 0 && <div className="flex flex-wrap items-center gap-2 px-3 pt-1 lg:px-0">
          <span className="text-label text-[color:var(--color-text-tertiary)]">{t('concepts')}</span>
          {group.concepts.slice(0, CONCEPTS_SHOWN).map(id => <Link key={id} href={'/topology/?p=' + encodeURIComponent(translateOntologyDeeplinkToTopologyParam(id))} className={controlClass({ shape: 'chip', size: 'xs', hoverSurface: 'lift', hoverInk: 'strong', className: 'border-[color:var(--color-border-soft)] text-label' })}>{conceptTitle(id)}</Link>)}
        </div>}
        <ul className="lg:-ml-3" data-digest-list={group.key}>
          {group.changes.slice(0, shown).map(change => <li key={change.commit.hash}>
            <ChangeRow change={change} list={group.key} headless={group.kind === 'label'} lead={formatTime(change.commit.committedAt)} leadClassName="w-14 whitespace-nowrap font-mono tabular-nums" {...rows} />
          </li>)}
        </ul>
        {remaining > 0 && <Button className="atlas-touch-floor atlas-touch-floor-wide mx-3" variant="ghost" size="sm" onClick={onMore}>{t('more', { count: Math.min(PAGE_SIZE, remaining) })}</Button>}
      </>}
    </div>
  </li>;
}

function ChangeRow({ change, list, lead, leadClassName, emphasis = false, headless = false, detail, onDetail, conceptTitle, pullUrl, onOpen }: {
  change: DigestChange; list: string; lead: ReactNode; leadClassName: string; emphasis?: boolean;
  /** The list already names the label, so the title drops its `type(label):` head. */
  headless?: boolean;
} & RowShared) {
  const panelId = useId();
  const { commit } = change;
  const title = changeTitle(commit.subject, commit.message);
  const key = `${list}:${commit.hash}`;
  const open = detail === key;
  return <>
    <RowButton hoverSurface="lift" hoverInk="strong" aria-expanded={open} aria-controls={panelId} title={title} data-change-hash={commit.hash} onClick={() => onDetail(key)}
      className={cn('min-h-10 w-full min-w-0 flex-wrap gap-x-3 gap-y-0.5 px-3 py-2 md:flex-nowrap md:gap-x-4', open && 'bg-[color:var(--color-overlay-2)]')}>
      <span className={cn('shrink-0 text-label', emphasis ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-tertiary)]', leadClassName)}>{lead}</span>
      <span className={cn('min-w-0 flex-1 truncate', emphasis || open ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]', emphasis ? 'text-body-lg' : 'text-body')}>{headless ? titleWithoutHead(commit.subject, commit.message) : title}</span>
      {change.number !== null && <span className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">#{change.number}</span>}
    </RowButton>
    <div id={panelId} hidden={!open}>
      {open && <ChangeDetail change={change} title={title} conceptTitle={conceptTitle} url={change.number === null ? null : pullUrl(change.number)} onOpen={onOpen} />}
    </div>
  </>;
}

function ChangeDetail({ change, title, conceptTitle, url, onOpen }: { change: DigestChange; title: string; url: string | null } & Pick<ChangeDigestProps, 'conceptTitle' | 'onOpen'>) {
  const t = useTranslations('changeDigest');
  const briefing = useTranslations('changeBriefing');
  const { commit } = change;
  const paths = [...new Set(commit.paths)];
  const directories = directoryCounts(paths);
  const body = changeBody(commit.subject, commit.message);
  return <div data-testid="change-detail" className="space-y-3 px-3 pb-4 pt-2">
    {body.length > 0 && <p className="whitespace-pre-line text-body text-[color:var(--color-text-secondary)]">{body.join('\n')}</p>}
    {change.concepts.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <span className="text-label text-[color:var(--color-text-tertiary)]">{t('concepts')}</span>
      {change.concepts.slice(0, CONCEPTS_SHOWN).map(id => <Link key={id} href={'/topology/?p=' + encodeURIComponent(translateOntologyDeeplinkToTopologyParam(id))} className={controlClass({ shape: 'chip', size: 'xs', hoverSurface: 'lift', hoverInk: 'strong', className: 'border-[color:var(--color-border-soft)] text-label' })}>{conceptTitle(id)}</Link>)}
    </div>}
    {paths.length > 0 && <div className="space-y-1.5">
      <p className="text-label text-[color:var(--color-text-tertiary)]">
        <span className="text-[color:var(--color-text-secondary)]">{t('detailFiles', { count: paths.length })}</span>
        {directories.slice(0, DIRECTORIES_SHOWN).map(([directory, count]) => <span key={directory} className="ml-3 font-mono tabular-nums">{directory === '.' ? briefing('rootFiles') : directory} {count}</span>)}
      </p>
      <ul className="space-y-0.5 font-mono text-label text-[color:var(--color-text-tertiary)]">
        {paths.slice(0, PATHS_SHOWN).map(path => <li key={path} className="truncate" title={path}>{path}</li>)}
        {paths.length > PATHS_SHOWN && <li>{t('moreFiles', { count: paths.length - PATHS_SHOWN })}</li>}
      </ul>
    </div>}
    <div className="flex flex-wrap items-center gap-2">
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" aria-label={t('readOriginal', { title })} onClick={() => onOpen(commit)}>{t('openOriginal')}</Button>
      {url && <a href={url} target="_blank" rel="noopener noreferrer" className={controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong', className: 'touch-hit-expand px-2 text-label' })}>{t('onGitHub')}</a>}
    </div>
  </div>;
}
