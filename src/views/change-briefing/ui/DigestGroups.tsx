'use client';

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import type { BriefingCommit } from '@/shared/lib/git/tauri-change-briefing';
import { Button, RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { changeBody, changeTitle, directoryCounts, kindCounts, titleWithoutHead, type ChangeDigest, type DigestChange, type DigestGroup, type WorkKinds } from '../model/change-digest';

export const PAGE_SIZE = 40;
const CONCEPTS_SHOWN = 3;
const DIRECTORIES_SHOWN = 4;
const PATHS_SHOWN = 6;

/** The neutral ladder for the period's kinds, loudest first; the remainder is the quietest step. */
const KIND_INKS = [
  'bg-[color:var(--color-text-primary)]',
  'bg-[color:var(--color-text-secondary)]',
  'bg-[color:var(--color-text-tertiary)]',
  'bg-[color:var(--color-text-quaternary)]',
  'bg-[color:var(--color-indigo-a46)]',
] as const;
const OTHER_KIND_INK = 'bg-[color:var(--color-indigo-a28)]';
const ACCENT_INK = 'bg-[color:var(--color-indigo-accent)]';
/**
 * From 820px of pane (51.25rem) an opened change sits beside the full list, split by a hairline;
 * below it the list shortens and the change stacks under it.
 */
const SPLIT_WIDE = '@[51.25rem]/scope:grid @[51.25rem]/scope:grid-cols-2 @[51.25rem]/scope:items-start';
const DETAIL_FRAME = 'mt-4 space-y-4 border-t border-[color:var(--color-border-soft)] pt-4 @[51.25rem]/scope:sticky @[51.25rem]/scope:top-6 @[51.25rem]/scope:mt-0 @[51.25rem]/scope:ml-3 @[51.25rem]/scope:border-t-0 @[51.25rem]/scope:border-l @[51.25rem]/scope:pl-6 @[51.25rem]/scope:pt-3';
const FOCUS_RING = 'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

export interface DigestSelection {
  /** The selected group's key; null takes the first group. */
  group: string | null;
  /** The hash of the change whose detail is shown, inside the selected group. */
  change: string | null;
  /** Changes listed per group key; a missing key lists the first page. */
  shown: Record<string, number>;
}

interface DigestGroupsProps {
  digest: ChangeDigest;
  selection: DigestSelection;
  onSelection: (next: DigestSelection) => void;
  conceptTitle: (id: string) => string;
  formatTime: (committedAt: string) => string;
  pullUrl: (number: number) => string | null;
  onOpen: (commit: BriefingCommit) => void;
}

function selectedGroup(digest: ChangeDigest, selection: DigestSelection) {
  return digest.groups.find(group => group.key === selection.group) ?? digest.groups[0];
}

/** The groups as master and detail: one group is always selected and its changes stand beside the list. */
export function DigestGroups({ digest, selection, onSelection, conceptTitle, formatTime, pullUrl, onOpen }: DigestGroupsProps) {
  const t = useTranslations('changeDigest');
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const options = useRef(new Map<string, HTMLDivElement>());
  const group = selectedGroup(digest, selection);
  const largest = Math.max(...digest.groups.map(entry => entry.changes.length));
  const accent = digest.groups.find(entry => entry.kind !== 'other')?.key;
  const choose = (key: string) => onSelection({ ...selection, group: key, change: null });
  function move(event: KeyboardEvent<HTMLDivElement>) {
    const index = digest.groups.indexOf(group);
    const last = digest.groups.length - 1;
    const next = event.key === 'ArrowDown' ? Math.min(last, index + 1) : event.key === 'ArrowUp' ? Math.max(0, index - 1) : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    const key = digest.groups[next].key;
    choose(key);
    options.current.get(key)?.focus();
  }
  function press(key: string) {
    choose(key);
    const panel = panelRef.current;
    const list = options.current.get(key)?.parentElement;
    if (panel && list && panel.getBoundingClientRect().top >= list.getBoundingClientRect().bottom) requestAnimationFrame(() => panel.scrollIntoView({ block: 'start' }));
  }
  return <section aria-labelledby={headingId} data-testid="change-digest-groups" className="grid gap-x-6 gap-y-4 lg:grid-cols-3">
    <h3 id={headingId} className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)] lg:col-span-3">{digest.grouping === 'label' ? t('groupsByScope') : t('groupsByDirectory')}</h3>
    <div role="listbox" aria-labelledby={headingId} onKeyDown={move} className="min-w-0 space-y-1 self-start">
      {digest.groups.map(entry => <GroupOption key={entry.key} group={entry} kinds={digest.kinds} selected={entry === group} accent={entry.key === accent} share={entry.changes.length / largest}
        optionRef={element => { if (element) options.current.set(entry.key, element); else options.current.delete(entry.key); }} onPress={() => press(entry.key)} />)}
    </div>
    <div ref={panelRef} className="min-w-0 lg:col-span-2">
      <GroupPanel key={group.key} group={group} kinds={digest.kinds} selection={selection} onSelection={onSelection}
        conceptTitle={conceptTitle} formatTime={formatTime} pullUrl={pullUrl} onOpen={onOpen} />
    </div>
  </section>;
}

