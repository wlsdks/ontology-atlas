'use client';

import { useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowLeft, ChevronRight, GitCommitHorizontal } from 'lucide-react';
import { Button, RowButton } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import type { BriefingCommit, ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';

/** A commit opened from elsewhere: the reader starts on it and its back control returns there. */
export interface OpenedCommit { hash: string; backLabel: string; onBack: () => void }

type CommitInventoryProps = { data: ChangeBriefing; onExplain: () => void; onFiles?: (paths: string[]) => void; opened?: OpenedCommit | null };

export function CommitInventory({ data, opened, ...props }: CommitInventoryProps) {
  return <CommitInventoryScope key={JSON.stringify([data.sourceRoot, data.head, data.snapshot, opened?.hash])} data={data} opened={opened} {...props} />;
}

function CommitInventoryScope({ data, onExplain, onFiles, opened }: CommitInventoryProps) {
  const t = useTranslations('prBriefing');
  const git = useTranslations('gitBriefing');
  const locale = useLocale();
  const [selected, setSelected] = useState<BriefingCommit | null>(() => data.commits.find(commit => commit.hash === opened?.hash) ?? null);
  const fromElsewhere = Boolean(opened && selected?.hash === opened.hash);
  const [visible, setVisible] = useState(40);
  const list = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const open = (commit: BriefingCommit) => { setSelected(commit); requestAnimationFrame(() => reader.current?.focus()); };
  const back = () => {
    const hash = selected?.hash;
    setSelected(null);
    requestAnimationFrame(() => hash && list.current?.querySelector<HTMLElement>(`[data-commit-hash="${CSS.escape(hash)}"]`)?.focus());
  };
  const clock = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  };
  return <section className="space-y-5" aria-label={t('commitsTab')}>
    {selected ? <section ref={reader} tabIndex={-1} data-commit-reader className="max-w-4xl space-y-4 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
      <button type="button" className={controlClass({ shape: 'link', size: 'lg', tone: 'secondary', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide gap-2' })} onClick={fromElsewhere ? opened!.onBack : back}><ArrowLeft size={ICON_SIZE.lg} aria-hidden />{fromElsewhere ? opened!.backLabel : t('backToCommits')}</button>
      <h2 className="min-w-0 break-words text-title font-[var(--font-weight-strong)]">{selected.subject}</h2>
      <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{selected.hash} · {clock(selected.committedAt)}</p>
      {selected.messageComplete === false ? <p role="status">{git('sourceUnavailableInline')}</p> : <pre className="whitespace-pre-wrap break-words font-mono text-body">{selected.message ?? selected.subject}</pre>}
      {onFiles && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={() => onFiles(selected.paths)}>{t('filesFromCommit')}</Button>}
    </section> : <>
      <div className="flex flex-wrap items-start justify-between gap-3"><p className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{t('commitScope')}</p>{data.commits.length > 0 && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" onClick={onExplain}>{t('commitPrepare')}</Button>}</div>
      {data.commits.length > 0 && <div ref={list} className="max-w-4xl divide-y divide-[color:var(--color-border-soft)] overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">{data.commits.slice(0, visible).map((commit) => <RowButton key={commit.hash} tone="strong" hoverSurface="lift" hoverInk="strong" className="rounded-none px-4 py-3" data-commit-hash={commit.hash} onClick={() => open(commit)}><GitCommitHorizontal size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" /><span className="min-w-0 flex-1 text-left"><span className="block break-words text-body-lg font-[var(--font-weight-strong)]">{commit.subject}</span><span className="block text-label text-[color:var(--color-text-secondary)]">{commit.hash.slice(0, 8)} · {clock(commit.committedAt)}</span></span><ChevronRight size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" /></RowButton>)}</div>}
      {data.commits.length > visible && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => {
        const previous = visible;
        setVisible(visible + 40);
        requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>('[data-commit-hash]')[previous]?.focus());
      }}>{t('moreCommits', { count: Math.min(40, data.commits.length - visible) })}</Button>}
    </>}
  </section>;
}
