'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button, Dialog, DialogBody, DialogFooter, Disclosure, Select } from '@/shared/ui';
import { prCopyDetails } from '../model/pr-copy';
import type { usePeriodNarrative } from '../model/use-period-narrative';

type PeriodApi = ReturnType<typeof usePeriodNarrative>;
export function PeriodPlanDialog({ preview, connection, close, start, clearedAt }: { clearedAt: number; preview: PeriodApi['preview']; connection: { baseUrl: string; model: string }; close: () => void; start: () => void }) {
  const t = useTranslations('gitBriefing');
  const locale = useLocale();
  const [part, setPart] = useState(0);
  const [visibleGaps, setVisibleGaps] = useState(40);
  const [shown, setShown] = useState(preview);
  if (preview && shown !== preview) { setShown(preview); setPart(0); setVisibleGaps(40); }
  const plan = shown?.plan;
  const index = Math.min(part, (plan?.parts.length ?? 0) - 1);
  const selected = plan?.parts[index];
  const commits = plan?.parts.reduce((count, part) => count + part.commits, 0) ?? 0;
  const prs = plan?.parts.reduce((count, part) => count + part.prs, 0) ?? 0;
  return <Dialog open={Boolean(preview)} onClose={close} labelledBy="briefing-preview-title" size="md" className="flex max-h-[calc(100dvh-var(--chrome-inset)*2)] flex-col">
    <h2 id="briefing-preview-title" className="text-title font-[var(--font-weight-strong)]">{t('periodPlanTitle')}</h2>
    {plan && <><DialogBody className="mt-4 space-y-4 overscroll-contain pb-4">
      <p className="break-words text-body">{t('transfer', { destination: (shown?.connection ?? connection).baseUrl, model: (shown?.connection ?? connection).model })}</p>
      <p className="text-body">{t('periodPlan', { commits, prs, parts: plan.parts.length })}</p>
      <p className="text-body">{t('periodReadingBytes', { bytes: plan.parts.reduce((count, part) => count + part.bytes, 0) })}</p>
      {plan.parts.length > 0 && <p className="text-body">{t(plan.parts.length > 1 ? 'periodOverviewPlan' : 'periodSinglePart', { bytes: plan.limit })}</p>}
      <p className="text-label text-[color:var(--color-text-secondary)]">{t('periodSessionOnly')}</p>
      {plan.unsent.length > 0 && <Disclosure animated summary={t('periodUnsendable', { count: plan.unsent.length })}><div className="space-y-3">{plan.unsent.slice(0, visibleGaps).map(({ source, reason }) => <Disclosure animated key={source.id} summary={source.title}><p>{t(reason === 'overlarge' ? 'periodOverlarge' : 'periodIncomplete')}</p>{source.kind === 'pr' && <p className="text-label text-[color:var(--color-text-secondary)]">{t(prCopyDetails(source, clearedAt, locale).key, { fetchedAt: prCopyDetails(source, clearedAt, locale).fetchedAt })}</p>}<pre className="whitespace-pre-wrap break-words font-mono text-body">{source.text}</pre></Disclosure>)}{plan.unsent.length > visibleGaps && <Button variant="outline" onClick={() => setVisibleGaps(visibleGaps + 40)}>{t('moreSources', { count: Math.min(40, plan.unsent.length - visibleGaps) })}</Button>}</div></Disclosure>}
      {selected && <Disclosure animated summary={t('previewPacket')}>
        <div className="space-y-4">
          {plan.parts.length > 1 && <Select ariaLabel={t('periodPreviewPart')} value={String(index)} onChange={value => setPart(Number(value))} options={plan.parts.map((part, number) => ({ value: String(number), label: `${t('periodPart', { number: number + 1, parts: plan.parts.length })} · ${t('periodPartSummary', { commits: part.commits, prs: part.prs, bytes: part.bytes })}` }))} />}
          <p className="text-label">{t('periodPartSummary', { commits: selected.commits, prs: selected.prs, bytes: selected.bytes })}</p>
          {selected.sources.map(source => <Disclosure animated key={source.id} className="max-w-full" summary={<span className="min-w-0 whitespace-normal break-words text-left">{source.title}</span>}>{source.kind === 'pr' && <p className="text-label text-[color:var(--color-text-secondary)]">{t(prCopyDetails(source, clearedAt, locale).key, { fetchedAt: prCopyDetails(source, clearedAt, locale).fetchedAt })}</p>}<pre className="whitespace-pre-wrap break-words font-mono text-body">{source.text}</pre></Disclosure>)}
        </div>
      </Disclosure>}
      </DialogBody><DialogFooter><div className="flex min-w-0 flex-wrap justify-end gap-3"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={close}>{t('back')}</Button><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" disabled={!plan.parts.length} onClick={start}>{t('periodStart')}</Button></div>
    </DialogFooter></>}
  </Dialog>;
}
