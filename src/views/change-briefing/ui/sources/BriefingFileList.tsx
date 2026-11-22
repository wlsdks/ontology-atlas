'use client';

import { useLayoutEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import { Button, RowButton } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';

export function BriefingFileList({ paths, selected, limit, query, onQuery, viewKey, scrollPositions, onScrollPosition, onChoose, onMore }: {
  paths: string[];
  selected: string | null;
  limit: number;
  query: string;
  onQuery: (value: string) => void;
  viewKey: string;
  scrollPositions: RefObject<Map<string, number>>;
  onScrollPosition: () => void;
  onChoose: (path: string) => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations('changeBriefing');
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (listRef.current) listRef.current.scrollTop = scrollPositions.current.get(viewKey) ?? 0; }, [scrollPositions, viewKey]);
  const needle = query.trim().toLowerCase();
  const matches = needle ? paths.filter(path => path.toLowerCase().includes(needle)) : paths;
  return <section className="space-y-3">
    <Input type="search" label={t('findFile')} value={query} onChange={event => onQuery(event.target.value)} className="w-full" />
    <p role="status" className="text-label text-[color:var(--color-text-secondary)]">{t('fileMatches', { count: matches.length, total: paths.length })}</p>
    <div ref={listRef} data-testid="briefing-file-list" onScroll={event => { scrollPositions.current.set(viewKey, event.currentTarget.scrollTop); onScrollPosition(); }} className="max-h-80 space-y-1 overflow-y-auto overscroll-contain pb-4 lg:max-h-[min(45vh,38rem)]">
      {matches.slice(0, limit).map(path => <RowButton key={path} active={selected === path} tone={selected === path ? 'strong' : 'secondary'} hoverInk="strong" hoverSurface="lift" aria-pressed={selected === path} aria-label={`${t('patchAction')}: ${path}`} onClick={() => onChoose(path)}>
        <span className="flex w-full min-w-0 items-center gap-2 py-1 text-left">
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block break-all text-body font-[var(--font-weight-strong)]">{path.split('/').at(-1)}</span>
            {path.includes('/') && <span className="block break-all text-label text-[color:var(--color-text-secondary)]">{path.slice(0, path.lastIndexOf('/') + 1)}</span>}
          </span>
          {selected === path && <Check size={16} aria-hidden className="shrink-0" />}
        </span>
      </RowButton>)}
      {!matches.length && <p className="py-4 text-body text-[color:var(--color-text-secondary)]">{t('noMatchingFiles')}</p>}
      {matches.length > limit && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={onMore}>{t('showMoreFiles', { count: Math.min(40, matches.length - limit) })}</Button>}
    </div>
  </section>;
}
