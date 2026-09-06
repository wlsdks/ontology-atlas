'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { analysisArchiveWritable, analysisScopeKey, appendAnalysisRecord, compareAnalysisBasis, latestFindingReview, readAnalysisHistory, serializeAnalysisRecord, verifyAnalysisEvidence, type AnalysisCompatibility, type AnalysisFinding, type AnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';
import { ANALYSIS_FINDINGS_INSTRUCTION, currentAnalysisBasis, type AnalysisCaptureContext, type AnalysisSaveState } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { Button, Checkbox, Chip, Disclosure, IconButton, Select, TabBar, Textarea } from '@/shared/ui';
import { RotateCcw, X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

/** Hairline between groups: the separation the tabs lacked (owner, 2026-09-06). */
const DIVIDED = 'border-t border-[color:var(--color-divider)] pt-4';
/** The small section label the Library and the workbench share: mono caps, quaternary ink. */
const EYEBROW = 'font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]';

type Tab = 'meaning' | 'history' | 'conversation';
const EMPTY_RECORDS: AnalysisRecord[] = [];

/** One context slot beside the canvas. Hiding conversation never unmounts its ACP session. */
export function AnalysisWorkbench({ context, contextLabel, open, requestNonce, sectionRequest, onSectionChange, initialTab = 'meaning', facts, conversation, onRequest, relationNoteGaps = 0, onClose, onEvidence, onFinding, onFindingsChange, capture, returnFocusSelector }: {
  context: AnalysisCaptureContext;
  contextLabel: string;
  open: boolean;
  requestNonce?: number;
  sectionRequest?: { tab: Tab; nonce: number };
  onSectionChange?: (tab: Tab) => void;
  initialTab?: Tab;
  facts?: ReactNode;
  conversation?: ReactNode;
  capture?: { state: AnalysisSaveState | null; setState: (state: AnalysisSaveState) => void };
  onRequest?: (text: string, parentRunId: string | null) => void;
  /**
   * Relations in scope whose `relation_notes` sentence is empty. Above zero, the Meaning view
   * offers to have the agent write them: one sentence per edge, on the source document, under
   * the permission gate. Zero hides the offer rather than showing a dead control.
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
  const locale = useLocale();
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    /*
     * ⚠️ **The opener, and never something inside this panel** (measured 2026-09-06). This effect
     * runs more than once per opening, and each run read `document.activeElement` — which the
     * previous run had just pointed at the close button. The second run therefore recorded the
     * close button as the place to return to, and closing "restored" focus to an element that was
     * being unmounted, dropping the keyboard on `<body>` with no way back to what had just closed.
     */
    const active = document.activeElement;
    const origin = active instanceof HTMLElement && active !== document.body && !panel?.contains(active)
      ? active : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      /*
       * Let the parent remove its sheet's inert state before returning to the opener.
       *
       * ⚠️ **One frame was not enough, and one frame was also too early** (same measurement). At
       * 744x900 with a coarse pointer the opener sits inside the parent's `[inert]` sheet for
       * about three frames after Escape, and the panel itself stays mounted for its exit — around
       * 220ms. A single `requestAnimationFrame` landed inside both windows, found an inert target,
       * and gave up silently.
       *
       * So the restore waits for the panel to actually be gone, then for the target to actually be
       * focusable, and gives up after roughly two thirds of a second — long enough for the exit,
       * short enough that focus never moves under a person who has already moved on. It also
       * stands down the moment focus lands anywhere outside this panel: that is somebody's
       * deliberate choice, not a gap to fill.
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
  const setTab = (next: Tab) => setSection({ nonce: requestNonce, viewNonce: sectionRequest?.nonce, tab: next });
  useEffect(() => { onSectionChange?.(tab); }, [onSectionChange, tab]);
  const [loaded, setLoaded] = useState<{ handle: FileSystemDirectoryHandle; records: AnalysisRecord[]; cursor: string | null; problems: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [readPending, setReadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const saved = saveState?.handle === context.handle ? saveState : null;
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
      if (generation === loadGeneration.current) setError(failure instanceof Error ? failure.message : String(failure));
    }).finally(() => { if (generation === loadGeneration.current) setReadPending(false); });
  }, [context.handle, open]);

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
   * The map's hover card read the same templated sentence on every containment edge because
   * 87% of the dogfood graph's edges carried no `relation_notes` (2026-09-06, 211 of 242).
   * This turn asks the agent to write the missing reasons, bounded, through patch_concept —
   * every write still stops at a permission card. It carries no findings instruction: the
   * result is frontmatter, not an analysis record.
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
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
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
      ⚠️ **One band, not four** (2026-09-06; measured in the installed app at 187px of chrome
      above a 371px well). The name, the subject, the sections and the close button were four
      stacked rows in a panel whose whole job is the content underneath them. The eyebrow and the
      subject stay stacked — they are one address read top to bottom — and the sections and the
      close move onto that block's line.

      `flex-wrap` rather than a promise the width cannot keep: below roughly 330px of usable
      panel the tab strip drops to its own line and the header is two bands again, which is what
      it was before. It never truncates the subject to keep the tabs beside it.
    */}
    <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-36"><p className="text-caption text-[color:var(--color-text-secondary)]">{t(context.mode === 'meaning' ? 'meaningTitle' : 'architectureTitle')}</p><h2 className="break-words text-title font-[var(--font-weight-strong)]">{contextLabel}</h2></div>
      {/*
        ⚠️ **The tab bar, not a segmented control** (2026-09-06). A `SegmentedControl` is an
        exclusive *value* picker and reaches the accessibility tree as a radiogroup — these are
        views of one surface, and a screen reader was told they were settings. `TabBar` is this
        repository's one tab pattern (`shared/ui/tab-bar.tsx`); the panels below carry the
        matching `workbench-tabpanel-*` id, which is the half of its contract a consumer can skip
        and silently break.
      */}
      <div className="flex min-w-0 shrink-0 items-end gap-1">
        <TabBar idPrefix="workbench" ariaLabel={t('section')} activeKey={tab} onSelect={(key) => setTab(key as Tab)} items={[
          { key: 'meaning', label: t('meaning') }, { key: 'history', label: t('history') }, ...(conversation ? [{ key: 'conversation', label: t('conversation') }] : []),
        ]} />
        <IconButton ref={closeRef} label={t('close')} onClick={onClose}><X size={ICON_SIZE.sm} /></IconButton>
      </div>
    </header>
    {error ? <p role="alert" className="text-caption text-[color:var(--color-danger-text)]">{error}</p> : null}
    {notice ? <p role="status" className="text-caption text-[color:var(--color-text-secondary)]">{notice}</p> : null}
    {/*
      **Action first, reference last** (owner, 2026-09-06: "messy" / "nothing is set apart"). The
      view opened on the glossary and put the one thing a person can do here — ask the agent —
      under a wall of same-grey prose. The ask now leads with its one-line caveat; what is picked
      on the map follows; groups are set apart by a hairline, not by more sentences.
    */}
    {tab === 'meaning' ? <div role="tabpanel" id="workbench-tabpanel-meaning" aria-labelledby="workbench-tab-meaning" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div className="flex flex-col gap-2">
        {onRequest ? <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => request(false)}>{t('analyze')}</Button>
          {relationNoteGaps > 0 && context.mode === 'meaning' ? <Chip data-testid="workbench-fill-notes" onClick={requestNotes}>{t('fillNotes', { count: relationNoteGaps })}</Chip> : null}
        </div> : <p className="text-caption text-[color:var(--color-text-secondary)]">{t('agentUnavailable')}</p>}
        <p className="text-caption text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p>
      </div>
      <div className={DIVIDED}>{facts ?? <p>{context.mode === 'architecture' ? t('architectureCriteria') : glossary('ontologyDefinition')}</p>}</div>
    </div> : null}
    {tab === 'history' ? <div role="tabpanel" id="workbench-tabpanel-history" aria-labelledby="workbench-tab-history" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1" aria-busy={busy || readPending}>
      {/* One control row: which version, reread, ask again. The two chips that led the tab
          looked like every other chip below them; the version picker is the row's subject. */}
      <div className="flex flex-wrap items-center gap-2">
        {runs.length ? <Select ariaLabel={t('version')} value={selected?.id ?? ''} onChange={setSelectedId} className="min-w-0 flex-1 basis-48" options={runs.map((run, index) => ({ value: run.id, label: `${index === 0 ? `${t('latest')} · ` : ''}${new Date(run.createdAt).toLocaleString(locale)} · ${run.id.slice(0, 8)}`, description: run.request.text.slice(0, 100) }))} /> : null}
        {context.handle ? <IconButton label={t('refresh')} onClick={() => void refresh()}><RotateCcw size={ICON_SIZE.sm} aria-hidden /></IconButton> : null}
        {onRequest ? <Button size="sm" onClick={() => request(false)}>{t('reanalyze')}</Button> : null}
      </div>
      {!context.handle ? <p>{t('openFolder')}</p> : null}
      {context.handle && readPending ? <p role="status">{t('loadingHistory')}</p> : null}
      {!runs.length && context.handle && loaded?.handle === context.handle && !readPending && !error ? <p>{t('empty')}</p> : null}
      {selected ? <>
        {selected === runs[0] && earlierQuestions.length ? <Disclosure summary={t('earlierQuestions', { count: earlierQuestions.length })}>
          <p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('earlierQuestionsNote')}</p>
          <div className="mt-2 flex flex-col items-start gap-2">{earlierQuestions.map(({ run, finding }) => <Chip key={`${run.id}:${finding.id}`} onClick={() => setSelectedId(run.id)}>{finding.title} · {run.id.slice(0, 8)}</Chip>)}</div>
        </Disclosure> : null}
        {/*
          The scope is the heading (the picker already says the date and id); the outcome, the
          basis and the evidence count are one caption line under it, not three sentences of
          equal weight. The "AI findings are questions" caveat moved to the foot of the tab,
          once, because it applies to everything above it and not to the version in particular.
        */}
        <div className={cn('space-y-1', DIVIDED)}>
          <h3 className="break-words text-body-lg font-[var(--font-weight-strong)]">{selected.scope.targetSlugs.join(', ') || t('wholeProject')}</h3>
          <p className="text-caption text-[color:var(--color-text-secondary)]">{t(`outcome.${selected.origin.outcome}`)} · {t(`basis.${compatibility?.status ?? 'checking'}`)} · {t(selected.qualification.status === 'grounded' ? 'grounded' : 'unverified')}</p>
          <p className="text-caption text-[color:var(--color-text-secondary)]">{t('readCoverage', { count: selected.evidence.length })}</p>
        </div>
        <section className={cn('space-y-3', DIVIDED)}>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className={EYEBROW}>{t('findingsEyebrow', { count: selected.findings.length })}</p>
            {onFindingsChange && selected.findings.length ? <Checkbox label={t('showIssues')} checked={showIssues && overlayReady} onChange={(event) => setShowIssues(event.target.checked)} disabled={!overlayReady} /> : null}
          </div>
          {onFindingsChange && selected.findings.length ? <p className="text-caption text-[color:var(--color-text-secondary)]">{overlayReady ? t('issueLegend') : t('overlayUnavailable')}</p> : null}
        {selected.findings.length === 0 ? <p>{t('noFindings')}</p> : selected.findings.map((finding) => {
          const latestReview = latestFindingReview(reviews, selected.id, finding.id);
          return <article key={finding.id} className="space-y-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
            <h4 className="text-body-lg font-[var(--font-weight-strong)]">? {finding.title}</h4><p className="whitespace-pre-wrap">{finding.detail}</p>
            {latestReview ? <p className="text-caption">{t(`review.${latestReview.disposition}`)} · {latestReview.rationale}</p> : null}
            <div className="flex flex-wrap gap-2">{onFinding ? <Chip onClick={() => {
              if (!onFinding(finding, selected)) { setNotice(null); setError(t('targetUnavailable')); }
              else { setError(null); setNotice(t(window.matchMedia('(min-width: 1024px)').matches ? 'targetSelected' : 'targetSelectedSheet')); }
            }}>{t('showOnMap')}</Chip> : null}{writable ? <Chip onClick={() => { setReviewing(finding.id); setReviewText(''); }}>{t('reviewAction')}</Chip> : null}</div>
            {finding.evidenceSlugs.map((slug) => <Disclosure key={slug} summary={<span className="break-all">{t('evidence')} · {slug}</span>}><div className="mt-2 space-y-2">{onEvidence ? <Chip onClick={() => onEvidence(slug)}>{t('openCurrent')}</Chip> : null}<pre className="atlas-scroll-quiet whitespace-pre-wrap break-words text-caption">{selected.evidence.find((item) => item.slug === slug)?.body ?? t('evidenceMissing')}</pre></div></Disclosure>)}
            {reviewing === finding.id ? <div className="space-y-2"><Textarea label={t('reviewReason')} value={reviewText} onChange={(event) => setReviewText(event.target.value)} rows={3} /><div className="flex flex-wrap gap-2"><Chip disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'retain')}>{t('retain')}</Chip><Chip disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'dismiss')}>{t('dismiss')}</Chip></div><p className="text-caption text-[color:var(--color-text-secondary)]">{t('reviewBoundary')}</p></div> : null}
          </article>;
        })}
        </section>
        {selected.observations.map((observation, index) => <ArchitectureObservation key={`${observation.toolCallId}:${index}`} result={observation.result} />)}
        <section className={cn('space-y-3', DIVIDED)}>
          <p className={EYEBROW}>{t('answer')}</p>
          <div className="space-y-3 break-words text-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span> }}>{selected.answer}</ReactMarkdown></div>
        </section>
        <div className={cn('space-y-2', DIVIDED)}>
  {selected.profileSnapshot ? <Disclosure summary={t('profileSnapshot')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{selected.profileSnapshot.markdown}</pre></Disclosure> : null}
  <Disclosure summary={t('basisDetails')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify({ request: selected.request, origin: selected.origin, basis: selected.basis, sourceAccess: selected.sourceAccess, qualification: selected.qualification, current: compatibility }, null, 2)}</pre></Disclosure>
        </div>
        <div className="flex flex-wrap gap-2">{onRequest ? <Chip onClick={() => request(true)}>{t('followUp')}</Chip> : null}<Chip onClick={() => exportMarkdown(serializeAnalysisRecord(selected), selected.id)}>{t('export')}</Chip></div>
      </> : null}
      {loaded?.handle === context.handle && loaded?.cursor ? <Chip onClick={() => void refresh(loaded.cursor)}>{t('loadOlder')}</Chip> : null}
      {loaded?.handle === context.handle && loaded?.problems.length ? <Disclosure summary={t('recordProblems', { count: loaded.problems.length })}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{loaded.problems.join('\n')}</pre></Disclosure> : null}
      <p className="mt-auto pt-2 text-caption text-[color:var(--color-text-quaternary)]">{t('diagnosticOnly')}</p>
    </div> : null}
    {conversation ? <div role="tabpanel" id="workbench-tabpanel-conversation" aria-labelledby="workbench-tab-conversation" className={cn('min-h-0 flex-1 flex-col', tab === 'conversation' ? 'flex' : 'hidden')} inert={tab !== 'conversation'}>{conversation}</div> : null}
    {/*
      ⚠️ **The save report is a footer, not a fifth header band** (2026-09-06). It used to sit
      between the tabs and the view, pushing the content down on every tab whether or not an
      answer had just been saved — and its retry/export chips were laid out after an inline
      sentence with no wrapping container, so at a narrow panel the chip and the sentence
      measured 0px apart. It now stands at the foot of the panel, beside the composer the turn
      was sent from, and lays out as one wrapping row.
    */}
    {saved ? <div role="status" data-testid="analysis-workbench-save" className="flex shrink-0 flex-wrap items-center gap-2 text-caption text-[color:var(--color-text-secondary)]">
      <span className="min-w-0 break-keep">{t(`save.${saved.status}`)}</span>
      {saved.status === 'error' ? <>
        <span className="min-w-0 break-keep">{saved.error}</span>
        {saved.record ? <>{writable && !saved.record.qualification.reasons.includes('turn_origin_mismatch') ? <Chip onClick={() => { if (context.handle && saved.record) void appendAnalysisRecord(context.handle, saved.record, context.writable).then(() => setSaveState?.({ ...saved, status: 'saved', error: null })).catch((failure: Error) => setError(failure.message)); }}>{t('retrySave')}</Chip> : null}<Chip onClick={() => exportMarkdown(serializeAnalysisRecord(saved.record!), saved.record!.id)}>{t('export')}</Chip></> : saved.rawAnswer ? <Chip onClick={() => exportMarkdown(saved.rawAnswer!, saved.id)}>{t('export')}</Chip> : null}
      </> : saved.status === 'saved' ? <Chip onClick={() => { setSelectedId(saved.id); setTab('history'); }}>{t('viewSaved')}</Chip> : null}
    </div> : null}
  </section>;
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
