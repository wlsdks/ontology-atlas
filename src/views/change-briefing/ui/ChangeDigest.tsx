'use client';

import { useId, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { Button, RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { changeTitle, type ChangeDigest as Digest, type DigestChange, type DigestGroup, type NotableReason } from '../model/change-digest';
import { DigestSummarySeat } from './DigestSummarySeat';

const PAGE_SIZE = 40;
const CONCEPTS_SHOWN = 3;

interface ChangeDigestProps {
  digest: Digest;
  /** Changes listed per expanded group key; a missing key is a collapsed group. */
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
  const toggle = (key: string) => {
    const next = { ...shown };
    if (next[key]) delete next[key]; else next[key] = PAGE_SIZE;
    onShown(next);
  };
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
          <ChangeRow change={change} lead={reason(why)} leadClassName="basis-full md:basis-auto md:w-48" pullUrl={pullUrl} onOpen={onOpen} emphasis />
        </li>)}
      </ul>
    </section>}
    <DigestSummarySeat />
    <ul className="-mx-3 border-t border-[color:var(--color-border-soft)]" data-testid="change-digest-groups">
      {digest.groups.map(group => <GroupRow key={group.key} group={group} share={group.changes.length / largest} accent={group.key === accent} compare={digest.groups.length > 1}
        shown={shown[group.key] ?? 0} onToggle={() => toggle(group.key)} onMore={() => onShown({ ...shown, [group.key]: (shown[group.key] ?? 0) + PAGE_SIZE })}
        conceptTitle={conceptTitle} formatTime={formatTime} pullUrl={pullUrl} onOpen={onOpen} />)}
    </ul>
  </div>;
}

function GroupRow({ group, share, accent, compare, shown, onToggle, onMore, conceptTitle, formatTime, pullUrl, onOpen }: {
  group: DigestGroup; share: number; accent: boolean; compare: boolean; shown: number;
  onToggle: () => void; onMore: () => void;
} & Pick<ChangeDigestProps, 'conceptTitle' | 'formatTime' | 'pullUrl' | 'onOpen'>) {
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
            <ChangeRow change={change} lead={formatTime(change.commit.committedAt)} leadClassName="w-14 whitespace-nowrap font-mono tabular-nums" pullUrl={pullUrl} onOpen={onOpen} />
          </li>)}
        </ul>
        {remaining > 0 && <Button className="atlas-touch-floor atlas-touch-floor-wide mx-3" variant="ghost" size="sm" onClick={onMore}>{t('more', { count: Math.min(PAGE_SIZE, remaining) })}</Button>}
      </>}
    </div>
  </li>;
}

function ChangeRow({ change, lead, leadClassName, pullUrl, onOpen, emphasis = false }: {
  change: DigestChange; lead: ReactNode; leadClassName: string; emphasis?: boolean;
} & Pick<ChangeDigestProps, 'pullUrl' | 'onOpen'>) {
  const t = useTranslations('changeDigest');
  const title = changeTitle(change.commit.subject, change.commit.message);
  const url = change.number === null ? null : pullUrl(change.number);
  return <div className="group/change flex items-center gap-2">
    <RowButton hoverSurface="lift" hoverInk="strong" aria-label={t('readOriginal', { title })} title={title} data-change-hash={change.commit.hash} onClick={() => onOpen(change.commit)}
      className="min-h-10 min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 px-3 py-2 md:flex-nowrap md:gap-x-4">
      <span className={cn('shrink-0 text-label text-[color:var(--color-text-tertiary)]', leadClassName)}>{lead}</span>
      <span className={cn('min-w-0 flex-1 truncate', emphasis ? 'text-body-lg text-[color:var(--color-text-primary)]' : 'text-body text-[color:var(--color-text-secondary)]')}>{title}</span>
      {change.number !== null && <span className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">#{change.number}</span>}
    </RowButton>
    {url && <a href={url} target="_blank" rel="noopener noreferrer" className={controlClass({ shape: 'link', tone: 'secondary', hoverInk: 'strong', className: 'touch-hit-expand shrink-0 px-2 text-label max-md:hidden focus-visible:opacity-100 group-hover/change:opacity-100 [@media(hover:hover)]:opacity-0' })}>{t('onGitHub')}</a>}
  </div>;
}
