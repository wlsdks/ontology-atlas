'use client';

import { useRef, useState, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/ui';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { BriefingFileList } from './BriefingFileList';
import { BriefingPatch } from './BriefingPatch';

export function BriefingOriginFiles({ data, root, project, kind, paths, onBack, onRefresh }: {
  data: ChangeBriefing;
  root: string;
  project: string;
  kind: 'prs' | 'commits';
  paths: string[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations('prBriefing');
  const git = useTranslations('gitBriefing');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(40);
  const [showList, setShowList] = useState(false);
  const scrollPositions = useRef(new Map<string, number>());
  const listRef = useRef<HTMLDivElement>(null);
  const patchRef = useRef<HTMLDivElement>(null);
  const matching = paths.filter(path => !query.trim() || path.toLowerCase().includes(query.trim().toLowerCase()));
  function choose(path: string) {
    const index = matching.indexOf(path);
    if (index >= limit) setLimit(Math.ceil((index + 1) / 40) * 40);
    setSelected(path);
    setShowList(false);
    requestAnimationFrame(() => patchRef.current?.focus({ preventScroll: true }));
  }
  function changeQuery(value: string) {
    const needle = value.trim().toLowerCase();
    const matches = paths.filter(path => !needle || path.toLowerCase().includes(needle));
    const index = matches.indexOf(selected ?? '');
    setQuery(value);
    setLimit(Math.max(40, Math.ceil((index + 1) / 40) * 40));
  }
  function more(event: MouseEvent<HTMLButtonElement>) {
    const container = event.currentTarget.closest('[data-testid="briefing-file-list"]');
    const previous = limit;
    setLimit(value => value + 40);
    requestAnimationFrame(() => container?.querySelectorAll<HTMLElement>('[data-control="row"]')[previous]?.focus({ preventScroll: true }));
  }
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 tabIndex={-1} data-origin-files-heading className="text-title font-[var(--font-weight-strong)]">{git('readPeriodCode')}</h2>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={onBack}>{t(kind === 'prs' ? 'backToPr' : 'backToCommit')}</Button>
    </div>
    {kind === 'prs' && <p className="text-body text-[color:var(--color-text-secondary)]">{t('filesFromPrNote')}</p>}
    {!paths.length ? <p role="status">{t('filesEmpty')}</p> : <div className="@container/briefing-files min-w-0">
      <div className="grid min-w-0 gap-5 @[56rem]/briefing-files:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <div ref={listRef} className={selected && !showList ? 'hidden min-w-0 @[56rem]/briefing-files:block' : 'min-w-0'}>
          <BriefingFileList paths={paths} selected={selected} limit={limit} query={query} onQuery={changeQuery} viewKey="origin" scrollPositions={scrollPositions} onScrollPosition={() => {}} onChoose={choose} onMore={more} />
        </div>
        <div className={!selected || showList ? 'hidden min-w-0 @[56rem]/briefing-files:block' : 'min-w-0'}>
          {selected ? <div ref={patchRef} tabIndex={-1}><BriefingPatch key={`${data.snapshot}:${selected}`} root={root} project={project} data={data} path={selected} paths={matching} query={query} onNavigate={choose} onChooseFile={() => { setShowList(true); requestAnimationFrame(() => (listRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? listRef.current?.querySelector<HTMLElement>('input[type="search"]'))?.focus()); }} onRefresh={onRefresh} /></div> : <p className="rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-body text-[color:var(--color-text-secondary)]">{t('chooseFile')}</p>}
        </div>
      </div>
    </div>}
  </section>;
}
