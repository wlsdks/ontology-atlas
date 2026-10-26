'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Settings2, Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button, Chip, Dialog, RowButton, Select } from '@/shared/ui';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { controlClass } from '@/shared/ui/control-class';
import { gitBriefingPullDescriptions, gitBriefingRepositories, gitBriefingSavedPullDescriptions, type SavedPulls, type ChangeBriefing, type PullDescriptions, type PullLookupFailure } from '@/shared/lib/git/tauri-change-briefing';
import { isLocalEndpointReady, readLocalEndpoint, subscribeLocalEndpointChange } from '@/shared/lib/llm-connection/local-endpoint';
import { formatPrTime, prCopyDetails } from '../model/pr-copy';
import { authorEvidence, type AuthorEvidenceKind } from '../model/author-evidence';
import { narrativeSources, sourcePassages, type NarrativeClaim, type NarrativeSource } from '../model/narrative';
import { usePeriodNarrative } from '../model/use-period-narrative';
import { PeriodPlanDialog } from './PeriodPlanDialog';
import { PeriodRunStatus, PeriodRunDetails } from './PeriodRunStatus';

export type BriefingReadingMode = 'summary' | 'sources' | 'code';

export function BriefingNarrative({ data, period, onReadCode, clearedAt, mode, onMode, repository, setRepository }: {
  data: ChangeBriefing; period: string; onReadCode: () => void; clearedAt: number;
  mode: BriefingReadingMode; onMode: (mode: BriefingReadingMode) => void;
  repository: string; setRepository: (next: string) => void;
}) {
  const t = useTranslations('gitBriefing');
  const locale = useLocale();
  const [local, setLocal] = useState(readLocalEndpoint);
  useEffect(() => subscribeLocalEndpointChange(() => setLocal(readLocalEndpoint())), []);
  const memory = JSON.stringify(['source-narrative', data.sourceRoot, data.snapshot, period]);
  const [repositories, setRepositories] = useState<string[] | null>(null);
  const [pulls, setPulls] = useArrivalMemory<PullDescriptions | null>(`${memory}:pulls`, null);
  const [savedEntry, setSavedEntry] = useState<{ repository: string; snapshot: string; value: SavedPulls | null } | null>(null);
  const saved = savedEntry?.repository === repository && savedEntry.snapshot === data.snapshot ? savedEntry.value : null;
  const prRevision = useRef(0);
  const clearRef = useRef(clearedAt);
  useEffect(() => { clearRef.current = clearedAt; prRevision.current++; }, [clearedAt]);
  useEffect(() => {
    if (!repository || pulls?.repository === repository) return;
    let alive = true;
    const revision = prRevision.current;
    void gitBriefingSavedPullDescriptions(data, repository).then(value => {
      if (!alive || revision !== prRevision.current) return;
      setSavedEntry({ repository, snapshot: data.snapshot, value });
      if (value?.pulls?.descriptions.length) setPulls(value.pulls);
    }, () => { if (alive && revision === prRevision.current) setSavedEntry({ repository, snapshot: data.snapshot, value: { status: 'unavailable', pulls: null, omitted: 0, ignored: 0 } }); });
    return () => { alive = false; };
  }, [data, repository, pulls, setPulls, clearedAt]);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState(false);
  const [prStopped, setPrStopped] = useState(false);
  const [prFailure, setPrFailure] = useArrivalMemory<PullLookupFailure | null>('git-pr:github-rate-limit', null);
  const [retryNow, setRetryNow] = useState(() => Date.now());
  const prCooldown = Date.parse(prFailure?.retryAt ?? '') > retryNow;
  useEffect(() => {
    const delay = Date.parse(prFailure?.retryAt ?? '') - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = window.setTimeout(() => setRetryNow(Date.now()), Math.max(0, delay));
    return () => window.clearTimeout(timer);
  }, [prFailure]);
  const prController = useRef<AbortController | null>(null);
  useEffect(() => () => prController.current?.abort(), []);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const sourceRef = useRef<HTMLElement>(null);
  const citationRef = useRef<HTMLButtonElement | null>(null);
  const readingReturn = useRef<{ main: HTMLElement; scrollTop: number } | null>(null);
  const [reader, setReader] = useState<{ source: NarrativeSource; passage: string | null; head: string; fromList: boolean } | null>(null);
  const [visibleSources, setVisibleSources] = useState(40);
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeId = useId();
  const scopeOpener = useRef<HTMLButtonElement | null>(null);
  const originalsHeading = useRef<HTMLHeadingElement>(null);
  const originalsList = useRef<HTMLDivElement>(null);
  const matchedPulls = pulls?.repository === repository ? pulls : null;
  const hasPrDescriptions = Boolean(matchedPulls?.descriptions.length);
  const hasSavedCopies = Boolean(matchedPulls?.descriptions.some(pr => pr.copyKind === 'saved' && !(clearedAt && Date.parse(pr.fetchedAt) <= clearedAt)));
  const preferPrRead = Boolean(repository || repositories?.length) && !matchedPulls && !prError && !prStopped && !prFailure;
  const sources = useMemo(() => narrativeSources(data, matchedPulls?.descriptions ?? []), [data, matchedPulls]);
  const key = JSON.stringify([data.sourceRoot, data.snapshot, data.head, data.base, data.tip, period, matchedPulls && [matchedPulls.repository, matchedPulls.status, matchedPulls.unchecked, matchedPulls.uncheckedCommits, matchedPulls.unlinked, matchedPulls.descriptions.map(pr => [pr.digest, pr.updatedAt, pr.fetchedAt])], local.baseUrl, local.model, locale]);
  const api = usePeriodNarrative({ data, period, sources, lookup: { status: matchedPulls?.status ?? 'not-requested', unchecked: matchedPulls?.unchecked ?? data.commits.length, unlinked: matchedPulls?.unlinked ?? 0 }, identity: key, connection: local, locale });
  const { current, busy: activeBusy, failure, prepare } = api;
  const error = failure?.code;
  const displaySources = sources;
  useEffect(() => {
    if (current?.overview) requestAnimationFrame(() => { if (sourceRef.current && !sourceRef.current.closest('[hidden]')) return; if (resultRef.current?.closest('[hidden]')) return; resultRef.current?.focus(); resultRef.current?.scrollIntoView({ block: 'start' }); });
  }, [current?.overview]);
  useEffect(() => {
    let alive = true;
    void gitBriefingRepositories(data).then(values => { if (alive) { setRepositories(values); if (!values.includes(repository)) setRepository(values.length === 1 ? values[0] : ''); } }, () => { if (alive) setRepositories([]); });
    return () => { alive = false; };
  }, [data, repository, setRepository]);
  async function readPrs() {
    if (!repository || prLoading) return;
    prRevision.current++;
    const clearBefore = clearRef.current;
    const owned = new AbortController(); prController.current = owned;
    setPrLoading(true); setPrError(false); setPrStopped(false); setPrFailure(null);
    try {
      const value = await gitBriefingPullDescriptions(data, repository, owned.signal, hasPrDescriptions);
      if (!value) throw new Error();
      setPrFailure(value.failure?.kind === 'rate-limited' ? value.failure : null);
      if (clearBefore !== clearRef.current) { value.descriptions = value.descriptions.map(pr => ({ ...pr, copyKind: 'session' })); value.saved = { status: 'unchanged', saved: 0, unsaved: 0, evicted: 0 }; }
      if ((value.status === 'unavailable' || value.failure) && hasPrDescriptions) setPrError(true);
      else { setPulls(value); setSavedEntry(null); }
    }
    catch { if (owned.signal.aborted) setPrStopped(true); else setPrError(true); }
    finally { setPrLoading(false); }
  }
  function openScope(button: HTMLButtonElement) {
    button.focus({ preventScroll: true });
    scopeOpener.current = button; setScopeOpen(true);
  }
  function closeScope() {
    setScopeOpen(false);
    requestAnimationFrame(() => {
      if (scopeOpener.current?.isConnected) return;
      const target = sourceRef.current ?? resultRef.current;
      if (!target?.closest('[hidden]')) target?.focus({ preventScroll: true });
    });
  }
  function closeReader() {
    const fromList = reader?.fromList;
    setReader(null);
    onMode(fromList ? 'sources' : 'summary');
    requestAnimationFrame(() => {
      const origin = citationRef.current;
      if (readingReturn.current?.main.isConnected) readingReturn.current.main.scrollTop = readingReturn.current.scrollTop;
      if (origin?.isConnected && !origin.closest('[inert],[hidden]')) origin.focus({ preventScroll: true });
      else (fromList ? originalsHeading.current : resultRef.current)?.focus();
    });
  }
  function showSourceList() {
    setReader(null); onMode('sources');
    requestAnimationFrame(() => { originalsHeading.current?.focus(); originalsHeading.current?.scrollIntoView({ block: 'start' }); });
  }
  function readCitation(passageId: string, button: HTMLButtonElement) {
    const source = current?.packet.sources.find(source => sourcePassages(source).some(passage => passage.id === passageId));
    if (!source) return;
    openSource(source, passageId, button);
  }
  function openSource(source: NarrativeSource, passage: string | null, button: HTMLButtonElement, fromList = false) {
    if (current && !current.overview) api.select(current.index);
    citationRef.current = button;
    const main = button.closest('main');
    readingReturn.current = main ? { main, scrollTop: main.scrollTop } : null;
    onMode('sources');
    setReader({ source, passage, fromList, head: api.run?.plan.sources.some(value => value.id === source.id && value.version === source.version) ? api.run.head : data.head });
    requestAnimationFrame(() => { sourceRef.current?.focus(); sourceRef.current?.scrollIntoView({ block: 'start' }); });
  }
  const copyLabel = (source: NarrativeSource) => { const copy = prCopyDetails(source, clearedAt, locale); return t(copy.key, { fetchedAt: copy.fetchedAt }); };
  const citations = new Map((current?.packet.sources ?? []).flatMap(source => sourcePassages(source).map(passage => ({ source, passage }))).map((value, index) => [value.passage.id, { source: value.source, passage: value.passage, number: index + 1 }]));
  function claim(value: NarrativeClaim) {
    return <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><p className="max-w-prose whitespace-pre-wrap break-words text-body-lg">{value.text}</p><div className="flex flex-wrap items-center gap-2">{value.inferred && <span className="text-label text-[color:var(--color-text-secondary)]">{t('inferred')}</span>}{value.evidence.map((id, index) => <Chip key={id} size="lg" tone="muted" aria-label={t('sourceCitation', { source: citations.get(id)?.source.title ?? '' })} onClick={event => readCitation(id, event.currentTarget)}><FileText size={14} aria-hidden />{t('sourceNumber', { number: citations.get(id)?.number ?? index + 1 })}</Chip>)}</div></div>;
  }
  function authorRecord(value: NarrativeClaim, kind: AuthorEvidenceKind) {
    return <div className="space-y-3">{value.evidence.map((id, index) => {
      const cited = citations.get(id);
      if (!cited) return null;
      const excerpt = authorEvidence(sourcePassages(cited.source), kind).find(value => value.id === id);
      if (!excerpt) return null;
      return <div key={id} className="space-y-2">{kind === 'limits' && <blockquote data-testid="briefing-limit-source" className="whitespace-normal break-words border-l border-[color:var(--color-border-soft)] pl-3 text-body-lg text-[color:var(--color-text-secondary)]">{excerpt.text}</blockquote>}<Chip size="lg" tone="muted" aria-label={t('sourceCitation', { source: cited.source.title })} onClick={event => readCitation(id, event.currentTarget)}><FileText size={14} aria-hidden />{t('sourceNumber', { number: citations.get(id)?.number ?? index + 1 })}</Chip></div>;
    })}</div>;
  }
  const modelReady = isLocalEndpointReady(local);
  const prAction = (repository || Boolean(repositories?.length)) && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant={preferPrRead ? 'primary' : 'outline'} aria-describedby={prFailure ? 'git-pr-rate-limit' : undefined} disabled={!repository || prLoading || prCooldown || Boolean(activeBusy)} onClick={() => { void readPrs(); }}><FileText size={16} aria-hidden />{t(prLoading ? 'prLoading' : hasPrDescriptions ? 'prRefresh' : 'readPrs')}</Button>;
  const modelAction = modelReady
    ? <Button className="atlas-touch-floor atlas-touch-floor-wide" variant={preferPrRead ? 'outline' : 'primary'} aria-describedby={!hasPrDescriptions ? 'git-briefing-commit-only-note' : undefined} disabled={Boolean(activeBusy) || prLoading} onClick={event => { void prepare(event.currentTarget); }}><Sparkles size={16} aria-hidden />{t(current ? 'rebuildSummary' : hasPrDescriptions ? 'analyse' : 'analyseCommits')}</Button>
    : <Link href="/agents/?tab=models&returnTo=changes" className={controlClass({ shape: 'card', size: 'lg', tone: preferPrRead ? 'secondary' : 'accent', hoverSurface: 'lift', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide' })}><Settings2 size={16} aria-hidden />{t('chooseModel')}</Link>;
  const actions = (forView: 'summary' | 'sources') => <div className="space-y-3">
    {repositories && repositories.length > 1 && <Select ariaLabel={t('remoteSelection')} value={repository} onChange={setRepository} placeholder={t('remoteSelection')} options={repositories.map(value => ({ value, label: value }))} />}
    <div className="flex flex-wrap items-center gap-3">
      {forView === 'sources' ? prAction : preferPrRead ? <>{prAction}{modelAction}</> : <>{modelAction}{!current && prAction}</>}
    </div>
    {!current && !hasPrDescriptions && forView === 'summary' && <p id="git-briefing-commit-only-note" className="max-w-prose text-label text-[color:var(--color-text-secondary)]">{t('commitOnlyNote')}</p>}
  </div>;
  const prMessages = <div className="space-y-3">
    {repositories?.length === 0 && <p className="text-body text-[color:var(--color-text-secondary)]">{t('prUnsupported')}</p>}
      {matchedPulls && hasSavedCopies && <div role="status" className="max-w-prose space-y-1 text-body text-[color:var(--color-text-secondary)]"><p>{t('prSavedReady', { count: matchedPulls.descriptions.length })}</p><p>{t('prSavedUnchecked', { count: matchedPulls.unchecked })}</p></div>}
      {!saved && !matchedPulls && repository && !prLoading && !prError && !prStopped && <p role="status" className="text-body text-[color:var(--color-text-secondary)]">{t('prSavedLoading')}</p>}
      {saved && <div role="status" className="max-w-prose space-y-1 text-body text-[color:var(--color-text-secondary)]">
        {saved.status !== 'ready' ? <p>{t(saved.status === 'unsupported' ? 'prSavedUnsupported' : 'prSavedUnavailable')}</p> : !saved.pulls?.descriptions.length && <p>{t('prSavedNone')}</p>}
        {saved.omitted > 0 && <p>{t('prSavedOmitted', { count: saved.omitted })}</p>}{saved.ignored > 0 && <p>{t('prSavedIgnored', { count: saved.ignored })}</p>}
      </div>}
      {matchedPulls?.saved && !matchedPulls.descriptions.some(pr => clearedAt && Date.parse(pr.fetchedAt) <= clearedAt) && matchedPulls.saved.status !== 'unchanged' && <div role="status" className="max-w-prose space-y-1 text-body text-[color:var(--color-text-secondary)]">
        <p>{t(matchedPulls.saved.status === 'saved' ? 'prSavedUpdated' : matchedPulls.saved.status === 'unsupported' ? 'prSavedUnsupported' : matchedPulls.saved.status === 'superseded' ? 'prSaveSuperseded' : 'prSaveFailed', { count: matchedPulls.saved.saved })}</p>
        {matchedPulls.saved.unsaved > 0 && <p>{t('prSaveTooLarge', { count: matchedPulls.saved.unsaved })}</p>}{matchedPulls.saved.evicted > 0 && <p>{t('prSavedEvicted', { count: matchedPulls.saved.evicted })}</p>}
      </div>}
      {prStopped && <p role="status" className="text-body text-[color:var(--color-text-secondary)]">{t('prCancelled')}</p>}
      {(prError || matchedPulls?.status === 'unavailable') && (!prFailure || hasPrDescriptions) && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t(prError && hasPrDescriptions ? 'prRefreshFailed' : 'prUnavailable')}</p>}
      {!prLoading && prFailure && <div role="status" className="space-y-2 text-body text-[color:var(--color-status-warning)]"><p>{t('prRateLimited')}</p><p>{prFailure.retryAt && Number.isFinite(Date.parse(prFailure.retryAt)) ? t('prRetryAt', { time: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(prFailure.retryAt)) }) : t('prRetryUnknown')}</p></div>}
      {matchedPulls && matchedPulls.unlinked > 0 && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('prUnlinked')}</p>}
      {!matchedPulls && !repository && !prLoading && !prError && !prStopped && !prFailure && <p className="text-body text-[color:var(--color-text-secondary)]">{t('prNotRequested')}</p>}
      {matchedPulls?.status === 'partial' && !hasSavedCopies && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('prPartial')}</p>}
      {matchedPulls?.status === 'measured' && matchedPulls.descriptions.length === 0 && <p role="status" className="text-body text-[color:var(--color-text-secondary)]">{t('noPr')}</p>}
  </div>;
  return <section aria-label={t('title')} className="space-y-6" data-testid="briefing-narrative">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border-soft)] pb-4">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <PeriodRunStatus api={api} />
        {hasSavedCopies && <p className="text-label text-[color:var(--color-text-secondary)]">{t('savedPrStatus')}</p>}
      </div>
      <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" data-testid="briefing-coverage" onClick={event => openScope(event.currentTarget)}>{t('scopeDetails')}</Button>
    </div>
    {(prError || matchedPulls?.status === 'unavailable') && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t(hasPrDescriptions ? 'prRefreshFailed' : 'prUnavailable')}</p>}
    {prFailure && <div id="git-pr-rate-limit" role="status" className="max-w-prose space-y-1 text-body text-[color:var(--color-status-warning)]"><p>{t('prRateLimited')}</p><p>{prFailure.retryAt && Number.isFinite(Date.parse(prFailure.retryAt)) ? t('prRetryAt', { time: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(prFailure.retryAt)) }) : t('prRetryUnknown')}</p></div>}
    {saved && saved.status !== 'ready' && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t(saved.status === 'unsupported' ? 'prSavedUnsupported' : 'prSavedUnavailable')}</p>}
    {matchedPulls?.saved && ['unavailable', 'unsupported', 'superseded'].includes(matchedPulls.saved.status) && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t(matchedPulls.saved.status === 'unsupported' ? 'prSavedUnsupported' : matchedPulls.saved.status === 'superseded' ? 'prSaveSuperseded' : 'prSaveFailed')}</p>}
    {matchedPulls && !hasSavedCopies && (matchedPulls.status === 'partial' || matchedPulls.unlinked > 0) && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t(matchedPulls.unlinked > 0 ? 'prUnlinked' : 'prPartial')}</p>}
    {prLoading && <div role="status" className="flex flex-wrap items-center gap-3"><p>{t('prLoading')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={() => prController.current?.abort()}>{t('stop')}</Button></div>}
    {prStopped && <p role="status" className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{t('prCancelled')}</p>}
    {saved && saved.omitted > 0 && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('prSavedOmitted', { count: saved.omitted })}</p>}
    {saved && saved.ignored > 0 && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('prSavedIgnored', { count: saved.ignored })}</p>}
    {matchedPulls?.saved && matchedPulls.saved.unsaved > 0 && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('prSaveTooLarge', { count: matchedPulls.saved.unsaved })}</p>}
    {matchedPulls?.saved && matchedPulls.saved.evicted > 0 && <p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t('prSavedEvicted', { count: matchedPulls.saved.evicted })}</p>}
    {activeBusy && <div role="status" className="flex flex-wrap items-center gap-3"><p>{t(activeBusy === 'cancelling' ? 'periodStopping' : activeBusy === 'preparing' ? 'preparing' : api.run?.execution.status === 'overview' ? 'periodSynthesizing' : 'periodProgress', { current: Math.min((api.run?.execution.accepted.length ?? 0) + 1, api.run?.plan.parts.length ?? 0), parts: api.run?.plan.parts.length ?? 0, completed: api.run?.execution.accepted.length ?? 0 })}</p><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" disabled={activeBusy === 'cancelling'} onClick={api.stop}>{t('stop')}</Button></div>}
    {error && <div className="space-y-3" data-testid="briefing-error" data-briefing-error={error}><p role="status" className="max-w-prose text-body text-[color:var(--color-status-warning)]">{t(error)}</p>{failure?.response && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={event => openScope(event.currentTarget)}>{t('rejectedResponse')}</Button>}</div>}
    <div hidden={mode !== 'summary'} className="max-w-4xl space-y-7" data-testid="briefing-summary">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0 space-y-2">
          <p className="text-label text-[color:var(--color-text-secondary)]">{t('sourceInventory', { commits: data.commits.length, prs: matchedPulls?.descriptions.length ?? 0 })}</p>
          <h2 ref={resultRef} tabIndex={-1} id="git-briefing-title" className="text-display font-[var(--font-weight-strong)]">{api.stale ? t('periodPrevious') : current && !current.narrative.themes.length ? t('periodPartNoExplanation') : current && !current.overview && api.run ? t('periodPart', { number: current.index + 1, parts: api.run.plan.parts.length }) : t(current ? 'overviewReady' : 'summaryEmptyTitle')}</h2>
          {!current && <p className="text-body-lg text-[color:var(--color-text-secondary)]">{t(modelReady ? 'summaryEmptyBody' : 'summaryModelMissing')}</p>}
        </div>
        {current && actions('summary')}
      </header>
      {!current && <div className="space-y-5 py-6">{actions('summary')}<Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={showSourceList}>{t('sourceListTitle')}</Button></div>}
    {current && <>
      <div className="divide-y divide-[color:var(--color-border-soft)]">{current.narrative.themes.map((theme, index) => <article key={index} className="min-w-0 space-y-4 py-7 first:pt-0" data-testid="briefing-theme">
        <h3 className="text-title font-[var(--font-weight-strong)]">{theme.title}</h3>
        {claim(theme.change)}
        {theme.reason && <div className="space-y-2 text-[color:var(--color-text-secondary)]"><h4 className="text-label font-[var(--font-weight-strong)]">{t('reasonLabel')}</h4>{claim(theme.reason)}</div>}

        {theme.limits.length > 0 && <div className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-3 text-[color:var(--color-status-warning)]"><h4 className="text-label font-[var(--font-weight-strong)]">{t('limitsHeading')}</h4>{theme.limits.map((item, index) => <div key={index}>{authorRecord(item, 'limits')}</div>)}</div>}
        {theme.checks.length > 0 && <section aria-label={t('checksHeading')} data-testid="briefing-check-records" className="flex flex-wrap items-center gap-3 text-[color:var(--color-text-secondary)]"><h4 className="text-label font-[var(--font-weight-strong)]">{t('checksHeading')}</h4>{theme.checks.map((item, index) => <div key={index}>{authorRecord(item, 'checks')}</div>)}</section>}
      </article>)}</div>
      {current.narrative.themes.some(theme => !theme.reason || !theme.checks.length || !theme.limits.length) && <p className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{t('recordingGaps')}</p>}
    </>}
    </div>
    <div hidden={mode !== 'sources'} className="space-y-5" data-testid="briefing-sources">
      <div hidden={Boolean(reader)} className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3"><h2 ref={originalsHeading} tabIndex={-1} className="text-display font-[var(--font-weight-strong)]">{t('sourceListTitle')}</h2>{actions('sources')}</header>
      <div ref={originalsList} className="max-w-4xl space-y-2">{displaySources.slice(0, visibleSources).map(source => <RowButton key={source.id} onClick={event => openSource(source, null, event.currentTarget, true)}><span className="min-w-0 py-2"><span className="block break-words text-body">{source.title}</span><span className="block text-label text-[color:var(--color-text-secondary)]">{source.kind === 'pr' ? `PR #${source.id.split(':')[1]} · ${copyLabel(source)}` : source.integration.slice(0, 8)}{source.kind === 'commit' && matchedPulls?.uncheckedCommits.includes(source.integration) && ` · ${t('prUnchecked')}`}{api.coverage && !api.stale && ` · ${t(api.coverage.linked.has(source.id) ? 'includedSource' : api.coverage.sent.has(source.id) ? 'unexplainedSource' : api.coverage.uncertain.has(source.id) ? 'periodDeliveryUnknown' : 'excludedSource')}`}</span></span></RowButton>)}{displaySources.length > visibleSources && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={() => {
        setVisibleSources(visibleSources + 40);
        requestAnimationFrame(() => { const next = originalsList.current?.querySelectorAll<HTMLElement>('[data-control="row"]')[visibleSources]; next?.focus(); next?.scrollIntoView({ block: 'nearest' }); });
      }}>{t('moreSources', { count: Math.min(40, displaySources.length - visibleSources) })}</Button>}</div>
      </div>
    {reader && <section data-testid="briefing-original" ref={sourceRef} tabIndex={-1} aria-label={t('sourceHeading')} className="max-w-4xl space-y-4 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 flex-1 break-words text-title font-[var(--font-weight-strong)]">{reader.source.title}</h3><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={closeReader}>{t(reader.fromList ? 'backSources' : 'backSummary')}</Button></div>
      <p className="break-all font-mono text-label text-[color:var(--color-text-secondary)]">{reader.source.kind === 'pr' ? reader.source.version : t('sourceVersion', { hash: reader.source.integration.slice(0, 8), snapshot: reader.head.slice(0, 8) })}</p>
      {reader.source.kind === 'pr' && <p className="text-label text-[color:var(--color-text-secondary)]">{copyLabel(reader.source)} · {t('prVersion', { number: Number(reader.source.id.split(':')[1]), updatedAt: formatPrTime(reader.source.updatedAt ?? '', locale), fetchedAt: formatPrTime(reader.source.fetchedAt ?? '', locale) })} · {t('prSnapshotNote')}</p>}
      <div className="space-y-3">{!reader.source.text.trim() && <p role="status">{t('sourceUnavailableInline')}</p>}{sourcePassages(reader.source).map(passage => <pre key={passage.id} data-source-passage={passage.id} className={`whitespace-pre-wrap break-words font-mono text-body ${reader.passage === passage.id ? 'rounded-card bg-[color:var(--color-overlay-2)] p-3' : ''}`}>{passage.text}</pre>)}</div>
      <div className="flex flex-wrap items-center gap-3">
        <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" size="sm" onClick={closeReader}>{t(reader.fromList ? 'backSources' : 'backSummary')}</Button>
        <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={showSourceList}>{t('sourceList')}</Button>
        <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" disabled={api.stale} onClick={onReadCode}>{t('readPeriodCode')}</Button>
        {reader.source.url && <a href={reader.source.url} target="_blank" rel="noopener noreferrer" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}>{reader.source.url}</a>}
      </div>
    </section>}
    </div>
    <Dialog open={scopeOpen} onClose={closeScope} labelledBy={scopeId} size="md" testId="briefing-coverage-dialog">
      <div className="flex items-center justify-between gap-3"><h2 id={scopeId} className="text-title font-[var(--font-weight-strong)]">{t('scopeTitle')}</h2><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={closeScope}>{t('closeScope')}</Button></div>
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pb-4 pt-5">
        <section className="space-y-3"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('collectionHeading')}</h3><p>{t('sourceCount', { count: data.commits.length })}{matchedPulls && ` · ${t('prCount', { count: matchedPulls.descriptions.length })}`}</p>{prMessages}</section>
        <section className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-5"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('processingHeading')}</h3>{api.run ? <PeriodRunStatus api={api} detail /> : <p>{t('summaryNotStarted')}</p>}
          <PeriodRunDetails api={api} readSource={(source, id, button) => { setScopeOpen(false); openSource(source, id, button); }} select={value => { setReader(null); api.select(value); setScopeOpen(false); onMode('summary'); requestAnimationFrame(() => { resultRef.current?.focus(); resultRef.current?.scrollIntoView({ block: 'start' }); }); }} />
        </section>
        <section className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-5"><p>{t('attribution')}</p>{current && current.narrative.themes.map((theme, index) => <div key={index}><h3 className="font-[var(--font-weight-strong)]">{theme.title}</h3>{(!theme.reason || !theme.checks.length || !theme.limits.length) && <p>{t('notRecorded', { fields: [!theme.reason && t('reasonLabel'), !theme.checks.length && t('checksLabel'), !theme.limits.length && t('limitsLabel')].filter(Boolean).join(' · ') })}</p>}</div>)}</section>
        {failure?.response && <section className="space-y-3 border-t border-[color:var(--color-border-soft)] pt-5"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('rejectedResponse')}</h3><p>{t('rejectedResponseNote')}</p><pre className="whitespace-pre-wrap break-words font-mono text-body">{failure.detail}{'\n'}{failure.response}</pre></section>}
      </div>
    </Dialog>
    <PeriodPlanDialog clearedAt={clearedAt} preview={api.preview} connection={local} close={api.closePreview} start={() => { setReader(null); api.start(); }} />
  </section>;
}