function useGroupName(group: DigestGroup) {
  const t = useTranslations('changeDigest');
  const briefing = useTranslations('changeBriefing');
  return group.kind === 'other' ? t('other') : group.name === '.' ? briefing('rootFiles') : group.name;
}

function GroupOption({ group, kinds, selected, accent, share, optionRef, onPress }: {
  group: DigestGroup; kinds: WorkKinds | null; selected: boolean; accent: boolean; share: number;
  optionRef: (element: HTMLDivElement | null) => void; onPress: () => void;
}) {
  const t = useTranslations('changeDigest');
  const name = useGroupName(group);
  const count = group.changes.length;
  const newest = group.changes[0];
  const segments = kinds ? kindCounts(group.changes, kinds) : [count];
  return <div ref={optionRef} role="option" aria-selected={selected} tabIndex={selected ? 0 : -1} aria-label={t('groupName', { group: name, count })} data-digest-group={group.key}
    onClick={onPress}
    className={cn('block cursor-pointer rounded-card border px-3 py-2.5 transition-colors', FOCUS_RING,
      selected ? 'border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-2)]' : 'border-transparent hover:bg-[color:var(--color-overlay-1)]')}>
    <span className="flex items-baseline justify-between gap-3">
      <span className={cn('truncate text-body-lg font-[var(--font-weight-strong)]', group.kind === 'other' ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-primary)]')}>{name}</span>
      <span className="shrink-0 font-mono text-body-lg tabular-nums text-[color:var(--color-text-primary)]">{count.toLocaleString()}</span>
    </span>
    {newest && <span className="mt-0.5 block truncate text-body text-[color:var(--color-text-tertiary)]">{changeTitle(newest.commit.subject, newest.commit.message)}</span>}
    <span aria-hidden className="mt-2 flex h-1.5 gap-px" style={{ width: `${share * 100}%` }}>
      {segments.map((value, index) => value > 0 && <span key={index} className={cn('h-full min-w-px first:rounded-l-micro last:rounded-r-micro', accent ? ACCENT_INK : !kinds ? KIND_INKS[2] : index < kinds.kinds.length ? KIND_INKS[index] : OTHER_KIND_INK)} style={{ flexGrow: value }} />)}
    </span>
  </div>;
}

/** The period's kinds as one segmented bar, in the legend's order and inks. */
export function KindsBar({ kinds }: { kinds: WorkKinds }) {
  const counts = [...kinds.kinds.map(kind => kind.count), kinds.other];
  return <span aria-hidden data-testid="change-digest-kinds-bar" className="flex h-2 w-full gap-px">
    {counts.map((count, index) => count > 0 && <span key={index} className={cn('h-full min-w-px first:rounded-l-micro last:rounded-r-micro', index < kinds.kinds.length ? KIND_INKS[index] : OTHER_KIND_INK)} style={{ flexGrow: count }} />)}
  </span>;
}

