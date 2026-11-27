'use client';

import { useCallback, useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CloudDownload, FilePlus, FileText, FileUp, FolderOpen, FolderPen, LockKeyhole, PenLine, RefreshCw } from 'lucide-react';
import { useLocalVault } from '@/entities/vault-session';
import { choosePlanningFolder, planningAvailable, type PlanningInventory } from '@/shared/lib/planning/bridge';
import { pickPlanningFiles, planningAddAvailable } from '@/shared/lib/planning/add-files';
import { requestLibraryImport } from '@/shared/lib/library-import/destination';
import { navigateWithViewTransition } from '@/shared/lib/navigation/route-view-transition';
import { isAcpBridgeAvailable } from '@/shared/lib/agent-chat/tauri-acp';
import { createPlanningHomeDocument, PLANNING_HOME_FOLDER, planningIdentity, savePlanningHomeDocument } from '@/shared/lib/planning/home-source';
import { editablePlanningText, planningTextForDisk, type PlanningEditableText } from '@/shared/lib/planning/editable-text';
import { planningSourceFor, type HomePlanningSelection, type PlanningSelection } from '@/shared/lib/planning/source';
import { beginPlanningReturn, clearPlanningReturn } from '@/shared/lib/planning/navigation';
import { readPlanningMemory, writePlanningMemory } from '@/shared/lib/planning/memory';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/native-vault/tauri-vault-runtime';
import { MOTION } from '@/shared/motion';
import { PlanningMarkdown, PlanningStandaloneImage } from './PlanningMarkdown';
import { Button, CHROME_CHIP_COMPACT_BELOW_XL, ChromeChip, ChromeTile, PageHeaderBar, useToast, WaitStage } from '@/shared/ui';
import { PAGE_HEADER_FRAMES } from '@/shared/ui/layout/page-header-bar';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { PAGE_FRAME_FORM, PAGE_STAGE_FILL } from '@/shared/ui/tokens/page-frame';
import { PlanningFolderStage } from './PlanningFolderStage';
import { PlanningFileList } from './PlanningFileList';
import { PlanningReadScope } from './PlanningReadScope';
import { PlanningDraftRow } from './PlanningDraftRow';
import { PlanningEditor } from './PlanningEditor';
import { PlanningDiscardDialog } from './PlanningDiscardDialog';
import { firstPlanningDocument, isPlanningMarkdown } from '../model/file-groups';
import { planningArrival } from '../model/arrival';
import { planningAddSummary } from '../model/add-summary';

/** Below `xl` the header chips keep the icon and an `aria-label`: four labels overflow the app's 1040 minimum window. */
const ICON_ONLY_BELOW_XL = `${CHROME_CHIP_COMPACT_BELOW_XL} max-xl:[&_[data-chip-label]]:hidden`;

const QUIET_TEXT = 'text-label leading-label text-[color:var(--color-text-tertiary)]';
const FIRST_TITLE = '[data-planning-first-title]';

type HomeProbe = { root: FileSystemDirectoryHandle; directory: FileSystemDirectoryHandle | null };
/** `original` is null when the editor reopened kept text over a file it could not read back. */
type Editing = { path: string; text: string; original: string | null; identity: string; lineEnding: PlanningEditableText['lineEnding']; notice: 'refused' | 'failed' | null };

function homeDocumentSlug(path: string): string {
  return `${PLANNING_HOME_FOLDER}/${path.replace(/\.md$/, '')}`;
}

