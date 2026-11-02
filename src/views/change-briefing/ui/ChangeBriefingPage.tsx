'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Download, RefreshCw, Settings2 } from 'lucide-react';
import { useLocalVault, useVaultSessionIdentityScope } from '@/entities/vault-session';
import { translateOntologyDeeplinkToTopologyParam } from '@/entities/knowledge-graph';
import { Link } from '@/i18n/navigation';
import { isGitBridgeAvailable } from '@/shared/lib/git/tauri-git';
import { useArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory';
import { readArrivalMemory, writeArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory-store';
import { getTauriVaultRootPath, pickTauriSourceDirectory } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { Button, Dialog, Disclosure, IconButton, PageHeaderBar, RowButton, Select } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';
import { controlClass } from '@/shared/ui/control-class';
import { badgeClass } from '@/shared/ui/badge-class';
import { PAGE_TITLE, PAGE_FRAME_FORM, PAGE_STAGE_FILL } from '@/shared/ui/tokens/page-frame';
import { briefingRange, groupBriefing, groupSourceAreas, localDate, movePeriod, type BriefingPeriod } from '../model/briefing-model';
import { useBriefing } from '../model/use-briefing';
import { BriefingPatch } from './BriefingPatch';
import { BriefingFileList } from './BriefingFileList';
import { BriefingOriginFiles } from './BriefingOriginFiles';
import { BriefingNarrative, type BriefingReadingMode } from './BriefingNarrative';
import { BriefingSettings } from './BriefingSettings';
import { BriefingOverview } from './BriefingOverview';
import { CommitInventory } from './CommitInventory';
import { BriefingRepositoryStage } from './BriefingRepositoryStage';
import { PublicPullInventory } from './PublicPullInventory';

const subscribe = () => () => {};
const webSnapshot = () => false;
const PERIODS: BriefingPeriod[] = ['day', 'week', 'month', 'year', 'custom'];
type BriefingSection = 'prs' | 'commits' | 'files' | 'mixed';

export function ChangeBriefingPage() {
  const t = useTranslations('changeBriefing');
  const git = useTranslations('gitBriefing');
  const review = useTranslations('prBriefing');
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
  const [custom, setCustom] = useArrivalMemory<{ from: string; to: string } | null>(memory && `${memory}:custom`, null);
  const [projectChoice, setProjectChoice] = useArrivalMemory(memory && `${memory}:project`, '');
  const [selection, setSelection] = useArrivalMemory<{ scope: string; group: string; area: string | null; path: string | null } | null>(memory && `${memory}:selection`, null);
  const [rows, setRows] = useArrivalMemory(memory && `${memory}:rows`, { files: 40, net: 40 });
  const [mode, setMode] = useArrivalMemory<BriefingReadingMode>(`${memory}:reading-mode`, 'summary');
  const [section, setSection] = useArrivalMemory<BriefingSection>(`${memory}:review-section`, 'prs');
  const [publicRead, setPublicRead] = useState<AbortController | null>(null);
  const [commitActivity, setCommitActivity] = useState<{ busy: string; stop: () => void } | null>(null);
  const [mixedActivity, setMixedActivity] = useState<{ busy: string; stop: () => void } | null>(null);
  const [returnToExplanation, setReturnToExplanation] = useState(false);
  const [fileOrigin, setFileOrigin] = useState<{ scope: string; kind: 'prs' | 'commits'; paths: string[]; element: HTMLElement | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [coverageSeat, setCoverageSeat] = useState<HTMLDivElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);
  const mixedEntryRef = useRef<HTMLButtonElement>(null);
  const mixedHeadingRef = useRef<HTMLHeadingElement>(null);
  const codeOrigin = useRef<{ mode: BriefingReadingMode; section: BriefingSection; element: HTMLElement | null } | null>(null);
  const groupRefs = useRef(new Map<string, HTMLButtonElement>());
  const evidenceRef = useRef<HTMLElement>(null);
  const patchRef = useRef<HTMLDivElement>(null);
  const filesRef = useRef<HTMLDivElement>(null);
  const layoutMarkerRef = useRef<HTMLSpanElement>(null);
  const fileScrollPositions = useRef(readArrivalMemory<Map<string, number>>('source-briefing:file-scrolls') ?? new Map<string, number>());
  const fileLimits = useRef(readArrivalMemory<Map<string, number>>('source-briefing:file-limits') ?? new Map<string, number>());
  const [showNarrowFiles, setShowNarrowFiles] = useState(false);
  const docs = useMemo(() => vault.manifest?.docs ?? [], [vault.manifest]);
  const projects = docs.filter(doc => doc.frontmatter.kind === 'project');
  const project = sourceChoice ? '' : projects.some(doc => doc.slug === projectChoice) ? projectChoice : projects[0]?.slug ?? '';
  const range = briefingRange(period, anchor, custom?.from, custom?.to);
  const invalidDraft = period === 'custom' && !briefingRange('custom', anchor, from, to);
  const root = native ? sourceChoice ?? (vault.handle && project ? getTauriVaultRootPath(vault.handle) ?? null : null) : null;
  const { data, loading, error, refresh } = useBriefing(root, project, range, vault.lastLoadedAt);
  const grouped = data && section === 'files' ? groupBriefing(data.commits, sourceChoice ? [] : docs, locale, project) : null;
  const scopeKey = JSON.stringify([root, project, range?.startEpoch, range?.endEpoch, data?.snapshot, data?.head, data?.base, data?.tip]);
  const activeFileOrigin = fileOrigin?.scope === scopeKey ? fileOrigin : null;
  const [commitExplain, setCommitExplain] = useArrivalMemory(`${scopeKey}:commit-explain`, false);
  const [commitExplainStarted, setCommitExplainStarted] = useArrivalMemory(`${scopeKey}:commit-explain-started`, false);
  const [mixedStarted, setMixedStarted] = useArrivalMemory(`${scopeKey}:mixed-started`, false);
  const current = data && selection?.scope === scopeKey ? selection : null;
  const selected = grouped?.groups.find(group => group.id === current?.group);
  const areas = selected?.id === 'unmapped' ? groupSourceAreas(selected) : [];
  const readingGroup = areas.find(area => area.id === current?.area) ?? selected;
  const selectedGroup = selected?.id;
  useEffect(() => {
    const marker = layoutMarkerRef.current;
    if (!marker || !current?.path || section !== 'files') return;
    let wide = marker.getBoundingClientRect().width === 0;
    let owner: 'files' | 'back' | 'patch' | null = null;
    const updateOwner = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement) || target === document.body) return;
      owner = filesRef.current?.contains(target) ? 'files' : target.hasAttribute('data-return-files') ? 'back' : patchRef.current?.contains(target) ? 'patch' : null;
    };
    const rememberFocus = (event: FocusEvent) => updateOwner(event.target);
    updateOwner(document.activeElement);
    document.addEventListener('focusin', rememberFocus);
    const observer = new ResizeObserver(() => {
      const nextWide = marker.getBoundingClientRect().width === 0;
      if (wide === nextWide) return;
      wide = nextWide;
      if (!wide && !showNarrowFiles && owner === 'files') {
        patchRef.current?.querySelector<HTMLButtonElement>('[data-return-files]')?.focus({ preventScroll: true });
      } else if ((wide && owner === 'back') || (!wide && showNarrowFiles && (owner === 'patch' || owner === 'back'))) {
        (filesRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? filesRef.current?.querySelector<HTMLElement>('input[type="search"]'))?.focus({ preventScroll: true });
      }
    });
    observer.observe(marker);
    return () => { observer.disconnect(); document.removeEventListener('focusin', rememberFocus); };
  }, [selectedGroup, current?.path, section, showNarrowFiles]);
  const [fileQueries, setFileQueries] = useArrivalMemory<Record<string, string>>(`${memory}:${range?.startEpoch}:${range?.endEpoch}:file-queries`, {});
  const queryKey = JSON.stringify([scopeKey, selected?.id ?? '', current?.area ?? '']);
  const fileQuery = fileQueries[queryKey] ?? '';
  const needle = fileQuery.trim().toLowerCase();
  const matchingPaths = (readingGroup?.paths ?? []).filter(path => !needle || path.toLowerCase().includes(needle));
  const title = (slug: string) => {
    const doc = projects.find(item => item.slug === slug);
    const display = doc?.frontmatter[`display_${locale}`];
    return typeof display === 'string' ? display : doc?.title ?? slug;
  };
  const [positions, setPositions] = useArrivalMemory<Partial<Record<BriefingReadingMode, number>>>(`${memory}:${range?.startEpoch}:${range?.endEpoch}:scroll`, {});
  const explanationMode = mode === 'code' ? 'summary' : mode;
  const repositoryMemory = data ? `${JSON.stringify(['source-narrative', data.sourceRoot, data.snapshot, range ? `${range.start} – ${range.end}` : ''])}:repository` : null;
  const [repository, setRepository] = useArrivalMemory(repositoryMemory, '');
  const codeHeadingRef = useRef<HTMLHeadingElement>(null);
  function changePeriod(next: BriefingPeriod) {
    if (next === 'custom' && !custom) {
      const initial = { from: range?.start ?? anchor, to: range?.end ?? anchor };
      setFrom(initial.from);
      setTo(initial.to);
      setCustom(initial);
    }
    setPeriod(next);
    setDatesOpen(next === 'custom');
  }
  function changeMode(next: BriefingReadingMode) {
    if (next === mode) return;
    setPositions({ ...positions, [mode]: mainRef.current?.scrollTop ?? 0 });
    setMode(next);
    requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = positions[next] ?? 0; });
  }
  function changeSection(next: BriefingSection) {
    if (next !== 'files') setFileOrigin(null);
    setSection(next);
    if (next === 'files') { setReturnToExplanation(false); changeMode('code'); }
    else if ((next === 'commits' || next === 'mixed') && mode === 'code') changeMode(codeOrigin.current?.mode === 'sources' ? 'sources' : 'summary');
  }
  function openOriginalFiles(kind: 'prs' | 'commits', paths: string[]) {
    setFileOrigin({ scope: scopeKey, kind, paths: [...new Set(paths)], element: document.activeElement instanceof HTMLElement ? document.activeElement : null });
    setReturnToExplanation(false);
    setSection('files');
    changeMode('code');
    requestAnimationFrame(() => mainRef.current?.querySelector<HTMLElement>('[data-origin-files-heading]')?.focus());
  }
  function returnToOriginal() {
    const origin = activeFileOrigin;
    if (!origin) return;
    setFileOrigin(null);
    setSection(origin.kind);
    changeMode('summary');
    requestAnimationFrame(() => {
      if (origin.element?.isConnected && !origin.element.closest('[hidden]')) origin.element.focus();
      else modesRef.current?.querySelector<HTMLElement>(`[data-testid="briefing-${origin.kind}"]`)?.focus({ preventScroll: true });
    });
  }
  function openCode() {
    codeOrigin.current = { mode, section, element: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    setReturnToExplanation(true);
    setSection('files');
    changeMode('code');
    requestAnimationFrame(() => { codeHeadingRef.current?.focus(); codeHeadingRef.current?.scrollIntoView({ block: 'start' }); });
  }
  function closeCode() {
    const origin = codeOrigin.current;
    setSection(origin?.section === 'mixed' ? 'mixed' : 'commits');
    changeMode(origin?.mode === 'sources' ? 'sources' : 'summary');
    codeOrigin.current = null;
    setReturnToExplanation(false);
    requestAnimationFrame(() => {
      if (origin?.element?.isConnected && !origin.element.closest('[hidden]')) origin.element.focus();
      else modesRef.current?.querySelector<HTMLElement>('[data-testid="briefing-source-browser"]')?.focus();
    });
  }
  function refreshCode() {
    modesRef.current?.querySelector<HTMLElement>('[data-testid="briefing-source-browser"]')?.focus({ preventScroll: true });
    if (mainRef.current) mainRef.current.scrollTop = 0;
    refresh();
  }
  const entryRef = useRef<string | null>(null);
  function chooseGroup(id: string, area?: string) {
    if (!data) return;
    entryRef.current = area ? `area:${area}` : id;
    setSelection({ scope: scopeKey, group: id, area: area ?? null, path: null });
    setShowNarrowFiles(false);
    setRows({ files: fileLimits.current.get(JSON.stringify([scopeKey, id, area ?? ''])) ?? 40, net: 40 });
    requestAnimationFrame(() => { evidenceRef.current?.focus(); evidenceRef.current?.scrollIntoView({ block: 'start' }); });
  }
  function back() {
    if (!current) return;
    const target = entryRef.current ?? (current.area ? 'area:' + current.area : current.group);
    const group = current.group;
    setSelection(null);
    requestAnimationFrame(() => (groupRefs.current.get(target) ?? groupRefs.current.get(group))?.focus());
  }
  function chooseArea(area: string | null) {
    if (!selected) return;
    setSelection({ scope: scopeKey, group: selected.id, area, path: null });
    setRows({ files: fileLimits.current.get(JSON.stringify([scopeKey, selected.id, area ?? ''])) ?? 40, net: 40 });
    setShowNarrowFiles(false);
  }
  function revealSelectedFile() {
    const list = filesRef.current?.querySelector<HTMLElement>('[data-testid="briefing-file-list"]');
    const selectedFile = list?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!list || !selectedFile) return;
    const bounds = list.getBoundingClientRect();
    const row = selectedFile.getBoundingClientRect();
    if (row.top < bounds.top) list.scrollTop += row.top - bounds.top;
    else if (row.bottom > bounds.bottom) list.scrollTop += row.bottom - bounds.bottom;
  }
  function changeFileQuery(value: string) {
    const query = value.trim().toLowerCase();
    const matches = (readingGroup?.paths ?? []).filter(path => !query || path.toLowerCase().includes(query));
    const index = matches.indexOf(current?.path ?? '');
    const limit = Math.max(40, Math.ceil((index + 1) / 40) * 40);
    setFileQueries({ ...fileQueries, [queryKey]: value });
    fileLimits.current.set(queryKey, limit);
    writeArrivalMemory('source-briefing:file-limits', fileLimits.current);
    setRows({ ...rows, files: limit });
    fileScrollPositions.current.set(queryKey, 0);
    const list = filesRef.current?.querySelector<HTMLElement>('[data-testid="briefing-file-list"]');
    if (list) list.scrollTop = 0;
    if (!query && index >= 0) requestAnimationFrame(revealSelectedFile);
  }
  function choosePath(path: string, direction?: 'previous' | 'next') {
    if (!data || !selected) return;
    setShowNarrowFiles(false);
    const index = matchingPaths.indexOf(path);
    if (index >= rows.files) {
      const limit = Math.ceil((index + 1) / 40) * 40;
      fileLimits.current.set(queryKey, limit);
      writeArrivalMemory('source-briefing:file-limits', fileLimits.current);
      setRows({ ...rows, files: limit });
    }
    setSelection({ scope: scopeKey, group: selected.id, area: current?.area ?? null, path });
    requestAnimationFrame(() => {
      revealSelectedFile();
      const action = direction ? patchRef.current?.querySelector<HTMLButtonElement>(`[data-file-direction="${direction}"]`) : null;
      if (action && !action.disabled) action.focus({ preventScroll: true });
      else patchRef.current?.focus({ preventScroll: true });
      patchRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  function openFilePicker() {
    const index = matchingPaths.indexOf(current?.path ?? '');
    const limit = Math.max(rows.files, Math.ceil((index + 1) / 40) * 40);
    fileLimits.current.set(queryKey, limit);
    writeArrivalMemory('source-briefing:file-limits', fileLimits.current);
    setRows({ ...rows, files: limit });
    setShowNarrowFiles(true);
    requestAnimationFrame(() => {
      const selectedFile = filesRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
      (selectedFile ?? filesRef.current?.querySelector<HTMLElement>('button') ?? filesRef.current?.querySelector<HTMLElement>('input[type="search"]'))?.focus({ preventScroll: true });
      selectedFile?.scrollIntoView({ block: 'center' });
      if (!selectedFile) filesRef.current?.scrollIntoView({ block: 'start' });
    });
  }
  function showMore(kind: keyof typeof rows, event: MouseEvent<HTMLButtonElement>) {
    const container = event.currentTarget.parentElement;
    const before = rows[kind];
    if (kind === 'files') {
      fileLimits.current.set(queryKey, before + 40);
      writeArrivalMemory('source-briefing:file-limits', fileLimits.current);
    }
    setRows({ ...rows, [kind]: rows[kind] + 40 });
    requestAnimationFrame(() => container?.querySelectorAll<HTMLElement>('[data-control="row"]')[before]?.focus({ preventScroll: true }));
  }
  const validData = data && (data.status === 'measured' || data.status === 'partial');
  const status = !native ? 'webTitle' : !root ? null : !range ? 'invalidRange' : error ? 'readError' : loading ? 'loading' : data?.status === 'stale' ? 'stale' : data?.status === 'no-history' ? 'noHistory' : !validData ? 'sourceUnavailable' : !data.commits.length && data.status !== 'partial' ? 'empty' : null;
  async function chooseRepository() {
    const path = await pickTauriSourceDirectory(git('chooseRepository'));
    if (!path) {
      mainRef.current?.querySelector<HTMLButtonElement>('[data-briefing-choose]')?.focus({ preventScroll: true });
      return;
    }
    setSourceChoice(path);
    setSection('prs');
    setCommitExplain(false);
    setMode('summary');
    refresh();
  }
  if (native && !root) return <main ref={mainRef} id="main" data-briefing-surface className="flex min-h-full flex-col bg-[color:var(--color-canvas)] text-[color:var(--color-text-primary)]">
    <PageHeaderBar frame="page" title={git('title')} actions={<IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={git('briefingSettings')} data-testid="briefing-settings" onClick={() => setSettingsOpen(true)}><Settings2 size={16} aria-hidden /></IconButton>} />
    <div className={`${PAGE_FRAME_FORM} ${PAGE_STAGE_FILL}`}><BriefingRepositoryStage onChoose={() => void chooseRepository()} /></div>
    <BriefingSettings showFolderEntry={!vault.handle} open={settingsOpen} close={() => setSettingsOpen(false)} repository={repository} onCleared={() => setClearedAt(Date.now())} />
  </main>;
  return <main ref={mainRef} id="main" data-briefing-surface className="h-[calc(100%_-_var(--topology-mobile-bottom-tab-reserve))] min-h-0 overflow-y-auto bg-[color:var(--color-canvas)] pb-8 text-body text-[color:var(--color-text-primary)] lg:h-full">
    <div className="mx-auto max-w-screen-xl space-y-4 px-4 pt-6 md:px-8 md:pt-8">
      <header className="space-y-4 border-b border-[color:var(--color-border-soft)] pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <h1 tabIndex={-1} className={native ? "text-title font-[var(--font-weight-strong)]" : PAGE_TITLE}>{git('title')}</h1><span className={badgeClass({ shape: 'tag' })}>{t('prototype')}</span>
          {native && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant={root ? 'ghost' : 'primary'} size="sm" aria-label={git(root ? 'changeRepository' : 'chooseRepository')} onClick={() => void chooseRepository()}>{(sourceChoice ?? data?.sourceRoot)?.split('/').at(-1) || git('chooseRepository')}</Button>}
        </div>
        {native && <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={git('briefingSettings')} data-testid="briefing-settings" onClick={event => { event.currentTarget.focus({ preventScroll: true }); setSettingsOpen(true); }}><Settings2 size={16} aria-hidden /></IconButton>}
        </div>
        {!root && <p className="max-w-prose text-body text-[color:var(--color-text-secondary)]">{git('sourcePrompt')}</p>}
      {native && root && <section aria-label={t('period')} className="flex min-w-0 flex-wrap items-center gap-2">
        <Select size="md" className="max-[769px]:[&>button]:min-h-11" ariaLabel={t('period')} value={period} onChange={value => changePeriod(value as BriefingPeriod)} options={PERIODS.map(value => ({ value, label: t(value) }))} />
        <div className="flex min-h-8 min-w-0 items-center gap-1 rounded-chip border border-[color:var(--color-border-soft)] px-1">
          {period !== 'custom' && <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('previous')} onClick={() => setAnchor(movePeriod(period, anchor, -1))}><ChevronLeft size={16} /></IconButton>}
          <h2 data-testid="briefing-range" className="min-w-0 break-words text-body font-[var(--font-weight-strong)]">{range ? period === 'day' ? range.start : t('range', { start: range.start, end: range.end }) : t('invalidRange')}</h2>
          {period !== 'custom' && <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('next')} onClick={() => setAnchor(movePeriod(period, anchor, 1))}><ChevronRight size={16} /></IconButton>}
          <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('chooseDates')} aria-haspopup="dialog" aria-expanded={datesOpen} onClick={event => { event.currentTarget.focus({ preventScroll: true }); setDatesOpen(true); }}><CalendarDays size={16} /></IconButton>
        </div>
        {period !== 'custom' && <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('today')} onClick={() => setAnchor(localDate(new Date()))}><CalendarCheck size={16} /></IconButton>}
        <IconButton className="atlas-touch-floor atlas-touch-floor-wide" label={t('refresh')} onClick={refresh}><RefreshCw size={16} /></IconButton>
      </section>}
      </header>
      <Dialog open={datesOpen} onClose={() => setDatesOpen(false)} aria-label={t('chooseDates')} size="sm" testId="briefing-dates-dialog">
        <div className="space-y-5">
          <h2 className="text-title font-[var(--font-weight-strong)]">{t('chooseDates')}</h2>
          {period !== 'custom' ? <Input label={t('anchorDate')} type="date" value={anchor} onChange={event => setAnchor(event.target.value)} /> : <>
            <Input label={t('startDate')} type="date" value={from} onChange={event => setFrom(event.target.value)} />
            <Input label={t('endDate')} type="date" value={to} onChange={event => setTo(event.target.value)} error={invalidDraft ? t('invalidRange') : undefined} />
          </>}
          <div className="flex justify-end gap-2">
            <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={() => setDatesOpen(false)}>{t('closeDates')}</Button>
            {period === 'custom' && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="primary" size="sm" onClick={() => { if (!invalidDraft) { setCustom({ from, to }); setDatesOpen(false); } }}>{t('apply')}</Button>}
          </div>
        </div>
      </Dialog>
      {native && root && <div ref={modesRef} className="flex flex-wrap items-center justify-between gap-3">
        {section !== 'mixed' ? <SegmentedControl<Exclude<BriefingSection, 'mixed'>> className="max-[769px]:[&_[role=radio]]:min-h-11 max-[769px]:[&_[role=radio]]:min-w-11" ariaLabel={git('readingModes')} value={section} onChange={changeSection} options={[
          { value: 'prs', label: review('prTab'), testId: 'briefing-prs' },
          { value: 'commits', label: review('commitsTab'), testId: 'briefing-commits' },
          { value: 'files', label: review('filesTab'), testId: 'briefing-source-browser' },
        ]} /> : <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="ghost" size="sm" onClick={() => { changeSection('prs'); requestAnimationFrame(() => mixedEntryRef.current?.focus({ preventScroll: true })); }}>{review('backToPrs')}</Button>}
        {validData && data.commits.length > 0 && section !== 'mixed' && <Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="ghost" size="sm" data-testid="briefing-mixed" ref={mixedEntryRef} onClick={() => { setMixedStarted(true); changeSection('mixed'); requestAnimationFrame(() => mixedHeadingRef.current?.focus({ preventScroll: true })); }}>{review('previousCombined')}</Button>}
        <div hidden={!(section === 'mixed' || (section === 'commits' && commitExplain))} ref={setCoverageSeat} />
      </div>}
      {publicRead && section !== 'prs' && <div role="status" className="flex flex-wrap items-center gap-3"><p>{review('prLoading')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" onClick={() => publicRead.abort()}>{git('stop')}</Button></div>}
      {commitActivity && (section !== 'commits' || !commitExplain) && <div role="status" className="flex flex-wrap items-center gap-3"><p>{review('commitRunning')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" disabled={commitActivity.busy === 'cancelling'} onClick={commitActivity.stop}>{git('stop')}</Button></div>}
      {mixedActivity && section !== 'mixed' && <div role="status" className="flex flex-wrap items-center gap-3"><p>{review('combinedRunning')}</p><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="outline" size="sm" disabled={mixedActivity.busy === 'cancelling'} onClick={mixedActivity.stop}>{git('stop')}</Button></div>}
      {status && !(status === 'empty' && (section === 'prs' || activeFileOrigin)) && <section role="status" data-testid="briefing-status" className="space-y-3 py-6">
        <h2 className="text-title font-[var(--font-weight-strong)]">{t(status)}</h2>
        {!native && <><p className="text-[color:var(--color-text-secondary)]">{git('webBody')}</p><div className="flex flex-wrap gap-3"><Link href="/download/" className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}><Download size={16} aria-hidden /><span>{nav('getApp')}</span></Link></div></>}
        {status === 'empty' && <p>{t('emptyHint')}</p>}
        {native && status === 'sourceUnavailable' && <div className="flex flex-wrap gap-3"><Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={() => { void pickTauriSourceDirectory(t('repository')).then(path => { if (path) { setSourceChoice(path); refresh(); } }); }}>{t('retry')}</Button><Link className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })} href="/projects/">{t('openProjects')}</Link></div>}
        {native && (status === 'readError' || status === 'stale' || status === 'noHistory') && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" onClick={refresh}>{t('retry')}</Button>}
      </section>}
      {validData && <>
        {data.status === 'partial' && section !== 'prs' && <div role="status" className="space-y-1 rounded-panel border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-[color:var(--color-status-warning)]"><p>{t('partial')}</p><p className="text-body">{t('limit', { limit: data.limit })}</p></div>}
        <div hidden={section !== 'prs'}><PublicPullInventory data={data} memory={scopeKey} onActivity={setPublicRead} onFiles={() => openOriginalFiles('prs', data.commits.flatMap(commit => commit.paths))} /></div>
        {data.commits.length > 0 && <>
          <div hidden={section !== 'commits' || commitExplain}><CommitInventory data={data} onFiles={paths => openOriginalFiles('commits', paths)} onExplain={() => { setCommitExplainStarted(true); setCommitExplain(true); changeMode('summary'); }} /></div>
          {commitExplainStarted && <div hidden={section !== 'commits' || !commitExplain} className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><Button className="atlas-touch-floor atlas-touch-floor-wide max-[769px]:min-h-11" variant="ghost" size="sm" onClick={() => setCommitExplain(false)}>{review('backToCommits')}</Button><SegmentedControl<'summary' | 'sources'> className="max-[769px]:[&_[role=radio]]:min-h-11 max-[769px]:[&_[role=radio]]:min-w-11" ariaLabel={git('readingModes')} value={explanationMode === 'sources' ? 'sources' : 'summary'} onChange={changeMode} options={[{ value: 'summary', label: git('summaryMode') }, { value: 'sources', label: git('sourcesMode') }]} /></div><BriefingNarrative key={scopeKey} data={data} clearedAt={clearedAt} period={range ? `${range.start} – ${range.end}` : ''} mode={explanationMode} onMode={changeMode} repository={repository} setRepository={setRepository} onReadCode={openCode} coverageSeat={section === 'commits' && commitExplain ? coverageSeat : null} commitOnly onActivity={setCommitActivity} /></div>}
          {(mixedStarted || section === 'mixed') && <div hidden={section !== 'mixed'} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 ref={mixedHeadingRef} tabIndex={-1} className="text-body-lg font-[var(--font-weight-strong)]">{review('previousCombined')}</h2><p className="text-label text-[color:var(--color-text-secondary)]">{review('previousCombinedScope')}</p></div>
              <SegmentedControl<'summary' | 'sources'> className="max-[769px]:[&_[role=radio]]:min-h-11 max-[769px]:[&_[role=radio]]:min-w-11" ariaLabel={git('readingModes')} value={explanationMode === 'sources' ? 'sources' : 'summary'} onChange={changeMode} options={[{ value: 'summary', label: git('summaryMode'), testId: 'briefing-summary-mode' }, { value: 'sources', label: git('sourcesMode'), testId: 'briefing-originals' }]} />
            </div>
            <BriefingNarrative key={`mixed:${scopeKey}`} data={data} clearedAt={clearedAt} period={range ? `${range.start} – ${range.end}` : ''} mode={explanationMode} onMode={changeMode} repository={repository} setRepository={setRepository} onReadCode={openCode} coverageSeat={section === 'mixed' ? coverageSeat : null} onActivity={setMixedActivity} />
          </div>}
        </>}
      </>}
      {native && <div className="space-y-4 [&>.ai-row-disclosure]:overflow-clip">
        {validData && activeFileOrigin && section === 'files' && root && <BriefingOriginFiles key={`${scopeKey}:${activeFileOrigin.kind}`} data={data} root={root} project={project} kind={activeFileOrigin.kind} paths={activeFileOrigin.paths} onBack={returnToOriginal} onRefresh={refreshCode} />}
        {validData && <section hidden={section !== 'files' || Boolean(activeFileOrigin)} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 ref={codeHeadingRef} tabIndex={-1} data-testid="briefing-code-heading" className="text-title font-[var(--font-weight-strong)]">{git('readPeriodCode')}</h2>
              {returnToExplanation && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="outline" size="sm" onClick={closeCode}>{git('closeCode')}</Button>}
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
          <div hidden={Boolean(selected)}>
            <BriefingOverview sourceOnly={Boolean(sourceChoice)} grouped={grouped} commits={data.commits.length} selected={selected?.id} area={current?.area} groupRefs={groupRefs} onChoose={chooseGroup} />
          </div>
          {selected && readingGroup && <section ref={evidenceRef} tabIndex={-1} aria-label={t('evidence')} className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <h2 className="break-all text-title font-[var(--font-weight-strong)]">{current?.area ? (readingGroup.id === '.' ? t('rootFiles') : readingGroup.title) : selected.id === 'unmapped' ? (sourceChoice ? git('sourceHeading') : t('unmapped')) : selected.title}</h2>
                <p className="text-label text-[color:var(--color-text-secondary)]">{t('groupCounts', { commits: readingGroup.commits.length, files: readingGroup.paths.length })}</p>
                {selected.id === 'unmapped' && !sourceChoice && <p className="text-label text-[color:var(--color-text-secondary)]">{t('sourceAreaNote')}</p>}
              </div>
              <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={back}>{t('back')}</Button>
            </div>
            {selected.id === 'unmapped' && <Disclosure animated key={current?.area ?? 'all'} open={!current?.area} summary={t('sourceAreas')}>
              {!sourceChoice && <p className="text-body text-[color:var(--color-text-secondary)]">{t('sourceAreaNote')}</p>}
              <div className="flex flex-wrap gap-2">
                <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" aria-pressed={!current?.area} onClick={() => chooseArea(null)}>{t('allUnmapped')}</Button>
                {areas.map(area => <Button className="atlas-touch-floor atlas-touch-floor-wide" key={area.id} variant={current?.area === area.id ? 'outline' : 'ghost'} size="sm" aria-pressed={current?.area === area.id} onClick={() => chooseArea(area.id)}>{area.id === '.' ? t('rootFiles') : area.title} · {area.paths.length}</Button>)}
              </div>
            </Disclosure>}
            {selected.id !== 'unmapped' && <Link href={'/topology/?p=' + encodeURIComponent(translateOntologyDeeplinkToTopologyParam(selected.id))} className={controlClass({ shape: 'chip', hoverSurface: 'lift', hoverInk: 'strong' })}>{t('openConcept')}</Link>}
              <div className="@container/briefing-files min-w-0">
              <span ref={layoutMarkerRef} aria-hidden className="block h-px w-px @[56rem]/briefing-files:w-0" />
              <div className="grid min-w-0 gap-5 @[56rem]/briefing-files:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
                <div ref={filesRef} className={current?.path && !showNarrowFiles ? 'hidden min-w-0 @[56rem]/briefing-files:block' : 'min-w-0'}>
                  <BriefingFileList paths={readingGroup.paths} selected={current?.path ?? null} limit={rows.files} query={fileQuery} onQuery={changeFileQuery} viewKey={queryKey} scrollPositions={fileScrollPositions} onScrollPosition={() => writeArrivalMemory('source-briefing:file-scrolls', fileScrollPositions.current)} onChoose={choosePath} onMore={event => showMore('files', event)} />
                </div>
                <div className={!current?.path || showNarrowFiles ? 'hidden min-w-0 @[56rem]/briefing-files:block' : 'min-w-0'}>
                  {current?.path && root ? <div ref={patchRef} tabIndex={-1}><BriefingPatch key={[project, data.head, data.base, data.tip, current.path].join(':')} root={root} project={project} data={data} path={current.path} paths={matchingPaths} query={fileQuery} onNavigate={choosePath} onChooseFile={openFilePicker} onRefresh={refreshCode} /></div> : <p className="rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)] text-body text-[color:var(--color-text-secondary)]">{review('chooseFile')}</p>}
                </div>
              </div>
              </div>
              <Disclosure animated summary={t('netComparison')} summaryTestId="briefing-comparison"><section className="space-y-2"><p className="text-body text-[color:var(--color-text-secondary)]">{t('comparisonScope')}</p><p className="break-all text-body">{t('comparisonBasis', { before: data.base?.slice(0, 8) ?? t('initialTree'), after: data.tip?.slice(0, 8) ?? '' })}</p><p className="text-body text-[color:var(--color-text-secondary)]">{t('comparisonNote')}</p><p>{data.netPaths === null ? t('netUnavailable') : !data.netPaths.length ? t('netEmpty') : t('netFiles', { count: data.netPaths.length })}</p>{data.netPaths && data.netPaths.length > 0 && <Disclosure animated summary={t('paths')} summaryTestId="briefing-net-paths"><div className="space-y-1 pb-2">{data.netPaths.slice(0, rows.net).map(path => <RowButton key={path} aria-label={t('patchAction') + ': ' + path} onClick={() => choosePath(path)}><span className="break-all py-1 text-body">{path}</span></RowButton>)}{data.netPaths.length > rows.net && <Button className="atlas-touch-floor atlas-touch-floor-wide" variant="ghost" size="sm" onClick={event => showMore('net', event)}>{t('showMoreFiles', { count: Math.min(40, data.netPaths.length - rows.net) })}</Button>}</div></Disclosure>}</section></Disclosure>
          </section>}
        </section>}
          </>}
          </section>}
        </div>}
      {native && <BriefingSettings showFolderEntry={!vault.handle} open={settingsOpen} close={() => setSettingsOpen(false)} repository={repository} onCleared={() => setClearedAt(Date.now())} />}
    </div>
  </main>;
}
