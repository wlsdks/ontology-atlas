'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { analysisArchiveWritable, analysisScopeKey, appendAnalysisRecord, compareAnalysisBasis, latestFindingReview, readAnalysisHistory, serializeAnalysisRecord, verifyAnalysisEvidence, type AnalysisCompatibility, type AnalysisFinding, type AnalysisRecord, type AnalysisRun } from '@/entities/analysis-record';
import { ANALYSIS_FINDINGS_INSTRUCTION, currentAnalysisBasis, type AnalysisCaptureContext, type AnalysisSaveState } from '@/features/acp-session';
import { cn } from '@/shared/lib/cn';
import { Button, Checkbox, Chip, IconButton, Select, Textarea } from '@/shared/ui';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { X } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

type Tab = 'meaning' | 'history' | 'conversation';
const EMPTY_RECORDS: AnalysisRecord[] = [];

/** One context slot beside the canvas. Hiding conversation never unmounts its ACP session. */
export function AnalysisWorkbench({ context, contextLabel, open, requestNonce, sectionRequest, onSectionChange, initialTab = 'meaning', facts, conversation, onRequest, onClose, onEvidence, onFinding, onFindingsChange, capture, returnFocusSelector }: {
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
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      // Let the parent remove its sheet's inert state before returning to the opener.
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active !== document.body && active?.isConnected && !panel?.contains(active)) return;
        const target = origin?.isConnected && origin !== document.body && !origin.closest('[inert]')
          ? origin : returnFocusSelector ? document.querySelector<HTMLElement>(returnFocusSelector) : null;
        if (target && !target.closest('[inert]')) target.focus({ preventScroll: true });
      });
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
  const selectedLabel = selected ? `${new Date(selected.createdAt).toLocaleString(locale)} · ${selected.id.slice(0, 8)}` : t('noRecord');

  return <section ref={panelRef} data-testid="analysis-workbench" onKeyDown={(event) => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onClose(); }
  }} className="flex min-h-0 flex-1 flex-col gap-3 text-body text-[color:var(--color-text-primary)] [&_summary]:content-center [@media(pointer:coarse)]:[&_summary]:min-h-[var(--touch-target-min)]">
    <header className="flex shrink-0 items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-caption text-[color:var(--color-text-secondary)]">{t(context.mode === 'meaning' ? 'meaningTitle' : 'architectureTitle')}</p><h2 className="break-words text-title font-[var(--font-weight-strong)]">{contextLabel}</h2></div>
      <IconButton ref={closeRef} label={t('close')} onClick={onClose}><X size={ICON_SIZE.sm} /></IconButton>
    </header>
    <SegmentedControl ariaLabel={t('section')} value={tab} onChange={setTab} size="md" options={[
      { value: 'meaning', label: t('meaning') }, { value: 'history', label: t('history') }, ...(conversation ? [{ value: 'conversation' as const, label: t('conversation') }] : []),
    ]} />
    {error ? <p role="alert" className="text-caption text-[color:var(--color-danger-text)]">{error}</p> : null}
    {notice ? <p role="status" className="text-caption text-[color:var(--color-text-secondary)]">{notice}</p> : null}
    {saved ? <div role="status" className="text-caption text-[color:var(--color-text-secondary)]">
      {t(`save.${saved.status}`)}{saved.status === 'error' ? <><p>{saved.error}</p>{saved.record ? <div className="mt-2 flex gap-2">{writable && !saved.record.qualification.reasons.includes('turn_origin_mismatch') ? <Chip onClick={() => { if (context.handle && saved.record) void appendAnalysisRecord(context.handle, saved.record, context.writable).then(() => setSaveState?.({ ...saved, status: 'saved', error: null })).catch((failure: Error) => setError(failure.message)); }}>{t('retrySave')}</Chip> : null}<Chip onClick={() => exportMarkdown(serializeAnalysisRecord(saved.record!), saved.record!.id)}>{t('export')}</Chip></div> : saved.rawAnswer ? <Chip onClick={() => exportMarkdown(saved.rawAnswer!, saved.id)}>{t('export')}</Chip> : null}</> : saved.status === 'saved' ? <Chip onClick={() => { setSelectedId(saved.id); setTab('history'); }}>{t('viewSaved')}</Chip> : null}
    </div> : null}
    {tab === 'meaning' ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
      {facts ?? <p>{context.mode === 'architecture' ? t('architectureCriteria') : glossary('ontologyDefinition')}</p>}
      <p className="text-caption text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p>
      {onRequest ? <Button size="sm" onClick={() => request(false)}>{t('analyze')}</Button> : <p className="text-caption text-[color:var(--color-text-secondary)]">{t('agentUnavailable')}</p>}
    </div> : null}
    {tab === 'history' ? <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1" aria-busy={busy || readPending}>
      <div className="flex flex-wrap gap-2">{context.handle ? <Chip onClick={() => void refresh()}>{t('refresh')}</Chip> : null}{onRequest ? <Chip onClick={() => request(false)}>{t('reanalyze')}</Chip> : null}</div>
      {!context.handle ? <p>{t('openFolder')}</p> : null}
      {context.handle && readPending ? <p role="status">{t('loadingHistory')}</p> : null}
      {runs.length ? <Select ariaLabel={t('version')} value={selected?.id ?? ''} onChange={setSelectedId} options={runs.map((run, index) => ({ value: run.id, label: `${index === 0 ? `${t('latest')} · ` : ''}${new Date(run.createdAt).toLocaleString(locale)} · ${run.id.slice(0, 8)}`, description: run.request.text.slice(0, 100) }))} /> : context.handle && loaded?.handle === context.handle && !readPending && !error ? <p>{t('empty')}</p> : null}
      {selected ? <>
        {selected === runs[0] && earlierQuestions.length ? <details>
          <summary>{t('earlierQuestions', { count: earlierQuestions.length })}</summary>
          <p className="mt-2 text-caption text-[color:var(--color-text-secondary)]">{t('earlierQuestionsNote')}</p>
          <div className="mt-2 flex flex-col items-start gap-2">{earlierQuestions.map(({ run, finding }) => <Chip key={`${run.id}:${finding.id}`} onClick={() => setSelectedId(run.id)}>{finding.title} · {run.id.slice(0, 8)}</Chip>)}</div>
        </details> : null}
        <div className="space-y-2"><h3 className="text-body-lg font-[var(--font-weight-strong)]">{selectedLabel}</h3><p className="break-words text-caption text-[color:var(--color-text-secondary)]">{selected.scope.targetSlugs.join(', ') || t('wholeProject')}</p><p>{t(`outcome.${selected.origin.outcome}`)} · {t(`basis.${compatibility?.status ?? 'checking'}`)} · {t(selected.qualification.status === 'grounded' ? 'grounded' : 'unverified')}</p><p className="text-caption text-[color:var(--color-text-secondary)]">{t('diagnosticOnly')}</p><p className="text-caption text-[color:var(--color-text-secondary)]">{t('readCoverage', { count: selected.evidence.length })}</p></div>
        {onFindingsChange ? <><Checkbox label={t('showIssues')} checked={showIssues && overlayReady} onChange={(event) => setShowIssues(event.target.checked)} disabled={!overlayReady} /><p className="text-caption text-[color:var(--color-text-secondary)]">{overlayReady ? t('issueLegend') : t('overlayUnavailable')}</p></> : null}
        {selected.findings.length === 0 ? <p>{t('noFindings')}</p> : selected.findings.map((finding) => {
          const latestReview = latestFindingReview(reviews, selected.id, finding.id);
          return <article key={finding.id} className="space-y-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
            <h4 className="text-body-lg font-[var(--font-weight-strong)]">? {finding.title}</h4><p className="whitespace-pre-wrap">{finding.detail}</p>
            {latestReview ? <p className="text-caption">{t(`review.${latestReview.disposition}`)} · {latestReview.rationale}</p> : null}
            <div className="flex flex-wrap gap-2">{onFinding ? <Chip onClick={() => {
              if (!onFinding(finding, selected)) { setNotice(null); setError(t('targetUnavailable')); }
              else { setError(null); setNotice(t(window.matchMedia('(min-width: 1024px)').matches ? 'targetSelected' : 'targetSelectedSheet')); }
            }}>{t('showOnMap')}</Chip> : null}{writable ? <Chip onClick={() => { setReviewing(finding.id); setReviewText(''); }}>{t('reviewAction')}</Chip> : null}</div>
            {finding.evidenceSlugs.map((slug) => <details key={slug}><summary className="break-all text-caption">{t('evidence')} · {slug}</summary><div className="mt-2 space-y-2">{onEvidence ? <Chip onClick={() => onEvidence(slug)}>{t('openCurrent')}</Chip> : null}<pre className="whitespace-pre-wrap break-words text-caption">{selected.evidence.find((item) => item.slug === slug)?.body ?? t('evidenceMissing')}</pre></div></details>)}
            {reviewing === finding.id ? <div className="space-y-2"><Textarea label={t('reviewReason')} value={reviewText} onChange={(event) => setReviewText(event.target.value)} rows={3} /><div className="flex flex-wrap gap-2"><Chip disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'retain')}>{t('retain')}</Chip><Chip disabled={!reviewText.trim() || busy} onClick={() => void review(finding.id, 'dismiss')}>{t('dismiss')}</Chip></div><p className="text-caption text-[color:var(--color-text-secondary)]">{t('reviewBoundary')}</p></div> : null}
          </article>;
        })}
        {selected.observations.map((observation, index) => <ArchitectureObservation key={`${observation.toolCallId}:${index}`} result={observation.result} />)}
        <details open><summary >{t('answer')}</summary><div className="mt-3 space-y-3 break-words text-body"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ img: ({ alt }) => <span>{alt}</span> }}>{selected.answer}</ReactMarkdown></div></details>
        {selected.profileSnapshot ? <details><summary>{t('profileSnapshot')}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{selected.profileSnapshot.markdown}</pre></details> : null}
        <details><summary >{t('basisDetails')}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify({ request: selected.request, origin: selected.origin, basis: selected.basis, sourceAccess: selected.sourceAccess, qualification: selected.qualification, current: compatibility }, null, 2)}</pre></details>
        <div className="flex flex-wrap gap-2">{onRequest ? <Chip onClick={() => request(true)}>{t('followUp')}</Chip> : null}<Chip onClick={() => exportMarkdown(serializeAnalysisRecord(selected), selected.id)}>{t('export')}</Chip></div>
      </> : null}
      {loaded?.handle === context.handle && loaded?.cursor ? <Chip onClick={() => void refresh(loaded.cursor)}>{t('loadOlder')}</Chip> : null}
      {loaded?.handle === context.handle && loaded?.problems.length ? <details><summary>{t('recordProblems', { count: loaded.problems.length })}</summary><pre className="whitespace-pre-wrap break-words text-caption">{loaded.problems.join('\n')}</pre></details> : null}
    </div> : null}
    {conversation ? <div className={cn('min-h-0 flex-1 flex-col', tab === 'conversation' ? 'flex' : 'hidden')} inert={tab !== 'conversation'}>{conversation}</div> : null}
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
    <details><summary>{t('observationDetails')}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify(result, null, 2)}</pre></details>
  </section>;
}
