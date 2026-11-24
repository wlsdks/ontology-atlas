'use client';

import { focusWithoutTooltip } from '@/shared/ui/hints/tooltip';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { analysisArchiveWritable, analysisScopeKey, appendAnalysisRecord, compareAnalysisBasis, latestFindingReview, readAnalysisHistory, serializeAnalysisRecord, verifyAnalysisEvidence, type AnalysisCompatibility, type AnalysisFinding, type AnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';
import { ANALYSIS_FINDINGS_INSTRUCTION, currentAnalysisBasis, requestsAnalysisFindings, type AnalysisCaptureContext, type AnalysisSaveState } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { isImeComposing } from '@/shared/lib/keyboard/ime-composition';
import { useSurfaceSwap } from '@/shared/lib/render-timing/use-presence';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { Chip, CloseButton, Disclosure, EmptyState, IconButton, OntologyMapKindGlyph, Select, TabBar, useToast } from '@/shared/ui';
import { History as HistoryIcon, RotateCcw } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { isReviewResult } from '../model/review-result';
import { MeaningTransitionHistory, type MeaningTransitionArchiveState } from './MeaningTransitionHistory';
import { FindingDetail, FindingRow, type EvidenceConcept, type FindingDisposition } from './review-findings';
import { ReviewRecordDialog } from './ReviewRecordDialog';

const DIVIDED = 'border-t border-[color:var(--color-divider)] pt-4';
const LIST_VIEW = 'list';

type Tab = 'meaning' | 'history' | 'conversation';
const KNOWN_KINDS = ['project', 'domain', 'capability', 'element', 'document', 'vault-readme'];
const EMPTY_RECORDS: AnalysisRecord[] = [];
const EMPTY_PROBLEMS: string[] = [];
/* The fix request names its record by id inside a quoted argument; anything else is not offered. */
const PLAIN_RECORD_ID = /^[A-Za-z0-9_-]{1,200}$/;

/**
 * Module-level on purpose: the workbench unmounts when its dock closes, and a saved record must not
 * toast again on reopen.
 */
const announcedSaveIds = new Set<string>();

function InlineAlert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-2 text-label leading-label text-[color:var(--color-danger-text)]">{children}</p>;
}

