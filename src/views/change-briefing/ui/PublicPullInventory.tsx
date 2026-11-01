'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CircleHelp, CircleX, FileText, GitMerge, GitPullRequest, GitPullRequestDraft } from 'lucide-react';
import { Button, Checkbox, Disclosure, RowButton, Select } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { emptyPublicPullSession, publicPullConflicts } from '@/shared/lib/git/public-pull-session';
import { canStorePublicPullScope, clearPublicPullLedger, getPublicPullSession, invalidatePublicPullCursor, publicPullEvidenceRevision, publicPullLedgerGeneration, publicPullScope, savePublicPullPage } from '@/shared/lib/git/public-pull-ledger';
import { publicPullRepositories, readPublicPulls, type PublicPullVersion } from '@/shared/lib/git/tauri-pr-inventory';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { readArrivalMemory, writeArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory-store';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { OriginalSourceBody } from './OriginalSourceBody';
import { PrAgentPreparation } from './PrAgentPreparation';
import { Input } from '@/shared/ui/fields/input';

type Props = { data: ChangeBriefing; memory: string; active?: boolean; onActivity?: (controller: AbortController | null) => void };
type AgentSelection = { key: string; conflict: string | null };

function githubPullsUrl(repository: string): string | null {
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some(part => !part || part === '.' || part === '..' || !/^[a-z0-9_.-]+$/i.test(part))) return null;
  return `https://github.com/${parts[0]}/${parts[1]}/pulls`;
}

export function PublicPullInventory({ data, memory, active, onActivity }: Props) {
  const scope = JSON.stringify([data.sourceRoot, data.head, data.snapshot]);
  return <PublicPullInventoryScope key={scope} data={data} memory={memory} active={active} onActivity={onActivity} />;
}

