'use client';

import { useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button, RowButton } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';

export function BriefingFileList({ paths, selected, limit, onChoose, onMore }: {
  paths: string[];
  selected: string | null;
  limit: number;
  onChoose: (path: string) => void;
  onMore: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations('changeBriefing');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const matches = needle ? paths.filter(path => path.toLowerCase().includes(needle)) : paths;
  return <section className="space-y-3">
    <Input type="search" label={t('findFile')} value={query} onChange={event => setQuery(event.target.value)} className="w-full" />
    <p role="status" className="text-label text-[color:var(--color-text-secondary)]">{t('fileMatches', { count: matches.length, total: paths.length })}</p>
    <div data-testid="briefing-file-list" className="max-h-80 space-y-1 overflow-y-auto overscroll-contain pb-4">
      {matches.slice(0, limit).map(path => <RowButton key={path} active={selected === path} aria-pressed={selected === path} aria-label={`${t('patchAction')}: ${path}`} onClick={() => onChoose(path)}>
        <span className="min-w-0 space-y-1 py-1 text-left">
          <span className="block break-all text-body font-[var(--font-weight-strong)]">{path.split('/').at(-1)}</span>
          <span className="block break-all text-label text-[color:var(--color-text-secondary)]">{path}</span>
        </span>
      </RowButton>)}
      {!matches.length && <p className="py-4 text-body text-[color:var(--color-text-secondary)]">{t('noMatchingFiles')}</p>}
      {matches.length > limit && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={onMore}>{t('showMoreFiles', { count: Math.min(40, matches.length - limit) })}</Button>}
    </div>
  </section>;
}
