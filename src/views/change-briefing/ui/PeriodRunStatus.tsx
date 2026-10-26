'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, RowButton, Select } from '@/shared/ui';
import type { usePeriodNarrative } from '../model/use-period-narrative';
import type { NarrativeSource } from '../model/narrative';

interface DetailsProps { api: ReturnType<typeof usePeriodNarrative>; readSource: (source: NarrativeSource, id: string, button: HTMLButtonElement) => void; select: (value: 'overview' | number) => void }

export function PeriodRunStatus({ api, detail = false }: Pick<DetailsProps, 'api'> & { detail?: boolean }) {
  const t = useTranslations('gitBriefing');
  const { run, coverage, busy, stale } = api;
  if (!run || !coverage) return null;
  const { execution, plan } = run;
  const selection = execution.overviewSelection;
  const partial = plan.unsent.length > 0 || coverage.uncertain.size > 0 || coverage.unexplained > 0 || execution.accepted.length < plan.parts.length || plan.lookup.status !== 'measured' || plan.lookup.unchecked > 0 || plan.lookup.unlinked > 0 || run.collectionPartial || execution.accepted.some(value => value.unsupported > 0) || Boolean(selection && (selection.selected.length < selection.candidates.length || selection.represented < plan.parts.length)) || Boolean(execution.overview?.unexplained.length || execution.overview?.unsupported);
  const canContinue = !busy && !stale && execution.status !== 'finished';
  const failure = execution.failure;
  if (!detail) return <div className="flex flex-wrap items-center gap-3" data-testid={detail ? "briefing-period-coverage" : "briefing-period-run"}>
    {stale ? <><p className="text-body text-[color:var(--color-status-warning)]">{t('summaryStale')}</p><Button disabled={Boolean(busy)} variant="outline" size="sm" onClick={event => { void api.prepare(event.currentTarget); }}>{t('periodNewPlan')}</Button></>
      : busy ? null : <>
        {execution.status === 'failed' ? <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('summaryFailed')}</p>
          : canContinue ? <p role="status" className="text-body">{t('summaryStopped')}</p>
          : execution.accepted.length > 0 && partial ? <p className="text-body text-[color:var(--color-status-warning)]">{t('summaryPartial')}</p> : null}
        {canContinue && <Button variant="primary" size="sm" onClick={api.resume}>{t(failure ? failure.stage === 'overview' ? 'periodRetryOverview' : 'periodRetryPart' : execution.accepted.length === plan.parts.length ? 'periodRetryOverview' : 'periodContinue', { number: (failure?.index ?? execution.accepted.length) + 1 })}</Button>}
      </>}
  </div>;
  return <div className="space-y-3" data-testid={detail ? "briefing-period-coverage" : "briefing-period-run"}>
    {stale && <div role="status" className="space-y-2 text-body text-[color:var(--color-status-warning)]"><p>{t('periodStale')}</p><p>{run.period} · {run.connection.model}</p><Button disabled={Boolean(busy)} variant="outline" onClick={event => { void api.prepare(event.currentTarget); }}>{t('periodNewPlan')}</Button></div>}
    {!busy && <p className="text-label">{t('periodCoverage', { completed: execution.accepted.length, parts: plan.parts.length, sent: coverage.sent.size, collected: plan.sources.length, linked: coverage.linked.size })}</p>}
    {partial && execution.accepted.length > 0 && !busy && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('periodPartial')}</p>}
    {canContinue && <div className="flex flex-wrap items-center gap-3"><p className="max-w-prose text-body">{failure ? t(failure.stage === 'part' ? 'periodPartFailed' : 'periodOverviewFailed', { number: failure.index + 1 }) : t('periodStopped', { completed: execution.accepted.length, parts: plan.parts.length })}</p><Button variant="primary" onClick={api.resume}>{t(failure ? failure.stage === 'overview' ? 'periodRetryOverview' : 'periodRetryPart' : execution.accepted.length === plan.parts.length ? 'periodRetryOverview' : 'periodContinue', { number: (failure?.index ?? execution.accepted.length) + 1 })}</Button></div>}
    {busy && <p role="status">{t('periodProgress', { current: Math.min(execution.accepted.length + 1, plan.parts.length), completed: execution.accepted.length, parts: plan.parts.length })}</p>}
    {execution.status === 'finished' && <p className="text-label text-[color:var(--color-text-secondary)]">{t(execution.overview?.themes.length ? 'periodFinished' : 'periodNoOverview')}</p>}
    {selection && <><p className="text-label">{t('periodOverviewCoverage', { selected: selection.selected.length, candidates: selection.candidates.length, represented: selection.represented, parts: plan.parts.length })}</p>{(selection.selected.length < selection.candidates.length || selection.represented < plan.parts.length) && <p className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('periodOverviewPartial')}</p>}</>}
  </div>;
}


export function PeriodRunDetails({ api, readSource, select }: DetailsProps) {
  const t = useTranslations('gitBriefing');
  const [selectionPart, setSelectionPart] = useState(0);
  const { run, coverage } = api;
  if (!run || !coverage) return null;
  const { execution, plan } = run;
  const selection = execution.overviewSelection;
  return <div className="space-y-3">
    <section data-testid="briefing-period-parts" className="max-w-4xl space-y-4">
      <h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('periodParts')}</h3>
      <p className="text-body">{t('periodGaps', { unexplained: coverage.unexplained, unsent: coverage.unsent, uncertain: coverage.uncertain.size })}</p>
      {execution.accepted.length > 0 && <Select ariaLabel={t('periodParts')} value={api.current?.overview ? 'overview' : String(api.current?.index ?? 0)} onChange={value => select(value === 'overview' ? value : Number(value))} options={[...(execution.overview ? [{ value: 'overview', label: t('overviewReady') }] : []), ...execution.accepted.map((narrative, index) => ({ value: String(index), label: `${narrative.themes[0]?.title ? `${narrative.themes[0].title} · ` : ''}${t('periodPart', { number: index + 1, parts: plan.parts.length })} · ${t(narrative.themes.length ? 'periodPartDone' : 'periodPartNoExplanation')}` }))]} />}
      {api.current && <div className="space-y-2">{api.current.packet.sources.map(source => <RowButton key={source.id} onClick={event => readSource(source, '', event.currentTarget)}><span className="min-w-0 break-words py-2">{source.title}</span></RowButton>)}</div>}
    </section>
    {selection && <section className="max-w-4xl space-y-3"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('overviewEvidenceHeading')}</h3><p className="text-body">{t('periodOverviewPolicy')}</p><Select ariaLabel={t('periodSelectionPart')} value={String(Math.min(selectionPart, plan.parts.length - 1))} onChange={value => setSelectionPart(Number(value))} options={plan.parts.map((_, index) => ({ value: String(index), label: t('periodPart', { number: index + 1, parts: plan.parts.length }) }))} />{selection.candidates.filter(candidate => candidate.part === Math.min(selectionPart, plan.parts.length - 1)).map(candidate => <RowButton key={candidate.passage.id} onClick={event => readSource(candidate.source, candidate.passage.id, event.currentTarget)}><span className="min-w-0 break-words py-2"><span className="block">{candidate.source.title}</span><span className="block text-label text-[color:var(--color-text-secondary)]">{t('periodPart', { number: candidate.part + 1, parts: plan.parts.length })} · {selection.selected.includes(candidate.passage.id) ? t('periodOverviewSelected') : t('periodOverviewOmitted')}{candidate.kind === 'limits' && ` · ${t('limitsHeading')}`}</span></span></RowButton>)}</section>}
  </div>;
}