function PublicPullInventoryScope({ data, memory, active = true, onActivity }: Props) {
  const t = useTranslations('prBriefing');
  const git = useTranslations('gitBriefing');
  const locale = useLocale();
  const [remotes, setRemotes] = useState<string[] | null>(null);
  const [remotesError, setRemotesError] = useState(false);
  const [remoteAttempt, setRemoteAttempt] = useState(0);
  const [repository, setRepository] = useState('');
  const [session, setSession] = useState(emptyPublicPullSession);
  const [reading, setReading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [cursorInvalid, setCursorInvalid] = useState(false);
  const [scopeLimit, setScopeLimit] = useState(false);
  const [openedFromPreparation, setOpenedFromPreparation] = useState<string | null>(null);
  const arrivalKey = JSON.stringify([memory, data.sourceRoot, data.head, data.snapshot, repository, publicPullLedgerGeneration()]);
  const [selectedKey, setSelectedKey] = useArrivalMemory<string | null>(`${arrivalKey}:public-pr-selected`, null);
  const [query, setQuery] = useArrivalMemory(`${arrivalKey}:public-pr-query`, '');
  const [visible, setVisible] = useArrivalMemory(`${arrivalKey}:public-pr-visible`, 40);
  const [selectedForAgent, setSelectedForAgent] = useArrivalMemory<AgentSelection[]>(`${arrivalKey}:pr-agent-selection`, []);
  const [preparing, setPreparing] = useArrivalMemory(`${arrivalKey}:pr-agent-preparing`, false);
  const [preparedRevision, setPreparedRevision] = useArrivalMemory(`${arrivalKey}:pr-agent-revision`, '');
  const [question, setQuestion] = useArrivalMemory(`pr-agent-question:${data.sourceRoot}`, t('questionDefault'));
  const current = useRef<AbortController | null>(null);
  const activeScope = useRef<string | null>(null);
  const generation = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const reader = useRef<HTMLElement>(null);
  const preparation = useRef<HTMLDivElement>(null);
  const prepareButton = useRef<HTMLButtonElement>(null);
  const { sourceRoot, head, snapshot } = data;
  const identity = useMemo(() => ({ sourceRoot, head, snapshot }), [sourceRoot, head, snapshot]);
  const repositoryMemory = JSON.stringify(['public-pr-repository', sourceRoot, head, snapshot]);

  useEffect(() => {
    let active = true;
    const scopeGeneration = generation;
    const activeRequest = current;
    const requestScope = activeScope;
    void publicPullRepositories(identity).then((values) => {
      if (!active) return;
      setRemotes(values);
      setRemotesError(false);
      const remembered = readArrivalMemory<string>(repositoryMemory);
      const next = remembered && values.includes(remembered) ? remembered : values.length === 1 ? values[0] : '';
      setRepository(next);
      if (next) setSession(getPublicPullSession(publicPullScope(sourceRoot, head, snapshot, next)));
    }).catch(() => { if (active) { setRemotes([]); setRemotesError(true); } });
    return () => { active = false; scopeGeneration.current++; if (activeRequest.current && requestScope.current) invalidatePublicPullCursor(requestScope.current); activeRequest.current?.abort(); onActivity?.(null); };
  }, [identity, repositoryMemory, sourceRoot, head, snapshot, onActivity, remoteAttempt]);

  function chooseRepository(value: string) {
    generation.current++;
    if (current.current && activeScope.current) invalidatePublicPullCursor(activeScope.current);
    current.current?.abort();
    current.current = null;
    activeScope.current = null;
    onActivity?.(null);
    setRepository(value);
    writeArrivalMemory(repositoryMemory, value);
    setSession(getPublicPullSession(publicPullScope(sourceRoot, head, snapshot, value)));
    setReading(false);
    setFailed(false);
    setCursorInvalid(false);
    setScopeLimit(false);
  }

  async function read(action: 'start' | 'more' | 'smaller') {
    if (!repository || reading || session.omittedForSessionLimit) return;
    const scope = publicPullScope(sourceRoot, head, snapshot, repository);
    if (!canStorePublicPullScope(scope)) { setScopeLimit(true); return; }
    const cursor = action === 'start' ? null : session.report?.cursor;
    if (action !== 'start' && (!cursor || cursorInvalid || session.cursorNeedsRestart)) return;
    const controller = new AbortController();
    const owner = ++generation.current;
    current.current = controller;
    activeScope.current = scope;
    onActivity?.(controller);
    setReading(true);
    setFailed(false);
    try {
      const next = action === 'start' ? { action, cursor: null } as const : { action, cursor: cursor! };
      const result = await readPublicPulls(identity, repository, next, controller.signal);
      if (owner !== generation.current) return;
      if (!result) throw new Error('unavailable');
      const nextSession = savePublicPullPage(scope, result, action === 'start');
      if (!nextSession) { setScopeLimit(true); return; }
      setSession(nextSession);
      setCursorInvalid(false);
    } catch {
      if (owner === generation.current) {
        setFailed(true);
        invalidatePublicPullCursor(scope);
        setSession(getPublicPullSession(scope));
        setCursorInvalid(true);
      }
    } finally {
      if (owner === generation.current) { current.current = null; activeScope.current = null; onActivity?.(null); setReading(false); }
    }
  }

  const report = session.report;
  const conflicts = publicPullConflicts(session);
  const selected = session.versions.find(version => `${version.number}:${version.digest}` === selectedKey) ?? null;
  const conflictFingerprint = (version: PublicPullVersion) => conflicts.has(version.number) ? JSON.stringify(session.versions.filter(item => item.number === version.number).map(item => item.digest).sort()) : null;
  const isSelectedForAgent = (version: PublicPullVersion) => selectedForAgent.some(item => item.key === `${version.number}:${version.digest}` && item.conflict === conflictFingerprint(version));
  const agentVersions = session.versions.filter(isSelectedForAgent);
  const agentScope = useMemo(() => ({ ...identity, repository }), [identity, repository]);
  const evidenceRevision = publicPullEvidenceRevision(publicPullScope(sourceRoot, head, snapshot, repository));
  const needle = session.versions.length > 10 ? query.trim().toLocaleLowerCase() : '';
  const matches = session.versions.filter(version => !needle || `${version.title} #${version.number}`.toLocaleLowerCase().includes(needle));
  const clock = (value: string) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
  };
  const status = (value: PublicPullVersion['status']) => t(value === 'draft' ? 'statusDraft' : value === 'open' ? 'statusOpen' : value === 'merged' ? 'statusMerged' : value === 'closed' ? 'statusClosed' : 'statusUnknown');
  const pullCount = new Set(session.versions.map(version => version.number)).size;
  const open = (version: PublicPullVersion) => {
    if (preparing) setOpenedFromPreparation(`${version.number}:${version.digest}`);
    setSelectedKey(`${version.number}:${version.digest}`);
    requestAnimationFrame(() => reader.current?.focus());
  };
  const back = () => {
    const key = selected ? `${selected.number}:${selected.digest}` : '';
    setSelectedKey(null);
    requestAnimationFrame(() => preparing ? preparation.current?.querySelector<HTMLElement>(`[data-pr-source-key="${CSS.escape(key)}"]`)?.focus() : list.current?.querySelector<HTMLElement>(`[data-pull-key="${CSS.escape(key)}"]`)?.focus());
  };
  const toggleForAgent = (version: PublicPullVersion, checked: boolean) => {
    const key = `${version.number}:${version.digest}`;
    const withoutVersion = selectedForAgent.filter(value => !value.key.startsWith(`${version.number}:`));
    setSelectedForAgent(checked ? [...withoutVersion, { key, conflict: conflictFingerprint(version) }] : selectedForAgent.filter(value => value.key !== key));
  };

  return <section className="space-y-4" aria-label={t('prTab')}>
    {reading && <div role="status" className="flex flex-wrap items-center gap-3"><p>{t('prLoading')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => current.current?.abort()}>{git('stop')}</Button></div>}
    {selected ? <section ref={reader} tabIndex={-1} className="max-w-4xl space-y-4 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
      <p className="break-all text-label text-[color:var(--color-text-secondary)]">{repository} · {t('publicChoice')}</p>
      <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="min-w-0 flex-1 break-words text-title font-[var(--font-weight-strong)]">{selected.title}</h2><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="ghost" size="sm" onClick={back}>{t(preparing ? 'backToPreparation' : 'backToPrs')}</Button></div>
      <p className="text-label text-[color:var(--color-text-secondary)]">#{selected.number} · {status(selected.status)} · {selected.digest.slice(0, 8)} · {t('prFresh', { updatedAt: clock(selected.updatedAt), fetchedAt: clock(selected.fetchedAt) })}</p>
      {conflicts.has(selected.number) && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('versionConflict', { number: selected.number })}</p>}
      {!selected.bodyPresent ? <p>{git('sourceUnavailableInline')}</p> : <OriginalSourceBody source={{ id: `pr:${selected.number}`, kind: 'pr', title: selected.title, text: `${selected.title}\n\n${selected.body}`, integration: '', version: selected.digest }} passage={null} memory={memory} readerId={`${selected.number}:${selected.digest}`} rawLabel={git('viewSourceText')} readingLabel={git('viewFormattedText')} />}
      <a href={selected.url} target="_blank" rel="noopener noreferrer" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11' })}>{t('openOnGitHub')}</a>
    </section> : preparing ? <div ref={preparation} tabIndex={-1}>
      <PrAgentPreparation scope={agentScope} active={active} versions={agentVersions} evidenceRevision={evidenceRevision} preparedRevision={preparedRevision} question={question} onQuestion={setQuestion} originalsOpen={openedFromPreparation !== null} onBack={() => { setPreparing(false); setOpenedFromPreparation(null); requestAnimationFrame(() => prepareButton.current?.focus()); }} onOpen={open} />
    </div> : <>
      <p className="break-words text-body text-[color:var(--color-text-secondary)]">{repository && <><span className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{repository} · {t('publicChoice')}</span> · </>}{t('shortScope')}</p>
      {remotes === null ? <p role="status">{t('loadingRemotes')}</p> : remotes.length === 0 ? <div className="space-y-3"><p role="status">{t(remotesError ? 'remoteReadFailed' : 'noRemote')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => { setRemotes(null); setRemotesError(false); setRemoteAttempt(value => value + 1); }}>{t('retryRemotes')}</Button></div> : <div className="space-y-3">
        {remotes.length > 1 && <Select className="max-[769px]:[&>button]:min-h-11" ariaLabel={git('remoteSelection')} value={repository} onChange={chooseRepository} placeholder={git('remoteSelection')} options={remotes.map(value => ({ value, label: value }))} />}
        {repository && <>{!report && <p className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{t('prTransfer', { repository })}</p>}<div className="flex flex-wrap items-end gap-3">{session.versions.length > 10 && <Input className="w-full sm:max-w-sm max-[769px]:min-h-11" label={t('findPr')} value={query} onChange={event => { setQuery(event.target.value); setVisible(40); }} />}<Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant={report ? 'outline' : 'primary'} disabled={reading || scopeLimit || session.omittedForSessionLimit > 0} onClick={() => void read('start')}>{t(report ? 'refreshPrs' : 'readPrs')}</Button>{report && <Disclosure className="basis-full max-[769px]:[&>button]:min-h-11" summary={t('readDetails')}><div className="max-w-prose space-y-2 pt-2 text-body text-[color:var(--color-text-secondary)]"><p>{t('prScope')}</p><p>{t('prTransfer', { repository })}</p></div></Disclosure>}</div></>}
      </div>}
      {failed && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('prFailed')}</p>}
      {scopeLimit && <p role="status" className="text-body text-[color:var(--color-status-warning)]">{t('sessionLimit')}</p>}
      {report && <div className="space-y-2 text-body text-[color:var(--color-text-secondary)]">
        <p>{t('scanSummary', { shown: pullCount, scanned: report.scanned })} · {t('movingNote')}</p>
        {!report.observedDistinctExact && <p>{t('prCoverageAtLeast', { scanned: report.scanned, shown: report.observedDistinct })}</p>}
        {(report.reason === 'unavailable' || (report.status === 'unavailable' && report.reason !== 'rate-limited')) && <p role="status" className="text-[color:var(--color-status-warning)]">{t('prUnavailablePublic')}</p>}
        {(report.status !== 'observed' || session.hadNativeOmissions || session.conflictOverflow) && <p role="status">{t('prPartial')}</p>}
        {session.hadNativeOmissions && <p>{t('originalsOmitted')}</p>}
        {session.conflictOverflow && <p>{t('conflictsUnknown')}</p>}
        {session.omittedForSessionLimit > 0 && <p>{t('sessionLimit')}</p>}
        {(session.hasEarlierScan || report.restarted) && session.versions.length > 0 && <p>{t('retainedVersions')}</p>}
        {session.cursorNeedsRestart && <p>{t('restartRead')}</p>}
        {report.reason === 'rate-limited' && <p>{git('prRateLimited')} {report.retryAt && Number.isFinite(Date.parse(report.retryAt)) ? git('prRetryAt', { time: clock(report.retryAt) }) : git('prRetryUnknown')}</p>}
        {report.status === 'observed' && session.versions.length === 0 && !session.hadNativeOmissions && !session.omittedForSessionLimit && <p>{t('prEmpty')}</p>}
      </div>}
      {(scopeLimit || session.omittedForSessionLimit > 0) && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => { clearPublicPullLedger(); setSession(emptyPublicPullSession()); setSelectedKey(null); setQuery(''); setVisible(40); setScopeLimit(false); setCursorInvalid(false); }}>{t('clearSessionResults')}</Button>}
      {needle && matches.length === 0 && <p role="status" className="text-body text-[color:var(--color-text-secondary)]">{t('noPrMatch')}</p>}
      {session.versions.length > 0 && <div className="flex max-w-4xl flex-wrap items-center justify-between gap-3"><div><p className="text-body font-[var(--font-weight-emphasis)]">{t('selectionTitle')}</p><p className="text-label text-[color:var(--color-text-secondary)]">{t('selectedPrs', { count: agentVersions.length })}</p></div><Button ref={prepareButton} className="max-[769px]:min-h-11" variant="primary" size="sm" disabled={agentVersions.length === 0} onClick={() => { setPreparedRevision(evidenceRevision); setPreparing(true); requestAnimationFrame(() => preparation.current?.focus()); }}>{t('reviewSelected')}</Button></div>}
      {matches.length > 0 && <div ref={list} className="max-w-4xl divide-y divide-[color:var(--color-border-soft)] overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]">{matches.slice(0, visible).map((version) => {
        const Icon = version.status === 'merged' ? GitMerge : version.status === 'draft' ? GitPullRequestDraft : version.status === 'closed' ? CircleX : version.status === 'open' ? GitPullRequest : CircleHelp;
        const iconTone = version.status === 'merged' ? 'text-[color:var(--color-indigo-hover)]' : version.status === 'open' ? 'text-[color:var(--color-status-success)]' : 'text-[color:var(--color-text-secondary)]';
        return <div key={`${version.number}:${version.digest}`} className="flex items-center"><Checkbox className="mx-1 min-w-11 shrink-0 justify-center max-[769px]:relative max-[769px]:size-11 max-[769px]:focus-within:ring-2 max-[769px]:focus-within:ring-[color:var(--color-indigo-focus-ring)] max-[769px]:[&_input]:absolute max-[769px]:[&_input]:inset-0 max-[769px]:[&_input]:size-full max-[769px]:[&_input]:opacity-0 max-[769px]:[&>span:first-child]:rounded-micro max-[769px]:[&>span:first-child]:border max-[769px]:[&>span:first-child]:border-[color:var(--color-text-quaternary)] max-[769px]:has-[:checked]:[&>span:first-child]:bg-[color:var(--color-indigo-brand)] max-[769px]:[&>span:first-child]:text-[color:var(--color-text-on-accent)]" label={<span className="sr-only">{t('selectPr', { number: version.number, title: version.title })}{conflicts.has(version.number) ? ` · ${version.digest.slice(0, 8)}` : ''}</span>} checked={isSelectedForAgent(version)} onChange={event => toggleForAgent(version, event.target.checked)} /><RowButton tone="strong" hoverSurface="lift" hoverInk="strong" className="min-w-0 flex-1 rounded-none px-4 py-3" data-pull-key={`${version.number}:${version.digest}`} onClick={() => open(version)}><Icon size={18} aria-hidden className={`shrink-0 ${iconTone}`} /><span className="min-w-0 flex-1 text-left"><span className="block break-words text-body font-[var(--font-weight-emphasis)]">{version.title}</span><span className="block break-words text-label text-[color:var(--color-text-secondary)]">#{version.number} · {status(version.status)} · {clock(version.updatedAt)}{conflicts.has(version.number) ? ` · ${t('reviewVersions')} · ${version.digest.slice(0, 8)}` : ''}</span></span><FileText size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-secondary)]" /></RowButton></div>;
      })}</div>}
      {matches.length > visible && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => {
        const previous = visible;
        setVisible(visible + 40);
        requestAnimationFrame(() => list.current?.querySelectorAll<HTMLElement>('[data-pull-key]')[previous]?.focus());
      }}>{t('morePrs', { count: Math.min(40, matches.length - visible) })}</Button>}
      {report && !reading && !cursorInvalid && !session.cursorNeedsRestart && !session.omittedForSessionLimit && report.cursor && <div className="flex flex-wrap gap-2">{report.canContinue && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" onClick={() => void read('more')}>{t('prMore')}</Button>}{report.retrySmaller && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" onClick={() => void read('smaller')}>{t('retrySmaller')}</Button>}</div>}
      {report?.reason === 'scan-cannot-continue' && <div className="space-y-2"><p>{t('scanCannotContinue')}</p>{githubPullsUrl(repository) && <a href={githubPullsUrl(repository)!} target="_blank" rel="noopener noreferrer" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong', className: 'atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11' })}>{t('openPrsOnGitHub')}</a>}</div>}
    </>}
  </section>;
}
