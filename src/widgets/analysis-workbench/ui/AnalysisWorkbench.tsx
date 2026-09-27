'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { analysisArchiveWritable, analysisScopeKey, appendAnalysisRecord, compareAnalysisBasis, latestFindingReview, readAnalysisHistory, serializeAnalysisRecord, verifyAnalysisEvidence, type AnalysisCompatibility, type AnalysisFinding, type AnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';
import { ANALYSIS_FINDINGS_INSTRUCTION, currentAnalysisBasis, type AnalysisCaptureContext, type AnalysisSaveState } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { Checkbox, Chip, Disclosure, EmptyState, IconButton, OntologyMapKindGlyph, Select, TabBar, Textarea, useToast } from '@/shared/ui';
import { History as HistoryIcon, RotateCcw, X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { MeaningTransitionHistory, type MeaningTransitionArchiveState } from './MeaningTransitionHistory';

/** Hairline between groups, only where no label already separates them. */
const DIVIDED = 'border-t border-[color:var(--color-divider)] pt-4';
/**
 * Sans, not mono caps: mono metrics push Hangul syllables apart (`docs/DESIGN-SYSTEM.md`, "Caps
 * tracking is a Latin device").
 */
const SECTION_LABEL = 'text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]';

type Tab = 'meaning' | 'history' | 'conversation';
const KNOWN_KINDS = ['project', 'domain', 'capability', 'element', 'document', 'vault-readme'];
const EMPTY_RECORDS: AnalysisRecord[] = [];

/** One context slot beside the canvas. Hiding conversation never unmounts its ACP session. */
/**
 * Module-level on purpose: the workbench unmounts when its dock closes, and a saved record must not
 * toast again on reopen.
 */
const announcedSaveIds = new Set<string>();

function InlineAlert({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-2 text-label leading-label text-[color:var(--color-danger-text)]">{children}</p>;
}

export function AnalysisWorkbench({ context, contextLabel, contextKind = null, open, requestNonce, sectionRequest, onSectionChange, onFitContentChange, initialTab = 'meaning', facts, conversation, onRequest, relationNoteGaps = 0, onClose, onEvidence, onFinding, onFindingsChange, capture, returnFocusSelector }: {
  context: AnalysisCaptureContext;
  contextLabel: string;
  /** The picked node's kind, shown in the header eyebrow beside the view name. */
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
   * Relations in scope with an empty `relation_notes`; above zero the Meaning view offers to have
   * the agent write them.
   */
  relationNoteGaps?: number;
  onClose: () => void;
  returnFocusSelector?: string;
  onEvidence?: (slug: string) => void;
  onFinding?: (finding: AnalysisFinding, run: AnalysisRun) => boolean;
  onFindingsChange?: (findings: readonly AnalysisFinding[]) => void;
}) {
  const t = useTranslations('analysisWorkbench');
  const glossary = useTranslations('searchWidgets.shortcuts.glossary');
  const kindLabel = useTranslations('kinds');
  const locale = useLocale();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    /* Record the opener once: later runs of this effect already see focus on the close button. */
    const active = document.activeElement;
    const origin = active instanceof HTMLElement && active !== document.body && !panel?.contains(active)
      ? active : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      /*
       * Restore waits until the panel is gone and the target is focusable (inert for about three
       * frames, exit about 220ms), gives up after about 0.66s, and stands down once focus moves
       * elsewhere.
       */
      let frames = 0;
      const restore = () => {
        const current = document.activeElement;
        if (current !== document.body && current?.isConnected && !panel?.contains(current)) return;
        const target = origin?.isConnected && !origin.closest('[inert]')
          ? origin : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
        if (!panel?.isConnected && target?.isConnected && !target.closest('[inert]')) {
          target.focus({ preventScroll: true });
          return;
        }
        if ((frames += 1) < 40) window.requestAnimationFrame(restore);
      };
      window.requestAnimationFrame(restore);
    };
  }, [open, returnFocusSelector]);
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
  const [showIssues, setShowIssues] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewing, setReviewing] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const writable = analysisArchiveWritable(context.handle, context.writable);
  const records = loaded?.handle === context.handle ? loaded.records : EMPTY_RECORDS;
  const runs = useMemo(() => records.filter((record): record is AnalysisRun => record.recordType === 'run'
    && record.mode === context.mode && record.scope.projectSlug === context.scope.projectSlug
    && record.scope.profileSlug === context.scope.profileSlug), [records, context.mode, context.scope.projectSlug, context.scope.profileSlug]);
  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;
  const emptyArchive = !runs.length && Boolean(context.handle) && loaded?.handle === context.handle && !readPending && !error;
  const saved = saveState?.handle === context.handle ? saveState : null;
  const fitsContent = open && tab === 'history' && emptyArchive;
  useEffect(() => { onFitContentChange?.(fitsContent); }, [fitsContent, onFitContentChange]);
  useEffect(() => () => onFitContentChange?.(false), [onFitContentChange]);
  /*
   * A saved analysis arrives as a toast; the foot keeps only saving in progress or an error with
   * retry.
   */
  const toast = useToast();
  useEffect(() => {
    if (saved?.status !== 'saved' || announcedSaveIds.has(saved.id)) return;
    announcedSaveIds.add(saved.id);
    toast.show(t('save.saved'), 'success', { label: t('viewSaved'), onClick: () => { setSelectedId(saved.id); setTab('history'); } });
  }, [saved, t, toast, setSelectedId, setTab]);
  const sameScope = selected ? analysisScopeKey(selected.mode, selected.scope) === analysisScopeKey(context.mode, context.scope) : false;
  const compatibility = checked?.run === selected && checked.context === context ? checked.state : null;
  const overlayReady = !!selected && selected.qualification.status === 'grounded' && sameScope && compatibility?.status === 'current';
  const reviews = records.filter((record) => record.recordType === 'review');
  const earlierQuestions = runs.slice(1).flatMap((run) => run.findings
    .filter((finding) => latestFindingReview(records, run.id, finding.id)?.disposition !== 'dismiss')
    .map((finding) => ({ run, finding })));

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

  useEffect(() => {
    if (!open || !context.handle) return;
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('atlas-analysis-records-changed', update);
    return () => { loadGeneration.current += 1; window.removeEventListener('atlas-analysis-records-changed', update); };
  }, [context.handle, open, refresh]);
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
    const visible = open && showIssues && overlayReady && selected
      ? selected.findings.filter((finding) => latestFindingReview(records, selected.id, finding.id)?.disposition !== 'dismiss') : [];
    onFindingsChange?.(visible);
    return () => onFindingsChange?.([]);
  }, [onFindingsChange, open, overlayReady, records, selected, showIssues]);

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
    onRequest?.(`${instruction}\nScope: ${scope}.${previous}\n${ANALYSIS_FINDINGS_INSTRUCTION}`, parent?.id ?? null);
    setTab('conversation');
  }
  async function review(findingId: string, disposition: 'retain' | 'dismiss') {
    const handle = context.handle;
    if (!selected || !handle || !writable || !reviewText.trim()) return;
    setBusy(true); setError(null);
    try {
      await appendAnalysisRecord(handle, { schema: 'atlas-analysis/v1', recordType: 'review', id: crypto.randomUUID(), createdAt: new Date().toISOString(), runId: selected.id, findingId, disposition, actor: 'user-action', rationale: reviewText.trim() }, context.writable);
      setReviewing(null); setReviewText('');
    } catch (failure) { failWith(t('reviewFailed'), failure); }
    finally { setBusy(false); }
  }
  function exportMarkdown(markdown: string, id: string) {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${id}.md`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section ref={panelRef} data-testid="analysis-workbench" onKeyDown={(event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onClose(); }
  }} className="flex min-h-0 flex-1 flex-col gap-3 break-keep text-body text-[color:var(--color-text-primary)] [&_summary]:content-center [@media(pointer:coarse)]:[&_summary]:min-h-[var(--touch-target-min)]">
    {/*
     * flex-wrap: below about 330px the tab strip drops to its own line instead of truncating the
     * subject.
     */}
    <header className="relative flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2 pr-8">
      <div className="min-w-0 flex-1 basis-36"><p data-testid="analysis-workbench-eyebrow" className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-label leading-label text-[color:var(--color-text-secondary)]"><span>{t(tab === 'conversation' ? 'conversationTitle' : context.mode === 'meaning' ? 'meaningTitle' : 'architectureTitle')}</span>{contextKind ? <><span aria-hidden className="text-[color:var(--color-text-quaternary)]">·</span><span className="inline-flex items-center gap-1 text-[color:var(--color-text-tertiary)]"><OntologyMapKindGlyph kind={contextKind} size={11} />{kindLabel(KNOWN_KINDS.includes(contextKind) ? contextKind : 'unknown')}</span></> : null}</p><h2 className="break-words text-title font-[var(--font-weight-strong)]">{contextLabel}</h2></div>
      {/*
       * TabBar, not SegmentedControl: these are views, not a value; panels carry the matching
       * workbench-tabpanel-* id.
       */}
      <div data-testid="analysis-workbench-tabs" className="flex min-w-0 shrink-0 items-end">
        <TabBar idPrefix="workbench" ariaLabel={t('section')} activeKey={tab} onSelect={(key) => setTab(key as Tab)} items={[
          { key: 'meaning', label: t('meaning') }, { key: 'history', label: t('history') }, ...(conversation ? [{ key: 'conversation', label: t('conversation') }] : []),
        ]} />
      </div>
      <IconButton ref={closeRef} data-testid="analysis-workbench-close" className="absolute right-0 top-0 size-[var(--overlay-close-size)]" label={t(tab === 'conversation' ? 'closeConversation' : 'close')} onClick={onClose}><X size={ICON_SIZE.lg} /></IconButton>
    </header>
    {error ? <div data-testid="analysis-workbench-error" className="flex flex-col gap-1">
      <InlineAlert>{error.sentence}</InlineAlert>
      {error.detail ? <FailureDetail summary={t('errorDetails')} detail={error.detail} /> : null}
    </div> : null}
    {notice ? <p role="status" className="text-label leading-label text-[color:var(--color-text-secondary)]">{notice}</p> : null}
    {tab === 'meaning' ? <div role="tabpanel" id="workbench-tabpanel-meaning" aria-labelledby="workbench-tab-meaning" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {/*
         * The primary is the same chip box in filled indigo, so only the fill separates it from its
         * neighbour.
         */}
        {onRequest ? <div className="flex flex-wrap items-center gap-2">
          <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('analyze')}</Chip>
          {relationNoteGaps > 0 && context.mode === 'meaning' ? <Chip size="lg" data-testid="workbench-fill-notes" onClick={requestNotes}>{t('fillNotes', { count: relationNoteGaps })}</Chip> : null}
        </div> : <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('agentUnavailable')}</p>}
        <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p>
      </div>
      <div className={DIVIDED}>{facts ?? <p>{context.mode === 'architecture' ? t('architectureCriteria') : glossary('ontologyDefinition')}</p>}</div>
    </div> : null}
    {tab === 'history' ? <div role="tabpanel" id="workbench-tabpanel-history" aria-labelledby="workbench-tab-history" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" aria-busy={busy || readPending}>
      <MeaningTransitionHistory handle={context.handle} open={open && tab === 'history'} foldWhenQuiet={!runs.length} onStateChange={setDecisionArchive} />
      {/*
       * The trigger shows only latest plus a short date and time; the id moves to the option
       * description so the value never truncates.
       */}
      {runs.length ? <div className="agent-panel-stage-swap flex flex-wrap items-center gap-2">
        <Select size="md" ariaLabel={t('version')} value={selected?.id ?? ''} onChange={setSelectedId} className="min-w-0 flex-1 basis-48" options={runs.map((run, index) => ({ value: run.id, label: `${index === 0 ? `${t('latest')} · ` : ''}${new Date(run.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}`, description: `${run.id.slice(0, 8)} · ${run.request.text.slice(0, 80)}` }))} />
        {onRequest ? <Chip size="lg" tone="onAccent" onClick={() => request(false)}>{t('reanalyze')}</Chip> : null}
        {context.handle ? <Chip size="lg" onClick={() => void refresh()}><RotateCcw size={ICON_SIZE.sm} aria-hidden />{t('refresh')}</Chip> : null}
      </div> : null}
      {!context.handle ? <p>{t('openFolder')}</p> : null}
      {context.handle && readPending ? <p role="status">{t('loadingHistory')}</p> : null}
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
          <Chip size="lg" onClick={() => void refresh()}><RotateCcw size={ICON_SIZE.sm} aria-hidden />{t('refresh')}</Chip>
          {onRequest ? <p className="basis-full text-balance pt-1 text-label leading-label text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p> : null}
        </>}
      /></div> : null}
      {runs.length ? <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p> : null}
      {selected ? <>
        {selected === runs[0] && earlierQuestions.length ? <Disclosure summary={t('earlierQuestions', { count: earlierQuestions.length })}>
          <p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('earlierQuestionsNote')}</p>
          <div className="mt-2 flex flex-col items-start gap-2">{earlierQuestions.map(({ run, finding }) => <Chip key={`${run.id}:${finding.id}`} size="lg" onClick={() => setSelectedId(run.id)}>{finding.title} · {run.id.slice(0, 8)}</Chip>)}</div>
        </Disclosure> : null}
        <div className={cn('space-y-1', DIVIDED)}>
          <h3 className="break-words text-body-lg font-[var(--font-weight-strong)]">{selected.scope.targetSlugs.join(', ') || t('wholeProject')}</h3>
          <p className="text-caption text-[color:var(--color-text-secondary)]">{t(`outcome.${selected.origin.outcome}`)} · {t(`basis.${compatibility?.status ?? 'checking'}`)} · {t(selected.qualification.status === 'grounded' ? 'grounded' : 'unverified')}</p>
          <p className="text-caption text-[color:var(--color-text-secondary)]">{t('readCoverage', { count: selected.evidence.length })}</p>
        </div>
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className={SECTION_LABEL}>{t('findingsEyebrow', { count: selected.findings.length })}</p>
            {onFindingsChange && selected.findings.length ? <Checkbox label={t('showIssues')} checked={showIssues && overlayReady} onChange={(event) => setShowIssues(event.target.checked)} disabled={!overlayReady} /> : null}
          </div>
          {onFindingsChange && selected.findings.length ? <p className="text-caption text-[color:var(--color-text-secondary)]">{overlayReady ? t('issueLegend') : t('overlayUnavailable')}</p> : null}
        {selected.findings.length === 0 ? <p>{t('noFindings')}</p> : selected.findings.map((finding) => {
          const latestReview = latestFindingReview(reviews, selected.id, finding.id);
          return <article key={finding.id} className="space-y-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
            <h4 className="text-body font-[var(--font-weight-strong)]">? {finding.title}</h4><p className="whitespace-pre-wrap">{finding.detail}</p>
            {latestReview ? <p className="text-caption">{t(`review.${latestReview.disposition}`)} · {latestReview.rationale}</p> : null}
            <div className="flex flex-wrap gap-2">{onFinding ? <Chip size="lg" onClick={() => {
              if (!onFinding(finding, selected)) { setNotice(null); setError({ sentence: t('targetUnavailable'), detail: null }); }
              else { setError(null); setNotice(t(window.matchMedia('(min-width: 1024px)').matches ? 'targetSelected' : 'targetSelectedSheet')); }
            }}>{t('showOnMap')}</Chip> : null}{writable ? <Chip size="lg" onClick={() => { setReviewing(finding.id); setReviewText(''); }}>{t('reviewAction')}</Chip> : null}</div>
            {finding.evidenceSlugs.map((slug) => <Disclosure key={slug} summary={<span className="break-all">{t('evidence')} · {slug}</span>}><div className="mt-2 space-y-2">{onEvidence ? <Chip size="lg" onClick={() => onEvidence(slug)}>{t('openCurrent')}</Chip> : null}<pre className="atlas-scroll-quiet whitespace-pre-wrap break-words text-caption">{selected.evidence.find((item) => item.slug === slug)?.body ?? t('evidenceMissing')}</pre></div></Disclosure>)}
            {reviewing === finding.id ? <div className="space-y-2"><Textarea label={t('reviewReason')} value={reviewText} onChange={(event) => setReviewText(event.target.value)} rows={3} /><div className="flex flex-wrap gap-2"><Chip size="lg" disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'retain')}>{t('retain')}</Chip><Chip size="lg" disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'dismiss')}>{t('dismiss')}</Chip></div><p className="text-caption text-[color:var(--color-text-secondary)]">{t('reviewBoundary')}</p></div> : null}
          </article>;
        })}
        </section>
        {selected.observations.map((observation, index) => <ArchitectureObservation key={`${observation.toolCallId}:${index}`} result={observation.result} />)}
        <section className="space-y-3">
          <p className={SECTION_LABEL}>{t('answer')}</p>
          <div className="space-y-3 break-words text-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span> }}>{selected.answer}</ReactMarkdown></div>
        </section>
        <div className={cn('space-y-2', DIVIDED)}>
  {selected.profileSnapshot ? <Disclosure summary={t('profileSnapshot')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{selected.profileSnapshot.markdown}</pre></Disclosure> : null}
  <Disclosure summary={t('basisDetails')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify({ request: selected.request, origin: selected.origin, basis: selected.basis, sourceAccess: selected.sourceAccess, qualification: selected.qualification, current: compatibility }, null, 2)}</pre></Disclosure>
        </div>
        <div className="flex flex-wrap gap-2">{onRequest ? <Chip size="lg" onClick={() => request(true)}>{t('followUp')}</Chip> : null}<Chip size="lg" onClick={() => exportMarkdown(serializeAnalysisRecord(selected), selected.id)}>{t('export')}</Chip></div>
      </> : null}
      {loaded?.handle === context.handle && loaded?.cursor ? <Chip size="lg" onClick={() => void refresh(loaded.cursor)}>{t('loadOlder')}</Chip> : null}
      {loaded?.handle === context.handle && loaded?.problems.length ? <Disclosure summary={t('recordProblems', { count: loaded.problems.length })}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{loaded.problems.join('\n')}</pre></Disclosure> : null}
    </div> : null}
    {conversation ? <div role="tabpanel" id="workbench-tabpanel-conversation" aria-labelledby="workbench-tab-conversation" className={cn('min-h-0 flex-1 flex-col', tab === 'conversation' ? 'flex' : 'hidden')} inert={tab !== 'conversation'}>{conversation}</div> : null}
    {saved && saved.status !== 'saved' ? <div role="status" data-testid="analysis-workbench-save" className="flex shrink-0 flex-wrap items-center gap-2 text-caption text-[color:var(--color-text-secondary)]">
      <span className="min-w-0 break-keep">{t(`save.${saved.status}`)}</span>
      {saved.status === 'error' ? <>
        {saved.error ? <FailureDetail summary={t('errorDetails')} detail={saved.error} /> : null}
        {saved.record ? <>{writable && !saved.record.qualification.reasons.includes('turn_origin_mismatch') ? <Chip size="lg" onClick={() => { if (context.handle && saved.record) void appendAnalysisRecord(context.handle, saved.record, context.writable).then(() => setSaveState?.({ ...saved, status: 'saved', error: null })).catch((failure: unknown) => failWith(t('save.error'), failure)); }}>{t('retrySave')}</Chip> : null}<Chip size="lg" onClick={() => exportMarkdown(serializeAnalysisRecord(saved.record!), saved.record!.id)}>{t('export')}</Chip></> : saved.rawAnswer ? <Chip size="lg" onClick={() => exportMarkdown(saved.rawAnswer!, saved.id)}>{t('export')}</Chip> : null}
      </> : null}
    </div> : null}
  </section>;
}

/** The exception text behind a failure sentence, folded; see the `error` state above. */
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
    <Disclosure summary={t('observationDetails')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify(result, null, 2)}</pre></Disclosure>
  </section>;
}
