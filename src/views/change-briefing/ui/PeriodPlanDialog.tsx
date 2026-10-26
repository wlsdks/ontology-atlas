'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Dialog, DialogBody, DialogFooter, Disclosure, RowDisclosure, Select } from '@/shared/ui';
import { prCopyDetails } from '../model/pr-copy';
import type { usePeriodNarrative } from '../model/use-period-narrative';

type PeriodApi = ReturnType<typeof usePeriodNarrative>;
export function PeriodPlanDialog({ preview, connection, close, start, clearedAt }: { clearedAt: number; preview: PeriodApi['preview']; connection: { baseUrl: string; model: string }; close: () => void; start: () => void }) {
  const t = useTranslations('gitBriefing');
  const locale = useLocale();
  const [part, setPart] = useState(0);
  const [visibleGaps, setVisibleGaps] = useState(40);
  const [section, setSection] = useState<'sources' | 'details' | null>(null);
  const [shown, setShown] = useState(preview);
  if (preview && shown !== preview) { setShown(preview); setPart(0); setVisibleGaps(40); setSection(null); }
  const plan = shown?.plan;
  const index = Math.min(part, (plan?.parts.length ?? 0) - 1);
  const commits = plan?.parts.reduce((count, part) => count + part.commits, 0) ?? 0;
  const prs = plan?.parts.reduce((count, part) => count + part.prs, 0) ?? 0;
  const destination = shown?.connection ?? connection;
  return <Dialog open={Boolean(preview)} onClose={close} labelledBy="briefing-preview-title" size="md" className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col">
    <h2 id="briefing-preview-title" className="text-title font-[var(--font-weight-strong)]">{t('periodPlanTitle')}</h2>
    {plan && <><DialogBody className="mt-4 space-y-4 overscroll-contain pb-4">
      <p className="text-title font-[var(--font-weight-strong)]">{t('previewSourceCount', { commits, prs })}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
        <dt className="text-[color:var(--color-text-secondary)]">{t('previewModel')}</dt><dd className="min-w-0 break-words">{destination.model}</dd>
        <dt className="text-[color:var(--color-text-secondary)]">{t('previewDestination')}</dt><dd className="min-w-0 break-all">{destination.baseUrl}</dd>
      </dl>
      <p className="text-body text-[color:var(--color-text-secondary)]">{t('previewSourceScope')}</p>
      <div className="space-y-2 border-y border-[color:var(--color-border-soft)] py-4" data-testid="briefing-plan-requests" data-reading-parts={plan.parts.length}>
        <p className="text-body font-[var(--font-weight-strong)]">{t(plan.parts.length > 1 ? 'previewMultipleRequests' : 'previewSingleRequest', { count: plan.parts.length + (plan.parts.length > 1 ? 1 : 0) })}</p>
        {plan.parts.length > 1 && <p className="text-body text-[color:var(--color-text-secondary)]">{t('previewOverview', { bytes: plan.limit })}</p>}
      </div>
      {plan.unsent.length > 0 && <Disclosure animated summary={t('periodUnsendable', { count: plan.unsent.length })}><div className="space-y-3">{plan.unsent.slice(0, visibleGaps).map(({ source, reason }) => <Disclosure animated key={source.id} summary={source.title}><p>{t(reason === 'overlarge' ? 'periodOverlarge' : 'periodIncomplete')}</p>{source.kind === 'pr' && <p className="text-label text-[color:var(--color-text-secondary)]">{t(prCopyDetails(source, clearedAt, locale).key, { fetchedAt: prCopyDetails(source, clearedAt, locale).fetchedAt })}</p>}<pre className="whitespace-pre-wrap break-words font-mono text-body">{source.text}</pre></Disclosure>)}{plan.unsent.length > visibleGaps && <Button variant="outline" onClick={() => setVisibleGaps(visibleGaps + 40)}>{t('moreSources', { count: Math.min(40, plan.unsent.length - visibleGaps) })}</Button>}</div></Disclosure>}
      <div className="flex flex-wrap gap-2">
        {plan.parts.length > 0 && <Button variant="outline" size="sm" className="atlas-touch-floor atlas-touch-floor-wide" aria-expanded={section === 'sources'} aria-controls="briefing-preview-sources" onClick={() => setSection(section === 'sources' ? null : 'sources')}>{t('previewPacket')}</Button>}
        <Button variant="ghost" size="sm" className="atlas-touch-floor atlas-touch-floor-wide" aria-expanded={section === 'details'} aria-controls="briefing-preview-details" onClick={() => setSection(section === 'details' ? null : 'details')}>{t('previewDetails')}</Button>
      </div>
      <RowDisclosure open={section === 'sources'} id="briefing-preview-sources"><PreviewSources plan={plan} index={index} onPart={setPart} clearedAt={clearedAt} /></RowDisclosure>
      <RowDisclosure open={section === 'details'} id="briefing-preview-details" className="space-y-3 text-body">
        <p>{t('periodPlan', { commits, prs, parts: plan.parts.length })}</p>
        <p>{t('periodReadingBytes', { bytes: plan.parts.reduce((count, part) => count + part.bytes, 0) })}</p>
        {plan.parts.length > 0 && <p>{t(plan.parts.length > 1 ? 'periodOverviewPlan' : 'periodSinglePart', { bytes: plan.limit })}</p>}
      </RowDisclosure>
      <p className="text-label text-[color:var(--color-text-secondary)]">{t('periodSessionOnly')}</p>
      </DialogBody><DialogFooter><div className="flex min-w-0 flex-wrap justify-end gap-3"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={close}>{t('back')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!plan.parts.length} onClick={start}>{t('periodStart')}</Button></div>
    </DialogFooter></>}
  </Dialog>;
}

function PreviewSources({ plan, index, onPart, clearedAt }: { plan: NonNullable<PeriodApi['preview']>['plan']; index: number; onPart: (index: number) => void; clearedAt: number }) {
  const t = useTranslations('gitBriefing');
  const locale = useLocale();
  const selected = plan.parts[index];
  if (!selected) return null;
  return <div className="space-y-4">
    {plan.parts.length > 1 && <Select ariaLabel={t('periodPreviewPart')} value={String(index)} onChange={value => onPart(Number(value))} options={plan.parts.map((part, number) => ({ value: String(number), label: `${t('periodPart', { number: number + 1, parts: plan.parts.length })} · ${t('periodPartSummary', { commits: part.commits, prs: part.prs, bytes: part.bytes })}` }))} />}
    <p className="text-label">{t('periodPartSummary', { commits: selected.commits, prs: selected.prs, bytes: selected.bytes })}</p>
    {selected.sources.map(source => <Disclosure animated key={source.id} className="max-w-full" summary={<span className="min-w-0 whitespace-normal break-words text-left">{source.title}</span>}>{source.kind === 'pr' && <p className="text-label text-[color:var(--color-text-secondary)]">{t(prCopyDetails(source, clearedAt, locale).key, { fetchedAt: prCopyDetails(source, clearedAt, locale).fetchedAt })}</p>}<pre className="whitespace-pre-wrap break-words font-mono text-body">{source.text}</pre></Disclosure>)}
  </div>;
}
