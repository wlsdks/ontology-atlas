'use client';

import { useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Download, RefreshCw, Settings2 } from 'lucide-react';
import { useLocalVault, useVaultSessionIdentityScope } from '@/entities/vault-session';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { isGitBridgeAvailable } from '@/shared/lib/git/tauri-git';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { getTauriVaultRootPath, pickTauriSourceDirectory } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { Button, Disclosure, IconButton, RowButton, Select } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { controlClass } from '@/shared/ui/control-class';
import { badgeClass } from '@/shared/ui/badge-class';
import { briefingRange, groupBriefing, groupSourceAreas, localDate, movePeriod, type BriefingPeriod } from '../model/briefing-model';
import { useBriefing } from '../model/use-briefing';
import { BriefingPatch } from './BriefingPatch';
import { BriefingNarrative, type BriefingReadingMode } from './BriefingNarrative';
import { BriefingSettings } from './BriefingSettings';
import { BriefingOverview } from './BriefingOverview';

const subscribe = () => () => {};
const webSnapshot = () => false;
const PERIODS: BriefingPeriod[] = ['day', 'week', 'month', 'year', 'custom'];

export function ChangeBriefingPage() {
  const t = useTranslations('changeBriefing');
  const git = useTranslations('gitBriefing');
  const nav = useTranslations('navRail');
  const locale = useLocale();
  const vault = useLocalVault();
  const identity = useVaultSessionIdentityScope();
  const [clearedAt, setClearedAt] = useArrivalMemory('git-pr:cleared-at', 0);
  const [sourceChoice, setSourceChoice] = useArrivalMemory<string | null>("source-briefing:repository", null);
  const memory = sourceChoice ? `source-briefing:${sourceChoice}` : vault.handle ? `${identity}:change-briefing` : "source-briefing:unselected";
  const native = useSyncExternalStore(subscribe, isGitBridgeAvailable, webSnapshot);
  const [period, setPeriod] = useArrivalMemory<BriefingPeriod>(memory && `${memory}:period`, 'week');
  const [anchor, setAnchor] = useArrivalMemory(memory && `${memory}:anchor`, localDate(new Date()));
  const [from, setFrom] = useArrivalMemory(memory && `${memory}:from`, anchor);
  const [to, setTo] = useArrivalMemory(memory && `${memory}:to`, anchor);
  const [custom, setCustom] = useArrivalMemory(memory && `${memory}:custom`, { from: anchor, to: anchor });
  const [projectChoice, setProjectChoice] = useArrivalMemory(memory && `${memory}:project`, '');
  const [selection, setSelection] = useArrivalMemory<{ scope: string; group: string; area: string | null; path: string | null } | null>(memory && `${memory}:selection`, null);
  const [rows, setRows] = useArrivalMemory(memory && `${memory}:rows`, { files: 40, commits: 40, net: 40 });
  const [mode, setMode] = useArrivalMemory<BriefingReadingMode>(`${memory}:reading-mode`, 'summary');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const codeOrigin = useRef<{ mode: BriefingReadingMode; element: HTMLElement | null } | null>(null);
  const groupRefs = useRef(new Map<string, HTMLButtonElement>());
  const evidenceRef = useRef<HTMLElement>(null);
  const patchRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const [pickerRequest, setPickerRequest] = useState(0);
  const docs = useMemo(() => vault.manifest?.docs ?? [], [vault.manifest]);
  const projects = docs.filter(doc => doc.frontmatter.kind === 'project');
  const project = sourceChoice ? '' : projects.some(doc => doc.slug === projectChoice) ? projectChoice : projects[0]?.slug ?? '';
  const range = briefingRange(period, anchor, custom.from, custom.to);
  const invalidDraft = period === 'custom' && !briefingRange('custom', anchor, from, to);
  const root = native ? sourceChoice ?? (vault.handle && project ? getTauriVaultRootPath(vault.handle) ?? null : null) : null;
  const { data, loading, error, refresh } = useBriefing(root, project, range, vault.lastLoadedAt);
  const grouped = data && mode === 'code' ? groupBriefing(data.commits, sourceChoice ? [] : docs, locale, project) : null;
  const scopeKey = JSON.stringify([root, project, range?.startEpoch, range?.endEpoch, data?.snapshot, data?.head, data?.base, data?.tip]);
  const current = data && selection?.scope === scopeKey ? selection : null;
  const selected = grouped?.groups.find(group => group.id === current?.group);
  const areas = selected?.id === 'unmapped' ? groupSourceAreas(selected) : [];
  const readingGroup = areas.find(area => area.id === current?.area) ?? selected;
  const title = (slug: string) => {
    const doc = projects.find(item => item.slug === slug);
    const display = doc?.frontmatter[`display_${locale}`];
    return typeof display === 'string' ? display : doc?.title ?? slug;
  };
  const [positions, setPositions] = useArrivalMemory<Partial<Record<BriefingReadingMode, number>>>(`${memory}:${range?.startEpoch}:${range?.endEpoch}:scroll`, {});
  const repositoryMemory = data ? `${JSON.stringify(['source-narrative', data.sourceRoot, data.snapshot, range ? `${range.start} – ${range.end}` : ''])}:repository` : null;
  const [repository, setRepository] = useArrivalMemory(repositoryMemory, '');
  const codeHeadingRef = useRef<HTMLHeadingElement>(null);
  function changeMode(next: BriefingReadingMode) {
    if (next === mode) return;
    setPositions({ ...positions, [mode]: mainRef.current?.scrollTop ?? 0 });
    setMode(next);
    requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = positions[next] ?? 0; });
  }
  function openCode() {
    codeOrigin.current = { mode, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    changeMode('code');
    requestAnimationFrame(() => { codeHeadingRef.current?.focus(); codeHeadingRef.current?.scrollIntoView({ block: 'start' }); });
  }
  function closeCode() {
    const origin = codeOrigin.current;
    changeMode(origin?.mode === 'sources' ? 'sources' : 'summary');
    requestAnimationFrame(() => {
      if (origin?.element?.isConnected && !origin.element.closest('[hidden]')) origin.element.focus();
      else modesRef.current?.querySelector<HTMLElement>('[data-testid="briefing-source-browser"]')?.focus();
    });
  }
  const entryRef = useRef<string | null>(null);
  function chooseGroup(id: string, area?: string) {
    if (!data) return;
    entryRef.current = area ? `area:${area}` : id;
    setSelection({ scope: scopeKey, group: id, area: area ?? null, path: null });
    setRows({ files: 40, commits: 40, net: 40 });
    requestAnimationFrame(() => { evidenceRef.current?.focus(); evidenceRef.current?.scrollIntoView({ block: 'start' }); });
  }
  function back() {
    if (current) groupRefs.current.get(entryRef.current ?? current.group)?.focus();
  }
  function choosePath(path: string, direction?: 'previous' | 'next') {
    if (!data || !selected) return;
    setPickerRequest(0);
    setSelection({ scope: scopeKey, group: selected.id, area: current?.area ?? null, path });
    requestAnimationFrame(() => {
      const action = direction ? patchRef.current?.querySelector<HTMLButtonElement>(`[data-file-direction="${direction}"]`) : null;
      if (action && !action.disabled) action.focus({ preventScroll: true });
      else patchRef.current?.focus({ preventScroll: true });
      patchRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  function openFilePicker() {
    const index = readingGroup?.paths.indexOf(current?.path ?? '') ?? -1;
    setRows({ ...rows, files: Math.max(rows.files, Math.ceil((index + 1) / 40) * 40) });
    setPickerRequest(value => value + 1);
    requestAnimationFrame(() => {
      const selectedFile = filesRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      (selectedFile ?? filesRef.current?.querySelector<HTMLElement>('button'))?.focus({ preventScroll: true });
      selectedFile?.scrollIntoView({ block: 'center' });
      if (!selectedFile) filesRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  function showMore(kind: keyof typeof rows, event: MouseEvent<HTMLButtonElement>) {
    const container = event.currentTarget.parentElement;
    const before = rows[kind];
    setRows({ ...rows, [kind]: rows[kind] + 40 });
    requestAnimationFrame(() => container?.querySelectorAll<HTMLElement>(kind === 'commits' ? 'li' : '[data-control="row"]')[before]?.focus({ preventScroll: true }));
  }
  const validData = data && (data.status === 'measured' || data.status === 'partial');
  const status = !native ? 'webTitle' : !root ? null : !range ? 'invalidRange' : error ? 'readError' : loading ? 'loading' : data?.status === 'stale' ? 'stale' : data?.status === 'no-history' ? 'noHistory' : !validData ? 'sourceUnavailable' : !data.commits.length && data.status !== 'partial' ? 'empty' : null;
  return <main ref={mainRef} id="main" className="h-[calc(100%_-_var(--topology-mobile-bottom-tab-reserve))] min-h-0 overflow-y-auto bg-[color:var(--color-canvas)] pb-8 text-body text-[color:var(--color-text-primary)] lg:h-full">
    <div className="mx-auto max-w-screen-xl space-y-8 px-4 pt-6 md:px-8 md:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-[color:var(--color-border-soft)] pb-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3"><h1 tabIndex={-1} className="text-title font-[var(--font-weight-strong)]">{git('title')}</h1><span className={badgeClass({ shape: 'tag' })}>{t('prototype')}</span></div>
          {native && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant={root ? 'ghost' : 'primary'} size="sm" aria-label={git(root ? 'changeRepository' : 'chooseRepository')} onClick={() => { void pickTauriSourceDirectory(git('chooseRepository')).then(path => { if (path) { setSourceChoice(path); setMode('summary'); refresh(); } }); }}>{(sourceChoice ?? data?.sourceRoot)?.split('/').at(-1) || git('chooseRepository')}</Button>}
          {!root && <p className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{git('sourcePrompt')}</p>}
        </div>
      {native && root && <section aria-label={t('period')} className="flex min-w-0 flex-wrap items-end gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select ariaLabel={t('period')} value={period} onChange={value => setPeriod(value as BriefingPeriod)} options={PERIODS.map(value => ({ value, label: t(value) }))} />
          {period !== 'custom' ? <Input label={t('anchorDate')} type="date" value={anchor} onChange={event => setAnchor(event.target.value)} /> : <>
            <Input label={t('startDate')} type="date" value={from} onChange={event => setFrom(event.target.value)} />
            <Input label={t('endDate')} type="date" value={to} onChange={event => setTo(event.target.value)} error={invalidDraft ? t('invalidRange') : undefined} />
            <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={() => { if (!invalidDraft) setCustom({ from, to }); }}>{t('apply')}</Button>
          </>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {period !== 'custom' && <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('previous')} onClick={() => setAnchor(movePeriod(period, anchor, -1))}><ChevronLeft size={16} /></IconButton>}
            <h2 data-testid="briefing-range" className="text-title font-[var(--font-weight-strong)]">{range ? period === 'day' ? range.start : t('range', { start: range.start, end: range.end }) : t('invalidRange')}</h2>
            {period !== 'custom' && <><IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('next')} onClick={() => setAnchor(movePeriod(period, anchor, 1))}><ChevronRight size={16} /></IconButton><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={() => setAnchor(localDate(new Date()))}>{t('today')}</Button></>}
          </div>
          <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={refresh}><RefreshCw size={16} />{t('refresh')}</Button>
        </div>
      </section>}
        {native && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" data-testid="briefing-settings" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setSettingsOpen(true); }}><Settings2 size={16} aria-hidden />{git('briefingSettings')}</Button>}
      </header>
      {native && root && <div ref={modesRef} className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<BriefingReadingMode> ariaLabel={git('readingModes')} value={mode} onChange={changeMode} options={[
          { value: 'summary', label: git('summaryMode'), testId: 'briefing-summary-mode' },
          { value: 'sources', label: git('sourcesMode'), testId: 'briefing-originals' },
          { value: 'code', label: git('codeMode'), testId: 'briefing-source-browser' },
        ]} />
      </div>}
      {status && <section role="status" data-testid="briefing-status" className="space-y-3 py-6">
        <h2 className="text-title font-[var(--font-weight-strong)]">{t(status)}</h2>
        {!native && <><p className="text-[color:var(--color-text-secondary)]">{git('webBody')}</p><div className="flex flex-wrap gap-3"><Link href="/download/" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}><Download size={16} aria-hidden /><span>{nav('getApp')}</span></Link></div></>}
        {status === 'empty' && <p>{t('emptyHint')}</p>}
        {native && status === 'sourceUnavailable' && <div className="flex flex-wrap gap-3"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={() => { void pickTauriSourceDirectory(t('repository')).then(path => { if (path) { setSourceChoice(path); refresh(); } }); }}>{t('retry')}</Button><Link className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })} href="/projects/">{t('openProjects')}</Link></div>}
        {native && (status === 'readError' || status === 'stale' || status === 'noHistory') && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={refresh}>{t('retry')}</Button>}
      </section>}
      {validData && <>
        {data.status === 'partial' && <div role="status" className="space-y-1 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-[color:var(--color-status-warning)]"><p>{t('partial')}</p><p className="text-body">{t('limit', { limit: data.limit })}</p></div>}
        {data.commits.length > 0 && <BriefingNarrative key={scopeKey} data={data} clearedAt={clearedAt} period={range ? `${range.start} – ${range.end}` : ''} mode={mode} onMode={changeMode} repository={repository} setRepository={setRepository} onReadCode={openCode} />}
      </>}
      {native && <div className="space-y-4 [&>.ai-row-disclosure]:overflow-clip">
        {validData && <section hidden={mode !== 'code'} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 ref={codeHeadingRef} tabIndex={-1} data-testid="briefing-code-heading" className="text-title font-[var(--font-weight-strong)]">{git('readPeriodCode')}</h2>
              <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={closeCode}>{git('closeCode')}</Button>
            </div>
          {grouped && <>
        <Disclosure animated summary={t('readBasis')} summaryTestId="briefing-read-basis">
          <section aria-label={t('repository')} className="space-y-2 py-3">
          {!sourceChoice && <Select ariaLabel={t('project')} value={project} onChange={setProjectChoice} options={projects.map(doc => ({ value: doc.slug, label: title(doc.slug) }))} />}

            <p className="break-all text-body">{t('repository')}: {data.sourceRoot} · {t('head', { hash: data.head.slice(0, 8) })}</p>
            <p className="text-body text-[color:var(--color-text-secondary)]">{t('scope')}</p>
            <p className="text-body text-[color:var(--color-text-secondary)]">{t('timezone', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}</p>
          </section>
        </Disclosure>
        {data.commits.length > 0 && <section className="space-y-8" data-testid="briefing-ready">
          <BriefingOverview sourceOnly={Boolean(sourceChoice)} grouped={grouped} commits={data.commits.length} selected={selected?.id} area={current?.area} groupRefs={groupRefs} onChoose={chooseGroup} />
          <div className="space-y-6">
            <section ref={evidenceRef} tabIndex={-1} aria-label={t('evidence')} className="min-w-0 space-y-4 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
              {!selected ? <p className="text-[color:var(--color-text-secondary)]">{t('selectGroup')}</p> : <>
                <p className="text-label font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]">{t('evidenceStep')}</p>
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="break-all text-display font-[var(--font-weight-strong)]">{current?.area && readingGroup ? (readingGroup.id === '.' ? t('rootFiles') : readingGroup.title) : selected.id === 'unmapped' ? (sourceChoice ? git('sourceHeading') : t('unmapped')) : selected.title}</h2><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={back}>{t('back')}</Button></div>
                {readingGroup && <p className="text-body text-[color:var(--color-text-secondary)]">{t('groupCounts', { commits: readingGroup.commits.length, files: readingGroup.paths.length })}</p>}
                {selected.id === 'unmapped' ? <div className="space-y-3">{!sourceChoice && <p>{t('unmappedHint')}</p>}<Disclosure animated key={current?.area ?? 'all'} open={!current?.area} summary={t('sourceAreas')}>{!sourceChoice && <p className="text-body text-[color:var(--color-text-secondary)]">{t('sourceAreaNote')}</p>}<div className="flex flex-wrap gap-2"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" aria-pressed={!current?.area} onClick={() => { setSelection({ scope: scopeKey, group: selected.id, area: null, path: null }); setRows({ files: 40, commits: 40, net: 40 }); }}>{t('allUnmapped')}</Button>{areas.map(area => <Button className="atlas-touch-floor atlas-touch-floor-wide" key={area.id} variant={current?.area === area.id ? 'outline' : 'ghost'} size="sm" aria-pressed={current?.area === area.id} onClick={() => { setSelection({ scope: scopeKey, group: selected.id, area: area.id, path: null }); setRows({ files: 40, commits: 40, net: 40 }); }}>{area.id === '.' ? t('rootFiles') : area.title} · {area.paths.length}</Button>)}</div></Disclosure></div> : <Link href={`/topology/?p=${encodeURIComponent(translateOntologyDeeplinkToTopologyParam(selected.id))}`} className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}>{t('openConcept')}</Link>}


                <div ref={filesRef}><Disclosure animated key={`${current?.path ?? 'file-list'}:${pickerRequest}`} open={!current?.path || pickerRequest > 0} summary={t('paths')} summaryTestId="briefing-touched-files"><section className="space-y-2"><p className="text-body text-[color:var(--color-text-secondary)]">{t('patchSelect')}</p><div className="space-y-1">{readingGroup?.paths.slice(0, rows.files).map(path => <RowButton key={path} active={current?.path === path} aria-pressed={current?.path === path} aria-label={`${t('patchAction')}: ${path}`} onClick={() => choosePath(path)}><span className="break-all py-1 text-body">{path}</span></RowButton>)}{readingGroup && readingGroup.paths.length > rows.files && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={event => showMore('files', event)}>{t('showMoreFiles', { count: Math.min(40, readingGroup.paths.length - rows.files) })}</Button>}</div></section></Disclosure></div>
                {current?.path && root && <div ref={patchRef} tabIndex={-1}><BriefingPatch key={`${project}:${data.head}:${data.base}:${data.tip}:${current.path}`} root={root} project={project} data={data} path={current.path} paths={readingGroup?.paths ?? []} onNavigate={choosePath} onChooseFile={openFilePicker} /></div>}

                <Disclosure animated summary={t('netComparison')} summaryTestId="briefing-comparison"><section className="space-y-2"><p className="text-body text-[color:var(--color-text-secondary)]">{t('comparisonScope')}</p><p className="break-all text-body">{t('comparisonBasis', { before: data.base?.slice(0, 8) ?? t('initialTree'), after: data.tip?.slice(0, 8) ?? '' })}</p><p className="text-body text-[color:var(--color-text-secondary)]">{t('comparisonNote')}</p><p>{data.netPaths === null ? t('netUnavailable') : !data.netPaths.length ? t('netEmpty') : t('netFiles', { count: data.netPaths.length })}</p>{data.netPaths && data.netPaths.length > 0 && <Disclosure animated summary={t('paths')} summaryTestId="briefing-net-paths"><div className="space-y-1 pb-2">{data.netPaths.slice(0, rows.net).map(path => <RowButton key={path} aria-label={`${t('patchAction')}: ${path}`} onClick={() => choosePath(path)}><span className="break-all py-1 text-body">{path}</span></RowButton>)}{data.netPaths.length > rows.net && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={event => showMore('net', event)}>{t('showMoreFiles', { count: Math.min(40, data.netPaths.length - rows.net) })}</Button>}</div></Disclosure>}</section></Disclosure>
                <section className="space-y-2 border-t border-[color:var(--color-border-soft)] pt-4"><h3 className="text-body font-[var(--font-weight-strong)]">{t('commits')}</h3><p className="text-body text-[color:var(--color-text-secondary)]">{t('commitAttribution')}</p><ul className="space-y-3">{readingGroup?.commits.slice(0, rows.commits).map(commit => <li tabIndex={-1} key={commit.hash} className="break-words text-body"><code className="text-label text-[color:var(--color-text-secondary)]">{commit.hash.slice(0, 8)}</code> {commit.message ? <Disclosure animated summary={commit.subject}><div>{commit.messageComplete === false && <p className="text-body text-[color:var(--color-status-warning)]">{git('sourceUnavailableInline')}</p>}<pre className="whitespace-pre-wrap break-words py-3 font-mono text-body">{commit.message}</pre></div></Disclosure> : commit.subject}</li>)}</ul>{readingGroup && readingGroup.commits.length > rows.commits && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={event => showMore('commits', event)}>{t('showMoreCommits', { count: Math.min(40, readingGroup.commits.length - rows.commits) })}</Button>}</section>
              </>}
            </section>
          </div>
        </section>}
          </>}
          </section>}
        </div>}
      {native && <BriefingSettings showFolderEntry={!vault.handle} open={settingsOpen} close={() => setSettingsOpen(false)} repository={repository} onCleared={() => setClearedAt(Date.now())} />}
    </div>
  </main>;
}
