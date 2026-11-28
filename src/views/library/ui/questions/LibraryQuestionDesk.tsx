import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';

import { MeaningDeskLine, MeaningSetupPress, useVectorSearch } from '@/features/vault-vectors';
import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';
import {
  buildQuestionDeskReportBrief,
  countDeskReadablePages,
  countDeskWikiPages,
  deskBriefEvidence,
  deskSearchPrefixes,
  planDeskSourceReads,
  questionDeskListingVersion,
  searchDesk,
  type DeskCitation,
  type DeskClaim,
  type LibraryPageFacts,
} from '@/features/library';
import { sourceUnits, type SourceUnit } from '@/shared/lib/library/source-units';
import type { VectorFound } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { Button, Chip } from '@/shared/ui';
import { Input } from '@/shared/ui/fields/input';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { EXIT_TRANSITION, MOTION, OVERLAY_RISE, OVERLAY_SETTLED } from '@/shared/motion';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { DeskCoverageInfo } from './desk/DeskCoverageInfo';
import { DeskEntry } from './desk/DeskEntry';
import { DeskJevConsent, useDeskJev } from './desk/DeskJev';
import { DeskLeads, type DeskLeadSet } from './desk/DeskLeads';
import type { CitationState } from './desk/DeskLeadRow';
import { DeskReport, type QuestionDeskReportDraft } from './desk/DeskReport';
import { DeskResultsHead } from './desk/DeskResultsHead';
import { useDeskSwap } from './desk/use-desk-swap';
import type { QuestionDeskReportRequest } from "../../model/turns/library-turn-requests";

export type { QuestionDeskReportDraft } from './desk/DeskReport';

interface DeskResult extends DeskLeadSet {
  question: string;
  listingVersion: string;
  readPages: number;
  totalPages: number;
  omittedClaims: number;
  plannedSources: number;
  totalSources: number;
  unreadableSources: number;
  changedSources: number;
  omittedSources: number;
  /** How search by meaning answered this question; `null` when it was not asked. */
  meaning: DeskMeaningAnswer | null;
}

interface DeskMeaningAnswer {
  state: VectorFound['state'];
  failure: VectorFound['failure'];
  filesReady: number;
  filesTotal: number;
  /** Passages left out because their file changed, by the app or by the desk's own read. */
  staleDropped: number;
}

/** What the slot under the field holds: the person's own trail, or a search's results. */
const ENTRY = { slot: 'entry' } as const;
const RESULTS = { slot: 'results' } as const;