function sameBytes(left: Uint8Array | null, right: Uint8Array): boolean {
  return left !== null && left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function homeSelection(root: FileSystemDirectoryHandle, directory: FileSystemDirectoryHandle): HomePlanningSelection {
  return { kind: 'home', root, directory, path: `${getTauriVaultRootPath(root) ?? root.name}/${PLANNING_HOME_FOLDER}` };
}

export function PlanningPage() {
  const t = useTranslations('planning');
  const router = useRouter();
  const toast = useToast();
  const vault = useLocalVault();
  const reducedMotion = usePrefersReducedMotion();
  const pathId = useId();
  const [selection, setSelection] = useState<PlanningSelection | null>(() => readPlanningMemory().selection);
  const [selected, setSelected] = useState<string | null>(() => readPlanningMemory().selected);
  const [inventory, setInventory] = useState<PlanningInventory | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [editableText, setEditableText] = useState<PlanningEditableText | null>(null);
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null);
  const [fileChanged, setFileChanged] = useState(() => readPlanningMemory().changed);
  const [status, setStatus] = useState<'idle' | 'checking' | 'ready' | 'unavailable'>('idle');
  const [fileFailed, setFileFailed] = useState(false);
  const [checkingId, setCheckingId] = useState(0);
  const [slowId, setSlowId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [imageRevision, setImageRevision] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [folderNotice, setFolderNotice] = useState<'failure' | 'recovered' | null>(null);
  const [showsDocumentBelowLg, setShowsDocumentBelowLg] = useState(() => Boolean(readPlanningMemory().returnFocus));
  const [home, setHome] = useState<HomeProbe | null>(null);
  const [creatingHome, setCreatingHome] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  const [draftFailed, setDraftFailed] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [enteredFromStage, setEnteredFromStage] = useState(false);
  const [adding, setAdding] = useState(false);
  const folderFailed = useRef(false);
  const folderNoticeSelection = useRef(selection);
  const sequence = useRef(0);
  const activeRequest = useRef<number | null>(null);
  const pendingRecheck = useRef(false);
  const recheckCurrent = useRef<(() => void) | null>(null);
  const selectedRef = useRef(selected);
  const editingRef = useRef(false);
  const unsavedRef = useRef(false);
  const mounted = useRef(true);
  const reader = useRef<HTMLDivElement>(null);
  const fileList = useRef<HTMLDivElement>(null);
  const draftOpener = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(Boolean(readPlanningMemory().returnFocus));
  const pendingScroll = useRef<number | null>(readPlanningMemory().returnFocus ? readPlanningMemory().scroll : null);

  const vaultRoot = vault.handle && (vault.status === 'loaded' || vault.isReloadingSameVault) ? vault.handle : null;
  const vaultState = vaultRoot ? 'loaded' as const
    : vault.status === 'opening' || vault.status === 'loading' || (vault.status === 'idle' && !vault.restoreAttempted) ? 'pending' as const : 'none' as const;
  // A home folder belongs to the ontology folder it was opened from; switching folders drops it.
  const activeSelection = selection?.kind === 'home' && selection.root !== vaultRoot ? null : selection;
  const homeState = !vaultRoot || home?.root !== vaultRoot ? 'unknown' as const : home.directory ? 'present' as const : 'absent' as const;
  const arrival = planningArrival({ selection: activeSelection?.kind ?? null, nativeAvailable: available, vault: vaultState, home: homeState });
  const workbench = arrival === 'workbench' && activeSelection !== null ? activeSelection : null;
  const isHome = workbench?.kind === 'home';
  const emptyHome = isHome && inventory !== null && inventory.files.length === 0 && status !== 'unavailable';
  const homePending = isHome && inventory === null && status !== 'unavailable';
  const firstDocumentStage = emptyHome && editing === null;
  const panes = workbench !== null && !homePending && !firstDocumentStage;

  useEffect(() => { editingRef.current = editing !== null; }, [editing]);
  useEffect(() => {
    let active = true;
    void planningAvailable().then((supported) => { if (active) setAvailable(supported); });
    return () => { active = false; };
  }, []);
  useEffect(() => { const currentSequence = sequence; clearPlanningReturn(); return () => { currentSequence.current++; }; }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const dropSelection = useCallback(() => {
    sequence.current++;
    recheckCurrent.current = null;
    writePlanningMemory({ selection: null, selected: null, scroll: 0, identity: null, changed: false, returnFocus: null });
    selectedRef.current = null;
    setSelection(null); setSelected(null); setInventory(null); setContent(null); setEditableText(null); setImageBytes(null);
  }, []);
  const refresh = useCallback(async (scope: PlanningSelection, path: string | null) => {
    if (path && path === selectedRef.current && pendingScroll.current === null && reader.current && readPlanningMemory().identity) pendingScroll.current = reader.current.scrollTop;
    const request = ++sequence.current;
    activeRequest.current = request;
    pendingRecheck.current = false;
    setCheckingId(request);
    setStatus('checking');
    try {
      const memory = readPlanningMemory();
      const source = planningSourceFor(scope);
      const [observation, result] = await Promise.all([
        source.scan().then((value) => ({ value, at: Date.now() })),
        path && !memory.changed ? source.openDocument(path, memory.identity).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error: String(error) })) : Promise.resolve({ value: null, error: null }),
      ]);
      if (request !== sequence.current) return;
      const next = observation.value;
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
      const markdown = result.value && path && isPlanningMarkdown(path) ? result.value.bytes : null;
      const editable = markdown ? editablePlanningText(markdown) : null;
      setContent(markdown ? new TextDecoder().decode(markdown) : null);
      setEditableText(editable);
      const kept = readPlanningMemory().draft;
      if (kept && scope.kind === 'home' && kept.homeFolderName === scope.path && kept.path === path && (editable || changed) && !editingRef.current) {
        editingRef.current = true;
        setEditing({ path, text: kept.text, original: editable?.text ?? null, identity: kept.identity, lineEnding: kept.lineEnding, notice: null });
      }
      const nextImage = result.value && path && !isPlanningMarkdown(path) ? result.value.bytes : null;
      setImageBytes((previous) => nextImage && sameBytes(previous, nextImage) ? previous : nextImage);
      const failed = Boolean(path && !changed && !memory.changed && (!next.files.some((file) => file.path === path) || !result.value));
      if (failed) { pendingScroll.current = null; writePlanningMemory({ ...readPlanningMemory(), scroll: 0, returnFocus: null }); }
      setFileFailed(failed);
      setCheckedAt(observation.at);
      setImageRevision(request);
      setStatus('ready');
      // The arrival document is read by the queued recheck, so its read stays in the request sequence.
      const arrivalDocument = path === null && selectedRef.current === null ? firstPlanningDocument(next.files.map((file) => file.path)) : null;
      if (arrivalDocument) {
        writePlanningMemory({ selection: scope, selected: arrivalDocument, scroll: 0, identity: null, changed: false, returnFocus: null });
        selectedRef.current = arrivalDocument;
        setSelected(arrivalDocument);
        pendingRecheck.current = true;
      }
    } catch {
      if (request !== sequence.current) return;
      const homeGone = scope.kind === 'home' && !(await scope.root.getDirectoryHandle(PLANNING_HOME_FOLDER).then(() => true, () => false));
      if (request !== sequence.current) return;
      // A home folder removed outside the app cannot be chosen again, so its stage offers to make it.
      if (homeGone) { setHome({ root: scope.root, directory: null }); dropSelection(); }
      else setStatus('unavailable');
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        if (pendingRecheck.current) { pendingRecheck.current = false; recheckCurrent.current?.(); }
      }
    }
  }, [dropSelection]);
  const enterSelection = useCallback((next: PlanningSelection, fromStage: boolean) => {
    sequence.current++;
    activeRequest.current = null;
    pendingRecheck.current = false;
    recheckCurrent.current = null;
    folderFailed.current = false;
    folderNoticeSelection.current = next;
    const kept = readPlanningMemory().draft;
    const resumed = next.kind === 'home' && kept?.homeFolderName === next.path ? kept.path : null;
    writePlanningMemory({ selection: next, selected: resumed, scroll: 0, identity: null, changed: false, returnFocus: null });
    selectedRef.current = resumed;
    restoreFocus.current = fromStage;
    setFolderNotice(null); setEnteredFromStage(fromStage); setEditing(null); setDrafting(false); setDraftFailed(false);
    setSelection(next); setSelected(resumed); setShowsDocumentBelowLg(Boolean(resumed)); setSearch(''); setInventory(null); setContent(null); setEditableText(null); setImageBytes(null); setCheckedAt(null); setFileFailed(false); setFileChanged(false);
  }, []);
  useEffect(() => {
    if (!vaultRoot) return;
    let active = true;
    const settle = (directory: FileSystemDirectoryHandle | null) => {
      if (!active) return;
      setHome({ root: vaultRoot, directory });
      const remembered = readPlanningMemory().selection;
      const usable = remembered && !(remembered.kind === 'home' && remembered.root !== vaultRoot);
      if (directory && !usable) enterSelection(homeSelection(vaultRoot, directory), false);
    };
    vaultRoot.getDirectoryHandle(PLANNING_HOME_FOLDER).then(settle, () => settle(null));
    return () => { active = false; };
  }, [vaultRoot, enterSelection]);
  const readable = arrival === 'workbench';
  useEffect(() => {
    if (!activeSelection || !readable) return;
    const requestCheck = () => {
      if (recheckCurrent.current !== requestCheck || document.visibilityState !== 'visible' || editingRef.current) return;
      if (activeRequest.current !== null) { pendingRecheck.current = true; return; }
      void refresh(activeSelection, selectedRef.current);
    };
    recheckCurrent.current = requestCheck;
    requestCheck();
    const interval = window.setInterval(requestCheck, 10_000);
    const recheck = () => {
      if (recheckCurrent.current !== requestCheck) return;
      if (document.visibilityState === 'visible') requestCheck();
      else { const request = ++sequence.current; setCheckingId(request); setStatus('checking'); }
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => { if (recheckCurrent.current === requestCheck) recheckCurrent.current = null; pendingRecheck.current = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', recheck); window.removeEventListener('focus', recheck); };
  }, [activeSelection, refresh, readable]);
  useEffect(() => {
    if (status !== 'checking') return;
    const timer = window.setTimeout(() => setSlowId(checkingId), 8_000);
    return () => window.clearTimeout(timer);
  }, [status, checkingId]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active || !activeSelection || folderNoticeSelection.current !== activeSelection) return;
      if (status === 'unavailable' && !folderFailed.current) { folderFailed.current = true; setFolderNotice('failure'); }
      else if (status === 'ready' && folderFailed.current) { folderFailed.current = false; setFolderNotice('recovered'); }
    });
    return () => { active = false; };
  }, [activeSelection, status]);
  useEffect(() => {
    if (status !== 'ready') return;
    const memory = readPlanningMemory();
    if (restoreFocus.current) {
      const target = !fileFailed && !fileChanged && memory.returnFocus
        ? document.querySelector<HTMLButtonElement>(`[data-return-focus="${memory.returnFocus}"]`)
        : fileList.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      (target ?? fileList.current?.querySelector<HTMLButtonElement>('button') ?? document.querySelector<HTMLInputElement>(FIRST_TITLE) ?? document.querySelector<HTMLButtonElement>('[data-planning-focus-fallback]'))?.focus();
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
  }, [activeSelection, readable, panes]);
  const readImage = useCallback((path: string) => activeSelection ? planningSourceFor(activeSelection).readFile(path) : Promise.reject(new Error('no-selection')), [activeSelection]);
  const unsaved = editing !== null && editing.text !== editing.original;
  useEffect(() => { unsavedRef.current = unsaved; }, [unsaved]);
  const { markSelfWrite, unmarkSelfWrite } = vault;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
  const closeEditor = () => { setEditing(null); writePlanningMemory({ draft: null }); };
  const leaveEditor = (action: () => void) => {
    if (unsaved) { setPendingLeave(() => action); return; }
    closeEditor();
    action();
  };
  const changeEditorText = (current: Editing, text: string) => {
    setEditing({ ...current, text });
    const keeps = activeSelection?.kind === 'home' && text !== current.original;
    writePlanningMemory({ draft: keeps ? { homeFolderName: activeSelection.path, path: current.path, text, identity: current.identity, lineEnding: current.lineEnding } : null });
  };
  const choose = async (fromStage: boolean) => {
    try {
      const next = await choosePlanningFolder(t('folderUnavailable'));
      if (!next) {
        document.querySelector<HTMLButtonElement>('[data-planning-choose]')?.focus({ preventScroll: true });
        return;
      }
      enterSelection(next, fromStage);
    } catch { setStatus('unavailable'); }
  };
  const openHome = async (fromStage: boolean) => {
    if (!vaultRoot) return;
    setCreatingHome(true); setCreateFailed(false);
    try {
      const directory = home?.root === vaultRoot && home.directory ? home.directory : await vaultRoot.getDirectoryHandle(PLANNING_HOME_FOLDER, { create: true });
      setHome({ root: vaultRoot, directory });
      enterSelection(homeSelection(vaultRoot, directory), fromStage);
    } catch { setCreateFailed(true); } finally { setCreatingHome(false); }
  };
  const returnHome = () => {
    if (home?.root === vaultRoot && home.directory) { void openHome(false); return; }
    dropSelection();
  };
  const openFile = (path: string) => {
    if (!activeSelection) return;
    setShowsDocumentBelowLg(true);
    if (path === selectedRef.current && !fileFailed && !fileChanged) return;
    writePlanningMemory({ selection: activeSelection, selected: path, scroll: 0, identity: null, changed: false, returnFocus: null });
    pendingScroll.current = null;
    selectedRef.current = path; setSelected(path); setContent(null); setEditableText(null); setImageBytes(null); setFileFailed(false); setFileChanged(false);
    void refresh(activeSelection, path);
  };
  const startDraft = (event: MouseEvent<HTMLElement>) => {
    if (!panes) { document.querySelector<HTMLInputElement>(FIRST_TITLE)?.focus(); return; }
    const opener = event.currentTarget;
    leaveEditor(() => { draftOpener.current = opener; setDraftFailed(false); setDrafting(true); setShowsDocumentBelowLg(false); });
  };
  const cancelDraft = () => {
    setDrafting(false);
    (draftOpener.current?.isConnected ? draftOpener.current : document.querySelector<HTMLElement>('[data-planning-new]'))?.focus();
  };
  const createDocument = async (title: string) => {
    if (activeSelection?.kind !== 'home' || creatingDocument) return;
    setCreatingDocument(true); setDraftFailed(false);
    let marked: string | null = null;
    try {
      const created = await createPlanningHomeDocument(activeSelection.directory, title, (path) => { marked = homeDocumentSlug(path); markSelfWrite(marked); });
      const identity = await planningIdentity(new TextEncoder().encode(created.text));
      writePlanningMemory({ selection: activeSelection, selected: created.path, scroll: 0, identity, changed: false, returnFocus: null });
      pendingScroll.current = null;
      selectedRef.current = created.path;
      setDrafting(false); setSelected(created.path); setContent(created.text); setEditableText({ text: created.text, lineEnding: '\n' }); setImageBytes(null); setFileFailed(false); setFileChanged(false); setShowsDocumentBelowLg(true);
      setEditing({ path: created.path, text: created.text, original: created.text, identity, lineEnding: '\n', notice: null });
      void refresh(activeSelection, created.path);
    } catch {
      if (marked) unmarkSelfWrite(marked);
      setDraftFailed(true);
    } finally { setCreatingDocument(false); }
  };
  const addFiles = async () => {
    if (activeSelection?.kind !== 'home' || adding) return;
    const scope = activeSelection;
    const marked = new Map<string, string>();
    const markOwnWrite = (path: string) => {
      if (!isPlanningMarkdown(path)) return;
      marked.set(path, homeDocumentSlug(path));
      markSelfWrite(homeDocumentSlug(path));
    };
    setAdding(true);
    try {
      const rootPath = getTauriVaultRootPath(scope.root) ?? null;
      const outcome = await pickPlanningFiles({ rootPath });
      if (!outcome) return;
      if (rootPath) outcome.added.forEach(markOwnWrite);
      for (const [path, slug] of marked) if (!outcome.added.includes(path)) unmarkSelfWrite(slug);
      const summary = planningAddSummary(outcome);
      if (summary) toast.show(summary.sentences.map(({ key, values }) => t(key, values)).join(' '), summary.tone);
      // A screen left during the copy keeps its editor and kept draft; only the toast reports.
      if (!mounted.current || readPlanningMemory().selection !== scope) return;
      const first = outcome.added[0];
      if (first && !unsavedRef.current) {
        if (editingRef.current) closeEditor();
        openFile(first);
      } else void refresh(scope, selectedRef.current);
    } catch {
      for (const slug of marked.values()) unmarkSelfWrite(slug);
      toast.show(t('addFilesFailed'), 'error');
    } finally { setAdding(false); }
  };
  const startEdit = () => {
    const identity = readPlanningMemory().identity;
    if (!selected || !editableText || !identity) return;
    setEditing({ path: selected, text: editableText.text, original: editableText.text, identity, lineEnding: editableText.lineEnding, notice: null });
  };
  const focusEdit = () => requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-planning-edit]')?.focus({ preventScroll: true }));
  const save = async () => {
    if (!editing || activeSelection?.kind !== 'home' || saving) return;
    const saved = editing;
    const slug = homeDocumentSlug(saved.path);
    const onDisk = planningTextForDisk(saved.text, saved.lineEnding);
    setSaving(true);
    markSelfWrite(slug);
    try {
      const identity = await savePlanningHomeDocument(activeSelection.directory, saved.path, onDisk, saved.identity);
      writePlanningMemory({ identity, changed: false, draft: null });
      setContent(onDisk); setEditableText({ text: saved.text, lineEnding: saved.lineEnding }); setFileChanged(false);
      setEditing((current) => (current === saved ? null : current));
      focusEdit();
      void refresh(activeSelection, saved.path);
    } catch (error) {
      unmarkSelfWrite(slug);
      const notice = String(error).includes('file-changed') ? 'refused' as const : 'failed' as const;
      setEditing((current) => (current?.path === saved.path ? { ...current, notice } : current));
    } finally { setSaving(false); }
  };
  const go = (path: string, focus: 'history' | 'map') => { writePlanningMemory({ ...readPlanningMemory(), returnFocus: focus }); beginPlanningReturn(); router.push(path); };
  const importFromService = () => { requestLibraryImport('planning'); navigateWithViewTransition('/library/', () => router.push('/library/')); };
  const observation = { revision: imageRevision, status: status === 'idle' ? 'checking' as const : status, checking: t('imageChecking'), unconfirmed: t('imageUnconfirmed'), checked: t('imageChecked'), attention: (name: string) => t('imageAttention', { image: name }), recovered: (name: string) => t('imageRecovered', { image: name }), blocked: (name: string, reason: string) => t('imageBlocked', { image: name, reason }), unnamed: (line: number, column: number) => t('imageUnnamed', { line, column }) };
  const files = inventory?.files.filter((file) => file.path.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((file) => file.path) ?? [];
  const evidenceOpenable = status === 'ready' && !fileFailed && !fileChanged && Boolean(readPlanningMemory().identity);
  const refreshFolder = (scope: PlanningSelection) => {
    if (fileChanged) { writePlanningMemory({ ...readPlanningMemory(), identity: null, changed: false }); setFileChanged(false); }
    void refresh(scope, selectedRef.current);
  };
  const backToList = () => {
    setShowsDocumentBelowLg(false);
    requestAnimationFrame(() => fileList.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus());
  };
  const canAddFiles = workbench?.kind === 'home' && planningAddAvailable(getTauriVaultRootPath(workbench.root) ?? null);
  const readScope = (placement: 'list' | 'stage') => <PlanningReadScope placement={placement} inventory={inventory} status={status} checkedAt={checkedAt} slow={status === 'checking' && slowId === checkingId} writable={isHome} />;
  // Pressing Create keeps its stage, button disabled, until the new folder's first scan answers.
  const holdsCreateStage = arrival === 'create-home' || (homePending && enteredFromStage);
  const editingShown = editing !== null && editing.path === selected ? editing : null;
  const shownMarkdown = isHome && selected !== null && isPlanningMarkdown(selected) && content !== null && !fileChanged && !fileFailed && !editingShown;
  const editable = shownMarkdown && editableText !== null;
  return <main data-planning-surface className={panes ? 'flex h-full min-h-0 flex-col overflow-hidden' : 'flex min-h-full flex-col'}>
    <span role="alert" data-planning-folder-alert className="sr-only">{folderNotice === 'failure' ? t('folderUnavailable') : ''}</span>
    <span role="status" data-planning-folder-recovery className="sr-only">{folderNotice === 'recovered' ? t('folderRecovered') : ''}</span>
    <PageHeaderBar
      frame="page"
      title={t('title')}
      meta={workbench ? <span className={`hidden min-w-0 items-center gap-3 md:flex ${QUIET_TEXT}`}><span data-planning-folder-path title={workbench.path} className="max-w-[min(28vw,32rem)] truncate font-mono">{workbench.path}</span>{!isHome && <span className="flex shrink-0 items-center gap-1"><LockKeyhole size={ICON_SIZE.sm} aria-hidden />{t('readOnly')}</span>}</span> : undefined}
      actions={workbench ? <>
        <ChromeTile title={t('refresh')} icon={<RefreshCw aria-hidden />} data-planning-focus-fallback onClick={() => refreshFolder(workbench)} />
        {/* An empty folder's stage carries these three in its centre; the header would repeat them. */}
        {isHome && !firstDocumentStage && <ChromeChip icon={<FilePlus aria-hidden />} data-planning-new onClick={startDraft} aria-label={t('newDocument')} title={t('newDocument')} className={ICON_ONLY_BELOW_XL}>{t('newDocument')}</ChromeChip>}
        {canAddFiles && !firstDocumentStage && <ChromeChip icon={<FileUp aria-hidden />} data-planning-add disabled={adding} onClick={() => void addFiles()} aria-label={t('addFiles')} title={t('addFiles')} className={ICON_ONLY_BELOW_XL}>{t('addFiles')}</ChromeChip>}
        {isHome && !firstDocumentStage && isAcpBridgeAvailable() && <ChromeChip icon={<CloudDownload aria-hidden />} data-planning-import title={t('importServiceHint')} onClick={importFromService} aria-label={t('importService')} className={ICON_ONLY_BELOW_XL}>{t('importService')}</ChromeChip>}
        {!isHome && vaultRoot && <ChromeChip icon={<FolderPen aria-hidden />} data-planning-home disabled={creatingHome} onClick={returnHome} aria-label={t('homeFolder')} title={t('homeFolder')} className={ICON_ONLY_BELOW_XL}>{t('homeFolder')}</ChromeChip>}
        {available === true && <ChromeChip icon={<FolderOpen aria-hidden />} data-planning-choose onClick={() => void choose(false)} aria-label={t('chooseFolder')} title={t('chooseFolder')} className={ICON_ONLY_BELOW_XL}>{t('chooseFolder')}</ChromeChip>}
      </> : undefined}
    />
    {!panes ? <div className={`relative ${PAGE_FRAME_FORM} ${PAGE_STAGE_FILL}`}>
      {arrival === 'unsupported' ? <PlanningFolderStage door={{ kind: 'unsupported' }} />
        : arrival === 'picker' ? <PlanningFolderStage door={{ kind: 'choose', onChoose: () => void choose(true), unavailable: status === 'unavailable' }} />
        : holdsCreateStage && vaultRoot ? <PlanningFolderStage door={{ kind: 'create', folder: vaultRoot.name, onCreate: () => void openHome(true), onChoose: available ? () => void choose(true) : null, failed: createFailed, creating: creatingHome || homePending }} />
        : firstDocumentStage && workbench?.kind === 'home' ? <PlanningFolderStage door={{
          kind: 'first-document', folder: workbench.root.name, creating: creatingDocument, failed: draftFailed, onCreate: (title) => void createDocument(title),
          onAddFiles: canAddFiles ? () => void addFiles() : null, adding, onImport: isAcpBridgeAvailable() ? importFromService : null,
          readScope: inventory && inventory.visited > 0 ? readScope('stage') : null,
        }} />
        : homePending ? <WaitStage title={t('loading')} delayed data-planning-loading />
        : <p role="status">{t('checkingSupport')}</p>}
    </div> : <motion.div
      data-planning-workbench
      initial={enteredFromStage || isHome ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? MOTION.fast : MOTION.base}
      className={`relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)] ${PAGE_HEADER_FRAMES.page}`}
    >
      <section aria-label={t('findFile')} data-planning-list className={`flex min-h-0 min-w-0 flex-col lg:border-r lg:border-[color:var(--color-divider)] ${showsDocumentBelowLg ? 'max-lg:hidden' : ''}`}>
        <PlanningFileList
          listRef={fileList} paths={files} selected={selected} search={search} onSearch={setSearch} onOpen={(path) => leaveEditor(() => openFile(path))}
          emptyMessage={inventory && files.length === 0 && !(emptyHome && !search) ? t(search ? 'noMatches' : 'empty') : null}
          draft={<AnimatePresence initial={false}>{isHome && drafting && <PlanningDraftRow key="draft" busy={creatingDocument} failed={draftFailed} onSubmit={(title) => leaveEditor(() => void createDocument(title))} onCancel={cancelDraft} />}</AnimatePresence>}
        />
        {readScope('list')}
      </section>
      <section data-planning-document className={`flex min-h-0 min-w-0 flex-col ${showsDocumentBelowLg ? '' : 'max-lg:hidden'}`}>
        {selected && <div data-planning-document-head className="flex min-h-12 flex-none flex-wrap items-center gap-x-3 gap-y-1 border-b border-[color:var(--color-divider)] py-1.5 lg:pl-6">
          <Button variant="ghost" size="sm" className="-ml-2 lg:hidden max-[769px]:min-h-11" onClick={backToList}><ArrowLeft size={ICON_SIZE.sm} aria-hidden />{t('backPlanning')}</Button>
          <p id={pathId} data-planning-path title={selected} className={`min-w-0 flex-1 truncate font-mono ${QUIET_TEXT}`}>{selected}</p>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            {shownMarkdown && !editable && <span data-planning-not-editable className={`mr-2 ${QUIET_TEXT}`}>{t('notEditable')}</span>}
            {editable && <Button variant="ghost" size="sm" className="mr-2 max-[769px]:min-h-11" data-planning-edit onClick={startEdit}><PenLine size={ICON_SIZE.sm} aria-hidden />{t('edit')}</Button>}
            <span className={`mr-2 ${QUIET_TEXT}`}>{t('historyBrief')}</span>
            <Button variant="ghost" size="sm" className="max-[769px]:min-h-11" disabled={!evidenceOpenable} data-return-focus="history" onClick={() => go('/changes/', 'history')}>{t('openHistory')}</Button>
            <Button variant="ghost" size="sm" className="max-[769px]:min-h-11" disabled={!evidenceOpenable} data-return-focus="map" onClick={() => go('/topology/', 'map')}>{t('openMap')}</Button>
          </div>
        </div>}
        <div ref={reader} data-planning-reader onScroll={(event) => { if (pendingScroll.current === null) writePlanningMemory({ ...readPlanningMemory(), scroll: event.currentTarget.scrollTop }); }} className="min-h-0 flex-1 overflow-y-auto py-6 lg:px-10 lg:py-8">
          {editingShown ? <PlanningEditor labelledBy={pathId} text={editingShown.text} notice={editingShown.notice} saving={saving} onChange={(text) => changeEditorText(editingShown, text)} onSave={() => void save()} onCancel={() => leaveEditor(focusEdit)} />
            : !inventory ? null
            : !selected ? <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-body leading-body text-[color:var(--color-text-secondary)]"><FileText size={ICON_SIZE.lg} aria-hidden /><p>{t('selectFile')}</p></div>
            : fileChanged ? <p role="alert" className="mx-auto max-w-[var(--measure-doc-column)] text-body leading-body text-[color:var(--color-text-primary)]">{t('fileChanged')}</p>
            : fileFailed ? <p role="alert" className="mx-auto max-w-[var(--measure-doc-column)] text-body leading-body text-[color:var(--color-text-primary)]">{t('fileUnavailable')}</p>
            : isPlanningMarkdown(selected) ? content !== null && <div className="mx-auto max-w-[var(--measure-doc-column)]"><PlanningMarkdown key={selected} document={selected} text={content} readImage={readImage} observation={observation} imageUnavailable={t('imageUnavailable')} unsupported={t('unsupported')} imageLimit={t('imageLimit')} /></div>
            : imageBytes && <figure className="flex min-h-full flex-col items-center justify-center gap-3"><PlanningStandaloneImage key={selected} path={selected} bytes={imageBytes} alt={selected} unavailable={t('imageUnavailable')} unsupported={t('unsupported')} observation={observation} /><figcaption className={QUIET_TEXT}>{selected.slice(selected.lastIndexOf('/') + 1)}</figcaption></figure>}
        </div>
      </section>
      {!inventory && status !== 'unavailable' && <WaitStage title={t('loading')} delayed data-planning-loading />}
    </motion.div>}
    <PlanningDiscardDialog open={pendingLeave !== null} onKeep={() => setPendingLeave(null)} onDiscard={() => { const action = pendingLeave; setPendingLeave(null); closeEditor(); action?.(); }} />
  </main>;
}
