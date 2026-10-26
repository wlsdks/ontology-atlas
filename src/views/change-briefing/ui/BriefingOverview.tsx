'use client';

import { ArrowRight, Circle, FolderCode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import { RowButton } from '@/shared/ui';
import { groupSourceAreas, type CapabilityGroup } from '../model/briefing-model';

type Groups = { groups: CapabilityGroup[]; files: number; mapped: number; unmapped: number };

export function BriefingOverview({ sourceOnly = false, grouped, commits, selected, area, groupRefs, onChoose }: {
  sourceOnly?: boolean;
  grouped: Groups;
  commits: number;
  selected?: string;
  area?: string | null;
  groupRefs: RefObject<Map<string, HTMLButtonElement>>;
  onChoose: (id: string, area?: string) => void;
}) {
  const t = useTranslations('changeBriefing');
  const git = useTranslations('gitBriefing');
  const unmapped = grouped.groups.find(group => group.id === 'unmapped');
  const areas = unmapped ? groupSourceAreas(unmapped) : [];
  const shown = areas.slice(0, 6);
  return <section aria-labelledby="briefing-overview-title" className="space-y-6" data-testid="briefing-overview">
    <div className="flex flex-wrap items-end justify-between gap-5 border-b border-[color:var(--color-border-soft)] pb-6">
      <div className="max-w-xl space-y-2">
        <p className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-indigo-accent)]">{t('overviewStep')}</p>
        <h2 id="briefing-overview-title" className="text-display font-[var(--font-weight-strong)]">{sourceOnly ? git('readSources') : t('overviewTitle')}</h2>
        <p className="text-body text-[color:var(--color-text-secondary)]">{t('overviewHint')}</p>
      </div>
      <dl className="flex gap-8">
        <div className="space-y-1"><dt className="text-label text-[color:var(--color-text-secondary)]">{t('filesLabel')}</dt><dd className="font-mono text-hero font-[var(--font-weight-strong)] tabular-nums">{grouped.files.toLocaleString()}</dd></div>
        <div className="space-y-1"><dt className="text-label text-[color:var(--color-text-secondary)]">{t('commitsLabel')}</dt><dd className="font-mono text-hero font-[var(--font-weight-strong)] tabular-nums text-[color:var(--color-text-secondary)]">{commits.toLocaleString()}</dd></div>
      </dl>
    </div>
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {shown.length > 0 && <section aria-labelledby="briefing-areas-title" className="min-w-0 space-y-3">
        <div className="flex items-center gap-2"><FolderCode size={16} aria-hidden className="text-[color:var(--color-text-secondary)]" /><h3 id="briefing-areas-title" className="text-title font-[var(--font-weight-strong)]">{t(sourceOnly ? 'sourceAreas' : 'sourceAreasHeading')}</h3></div>
        <div className="space-y-1">
          {shown.map((item, index) => <RowButton key={item.id} data-testid={`briefing-area-${item.id}`} ref={button => { const key = `area:${item.id}`; if (button) groupRefs.current.set(key, button); else groupRefs.current.delete(key); }} active={selected === 'unmapped' && area === item.id} aria-pressed={selected === 'unmapped' && area === item.id} aria-label={t('areaAction', { area: item.id === '.' ? t('rootFiles') : item.title })} onClick={() => onChoose('unmapped', item.id)} className="w-full">
            <span className="flex w-full min-w-0 items-center gap-3 py-2">
              <span aria-hidden className="font-mono text-label tabular-nums text-[color:var(--color-text-tertiary)]">{String(index + 1).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1 space-y-2">
                <span className="block break-all text-body-lg font-[var(--font-weight-strong)]">{item.id === '.' ? t('rootFiles') : item.title}</span>
                <span aria-hidden className="block h-1 overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]"><span className={`block h-full ${index === 0 ? 'bg-[color:var(--color-indigo-accent)]' : 'bg-[color:var(--color-text-tertiary)]'}`} style={{ width: `${item.paths.length / shown[0].paths.length * 100}%` }} /></span>
              </span>
              <span className="shrink-0 font-mono text-label tabular-nums">{t('fileCount', { count: item.paths.length })}</span><ArrowRight size={14} aria-hidden className="shrink-0 text-[color:var(--color-text-tertiary)]" />
            </span>
          </RowButton>)}
        </div>
        {!sourceOnly && <p className="text-label text-[color:var(--color-text-secondary)]">{t('sourceAreaNote')}</p>}
        {areas.length > shown.length && <p className="text-label text-[color:var(--color-text-secondary)]">{t('areasShown', { count: shown.length })}</p>}
      </section>}
      <section aria-labelledby="briefing-capabilities-title" className="min-w-0 space-y-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)]">
        <h3 id="briefing-capabilities-title" className="text-title font-[var(--font-weight-strong)]">{sourceOnly ? git('sourceHeading') : t('mappedHeading')}</h3>
        <p className="text-body text-[color:var(--color-text-secondary)]">{sourceOnly ? git('attribution') : t('coverage', { mapped: grouped.mapped, unmapped: grouped.unmapped })}</p>
        <div className="space-y-2">
          {grouped.groups.map(group => <RowButton key={group.id} data-testid={`briefing-group-${group.id}`} ref={button => { if (button) groupRefs.current.set(group.id, button); else groupRefs.current.delete(group.id); }} active={selected === group.id} aria-pressed={selected === group.id} onClick={() => onChoose(group.id)} className="w-full">
            <span className="flex w-full min-w-0 items-center gap-3 py-3">
              {group.id !== 'unmapped' && <Circle size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" />}
              <span className="min-w-0 flex-1 space-y-1"><span className="block whitespace-normal text-body-lg font-[var(--font-weight-strong)]">{group.id === 'unmapped' ? (sourceOnly ? git('readSources') : t('unmapped')) : group.title}</span><span className="block text-label text-[color:var(--color-text-secondary)]">{t('groupCounts', { commits: group.commits.length, files: group.paths.length })}</span></span><ArrowRight size={16} aria-hidden className="shrink-0" />
            </span>
          </RowButton>)}
        </div>
        {!sourceOnly && <p className="text-label text-[color:var(--color-text-secondary)]">{t('groupingNote')}</p>}
      </section>
    </div>
  </section>;
}