/** A kinds line in the period's ink order, for a whole period or one group. */
export function KindsLine({ kinds, counts, className, label }: { kinds: WorkKinds; counts: number[]; className?: string; label: string }) {
  const t = useTranslations('changeDigest');
  const entries = [...kinds.kinds.map((kind, index) => ({ type: kind.type, ink: KIND_INKS[index], count: counts[index] })), { type: t('other'), ink: OTHER_KIND_INK, count: counts[kinds.kinds.length] }];
  return <ul aria-label={label} data-testid="change-digest-kinds" className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
    {entries.filter(entry => entry.count > 0).map(entry => <li key={entry.type} data-digest-kind={entry.type} className="flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden className={cn('size-2 rounded-micro', entry.ink)} />
      <span className="font-mono text-[color:var(--color-text-secondary)]">{entry.type}</span>
      <span data-kind-count className="font-mono tabular-nums text-[color:var(--color-text-primary)]">{entry.count.toLocaleString()}</span>
    </li>)}
  </ul>;
}

function GroupPanel({ group, kinds, selection, onSelection, conceptTitle, formatTime, pullUrl, onOpen }: { group: DigestGroup; kinds: WorkKinds | null } & Omit<DigestGroupsProps, 'digest'>) {
  const t = useTranslations('changeDigest');
  const name = useGroupName(group);
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [listOverflows, setListOverflows] = useState(false);
  const count = group.changes.length;
  const shown = selection.shown[group.key] ?? PAGE_SIZE;
  const opened = group.changes.find(change => change.commit.hash === selection.change) ?? null;
  const remaining = count - shown;
  const select = (hash: string | null) => onSelection({ ...selection, group: group.key, change: hash });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !opened) { setListOverflows(false); return; }
    setListOverflows(list.scrollHeight > list.clientHeight);
    const row = list.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (row && (row.offsetTop < list.scrollTop || row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.offsetHeight / 2;
  }, [opened]);
  function back() {
    const hash = opened?.commit.hash;
    select(null);
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-change-hash="${CSS.escape(hash ?? '')}"]`)?.focus());
  }
  return <section aria-labelledby={headingId} data-digest-list={group.key} data-testid="change-digest-group" className="@container/scope rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]"
    onKeyDown={event => { if (event.key === 'Escape' && opened) { event.preventDefault(); back(); } }}>
    <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <h3 id={headingId} className="flex min-w-0 items-baseline gap-3 text-title font-[var(--font-weight-strong)]">
        <span className={cn('truncate', group.kind === 'other' ? 'text-[color:var(--color-text-secondary)]' : 'text-[color:var(--color-text-primary)]')}>{name}</span>
        <span className="font-mono tabular-nums text-[color:var(--color-text-tertiary)]">{count.toLocaleString()}</span>
      </h3>
      {kinds && <KindsLine kinds={kinds} counts={kindCounts(group.changes, kinds)} label={t('kinds')} className="text-label" />}
    </header>
    {group.concepts.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-label text-[color:var(--color-text-tertiary)]">{t('concepts')}</span>
      <ConceptLinks ids={group.concepts} conceptTitle={conceptTitle} />
    </div>}
    <div data-change-split={opened ? 'open' : 'closed'} className={cn('mt-4 border-t border-[color:var(--color-border-soft)]', opened && SPLIT_WIDE)}>
      <div className="min-w-0">
        <ul ref={listRef} data-change-list className={cn('relative -mx-3 pt-1', opened && 'atlas-scroll-quiet max-h-50 overflow-y-auto @[51.25rem]/scope:max-h-none @[51.25rem]/scope:overflow-visible', listOverflows && '[mask-image:linear-gradient(to_bottom,black_calc(100%_-_var(--tabbar-edge-fade)),transparent)] @[51.25rem]/scope:[mask-image:none]')}>
          {group.changes.slice(0, shown).map(change => <li key={change.commit.hash}>
            <ChangeRow change={change} time={formatTime(change.commit.committedAt)} headless={group.kind === 'label'} selected={change === opened} onPress={() => select(change === opened ? null : change.commit.hash)} />
          </li>)}
        </ul>
        {remaining > 0 && <Button className={cn('atlas-touch-floor atlas-touch-floor-wide mt-2', opened && 'hidden @[51.25rem]/scope:inline-flex')} variant="ghost" size="sm" onClick={() => onSelection({ ...selection, shown: { ...selection.shown, [group.key]: shown + PAGE_SIZE } })}>{t('more', { count: Math.min(PAGE_SIZE, remaining) })}</Button>}
      </div>
      {opened && <ChangeDetail change={opened} time={formatTime(opened.commit.committedAt)} conceptTitle={conceptTitle} url={opened.number === null ? null : pullUrl(opened.number)} onOpen={onOpen} onClose={back} />}
    </div>
  </section>;
}

export function ConceptLinks({ ids, conceptTitle }: { ids: readonly string[]; conceptTitle: (id: string) => string }) {
  return <>{ids.slice(0, CONCEPTS_SHOWN).map(id => <Link key={id} href={'/topology/?p=' + encodeURIComponent(translateOntologyDeeplinkToTopologyParam(id))} className={controlClass({ shape: 'chip', size: 'xs', hoverSurface: 'lift', hoverInk: 'strong', className: 'border-[color:var(--color-border-soft)] text-label' })}>{conceptTitle(id)}</Link>)}</>;
}

function ChangeRow({ change, time, headless, selected, onPress }: { change: DigestChange; time: string; headless: boolean; selected: boolean; onPress: () => void }) {
  const { commit } = change;
  const title = changeTitle(commit.subject, commit.message);
  return <RowButton hoverSurface="lift" hoverInk="strong" aria-pressed={selected} title={title} data-change-hash={commit.hash} onClick={onPress}
    className={cn('min-h-10 min-w-0 gap-4 rounded-card px-3 py-2', selected && 'bg-[color:var(--color-overlay-2)]')}>
    <span className="w-14 shrink-0 whitespace-nowrap font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">{time}</span>
    <span className={cn('min-w-0 flex-1 truncate text-body', selected ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]')}>{headless ? titleWithoutHead(commit.subject, commit.message) : title}</span>
    {change.number !== null && <span className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">#{change.number}</span>}
  </RowButton>;
}

function ChangeDetail({ change, time, conceptTitle, url, onOpen, onClose }: { change: DigestChange; time: string; url: string | null; onClose: () => void } & Pick<DigestGroupsProps, 'conceptTitle' | 'onOpen'>) {
  const t = useTranslations('changeDigest');
  const briefing = useTranslations('changeBriefing');
  const { commit } = change;
  const title = changeTitle(commit.subject, commit.message);
  const paths = [...new Set(commit.paths)];
  const directories = directoryCounts(paths);
  const body = changeBody(commit.subject, commit.message);
  return <div data-testid="change-detail" className={DETAIL_FRAME}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <p className="break-words text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{title}</p>
        <p className="font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">{[change.number !== null ? `#${change.number}` : null, time, commit.hash.slice(0, 8)].filter(Boolean).join(' · ')}</p>
      </div>
      <Button className="atlas-touch-floor atlas-touch-floor-wide -mr-2 -mt-1 shrink-0 gap-1.5" variant="ghost" size="sm" onClick={onClose}><X size={ICON_SIZE.sm} aria-hidden />{t('close')}</Button>
    </div>
    {body.length > 0 && <p className="whitespace-pre-line text-body text-[color:var(--color-text-secondary)]">{body.join('\n')}</p>}
    {change.concepts.length > 0 && <div className="flex flex-wrap items-center gap-2">
      <span className="text-label text-[color:var(--color-text-tertiary)]">{t('concepts')}</span>
      <ConceptLinks ids={change.concepts} conceptTitle={conceptTitle} />
    </div>}
    {paths.length > 0 && <div className="space-y-1.5">
      <p className="text-label text-[color:var(--color-text-tertiary)]">
        <span className="text-[color:var(--color-text-secondary)]">{t('detailFiles', { count: paths.length })}</span>
        {directories.slice(0, DIRECTORIES_SHOWN).map(([directory, files]) => <span key={directory} className="ml-3 font-mono tabular-nums">{directory === '.' ? briefing('rootFiles') : directory} {files}</span>)}
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