export function AnalysisWorkbench({ context, contextLabel, conversationLabel = null, contextKind = null, open, requestNonce, sectionRequest, onSectionChange, onFitContentChange, initialTab = 'history', facts, conversation, onRequest, relationNoteGaps = 0, onClose, onEvidence, onFinding, onFindingsChange, capture, returnFocusSelector, takesFocusOnOpen = true }: {
  context: AnalysisCaptureContext;
  contextLabel: string;
  conversationLabel?: string | null;
  contextKind?: string | null;
  open: boolean;
  requestNonce?: number;
  sectionRequest?: { tab: Tab; nonce: number };
  /**
   * True while the open view is a short designed state (the empty history archive), so the host can
   * end under it.
   */
  onFitContentChange?: (fits: boolean) => void;
  onSectionChange?: (tab: Tab) => void;
  initialTab?: Tab;
  facts?: ReactNode;
  conversation?: ReactNode;
  capture?: { state: AnalysisSaveState | null; setState: (state: AnalysisSaveState) => void };
  onRequest?: (text: string, parentRunId: string | null) => void;
  /**
   * Relations in scope with an empty `relation_notes`; above zero the results section offers to
   * have the agent write them.
   */
  relationNoteGaps?: number;
  onClose: () => void;
  returnFocusSelector?: string;
  /** False when the panel comes back on its own, so focus stays where the person is. */
  takesFocusOnOpen?: boolean;
  onEvidence?: (slug: string) => void;
  onFinding?: (finding: AnalysisFinding, run: AnalysisRun) => boolean;
  onFindingsChange?: (findings: readonly AnalysisFinding[]) => void;
}) {
  const t = useTranslations('analysisWorkbench');
  const kindLabel = useTranslations('kinds');
  const locale = useLocale();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const takesFocusOnOpenRef = useLatestRef(takesFocusOnOpen);
  useEffect(() => {
    if (!open || !takesFocusOnOpenRef.current) return;
    const panel = panelRef.current;
    const isPageContainer = (element: Element | null) => element === document.body || Boolean(element?.matches('main, [role="main"]'));
    const active = document.activeElement;
    const origin = active instanceof HTMLElement && !isPageContainer(active) && !panel?.contains(active)
      ? active : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      /*
       * Restore after the panel is gone or put away and the target is focusable;
       * stand down once focus moves elsewhere, or after about 0.66s.
       */
      let frames = 0;
      const restore = () => {
        const current = document.activeElement;
        if (!isPageContainer(current) && current?.isConnected && !panel?.contains(current)) return;
        const target = origin?.isConnected && !origin.closest('[inert]')
          ? origin : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
        const putAway = !panel?.isConnected || !!panel.closest('[inert]');
        if (putAway && target?.isConnected && !target.closest('[inert]')) {
          focusWithoutTooltip(target, { preventScroll: true });
          return;
        }
        if ((frames += 1) < 40) window.requestAnimationFrame(restore);
      };
      window.requestAnimationFrame(restore);
    };
  }, [open, returnFocusSelector, takesFocusOnOpenRef]);
  const [section, setSection] = useState({ nonce: requestNonce, viewNonce: sectionRequest?.nonce, tab: sectionRequest?.tab ?? initialTab });
  if (section.nonce !== requestNonce || section.viewNonce !== sectionRequest?.nonce) {
    const requestedTab = section.viewNonce !== sectionRequest?.nonce && sectionRequest
      ? sectionRequest.tab : requestNonce !== undefined && section.nonce !== requestNonce ? 'conversation' : section.tab;
    setSection({ nonce: requestNonce, viewNonce: sectionRequest?.nonce, tab: requestedTab });
  }
  const tab = section.tab;
  const sectionRequestNonce = sectionRequest?.nonce;
  const setTab = useCallback((next: Tab) => setSection({ nonce: requestNonce, viewNonce: sectionRequestNonce, tab: next }), [requestNonce, sectionRequestNonce]);
  useEffect(() => { onSectionChange?.(tab); }, [onSectionChange, tab]);
  const [loaded, setLoaded] = useState<{ handle: FileSystemDirectoryHandle; records: AnalysisRecord[]; cursor: string | null; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const [decisionArchive, setDecisionArchive] = useState<MeaningTransitionArchiveState>('pending');
  /* A failure is one readable sentence; the raw exception stays folded under it. */
  const [error, setError] = useState<{ sentence: string; detail: string | null } | null>(null);
  const failWith = (sentence: string, failure: unknown) =>
    setError({ sentence, detail: failure instanceof Error ? failure.message : String(failure) });
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saveState = capture?.state ?? null;
  const setSaveState = capture?.setState;
  const [checked, setChecked] = useState<{ run: AnalysisRun; context: AnalysisCaptureContext; state: AnalysisCompatibility } | null>(null);
  const [reviewText, setReviewText] = useState('');
  const [view, setView] = useState(LIST_VIEW);
  const [recordOpen, setRecordOpen] = useState(false);
  const historyPanelRef = useRef<HTMLDivElement>(null);
  const returnRowRef = useRef<string | null>(null);
  const loadGeneration = useRef(0);
  const writable = analysisArchiveWritable(context.handle, context.writable);
  const records = loaded?.handle === context.handle ? loaded.records : EMPTY_RECORDS;
  /* Folders written before only review requests were recorded hold a run for every chat turn. */
  const runs = useMemo(() => records.filter((record): record is AnalysisRun => record.recordType === 'run'
    && record.mode === context.mode && record.scope.projectSlug === context.scope.projectSlug
    && record.scope.profileSlug === context.scope.profileSlug
    && isReviewResult(record)), [records, context.mode, context.scope.projectSlug, context.scope.profileSlug]);
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const olderPage = loaded?.handle === context.handle ? loaded.cursor : null;
  const problems = loaded?.handle === context.handle ? loaded.problems : EMPTY_PROBLEMS;
  /* An unreadable record is not an empty archive: it may be the only review there is. */
  const emptyArchive = !runs.length && Boolean(context.handle) && loaded?.handle === context.handle && !olderPage && !readPending && !error && !problems.length;
  const saved = saveState?.handle === context.handle ? saveState : null;
  const fitsContent = open && tab === 'history' && emptyArchive;
  useEffect(() => { onFitContentChange?.(fitsContent); }, [fitsContent, onFitContentChange]);
  useEffect(() => () => onFitContentChange?.(false), [onFitContentChange]);
  /*
   * A requested review that finishes in front of the person opens as its result; any other saved
   * record arrives as a toast. The foot keeps only saving in progress or an error with retry.
   */
  const toast = useToast();
  useEffect(() => {
    if (saved?.status !== 'saved' || announcedSaveIds.has(saved.id)) return;
    announcedSaveIds.add(saved.id);
    const showResult = () => { setSelectedId(saved.id); setTab('history'); };
    const watchedReview = open && tab === 'conversation' && !!saved.record && requestsAnalysisFindings(saved.record.request.text);
    if (watchedReview) { showResult(); toast.show(t('save.saved'), 'success'); return; }
    toast.show(t('save.saved'), 'success', { label: t('viewSaved'), onClick: showResult });
  }, [saved, open, tab, t, toast, setSelectedId, setTab]);
  const sameScope = selected ? analysisScopeKey(selected.mode, selected.scope) === analysisScopeKey(context.mode, context.scope) : false;
  /* Records are create-only, so a re-read run with the same id keeps its checked basis. */
  const compatibility = checked && checked.run.id === selected?.id && checked.context === context ? checked.state : null;
  const overlayReady = !!selected && selected.qualification.status === 'grounded' && sameScope && compatibility?.status === 'current';
  const historyShown = open && tab === 'history';
  const dispositionOf = (run: AnalysisRun, finding: AnalysisFinding): FindingDisposition | null => latestFindingReview(records, run.id, finding.id)?.disposition ?? null;
  const dismissedFindings = selected ? selected.findings.filter((finding) => dispositionOf(selected, finding) === 'dismiss') : [];
  const openFindings = selected ? selected.findings.filter((finding) => !dismissedFindings.includes(finding)) : [];
  const findingOf = (key: string) => {
    const runId = key.slice(0, key.indexOf(':'));
    const findingId = key.slice(runId.length + 1);
    const run = selected?.id === runId ? selected : null;
    const finding = run?.findings.find((item) => item.id === findingId);
    return run && finding ? { run, finding } : null;
  };
  const shownView = view !== LIST_VIEW && findingOf(view) ? view : LIST_VIEW;
  const { leaving: leavingView } = useSurfaceSwap(shownView);

  const refresh = useCallback((cursor: string | null = null) => {
    const handle = context.handle;
    if (!handle || !open) return;
    const generation = ++loadGeneration.current;
    // Archive reads are asynchronous; publish their pending state for this generation only.
    queueMicrotask(() => { if (generation === loadGeneration.current) setReadPending(true); });
    return readAnalysisHistory(handle, { cursor }).then((page) => {
      if (generation !== loadGeneration.current) return;
      setError(null);
      setLoaded((previous) => ({
        handle, records: cursor && previous?.handle === handle ? [...previous.records, ...page.records] : page.records,
        cursor: page.nextCursor,
        problems: [...(cursor && previous?.handle === handle ? previous.problems : []), ...page.problems.map((problem) => `${problem.fileName}: ${problem.reason}`)],
      }));
    }).catch((failure) => {
      if (generation === loadGeneration.current) setError({ sentence: t('readFailed'), detail: failure instanceof Error ? failure.message : String(failure) });
    }).finally(() => { if (generation === loadGeneration.current) setReadPending(false); });
  }, [context.handle, open, t]);

  /* Re-read whenever the results tab comes into view; no signal reaches here when another program writes the folder. */
  useEffect(() => {
    if (!historyShown || !context.handle) return;
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('atlas-analysis-records-changed', update);
    return () => { loadGeneration.current += 1; window.removeEventListener('atlas-analysis-records-changed', update); };
  }, [context.handle, historyShown, refresh]);
  /* A page can hold only unlisted chat turns, so an empty list is known only at the last page. */
  useEffect(() => {
    if (open && !runs.length && olderPage && !readPending && !error) void refresh(olderPage);
  }, [open, runs.length, olderPage, readPending, error, refresh]);
  useEffect(() => {
    if (!open || !selected) return;
    let cancelled = false;
    void Promise.all([currentAnalysisBasis(context, selected.evidence.map((item) => item.slug)), verifyAnalysisEvidence(selected)])
      .then(([basis, problems]) => {
        if (cancelled) return;
        const state = compareAnalysisBasis(selected.basis, basis);
        setChecked({ run: selected, context, state: problems.length ? { status: 'unknown', reasons: [...state.reasons, ...problems] } : state });
      }).catch(() => { if (!cancelled) setChecked({ run: selected, context, state: { status: 'unknown', reasons: ['evidence_check_failed'] } }); });
    return () => { cancelled = true; };
  }, [context, open, selected]);
  useEffect(() => {
    const visible = historyShown && overlayReady && selected
      ? selected.findings.filter((finding) => latestFindingReview(records, selected.id, finding.id)?.disposition !== 'dismiss') : [];
    onFindingsChange?.(visible);
  }, [onFindingsChange, historyShown, overlayReady, records, selected]);
  useEffect(() => () => onFindingsChange?.([]), [onFindingsChange]);
  /*
   * Capture phase: the map closes its review on any Escape nobody prevented, and a text click
   * leaves focus outside every element handler of this panel.
   */
  const detailShown = historyShown && shownView !== LIST_VIEW && !recordOpen;
  useEffect(() => {
    if (!detailShown) return;
    const findingId = shownView.slice(shownView.indexOf(':') + 1);
    const goBack = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || isImeComposing(event)) return;
      const target = event.target;
      const panel = panelRef.current;
      /* A text click leaves focus on the body or the route container, an ancestor of this panel. */
      if (!panel || !(target instanceof Node) || !(panel.contains(target) || target.contains(panel))) return;
      event.preventDefault(); event.stopPropagation();
      returnRowRef.current = findingId; setNotice(null); setView(LIST_VIEW);
    };
    window.addEventListener('keydown', goBack, true);
    return () => window.removeEventListener('keydown', goBack, true);
  }, [detailShown, shownView]);
  /* Back from a finding lands on its row; the row's frame stops being inert in this same commit. */
  useLayoutEffect(() => {
    const panel = historyPanelRef.current;
    if (!panel) return;
    if (shownView !== LIST_VIEW) { panel.scrollTop = 0; return; }
    const findingId = returnRowRef.current;
    returnRowRef.current = null;
    if (findingId) [...panel.querySelectorAll<HTMLElement>(`[data-review-view="${LIST_VIEW}"]:not([inert]) [data-finding-row]`)].find((row) => row.dataset.findingRow === findingId)?.focus();
  }, [shownView]);

  /*
   * Asks the agent to write missing relation reasons through patch_concept; each write still stops
   * at a permission card.
   */
  function requestNotes() {
    onRequest?.(`${t('relationNotesPrompt', { limit: 12 })}\nScope: ${JSON.stringify(context.scope)}.`, null);
    setTab('conversation');
  }
  function request(followUp: boolean) {
    const parent = followUp ? selected : null;
    const instruction = context.mode === 'architecture' ? t('architecturePrompt') : t('meaningPrompt');
    const scope = JSON.stringify(context.scope);
    const previous = parent ? `\nContinue analysis ${parent.id}. Read it with query_ontology(operation: "analysis_record", recordId: "${parent.id}"). Recheck its evidence. Preserve disputed and unresolved questions.` : '';
    const language = new Intl.DisplayNames(['en'], { type: 'language' }).of(locale) ?? locale;
    const responseLanguage = `Write the answer, finding titles, explanations and suggested next steps in ${language} (${locale}). Keep schema keys, enum values, identifiers, paths and exact source quotations unchanged. Explain quoted evidence in ${language}.`;
    onRequest?.(`${instruction}\nScope: ${scope}.${previous}\n${ANALYSIS_FINDINGS_INSTRUCTION}\n${responseLanguage}`, parent?.id ?? null);
    setTab('conversation');
  }
  function openFinding(run: AnalysisRun, finding: AnalysisFinding) {
    if (onFinding && !onFinding(finding, run)) { setNotice(null); setError({ sentence: t('targetUnavailable'), detail: null }); }
    else {
      setError(null);
      setNotice(onFinding && !window.matchMedia('(min-width: 1024px)').matches ? t('targetSelectedSheet') : null);
    }
    setReviewText('');
    setView(`${run.id}:${finding.id}`);
  }
  function backToList(findingId: string) {
    returnRowRef.current = findingId;
    setNotice(null);
    setView(LIST_VIEW);
  }
  /* Names the record and position only: recorded text may hold the findings fence, and must never make this a review. */
  function requestFix(run: AnalysisRun, finding: AnalysisFinding) {
    onRequest?.(t('fixPrompt', { recordId: run.id, position: run.findings.indexOf(finding) + 1 }), null);
    setTab('conversation');
  }
  /* The record schema accepts an empty rationale, so one press judges and a reason is optional. */
  async function review(finding: AnalysisFinding, disposition: FindingDisposition) {
    const handle = context.handle;
    if (!selected || !handle || !writable) return;
    setBusy(true); setError(null);
    try {
      const record: AnalysisRecord = { schema: 'atlas-analysis/v1', recordType: 'review', id: crypto.randomUUID(), createdAt: new Date().toISOString(), runId: selected.id, findingId: finding.id, disposition, actor: 'user-action', rationale: reviewText.trim() };
      await appendAnalysisRecord(handle, record, context.writable);
      setLoaded((previous) => previous?.handle === handle ? { ...previous, records: [...previous.records, record] } : previous);
      setReviewText('');
      backToList(finding.id);
    } catch (failure) { failWith(t('reviewFailed'), failure); }
    finally { setBusy(false); }
  }
  function evidenceConcepts(run: AnalysisRun, finding: AnalysisFinding): EvidenceConcept[] {
    return finding.evidenceSlugs.map((slug) => {
      const node = context.graph.nodes.find((item) => item.id === slug);
      const captured = run.evidence.find((item) => item.slug === slug);
      return { slug, title: node?.title ?? captured?.title ?? null, kind: node?.kind ?? captured?.kind ?? null };
    });
  }
  function exportMarkdown(markdown: string, id: string) {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${id}.md`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const fillNotesChip = onRequest && relationNoteGaps > 0 && context.mode === 'meaning'
    ? <Chip size="lg" data-testid="workbench-fill-notes" onClick={requestNotes}>{t('fillNotes', { count: relationNoteGaps })}</Chip> : null;
  const refreshButton = context.handle ? <IconButton size="lg" hoverSurface="lift" hoverInk="strong" label={t('refresh')} onClick={() => void refresh()}><RotateCcw size={ICON_SIZE.sm} aria-hidden /></IconButton> : null;
  function findingList(run: AnalysisRun, leaving: boolean) {
    const status = compatibility?.status;
    /* A cancelled or failed review is not a clean one, so it never reads as nothing to check. */
    const finished = run.origin.outcome === 'completed';
    return <div data-testid={leaving ? undefined : 'review-finding-list'} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-body-lg leading-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {finished ? t('toCheck', { count: openFindings.length }) : t(`outcome.${run.origin.outcome}`)}
          {!finished && run.findings.length ? ` · ${t('toCheck', { count: openFindings.length })}` : null}
          {dismissedFindings.length ? <span className="text-[color:var(--color-text-tertiary)]"> · {t('dismissedCount', { count: dismissedFindings.length })}</span> : null}
        </h3>
        {runs.length > 1
          ? <Select size="sm" quiet ariaLabel={t('version')} value={run.id} onChange={(id) => { setSelectedId(id); setView(LIST_VIEW); }} className="min-w-0" options={runs.map((item, index) => ({ value: item.id, label: `${index === 0 ? `${t('latest')} · ` : ''}${new Date(item.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}`, description: `${item.id.slice(0, 8)} · ${item.request.text.slice(0, 80)}` }))} />
          : <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{new Date(run.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onRequest ? <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('reanalyze')}</Chip> : null}
          {fillNotesChip}
          {refreshButton}
        </div>
      </div>
      <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('trustLine')}</p>
      {status === 'stale' || status === 'unknown' ? <p className="text-label leading-label text-[color:var(--color-status-warning)]">{t(status === 'stale' ? 'basisStaleLine' : 'basisUnknownLine')}</p> : null}
      {run.observations.map((observation, index) => <ArchitectureObservation key={`${observation.toolCallId}:${index}`} result={observation.result} />)}
      {run.findings.length === 0 ? finished ? <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t('noFindings')}</p> : null
        : <ul className="grid auto-rows-fr gap-2">{[...openFindings, ...dismissedFindings].map((finding) => <li key={finding.id} className="min-w-0">
          <FindingRow finding={finding} disposition={dispositionOf(run, finding)} onOpen={() => openFinding(run, finding)} />
        </li>)}</ul>}
      <Chip size="lg" hoverBorder="strong" className="self-start" onClick={() => setRecordOpen(true)}>{t('recordDetails')}</Chip>
    </div>;
  }
  function findingDetail(key: string) {
    const target = findingOf(key);
    if (!target) return null;
    const { run, finding } = target;
    return <FindingDetail finding={finding} disposition={dispositionOf(run, finding)} evidence={evidenceConcepts(run, finding)}
      reason={reviewText} busy={busy} onReasonChange={setReviewText} onBack={() => backToList(finding.id)}
      onFix={onRequest && context.mode === 'meaning' && PLAIN_RECORD_ID.test(run.id) ? () => requestFix(run, finding) : null} onJudge={writable ? (disposition) => void review(finding, disposition) : null}
      onEvidence={onEvidence ?? null} />;
  }
  const subjectKind = contextKind && !(tab === 'conversation' && conversationLabel) ? contextKind : null;
  /** The lit tab already says "conversation", so beside a kind the eyebrow keeps only the kind. */
  const conversationNamedByTab = tab === 'conversation' && subjectKind !== null;
  const hasTabStrip = Boolean(conversation || facts);
  /** A lone section is no tab panel: no tab in the document would label it. */
  const loneSectionRole = hasTabStrip ? null : { role: undefined, 'aria-labelledby': undefined };
  /* The dialog sits outside the section: Escape inside it must not bubble to the section's close. */
  return <><section ref={panelRef} data-testid="analysis-workbench" onKeyDown={(event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !isImeComposing(event)) { event.stopPropagation(); onClose(); }
  }} className="flex min-h-0 flex-1 flex-col gap-3 break-keep text-body text-[color:var(--color-text-primary)] [&_summary]:content-center [@media(pointer:coarse)]:[&_summary]:min-h-[var(--touch-target-min)]">
    {/*
     * flex-wrap: below about 330px the tab strip drops to its own line instead of truncating the
     * subject.
     */}
    <header className="relative flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 pr-8">
      <div className="min-w-0 flex-1 basis-36"><p data-testid="analysis-workbench-eyebrow" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-label leading-label text-[color:var(--color-text-secondary)]">{conversationNamedByTab ? null : <><span>{t(tab === 'conversation' ? 'conversationTitle' : context.mode === 'meaning' ? 'meaningTitle' : 'architectureTitle')}</span>{subjectKind ? <span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span> : null}</>}{subjectKind ? <><span className="inline-flex items-center gap-1 text-[color:var(--color-text-tertiary)]"><OntologyMapKindGlyph kind={subjectKind} size={11} />{kindLabel(KNOWN_KINDS.includes(subjectKind) ? subjectKind : 'unknown')}</span></> : null}</p><h2 className="break-words text-title font-[var(--font-weight-strong)]">{tab === 'conversation' ? conversationLabel ?? contextLabel : contextLabel}</h2></div>
      {/*
       * TabBar, not SegmentedControl: these are views, not a value; panels carry the matching
       * workbench-tabpanel-* id.
       */}
      {/* The results section alone needs no strip. */}
      {hasTabStrip ? <div data-testid="analysis-workbench-tabs" className="flex min-w-0 shrink-0 items-end">
        <TabBar idPrefix="workbench" ariaLabel={t('section')} activeKey={tab} onSelect={(key) => setTab(key as Tab)} items={[
          ...(conversation ? [{ key: 'conversation', label: t('conversation') }] : []), ...(facts ? [{ key: 'meaning', label: t('meaning') }] : []), { key: 'history', label: t('history') },
        ]} />
      </div> : null}
      <CloseButton ref={closeRef} data-testid="analysis-workbench-close" className="absolute right-0 top-1" label={t(tab === 'conversation' ? 'closeConversation' : 'close')} onClick={onClose} />
    </header>
    {error ? <div data-testid="analysis-workbench-error" className="flex flex-col gap-1">
      <InlineAlert>{error.sentence}</InlineAlert>
      {error.detail ? <FailureDetail summary={t('errorDetails')} detail={error.detail} /> : null}
    </div> : null}
    {notice ? <p role="status" className="text-label leading-label text-[color:var(--color-text-secondary)]">{notice}</p> : null}
    {tab === 'meaning' && facts ? <div role="tabpanel" id="workbench-tabpanel-meaning" aria-labelledby="workbench-tab-meaning" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 pr-1">
      <div className="flex flex-col gap-2">
        <p className="text-body leading-body text-[color:var(--color-text-primary)]">{t('architectureCriteria')}</p>
        {onRequest ? <div className="flex flex-wrap items-center gap-2">
          <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('analyze')}</Chip>
        </div> : <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('agentUnavailable')}</p>}
        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p>
      </div>
      <div className={DIVIDED}>{facts}</div>
    </div> : null}
    {tab === 'history' ? <div ref={historyPanelRef} role="tabpanel" id="workbench-tabpanel-history" aria-labelledby="workbench-tab-history" {...loneSectionRole} className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2 pr-1" aria-busy={busy || readPending}>
      {!context.handle ? <p>{t('openFolder')}</p> : null}
      {context.handle && readPending && !runs.length ? <p role="status">{t('loadingHistory')}</p> : null}
      {emptyArchive ? <div data-testid="analysis-history-empty" className="agent-panel-stage-swap"><EmptyState
        size="compact"
        align="center"
        icon={<HistoryIcon aria-hidden />}
        title={<span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{t(decisionArchive === 'empty' ? 'emptyWithDecisions' : 'empty')}</span>}
        description={<span className="mx-auto block max-w-[46ch]">
          {t('emptyEffect')}
          {onRequest
            ? decisionArchive === 'unavailable' ? <span className="mt-2 block">{t('meaningTransitions.unavailable')}</span> : null
            : <span className="mt-2 block">{t(decisionArchive === 'unavailable' ? 'agentUnavailableWithDecisions' : 'agentUnavailable')}</span>}
        </span>}
        action={<>
          {onRequest ? <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('analyze')}</Chip> : null}
          {fillNotesChip}
          {refreshButton}
          {onRequest ? <p className="basis-full text-balance pt-1 text-label leading-label text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p> : null}
        </>}
      /></div> : null}
      {/* A failed read hides the empty state, and the request must not go with it. */}
      {!selected && problems.length ? <div data-testid="analysis-history-problems" className="flex flex-wrap items-center gap-2">
        <p role="status" className="min-w-0 flex-1 text-label leading-label text-[color:var(--color-status-warning)]">{t('recordProblems', { count: problems.length })}</p>
        {refreshButton}
        <pre className="basis-full whitespace-pre-wrap break-words text-caption leading-caption text-[color:var(--color-text-secondary)]">{problems.join('\n')}</pre>
      </div> : null}
      {onRequest && (error || problems.length > 0) && !runs.length ? <div data-testid="analysis-history-request" className="flex flex-wrap items-center gap-2">
        <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('analyze')}</Chip>
        {fillNotesChip}
      </div> : null}
      {selected ? <div className="grid">
        {[shownView, ...(leavingView !== null && leavingView !== shownView ? [leavingView] : [])].map((key) => {
          const leaving = key !== shownView;
          return <div key={key} data-review-view={key === LIST_VIEW ? LIST_VIEW : 'finding'} inert={leaving || undefined} aria-hidden={leaving || undefined} className={cn('col-start-1 row-start-1 min-w-0', leaving ? 'motion-swap-out pointer-events-none' : leavingView === null ? null : key === LIST_VIEW ? 'settings-view-pop-in' : 'settings-view-push-in')}>
            {key === LIST_VIEW ? findingList(selected, leaving) : findingDetail(key)}
          </div>;
        })}
      </div> : null}
      {runs.length ? null : <MeaningTransitionHistory handle={context.handle} open={historyShown} onStateChange={setDecisionArchive} />}
    </div> : null}
    {conversation ? <div role="tabpanel" id="workbench-tabpanel-conversation" aria-labelledby="workbench-tab-conversation" className={cn('min-h-0 flex-1 flex-col', tab === 'conversation' ? 'flex' : 'hidden')} inert={tab !== 'conversation'}>{conversation}</div> : null}
    {saved && saved.status !== 'saved' ? <div role="status" data-testid="analysis-workbench-save" className="flex shrink-0 flex-wrap items-center gap-2 text-caption text-[color:var(--color-text-secondary)]">
      <span className="min-w-0 break-keep">{t(`save.${saved.status}`)}</span>
      {saved.status === 'error' ? <>
        {saved.error ? <FailureDetail summary={t('errorDetails')} detail={saved.error} /> : null}
        {saved.record ? <>{writable && !saved.record.qualification.reasons.includes('turn_origin_mismatch') ? <Chip size="lg" onClick={() => { if (context.handle && saved.record) void appendAnalysisRecord(context.handle, saved.record, context.writable).then(() => setSaveState?.({ ...saved, status: 'saved', error: null })).catch((failure: unknown) => failWith(t('save.error'), failure)); }}>{t('retrySave')}</Chip> : null}<Chip size="lg" onClick={() => exportMarkdown(serializeAnalysisRecord(saved.record!), saved.record!.id)}>{t('export')}</Chip></> : saved.rawAnswer ? <Chip size="lg" onClick={() => exportMarkdown(saved.rawAnswer!, saved.id)}>{t('export')}</Chip> : null}
      </> : null}
    </div> : null}
  </section>
  {selected ? <ReviewRecordDialog open={recordOpen} onClose={() => setRecordOpen(false)} run={selected} compatibility={compatibility}
    answer={<ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span> }}>{selected.answer}</ReactMarkdown>}
      problems={problems}
      actions={<>
        <Chip size="lg" onClick={() => exportMarkdown(serializeAnalysisRecord(selected), selected.id)}>{t('export')}</Chip>
        {onRequest ? <Chip size="lg" onClick={() => { setRecordOpen(false); request(true); }}>{t('followUp')}</Chip> : null}
        {olderPage ? <Chip size="lg" onClick={() => void refresh(olderPage)}>{t('loadOlder')}</Chip> : null}
      </>}
      decisions={<MeaningTransitionHistory handle={context.handle} open={recordOpen} />} /> : null}
  </>;
}

function FailureDetail({ summary, detail }: { summary: string; detail: string }) {
  return <Disclosure summary={summary} className="min-w-0 text-[color:var(--color-text-tertiary)]">
    <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-caption leading-caption">{detail}</pre>
  </Disclosure>;
}

function ArchitectureObservation({ result }: { result: Record<string, unknown> }) {
  const t = useTranslations('analysisWorkbench');
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const conformance = record(result.conformance);
  const measured = record(result.measured);
  const profile = record(result.profile);
  const unknown = record(conformance.unknown);
  const source = record(conformance.source);
  const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : t('unknownCount');
  return <section className="space-y-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
    <h3 className="text-body-lg font-[var(--font-weight-strong)]">{t('measurement')}</h3>
    <p className="text-caption text-[color:var(--color-text-secondary)]">{String(profile.title ?? profile.slug ?? '')} · {String(measured.at ?? '')}</p>
    <p>{t('measurementCounts', { violations: count(conformance.violationCount), unmapped: count(unknown.unmappedEdges), files: count(source.filesScanned) })}</p>
    <p className="text-caption text-[color:var(--color-text-secondary)]">{t('measurementScope')}</p>
  </section>;
}
