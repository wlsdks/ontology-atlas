'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FileImage, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { choosePlanningFolder, openPlanningDocument, planningAvailable, readPlanningFile, scanPlanningFolder, type PlanningInventory, type PlanningSelection } from '@/shared/lib/planning/bridge';
import { beginPlanningReturn, clearPlanningReturn } from '@/shared/lib/planning/navigation';
import { readPlanningMemory, writePlanningMemory } from '@/shared/lib/planning/memory';
import { PlanningMarkdown, PlanningStandaloneImage } from './PlanningMarkdown';
import { Button, Disclosure, PageHeaderBar, RowButton } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';

const panel = 'rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]';

export function PlanningPage() {
  const t = useTranslations('planning');
  const router = useRouter();
  const [selection, setSelection] = useState<PlanningSelection | null>(() => readPlanningMemory().selection);
  const [selected, setSelected] = useState<string | null>(() => readPlanningMemory().selected);
  const [inventory, setInventory] = useState<PlanningInventory | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [fileChanged, setFileChanged] = useState(() => readPlanningMemory().changed);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle');
  const [fileFailed, setFileFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const sequence = useRef(0);
  const inFlight = useRef(0);
  const selectedRef = useRef(selected);
  const reader = useRef<HTMLDivElement>(null);
  const fileList = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(Boolean(readPlanningMemory().returnFocus));
  const pendingScroll = useRef<number | null>(readPlanningMemory().returnFocus ? readPlanningMemory().scroll : null);

  useEffect(() => {
    let active = true;
    void planningAvailable().then((supported) => { if (active) setAvailable(supported); });
    return () => { active = false; };
  }, []);
  useEffect(() => { const currentSequence = sequence; clearPlanningReturn(); return () => { currentSequence.current++; }; }, []);
  const refresh = useCallback(async (scope: PlanningSelection, path: string | null) => {
    if (path && path === selectedRef.current && pendingScroll.current === null && reader.current && readPlanningMemory().identity) pendingScroll.current = reader.current.scrollTop;
    const request = ++sequence.current;
    inFlight.current++;
    setStatus('checking');
    try {
      const memory = readPlanningMemory();
      const [next, result] = await Promise.all([
        scanPlanningFolder(scope.generation),
        path && !memory.changed ? openPlanningDocument(scope.generation, path, memory.identity).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: String(error) })) : Promise.resolve({ value: null, error: null }),
      ]);
      if (request !== sequence.current) return;
      setInventory(next);
      const changed = result.error?.includes('file-changed') ?? false;
      if (changed) {
        pendingScroll.current = null;
        restoreFocus.current = true;
        writePlanningMemory({ ...readPlanningMemory(), scroll: 0, changed: true, returnFocus: null });
      } else if (result.value) {
        writePlanningMemory({ ...readPlanningMemory(), identity: result.value.identity });
      }
      setFileChanged(changed || memory.changed);
      setContent(result.value && path?.toLowerCase().endsWith('.md') ? new TextDecoder().decode(result.value.bytes) : null);
      setImageBytes(result.value && !path?.toLowerCase().endsWith('.md') ? result.value.bytes : null);
      const failed = Boolean(path && !changed && !memory.changed && (!next.files.some((file) => file.path === path) || !result.value));
      if (failed) { pendingScroll.current = null; writePlanningMemory({ ...readPlanningMemory(), scroll: 0, returnFocus: null }); }
      setFileFailed(failed);
      setCheckedAt(Date.now());
      setStatus('ready');
    } catch {
      if (request === sequence.current) setStatus('unavailable');
    } finally {
      inFlight.current--;
    }
  }, []);
  useEffect(() => {
    if (!selection || available !== true) return;
    void refresh(selection, selectedRef.current);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible' && inFlight.current === 0) void refresh(selection, selectedRef.current); }, 10_000);
    const recheck = () => { if (document.visibilityState === 'visible') void refresh(selection, selectedRef.current); else { sequence.current++; setStatus('checking'); } };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', recheck); window.removeEventListener('focus', recheck); };
  }, [selection, refresh, available]);
  useEffect(() => {
    if (status !== 'ready') return;
    const memory = readPlanningMemory();
    if (restoreFocus.current) {
      const target = !fileFailed && !fileChanged && memory.returnFocus
        ? document.querySelector<HTMLButtonElement>(`[data-return-focus="${memory.returnFocus}"]`)
        : fileList.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      (target ?? fileList.current?.querySelector<HTMLButtonElement>('button') ?? document.querySelector<HTMLButtonElement>('[data-planning-focus-fallback]'))?.focus();
      restoreFocus.current = false;
      writePlanningMemory({ ...memory, returnFocus: null });
    }
    const node = reader.current;
    if (!node || pendingScroll.current === null || fileFailed || fileChanged || !memory.identity || selected !== memory.selected) return;
    let frame = 0;
    const settle = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (pendingScroll.current === null || node.querySelector('[data-planning-image-pending]') || [...node.querySelectorAll('img')].some((image) => !image.complete)) return;
        node.scrollTop = pendingScroll.current;
        pendingScroll.current = null;
      });
    };
    const observer = new MutationObserver(settle);
    observer.observe(node, { childList: true, subtree: true, attributes: true });
    node.addEventListener('load', settle, true);
    node.addEventListener('error', settle, true);
    settle();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); node.removeEventListener('load', settle, true); node.removeEventListener('error', settle, true); };
  }, [status, selected, content, imageBytes, fileFailed, fileChanged]);
  useEffect(() => {
    const node = reader.current;
    if (!node) return;
    const cancel = () => { pendingScroll.current = null; };
    node.addEventListener('wheel', cancel, { passive: true });
    node.addEventListener('touchstart', cancel, { passive: true });
    node.addEventListener('pointerdown', cancel);
    node.addEventListener('keydown', cancel);
    return () => { node.removeEventListener('wheel', cancel); node.removeEventListener('touchstart', cancel); node.removeEventListener('pointerdown', cancel); node.removeEventListener('keydown', cancel); };
  }, [selection, available]);
  const readImage = useCallback((path: string) => selection ? readPlanningFile(selection.generation, path) : Promise.reject(new Error('no-selection')), [selection]);
  const choose = async () => {
    try {
      const next = await choosePlanningFolder(t('folderUnavailable'));
      if (!next) return;
      sequence.current++;
      writePlanningMemory({ selection: next, selected: null, scroll: 0, identity: null, changed: false, returnFocus: null });
      selectedRef.current = null;
      setSelection(next); setSelected(null); setInventory(null); setContent(null); setImageBytes(null); setCheckedAt(null); setFileFailed(false); setFileChanged(false);
    } catch { setStatus('unavailable'); }
  };
  const openFile = (path: string) => {
    if (!selection) return;
    writePlanningMemory({ selection, selected: path, scroll: 0, identity: null, changed: false, returnFocus: null });
    pendingScroll.current = null;
    selectedRef.current = path; setSelected(path); setContent(null); setImageBytes(null); setFileFailed(false); setFileChanged(false);
    void refresh(selection, path);
  };
  const go = (path: string, focus: 'history' | 'map') => { writePlanningMemory({ ...readPlanningMemory(), returnFocus: focus }); beginPlanningReturn(); router.push(path); };
  const files = inventory?.files.filter((file) => file.path.toLocaleLowerCase().includes(search.toLocaleLowerCase())) ?? [];
  return <main className="min-h-full">
    <PageHeaderBar frame="page" title={t('title')} actions={available && selection ? <Button variant="outline" className="max-[769px]:min-h-11" onClick={() => void choose()}><FolderOpen size={16} />{t('chooseFolder')}</Button> : undefined} />
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 pb-28 sm:px-6 lg:px-10">
      {available === null ? <p role="status">{t('checkingSupport')}</p>
        : available === false ? <section data-planning-state="unsupported" className={`${panel} space-y-3 p-6`}><p>{t('chooseBody')}</p><p>{t('browserUnavailable')}</p></section>
        : !selection ? <section className={`${panel} space-y-4 p-6`}><h2 className="text-title font-[var(--font-weight-strong)]">{t('chooseTitle')}</h2><p className="max-w-3xl text-body text-[color:var(--color-text-secondary)]">{t('chooseBody')}</p>{status === 'unavailable' && <p role="alert">{t('folderUnavailable')}</p>}{available && <Button variant="outline" className="max-[769px]:min-h-11" onClick={() => void choose()}>{t('chooseFolder')}</Button>}<Disclosure className="max-w-3xl [&>button]:min-h-10 max-[769px]:[&>button]:min-h-11" summary={t('details')}><p className="pt-2 text-body text-[color:var(--color-text-secondary)]">{t('limits')}</p></Disclosure></section>
        : <>
          <div className={`${panel} flex flex-wrap items-center justify-between gap-3 p-4`}>
            <div className="min-w-0 space-y-1 text-body"><p className="break-all text-[color:var(--color-text-primary)]">{t('folderLabel', { folder: selection.path })} · {t('readOnly')}</p><p className="text-[color:var(--color-text-secondary)]">{status === 'checking' ? t('checking') : checkedAt ? t('observedAt', { time: new Date(checkedAt).toLocaleString() }) : t('loading')} · {t('observationLimit')}</p></div>
            <Button variant="outline" className="max-[769px]:min-h-11" data-planning-focus-fallback onClick={() => { if (fileChanged) { writePlanningMemory({ ...readPlanningMemory(), identity: null, changed: false }); setFileChanged(false); } void refresh(selection, selectedRef.current); }}><RefreshCw size={16} />{t('refresh')}</Button>
          </div>
          {status === 'unavailable' && <p role="alert">{t('folderUnavailable')}</p>}
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 text-body text-[color:var(--color-text-secondary)]">
            {inventory && <p role="status">{t('visited', { count: inventory.visited })} {inventory.limit_reached && t('budgetLimit')} {inventory.depth_limited && t('depthLimit')} {inventory.omitted.unreadable > 0 && t('unreadable', { count: inventory.omitted.unreadable })} {inventory.unknown_remainder && t('unknownRemaining')}</p>}
            <Disclosure className="max-w-3xl [&>button]:min-h-10 max-[769px]:[&>button]:min-h-11" summary={t('details')}><div className="space-y-2 pt-2"><p>{t('chooseBody')}</p><p>{t('limits')}</p><p>{t('noContentSearch')}</p><p>{t('historyLimit')}</p><p>{t('comparisonLimit')}</p></div></Disclosure>
          </div>
          {inventory && inventory.skipped > 0 && <p className="text-caption text-[color:var(--color-text-secondary)]">{t('omitted', { count: inventory.skipped })} {inventory.omitted.linked > 0 && t('linkedOmitted', { count: inventory.omitted.linked })}</p>}
          <div className="grid min-h-[18rem] gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
            <section className={`${panel} min-w-0 space-y-3 p-4`} aria-label={t('findFile')}>
              <Input label={t('findFile')} value={search} onChange={(event) => setSearch(event.target.value)} className="w-full" />
              <div ref={fileList} className="max-h-[30rem] space-y-1 overflow-y-auto">{files.map((file) => <RowButton key={file.path} onClick={() => openFile(file.path)} aria-current={selected === file.path ? 'true' : undefined} active={selected === file.path} className="w-full justify-start text-left max-[769px]:min-h-11">{file.path.toLowerCase().endsWith('.md') ? <FileText size={16} className="mt-1 shrink-0" /> : <FileImage size={16} className="mt-1 shrink-0" />}<span className="break-all">{file.path}</span></RowButton>)}
                {inventory && files.length === 0 && <p className="py-3 text-body text-[color:var(--color-text-secondary)]">{search ? t('noMatches') : inventory.partial ? t('partial') : t('empty')}</p>}</div>
            </section>
            <section ref={reader} onScroll={(event) => { if (pendingScroll.current === null) writePlanningMemory({ ...readPlanningMemory(), scroll: event.currentTarget.scrollTop }); }} className={`${panel} min-w-0 overflow-auto p-5 sm:p-6 lg:max-h-[70vh]`}>
              {!selected ? <p className="text-body text-[color:var(--color-text-secondary)]">{t('selectFile')}</p> : <div className="space-y-5">
                <p className="break-all text-body text-[color:var(--color-text-secondary)]">{t('pathLabel', { path: selected })}</p>
                {fileChanged ? <p role="alert">{t('fileChanged')}</p> : fileFailed ? <p role="alert">{t('fileUnavailable')}</p> : selected.toLowerCase().endsWith('.md') ? content !== null && <PlanningMarkdown key={`${selected}:${checkedAt}`} document={selected} text={content} readImage={readImage} imageUnavailable={t('imageUnavailable')} unsupported={t('unsupported')} imageLimit={t('imageLimit')} /> : imageBytes && <PlanningStandaloneImage key={`${selected}:${checkedAt}`} path={selected} bytes={imageBytes} alt={selected} unavailable={t('imageUnavailable')} unsupported={t('unsupported')} />}
              </div>}
            </section>
          </div>
          {selected && <div className="flex flex-wrap items-center justify-end gap-2"><p className="mr-1 text-body text-[color:var(--color-text-secondary)]">{t('historyBrief')}</p><Button variant="outline" className="max-[769px]:min-h-11" disabled={status !== 'ready' || fileFailed || fileChanged || !readPlanningMemory().identity} data-return-focus="history" onClick={() => go('/changes/', 'history')}>{t('openHistory')}</Button><Button variant="outline" className="max-[769px]:min-h-11" disabled={status !== 'ready' || fileFailed || fileChanged || !readPlanningMemory().identity} data-return-focus="map" onClick={() => go('/topology/', 'map')}>{t('openMap')}</Button></div>}
        </>}
    </div>
  </main>;
}