export function LibraryQuestionDesk({
  docs,
  pageFacts,
  sources,
  sourceHandles,
  hashes,
  vaultRoot,
  vaultScope,
  agentReady,
  dockOpen,
  visible,
  turnRunning,
  report,
  onSummarize,
  onInvalidateReport,
  onFileReport,
  filingReport,
  fileReportNote,
  onBrowse,
  onOpenWiki,
  onOpenSource,
  workActivity = null,
}: {
  docs: readonly VaultDoc[];
  pageFacts: ReadonlyMap<string, LibraryPageFacts>;
  sources: readonly LibrarySourceRow[];
  sourceHandles: ReadonlyMap<string, FileSystemFileHandle>;
  hashes: ReadonlyMap<string, string>;
  vaultRoot: string | null;
  vaultScope: string;
  agentReady: boolean;
  dockOpen: boolean;
  visible: boolean;
  turnRunning: boolean;
  report: QuestionDeskReportDraft | null;
  onSummarize: (request: QuestionDeskReportRequest) => void;
  onInvalidateReport: () => void;
  onFileReport: (() => void) | null;
  filingReport: boolean;
  fileReportNote: string | null;
  onBrowse: () => void;
  onOpenWiki: (slug: string, claim?: { line: number; sentence: string }) => void;
  onOpenSource: (path: string, anchor?: string) => void;
  workActivity?: ReactNode;
}) {
  const t = useTranslations('library.questionDesk');
  const locale = useLocale();
  const reducedMotion = usePrefersReducedMotion();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<DeskResult | null>(null);
  const [reading, setReading] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [expandedFor, setExpandedFor] = useState<number | null>(null);
  const searchId = useRef(0);
  const sourceUnitsByStamp = useRef(new Map<string, SourceUnit[]>());
  const questionField = useRef<HTMLInputElement>(null);
  const jev = useDeskJev({ pageFacts, sources, sourceHandles, hashes, vaultRoot, vaultScope });
  const meaningSearch = useVectorSearch(vaultRoot, docs.length, visible);

  useEffect(() => () => { searchId.current += 1; }, []);

  // Both read every page and source: worked out when the listing changes, not on each render.
  const listingVersion = useMemo(() => questionDeskListingVersion(docs, sources), [docs, sources]);
  const readablePages = useMemo(() => countDeskReadablePages(docs, pageFacts), [docs, pageFacts]);
  const claimsBySlug = useMemo(() => new Map([...pageFacts].map(([slug, facts]) => [slug, facts.claims] as const)), [pageFacts]);
  const fresh = result !== null && result.listingVersion === listingVersion
    && result.readPages === readablePages;
  const outdated = result !== null && !fresh;
  const slot = useDeskSwap(result ? RESULTS : ENTRY, reducedMotion);

  const search = async (again = false) => {
    const asked = question.trim();
    if (!asked || reading || jev.sending) return;
    const id = ++searchId.current;
    jev.reset();
    setReading(true);
    setReadCount(0);
    const searchedVersion = listingVersion;
    const plan = planDeskSourceReads(sources);
    const stamp = (source: LibrarySourceRow) => JSON.stringify([vaultScope, source.path, source.mtime, source.bytes]);
    const currentStamps = new Set(plan.map(stamp));
    for (const key of sourceUnitsByStamp.current.keys()) if (!currentStamps.has(key)) sourceUnitsByStamp.current.delete(key);
    /* The units this search read, which also give the sentences of passages found by meaning. */
    const unitsByPath = new Map<string, readonly SourceUnit[]>();
    let unreadableSources = 0;
    let changedSources = 0;
    /* Asked beside the word search; the list waits for both, and the app ends a question at 10 s. */
    const askedByMeaning = meaningSearch.ask(asked, deskSearchPrefixes([
      ...docs.filter((doc) => doc.slug.startsWith('wiki/')).map((doc) => `${doc.slug}.md`),
      ...sources.map((source) => source.path),
    ]));
    try {
      for (const source of plan) {
        if (id !== searchId.current) return;
        const cached = sourceUnitsByStamp.current.get(stamp(source));
        if (cached) {
          if (cached.length === 0) unreadableSources += 1;
          else unitsByPath.set(source.path, cached);
          setReadCount((count) => count + 1);
          continue;
        }
        const handle = sourceHandles.get(source.path);
        if (!handle) { unreadableSources += 1; setReadCount((count) => count + 1); continue; }
        try {
          const file = await handle.getFile();
          if (id !== searchId.current) return;
          if (file.lastModified !== source.mtime) {
            changedSources += 1;
          } else {
            const units = sourceUnits(new Uint8Array(await file.arrayBuffer()), source.path).units;
            if (id !== searchId.current) return;
            sourceUnitsByStamp.current.set(stamp(source), units);
            if (units.length === 0) unreadableSources += 1;
            else unitsByPath.set(source.path, units);
          }
        } catch { unreadableSources += 1; }
        if (id !== searchId.current) return;
        setReadCount((count) => count + 1);
      }
      const found = askedByMeaning ? await askedByMeaning : null;
      if (id !== searchId.current) return;
      const searched = searchDesk({
        question: asked, docs, claimsBySlug, searchedSources: new Set(plan.map((source) => source.path)),
        sourceUnitsByPath: unitsByPath, meaningHits: found?.state === 'ok' ? found.hits : null,
      });
      const { leads, terms } = searched;
      /* A report cost an agent turn: it leaves with the rows it answered, when the new rows arrive. */
      onInvalidateReport();
      setResult({
        question: asked, searchId: id, listingVersion: searchedVersion,
        leads, terms, reasons: searched.meaningDropped !== null,
        readPages: searched.readPages, totalPages: searched.totalPages, omittedClaims: searched.omittedClaims,
        plannedSources: plan.length, totalSources: sources.length, unreadableSources,
        changedSources, omittedSources: searched.omittedSources,
        meaning: found ? {
          state: found.state, failure: found.failure, filesReady: found.filesReady, filesTotal: found.filesTotal,
          staleDropped: found.staleDropped + (searched.meaningDropped ?? 0),
        } : null,
      });
      if (!again && leads.length === 0 && found?.state === 'ok' && found.staleDropped > 0 && found.busy) {
        void meaningSearch.afterJob().then(() => askAgainAfterUpdate.current(id));
      }
    } finally {
      if (id === searchId.current) setReading(false);
    }
  };

  /* An empty list that left out passages of changed files is asked once more when their update ends. */
  const askAgainAfterUpdate = useLatestRef((id: number) => {
    if (id !== searchId.current || result?.searchId !== id || result.leads.length > 0) return;
    if (reading || turnRunning || jev.sending || report?.searchId === id) return;
    void search(true);
  });

  /*
   * A list found by words alone is asked once more when the folder's vectors become searchable and
   * their preparation ends: the line above would otherwise say "words and meaning" over rows that
   * meaning never searched. A report keeps its rows, and an edited field is left for the person.
   */
  const askAgainWithMeaning = useLatestRef((id: number) => {
    if (id !== searchId.current || result?.searchId !== id || result.meaning !== null) return;
    if (question.trim() !== result.question) return;
    if (reading || turnRunning || jev.sending || report?.searchId === id) return;
    void search(true);
  });
  const wordsOnlySearchId = result !== null && result.meaning === null ? result.searchId : null;
  const { searchable: meaningSearchable, afterJob: afterMeaningJob } = meaningSearch;
  useEffect(() => {
    if (!meaningSearchable || wordsOnlySearchId === null) return;
    void afterMeaningJob().then(() => askAgainWithMeaning.current(wordsOnlySearchId));
  }, [afterMeaningJob, askAgainWithMeaning, meaningSearchable, wordsOnlySearchId]);

  const citationState = (claim: DeskClaim, citation: DeskCitation): CitationState => {
    if (!sourceHandles.has(citation.path)) return 'missing';
    const recorded = claim.recordedHashes[citation.path];
    const measured = hashes.get(citation.path);
    if (!recorded || !measured) return 'unmeasured';
    return recorded.toLowerCase() === measured.toLowerCase() ? 'observed' : 'stale';
  };

  const readSources = result ? result.plannedSources - result.unreadableSources - result.changedSources : 0;
  const coverage = result ? t('coverage', {
    readPages: result.readPages, totalPages: result.totalPages, readSources, totalSources: result.totalSources,
  }) : '';
  const omittedLeads = result ? result.omittedClaims + result.omittedSources : 0;
  /* Like the popover, the compact line names omitted leads only when there are some. */
  const coverageCompact = result ? [
    t('coverageCompact', { readPages: result.readPages, totalPages: result.totalPages, readSources, totalSources: result.totalSources }),
    ...(omittedLeads > 0 ? [t('coverageOmitted', { count: omittedLeads })] : []),
  ].join(' · ') : '';
  /* The method sentence the search that produced this list made true; a report saves it with the record. */
  const searchedByMeaning = result?.meaning?.state === 'ok';
  /* When meaning covered only part of the folder, the saved limits say how much. */
  const partialMeaning = searchedByMeaning && result.meaning!.filesReady < result.meaning!.filesTotal
    ? t('limitsMeaningCoverage', { ready: result.meaning!.filesReady, total: result.meaning!.filesTotal }) : null;
  const limits = result ? [t(searchedByMeaning ? 'limitsBoth' : 'limits', {
    unreadable: result.unreadableSources, changed: result.changedSources,
    skipped: result.totalSources - result.plannedSources,
    omitted: result.omittedClaims + result.omittedSources,
  }), partialMeaning].filter(Boolean).join(' ') : '';
  /* The popovers list only the limits that hold something; the report keeps the full record. */
  const limitsMethod = t(searchedByMeaning ? 'limitsMethodBoth' : 'limitsMethod');
  const limitFacts = (withOmitted: boolean) => {
    if (!result) return '';
    const counts: Array<[Parameters<typeof t>[0], number]> = [
      ['limitUnreadable', result.unreadableSources],
      ['limitChanged', result.changedSources],
      ['limitSkipped', result.totalSources - result.plannedSources],
      ['limitOmitted', withOmitted ? result.omittedClaims + result.omittedSources : 0],
    ];
    return counts.filter(([, count]) => count > 0).map(([key, count]) => t(key, { count })).join(' · ');
  };
  const activeReport = fresh && result && report?.searchId === result.searchId
    && report.question === result.question && report.listingVersion === result.listingVersion
    && report.vaultScope === vaultScope
    ? report : null;
  const hasLocalMatches = Boolean(result && result.leads.length > 0);
  const reportAction = result && vaultRoot !== null ? <Button size="sm" variant="primary"
    disabled={!agentReady || turnRunning || reading || outdated} onClick={() => {
      onSummarize({
        // The brief carries the rows the person sees, those found by meaning included.
        brief: buildQuestionDeskReportBrief({ question: result.question, vaultRoot, locale,
          ...deskBriefEvidence(result.leads), coverage: `${coverage} ${limits}` }),
        question: result.question, searchId: result.searchId, listingVersion: result.listingVersion,
        vaultScope, coverage, limits,
      });
    }} data-testid="question-desk-summarize">{hasLocalMatches ? t('report.summarize') : t('report.investigate')}</Button> : null;
  const offerSetup = vaultRoot !== null && meaningSearch.offerSetup;
  const meaning = result?.meaning ?? null;
  const meaningTookPart = meaning?.state === 'ok';
  const changedLeftOut = meaning?.state === 'ok' ? meaning.staleDropped : 0;
  /* Meaning coverage is said only when it was partial: a full count would read as a second scope. */
  const meaningCoverage = meaning && meaningTookPart ? [
    ...(meaning.filesReady < meaning.filesTotal ? [t('meaning.coverage', { ready: meaning.filesReady, total: meaning.filesTotal })] : []),
    ...(meaning.staleDropped > 0 ? [t('meaning.staleDropped', { count: meaning.staleDropped })] : []),
  ] : [];
  const coverageInfo = <DeskCoverageInfo lines={[coverageCompact, ...meaningCoverage, limitFacts(false), limitsMethod, t('wikiCaveat')].filter(Boolean)} />;
  /*
   * When meaning could not answer, the word rows stand as they are and one sentence says why; the
   * line above carries the state and its press.
   */
  const meaningNotice = meaning?.state === 'failed' ? <p role="status" data-testid="question-desk-meaning-notice"
    className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
    {meaning.failure === 'modelGone' ? t('meaning.modelGoneNotice')
      : meaning.failure === 'runnerDown' || meaning.failure === 'modelMissing' ? t('meaning.runnerDownNotice')
        : t('meaning.failedNotice')}
  </p> : null;

  const results = result && visible ? <>
    {outdated || (report && !activeReport) ? <p role="status" className="mb-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{report ? t('report.outdated') : t('outdated')}</p> : null}
    {activeReport ? <div className="mb-10">
      <DeskReport report={activeReport} coverageCompact={coverageCompact}
        coverageInfo={<DeskCoverageInfo lines={[coverage, partialMeaning ?? '', limitFacts(true), limitsMethod].filter(Boolean)} testId="question-desk-report-coverage-info" />}
        sources={sources} dockOpen={dockOpen} reducedMotion={reducedMotion} onOpenSource={onOpenSource}
        onFileReport={onFileReport} filingReport={filingReport} fileReportNote={fileReportNote} />
    </div> : null}
    <div data-testid="question-desk-results">
      {hasLocalMatches ? <>
        <DeskResultsHead count={result.leads.length} underReport={activeReport !== null} coverageInfo={coverageInfo}
          reportAction={reportAction} />
        {activeReport ? null : meaningNotice}
        {!agentReady && !activeReport ? <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.agentUnavailable')}</p> : null}
        {jev.note ? <p role="status" className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="question-desk-jev-note">{jev.note}</p> : null}
        <div className="mt-1">
          <DeskLeads set={result} expandedFor={expandedFor} onShowMore={() => setExpandedFor(result.searchId)}
            reduced={reducedMotion} citationState={citationState} jev={jev} canCheck={vaultRoot !== null}
            onOpenWiki={onOpenWiki} onOpenSource={onOpenSource} />
        </div>
      </> : activeReport ? null : <section data-testid="question-desk-unknown">
        {/* With nothing found the title is the head: no count of zero over an empty rule. */}
        <div className="flex min-h-9 min-w-0 items-center gap-1.5">
          <h3 aria-live="polite" className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('zeroLocalTitle')}</h3>
          {coverageInfo}
        </div>
        {meaningNotice}
        <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{!meaningTookPart ? t('zeroLocalBody') : changedLeftOut > 0
          ? t('meaning.noMatchChanged', { count: changedLeftOut }) : t('meaning.noMatchBoth')}</p>
        {agentReady ? <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('zeroLocalAgentNote')}</p>
          : <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.agentUnavailable')}</p>}
        {offerSetup || reportAction ? <div className="mt-4 flex flex-wrap items-center gap-2">
          {offerSetup ? <MeaningSetupPress rootPath={vaultRoot} testId="question-desk-meaning-setup">{t('meaning.setup')}</MeaningSetupPress> : null}
          {reportAction}
        </div> : null}
      </section>}
    </div>
  </> : null;

  return (
    <div data-testid="library-question-desk" className="atlas-scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-6 lg:py-8 max-lg:mb-[var(--topology-mobile-bottom-tab-reserve)]">
      <div data-question-desk-container="true" className="mx-auto w-full shrink-0 max-w-[var(--measure-doc-column)]">
        <header className="mb-5 flex min-h-[var(--control-h-md)] flex-wrap items-center justify-between gap-x-4 gap-y-2 lg:flex-nowrap">
          <h2 className="min-w-0 text-display lg:truncate font-[var(--font-weight-signature)] leading-display tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">{t('title')}</h2>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 lg:flex-none lg:flex-nowrap">
            <Chip className="lg:hidden" tone="muted" onClick={onBrowse} data-testid="question-desk-browse">{t('browse')}</Chip>
          </div>
        </header>
        <form id="question-desk-question-form" onSubmit={(event) => { event.preventDefault(); void search(); }}>
          <div className="flex flex-wrap items-center gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-focus-ring)]">
            <Search size={ICON_SIZE.lg} className="flex-none text-[color:var(--color-text-tertiary)]" aria-hidden="true" />
            <Input ref={questionField} frame="bare" size="lg" aria-label={t('questionLabel')} placeholder={t('questionPlaceholder')} value={question} readOnly={jev.sending} onChange={(event) => {
              /* A report on screen stays until new rows arrive; one still being written stops answering. */
              if (!activeReport) onInvalidateReport();
              searchId.current += 1;
              jev.reset();
              setQuestion(event.target.value);
              setReading(false);
              setReadCount(0);
            }} onFocus={meaningSearch.warm} className="min-w-40 flex-1" data-testid="question-desk-input" />
            {/* Pressing keeps focus in the field, so asking again goes on from the keyboard. */}
            <Button type="submit" onMouseDown={(event) => event.preventDefault()} size="sm" variant={result && agentReady ? 'outline' : 'primary'} className="ml-auto" disabled={!question.trim() || reading || jev.sending} data-testid="question-desk-search">{reading ? t('reading', { read: readCount }) : t('search')}</Button>
          </div>
          <div data-question-desk-status-row="true" className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
            <p>{t('folderScope', { pages: countDeskWikiPages(docs), sources: sources.length })}</p>
          </div>
          <MeaningDeskLine rootPath={vaultRoot} markdownFiles={docs.length} roomForStage={!result} onAsk={() => questionField.current?.focus()} />
        </form>
        {workActivity ? <div className="mt-3">{workActivity}</div> : null}
        <div className="relative mt-6">
          {slot.map(({ value, leaving }) => <motion.div key={value.slot}
            inert={leaving} aria-hidden={leaving || undefined}
            className={leaving ? 'pointer-events-none absolute inset-x-0 top-0' : undefined}
            initial={reducedMotion ? false : OVERLAY_RISE}
            animate={leaving ? { opacity: 0, y: 0 } : OVERLAY_SETTLED}
            transition={leaving ? EXIT_TRANSITION : MOTION.base}>
            {value === ENTRY ? <DeskEntry docs={docs} listingVersion={listingVersion} sources={sources} hashes={hashes}
              onOpenWiki={onOpenWiki} onOpenSource={onOpenSource} /> : leaving ? null : results}
          </motion.div>)}
        </div>
      </div>
      <DeskJevConsent jev={jev} />
    </div>
  );
}
