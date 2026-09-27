'use client';

import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, Search } from 'lucide-react';

import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';
import { formatSourceBytes } from '@/entities/docs-vault';
import {
  buildQuestionDeskReportBrief,
  questionDeskReportFilename,
  serializeQuestionDeskReport,
  splitQuestionDeskReportSections,
  countDeskReadablePages,
  countDeskWikiPages,
  findDeskClaims,
  findDeskSourceHits,
  jevClaimEligibility,
  jevPayloadEligibility,
  planDeskSourceReads,
  questionDeskListingVersion,
  questionTerms,
  type DeskCitation,
  type DeskClaim,
  type DeskSourceHit,
} from '@/features/library';
import { buildJevPayload, jevJudge, jevSecretStatus, JEV_DESTINATION, type JevJudgment } from '@/shared/lib/tauri-jev';
import { citedPassage, sourceUnits, type SourceUnit } from '@/shared/lib/source-passage';
import { controlClass } from '@/shared/ui/control-class';
import { normalizeOriginalPaths, parseWikilinkHref, resolveSourceCitation, rewriteWikilinks } from '@/shared/lib/source-citation';
import { WIKI_CITATION_ANCHOR_PATTERN } from '@/shared/lib/wiki-page-schema';
import { Button, Chip, Dialog, Disclosure, RowButton, RowDisclosure } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { ICON_SIZE } from '@/shared/ui/icon-size';
import { MOTION, OVERLAY_RISE, OVERLAY_RISE_REDUCED, OVERLAY_SETTLED, STAGGER } from '@/shared/motion';
import { usePrefersReducedMotion } from '@/shared/lib/use-prefers-reduced-motion';
import { latinEyebrowClass } from '@/shared/lib/latin-eyebrow';
import { StateBadge } from './StateBadge';

const INLINE_CITATION = /\[\[src:[^\]]+\]\]/g;
const VALID_SOURCE_ANCHOR = new RegExp(`^(?:${WIKI_CITATION_ANCHOR_PATTERN})$`);

interface DeskResult {
  question: string;
  searchId: number;
  listingVersion: string;
  claims: DeskClaim[];
  sourceHits: DeskSourceHit[];
  readPages: number;
  totalPages: number;
  omittedClaims: number;
  plannedSources: number;
  totalSources: number;
  unreadableSources: number;
  changedSources: number;
  omittedSources: number;
}

export interface QuestionDeskReportDraft {
  question: string;
  searchId: number;
  listingVersion: string;
  vaultScope: string;
  text: string;
  coverage: string;
  limits: string;
  generatedAt: string;
}

export interface QuestionDeskReportRequest {
  brief: string;
  question: string;
  searchId: number;
  listingVersion: string;
  vaultScope: string;
  coverage: string;
  limits: string;
}

interface JevSelection {
  claim: DeskClaim;
  citation: DeskCitation;
  payload: string;
  pageRaw: string;
  sourceMtime: number;
  sourceHash: string;
  vaultScope: string;
}

interface LocatedJevFinding {
  judgment: JevJudgment;
  pageSlug: string;
  claimText: string;
  citation: DeskCitation;
  pageRaw: string;
  sourceMtime: number;
  sourceHash: string;
}

async function digestHex(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

function formatReportTimestamp(value: string, locale: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function SafeReportMarkdown({ text, sources, onOpenSource, answer = false }: {
  text: string;
  sources: readonly LibrarySourceRow[];
  onOpenSource: (path: string, anchor: string) => void;
  answer?: boolean;
}) {
  const t = useTranslations('library.questionDesk');
  const known = useMemo(() => normalizeOriginalPaths(new Set(sources.map((source) => source.path))), [sources]);
  const isCitationLink = (child: ReactNode) => isValidElement<{ href?: string }>(child)
    && Boolean(child.props.href && parseWikilinkHref(child.props.href));
  return <div data-report-markdown="true" className={answer
    ? 'min-w-0 text-reading leading-prose text-[color:var(--color-text-primary)]'
    : 'min-w-0 text-reading leading-prose text-[color:var(--color-text-secondary)]'} data-testid="question-desk-report-markdown">
    <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
      h1: ({ children }) => <h3 className="mb-2 mt-5 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
      h2: ({ children }) => <h3 className="mb-2 mt-5 text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] first:mt-0">{children}</h3>,
      h3: ({ children }) => <h4 className="mb-2 mt-4 text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{children}</h4>,
      p: ({ children, node }) => {
        if (!answer) return <p className="my-3 break-words">{children}</p>;
        const parts = Children.toArray(children);
        const citations = parts.filter(isCitationLink);
        const prose = citations.length ? parts.filter((child) => !isCitationLink(child)).reduce<ReactNode[]>((merged, child) => {
          if (typeof child === 'string' && typeof merged[merged.length - 1] === 'string') {
            merged[merged.length - 1] = String(merged[merged.length - 1]) + child;
          } else merged.push(child);
          return merged;
        }, []).map((child) => typeof child === 'string'
          ? child.replace(/[ \t]{2,}/gu, ' ').replace(/\s+([.,!?;:)\]])/gu, '$1')
          : child) : parts;
        const isAnswerLead = node?.position?.start.offset === 0;
        return <div data-report-paragraph="answer" className="my-4 first:mt-0">
          <p className={isAnswerLead
            ? 'break-words text-display font-[var(--font-weight-strong)] leading-display text-[color:var(--color-text-primary)]'
            : 'my-3 break-words'}>{prose}</p>
          {citations.length ? <div data-report-citations="true" className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-body-lg leading-body">{citations}</div> : null}
        </div>;
      },
      ul: ({ children }) => <ul className="my-3 list-disc pl-5">{children}</ul>,
      ol: ({ children }) => <ol className="my-3 list-decimal pl-5">{children}</ol>,
      li: ({ children }) => <li className="my-1 break-words">{children}</li>,
      pre: ({ children }) => <pre className="my-3 overflow-x-auto whitespace-pre-wrap break-words">{children}</pre>,
      img: () => <span className="text-label text-[color:var(--color-text-tertiary)]">{t('report.imageUnavailable')}</span>,
      a: ({ href, children }) => {
        const wikilink = href ? parseWikilinkHref(href) : null;
        const citation = wikilink ? resolveSourceCitation(wikilink.rawSlug, wikilink.rawAnchor, known, true) : null;
        if (citation?.status === 'known' && citation.path && citation.anchor && VALID_SOURCE_ANCHOR.test(citation.anchor)) {
          const address = `${citation.path}#${citation.anchor}`;
          return <button type="button" data-source-path={citation.path} data-source-anchor={citation.anchor}
            aria-label={address} onClick={() => onOpenSource(citation.path!, citation.anchor!)}
            className={controlClass({ shape: 'link', size: 'lg', tone: 'accentOnTint', hoverInk: 'strong', className: answer ? 'inline break-all underline text-body-lg leading-body' : 'inline break-all underline' })}>
            {wikilink?.labelled ? <>{children} · {address}</> : address}
          </button>;
        }
        return <span title={citation ? t('report.citationUnavailable') : t('report.externalUnavailable')}
          className="break-all border-b border-dashed border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)]"
          data-testid={citation ? 'question-desk-report-citation-unavailable' : undefined}>
          {children} {citation ? `${citation.rawPath}${citation.anchor ? `#${citation.anchor}` : ''} ${t('report.unavailableShort')}` : null}
        </span>;
      },
    }}>{rewriteWikilinks(text)}</ReactMarkdown>
  </div>;
}

function DraftReport({ text, sources, onOpenSource }: {
  text: string;
  sources: readonly LibrarySourceRow[];
  onOpenSource: (path: string, anchor: string) => void;
}) {
  const locale = useLocale();
  const t = useTranslations('library.questionDesk');
  const reduced = usePrefersReducedMotion();
  const sections = useMemo(() => splitQuestionDeskReportSections(text, locale), [locale, text]);
  if (!sections) return <div data-testid="question-desk-report-raw">
    <p className="mb-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.rawFallback')}</p>
    <SafeReportMarkdown text={text} sources={sources} onOpenSource={onOpenSource} />
  </div>;
  const renderSection = (index: number) => {
    const section = sections[index]!;
    return <motion.section key={section.title} data-report-section-index={index} data-testid={`question-desk-report-section-${index}`}
      data-report-chapter-start={index === 2 ? 'true' : undefined}
      initial={reduced ? OVERLAY_RISE_REDUCED : OVERLAY_RISE} animate={OVERLAY_SETTLED}
      transition={{ ...(reduced ? MOTION.fast : MOTION.settle), delay: reduced ? 0 : index * STAGGER }}
      className={index === 0 ? 'max-w-[var(--measure-doc-column)] border-b border-[color:var(--color-border-soft)] pb-6'
        : index === 1 ? '' : 'border-t border-[color:var(--color-border-soft)] pt-5'}>
      <div data-report-section-heading="true" className={index === 0 ? 'mb-4' : 'mb-2'}>
        <h5 className={index === 0
          ? 'text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-indigo-text-soft)]'
          : 'text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]'}>{section.title}</h5>
      </div>
      {section.markdown ? <SafeReportMarkdown text={section.markdown} sources={sources} onOpenSource={onOpenSource} answer={index === 0} />
        : <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.emptySection')}</p>}
    </motion.section>;
  };
  return <div data-report-sections="true" data-testid="question-desk-report-sections" className="space-y-7">
    {renderSection(0)}
    <div data-report-evidence-pair="true">
      {renderSection(1)}
      <div data-report-right="true" className="flex flex-col gap-7">
        {renderSection(2)}
        {renderSection(3)}
      </div>
    </div>
  </div>;
}

export function LibraryQuestionDesk({
  docs,
  pageTexts,
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
  pageTexts: ReadonlyMap<string, string>;
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
  onOpenWiki: (slug: string) => void;
  onOpenSource: (path: string, anchor?: string) => void;
  workActivity?: ReactNode;
}) {
  const t = useTranslations('library.questionDesk');
  const locale = useLocale();
  const reducedMotion = usePrefersReducedMotion();
  const [question, setQuestion] = useState('');
  const [editingQuestion, setEditingQuestion] = useState(false);
  const [questionFormFocused, setQuestionFormFocused] = useState(false);
  const [result, setResult] = useState<DeskResult | null>(null);
  const [reading, setReading] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [jevPreparing, setJevPreparing] = useState(false);
  const [jevSelection, setJevSelection] = useState<JevSelection | null>(null);
  const [jevFinding, setJevFinding] = useState<LocatedJevFinding | null>(null);
  const [jevNote, setJevNote] = useState<string | null>(null);
  const [jevSending, setJevSending] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const searchId = useRef(0);
  const questionInputRef = useRef<HTMLInputElement | null>(null);
  const printCleanupRef = useRef<(() => void) | null>(null);
  const printContentRef = useRef<HTMLDivElement | null>(null);
  const sourceUnitsByStamp = useRef(new Map<string, SourceUnit[]>());
  const jevRequestId = useRef(0);
  const liveScope = useRef(vaultScope);
  const livePageTexts = useRef(pageTexts);
  useEffect(() => {
    liveScope.current = vaultScope;
    livePageTexts.current = pageTexts;
  }, [pageTexts, vaultScope]);

  useEffect(() => () => { searchId.current += 1; jevRequestId.current += 1; }, []);
  useEffect(() => () => { printCleanupRef.current?.(); }, []);
  useEffect(() => { if (editingQuestion) questionInputRef.current?.focus(); }, [editingQuestion]);

  const listingVersion = questionDeskListingVersion(docs, sources);
  const displayResult = result && result.question === question.trim() && result.listingVersion === listingVersion && result.readPages === countDeskReadablePages(docs, pageTexts)
    ? result : null;
  const outdated = result !== null && displayResult === null;

  const search = async () => {
    const asked = question.trim();
    if (!asked || reading || jevSending) return;
    const id = ++searchId.current;
    onInvalidateReport();
    jevRequestId.current += 1;
    setJevPreparing(false);
    setReading(true);
    setReadCount(0);
    setResult(null);
    setJevFinding(null);
    setJevNote(null);
    setJevSelection(null);
    const wiki = findDeskClaims(asked, docs, pageTexts);
    const searchedVersion = listingVersion;
    const terms = questionTerms(asked);
    const plan = planDeskSourceReads(sources);
    const stamp = (source: LibrarySourceRow) => JSON.stringify([vaultScope, source.path, source.mtime, source.bytes]);
    const currentStamps = new Set(plan.map(stamp));
    for (const key of sourceUnitsByStamp.current.keys()) if (!currentStamps.has(key)) sourceUnitsByStamp.current.delete(key);
    const hits: DeskSourceHit[] = [];
    let unreadableSources = 0;
    let changedSources = 0;
    let omittedPerFile = 0;
    try {
      for (const source of plan) {
        if (id !== searchId.current) return;
        const cached = sourceUnitsByStamp.current.get(stamp(source));
        if (cached) {
          if (cached.length === 0) unreadableSources += 1;
          else {
            const found = findDeskSourceHits(source.path, cached, terms);
            hits.push(...found.hits);
            omittedPerFile += found.matches - found.hits.length;
          }
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
            else {
              const found = findDeskSourceHits(source.path, units, terms);
              hits.push(...found.hits);
              omittedPerFile += found.matches - found.hits.length;
            }
          }
        } catch { unreadableSources += 1; }
        if (id !== searchId.current) return;
        setReadCount((count) => count + 1);
      }
      hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
      setResult({
        question: asked, searchId: id, listingVersion: searchedVersion, claims: wiki.claims, sourceHits: hits.slice(0, 8),
        readPages: wiki.readPages, totalPages: wiki.totalPages, omittedClaims: wiki.omitted,
        plannedSources: plan.length, totalSources: sources.length, unreadableSources,
        changedSources, omittedSources: omittedPerFile + Math.max(0, hits.length - 8),
      });
    } finally {
      if (id === searchId.current) setReading(false);
    }
  };

  const citationState = (claim: DeskClaim, citation: DeskCitation) => {
    if (!sourceHandles.has(citation.path)) return 'missing';
    const recorded = claim.recordedHashes[citation.path];
    const measured = hashes.get(citation.path);
    if (!recorded || !measured) return 'unmeasured';
    return recorded.toLowerCase() === measured.toLowerCase() ? 'observed' : 'stale';
  };

  const prepareJev = async (claim: DeskClaim, citation: DeskCitation) => {
    if (jevPreparing || jevSending) return;
    const requestId = ++jevRequestId.current;
    setJevPreparing(true);
    setJevNote(null);
    const handle = sourceHandles.get(citation.path);
    const listed = sources.find((source) => source.path === citation.path);
    const pageRaw = pageTexts.get(claim.pageSlug);
    const stillCurrent = () => requestId === jevRequestId.current
      && liveScope.current === vaultScope
      && livePageTexts.current.get(claim.pageSlug) === pageRaw;
    try {
      if (!handle || !listed || !vaultRoot || !pageRaw) { setJevNote(t('jev.missing')); return; }
      let status: Awaited<ReturnType<typeof jevSecretStatus>>;
      try { status = await jevSecretStatus(); }
      catch { if (stillCurrent()) setJevNote(t('jev.unavailable')); return; }
      if (!stillCurrent()) return;
      if (!status?.stored) { setJevNote(t('jev.noKey')); return; }
      const file = await handle.getFile();
      if (!stillCurrent()) return;
      const bytes = await file.arrayBuffer();
      if (!stillCurrent()) return;
      const passage = citedPassage(new Uint8Array(bytes), citation.path, citation.anchor);
      const hash = await digestHex(bytes);
      if (!stillCurrent()) return;
      const eligibility = jevClaimEligibility(claim, citation, passage, hash, file.lastModified !== listed.mtime);
      if (eligibility !== 'ready') { setJevNote(t(`jev.${eligibility}`)); return; }
      const claimText = claim.text.replace(INLINE_CITATION, '').trim();
      const evidence = passage.cited.map((unit) => unit.text).join('\n');
      const payload = buildJevPayload(claimText, evidence);
      const payloadState = jevPayloadEligibility(claimText, evidence, payload);
      if (payloadState !== 'ready') { setJevNote(t(`jev.${payloadState}`)); return; }
      if (!hash) { setJevNote(t('jev.obsolete')); return; }
      setJevSelection({ claim, citation, payload, pageRaw, sourceMtime: file.lastModified, sourceHash: hash, vaultScope });
    } catch { if (stillCurrent()) setJevNote(t('jev.missing')); }
    finally { if (requestId === jevRequestId.current) setJevPreparing(false); }
  };

  const sendJev = async () => {
    if (!jevSelection || !vaultRoot || jevSending) return;
    const selected = jevSelection;
    const requestId = ++jevRequestId.current;
    setJevSending(true);
    setJevNote(null);
    try {
      const source = await sourceHandles.get(selected.citation.path)?.getFile();
      const currentHash = source ? await digestHex(await source.arrayBuffer()) : null;
      if (liveScope.current !== selected.vaultScope || pageTexts.get(selected.claim.pageSlug) !== selected.pageRaw || livePageTexts.current.get(selected.claim.pageSlug) !== selected.pageRaw || source?.lastModified !== selected.sourceMtime || currentHash !== selected.sourceHash) {
        setJevSelection(null);
        setJevNote(t('jev.obsolete'));
        return;
      }
      const judgment = await jevJudge(vaultRoot, selected.payload);
      if (jevRequestId.current !== requestId || liveScope.current !== selected.vaultScope || livePageTexts.current.get(selected.claim.pageSlug) !== selected.pageRaw) return;
      const after = await sourceHandles.get(selected.citation.path)?.getFile();
      const afterHash = after ? await digestHex(await after.arrayBuffer()) : null;
      if (after?.lastModified !== selected.sourceMtime || afterHash !== selected.sourceHash) { setJevNote(t('jev.obsolete')); setJevSelection(null); return; }
      if (judgment) setJevFinding({
        judgment, pageSlug: selected.claim.pageSlug, claimText: selected.claim.text,
        citation: selected.citation, pageRaw: selected.pageRaw,
        sourceMtime: selected.sourceMtime, sourceHash: selected.sourceHash,
      });
      setJevSelection(null);
    } catch { setJevNote(t('jev.failed')); }
    finally { if (jevRequestId.current === requestId) setJevSending(false); }
  };

  const coverage = displayResult ? t('coverage', {
    readPages: displayResult.readPages, totalPages: displayResult.totalPages,
    readSources: displayResult.plannedSources - displayResult.unreadableSources - displayResult.changedSources,
    totalSources: displayResult.totalSources,
  }) : '';
  const readSources = displayResult
    ? displayResult.plannedSources - displayResult.unreadableSources - displayResult.changedSources : 0;
  const omittedLeads = displayResult ? displayResult.omittedClaims + displayResult.omittedSources : 0;
  const limits = displayResult ? t('limits', {
    unreadable: displayResult.unreadableSources, changed: displayResult.changedSources,
    skipped: displayResult.totalSources - displayResult.plannedSources,
    omitted: displayResult.omittedClaims + displayResult.omittedSources,
  }) : '';
  const activeReport = displayResult && report?.searchId === displayResult.searchId
    && report.question === displayResult.question && report.listingVersion === displayResult.listingVersion
    && report.vaultScope === vaultScope
    ? report : null;
  const showQuestionForm = !activeReport || editingQuestion || questionFormFocused;
  const hasLocalMatches = Boolean(displayResult && (displayResult.claims.length > 0 || displayResult.sourceHits.length > 0));
  const startingSources = useMemo(() => [...sources].sort((a, b) => a.path.localeCompare(b.path)).slice(0, 3), [sources]);
  const reportAction = displayResult && !activeReport ? <Button size="sm" variant="primary" disabled={!agentReady || turnRunning} onClick={() => {
    if (!vaultRoot) return;
    onSummarize({
      brief: buildQuestionDeskReportBrief({ question: displayResult.question, vaultRoot, locale,
        claims: displayResult.claims, sourceHits: displayResult.sourceHits, coverage: `${coverage} ${limits}` }),
      question: displayResult.question, searchId: displayResult.searchId,
      listingVersion: displayResult.listingVersion,
      vaultScope, coverage, limits,
    });
  }} data-testid="question-desk-summarize">{hasLocalMatches ? t('report.summarize') : t('report.investigate')}</Button> : null;
  const downloadReport = () => {
    if (!activeReport) return;
    const markdown = serializeQuestionDeskReport(activeReport, locale, new Set(sources.map((source) => source.path)));
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = questionDeskReportFilename(activeReport);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const printReport = async () => {
    if (!activeReport) return;
    setPrintError(null);
    const root = document.documentElement;
    const printMedia = window.matchMedia?.('print');
    printCleanupRef.current?.();
    const printable = printContentRef.current;
    if (!printable) { setPrintError(t('report.printFailed')); return; }
    const printRoot = document.createElement('div');
    printRoot.dataset.questionDeskPrintRoot = 'true';
    const printPageStyle = document.createElement('style');
    printPageStyle.textContent = '@page { size: A4; margin: 18mm 16mm; }';
    const content = printable.cloneNode(true) as HTMLDivElement;
    content.removeAttribute('data-testid');
    content.querySelectorAll('[data-report-actions], [data-report-scope-disclosure]').forEach((control) => control.remove());
    content.querySelectorAll('[id], [data-testid]').forEach((element) => {
      element.removeAttribute('id');
      element.removeAttribute('data-testid');
    });
    printRoot.appendChild(content);
    const onMediaChange = () => { if (!printMedia?.matches) clear(); };
    const clear = () => {
      delete root.dataset.printScope;
      printRoot.remove();
      printPageStyle.remove();
      window.removeEventListener('afterprint', clear);
      printMedia?.removeEventListener?.('change', onMediaChange);
      if (printCleanupRef.current === clear) printCleanupRef.current = null;
    };
    printCleanupRef.current = clear;
    document.body.appendChild(printRoot);
    document.head.appendChild(printPageStyle);
    root.dataset.printScope = 'question-desk';
    window.addEventListener('afterprint', clear, { once: true });
    printMedia?.addEventListener?.('change', onMediaChange);
    try { await Promise.resolve(window.print()); }
    catch { clear(); setPrintError(t('report.printFailed')); }
  };
  const reportActions = activeReport ? <div data-report-actions="true" className="min-w-0">
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Chip tone="muted" aria-controls="question-desk-question-form" aria-expanded={showQuestionForm}
        onClick={() => setEditingQuestion(true)} data-testid="question-desk-edit-question">{t('editQuestion')}</Chip>
      <Chip tone="muted" onClick={downloadReport} data-testid="question-desk-download-markdown">{t('report.downloadMarkdown')}</Chip>
      <Chip tone="muted" onClick={() => void printReport()} data-testid="question-desk-print-pdf">{t('report.printPdf')}</Chip>
      <Chip tone="accentOnTint" disabled={!onFileReport || filingReport} onClick={onFileReport ?? undefined} data-testid="question-desk-file-report">
        {filingReport ? t('report.filing') : t('report.file')}
      </Chip>
    </div>
    {printError ? <p role="alert" className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]" data-testid="question-desk-print-error">{printError}</p> : null}
    {fileReportNote ? <p role="alert" className="mt-2 text-label leading-label text-[color:var(--color-danger-text)]">{fileReportNote}</p> : null}
  </div> : null;
  return (
    <div data-testid="library-question-desk" className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6 lg:py-8 max-lg:mb-[var(--topology-mobile-bottom-tab-reserve)] max-lg:pb-3">
      <div data-question-desk-container="true" className="mx-auto w-full max-w-[calc(var(--measure-note-column)+var(--measure-note-column))]">
        {!activeReport ? <header className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-label leading-label text-[color:var(--color-indigo-text-soft)]">{t('eyebrow')}</p>
            <Chip className="lg:hidden" tone="muted" onClick={onBrowse} data-testid="question-desk-browse">{t('browse')}</Chip>
          </div>
          <RowDisclosure open={!displayResult} id="question-desk-introduction">
            <h2 className="mt-4 max-w-[var(--measure-doc-column)] text-hero font-[var(--font-weight-signature)] leading-hero tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">{t('title')}</h2>
          </RowDisclosure>
        </header> : <header className="mb-4 lg:hidden"><Chip tone="muted" onClick={onBrowse} data-testid="question-desk-browse">{t('browse')}</Chip></header>}
        {workActivity ? <div className={activeReport ? 'mb-4' : 'mb-4 max-w-[var(--measure-doc-column)]'}>{workActivity}</div> : null}
        {showQuestionForm ? <form id="question-desk-question-form" onSubmit={(event) => { event.preventDefault(); void search(); }}
          onFocusCapture={() => setQuestionFormFocused(true)}
          onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuestionFormFocused(false); }}
          className="mb-5 max-w-[var(--measure-doc-column)]">
          <div className="flex flex-wrap items-center gap-3 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-[var(--card-pad)] transition-colors focus-within:border-[color:var(--color-indigo-line-a54)]">
          <Search size={ICON_SIZE.lg} className="flex-none text-[color:var(--color-text-tertiary)]" aria-hidden="true" />
          <Input ref={questionInputRef} frame="bare" size="lg" aria-label={t('questionLabel')} placeholder={t('questionPlaceholder')} value={question} readOnly={jevSending} onChange={(event) => {
            onInvalidateReport();
            searchId.current += 1;
            jevRequestId.current += 1;
            setQuestion(event.target.value);
            setEditingQuestion(false);
            setReading(false);
            setReadCount(0);
            setJevPreparing(false);
            setResult(null);
            setJevSelection(null);
            setJevFinding(null);
            setJevNote(null);
          }} className="min-w-40 flex-1" data-testid="question-desk-input" />
          <Button type="submit" size="sm" variant={displayResult && agentReady ? 'outline' : 'primary'} className="ml-auto" disabled={!question.trim() || reading || jevSending} data-testid="question-desk-search">{reading ? t('reading', { read: readCount }) : t('search')}</Button>
          </div>
          {!displayResult ? <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('folderScope', { pages: countDeskWikiPages(docs), sources: sources.length })}</p> : null}
        </form> : null}
        <RowDisclosure open={!displayResult && !activeReport} id="question-desk-starting-material" className="max-w-[var(--measure-doc-column)] pb-5">
          <p className="text-reading leading-prose text-[color:var(--color-text-secondary)]">{t('intro')}</p>
          {startingSources.length ? <section className="mt-7 border-t border-[color:var(--color-border-soft)] pt-5" data-testid="question-desk-originals" aria-labelledby="question-desk-originals-title">
            <h3 id="question-desk-originals-title" className="mb-3 text-body font-[var(--font-weight-strong)] leading-body">{t('originalsTitle')}</h3>
            <ul className="divide-y divide-[color:var(--color-border-soft)]">
              {startingSources.map((source) => <li key={source.path}>
                <RowButton size="lg" tone="muted" hoverInk="strong" hoverSurface="lift" className="w-full justify-start gap-3" title={source.path} onClick={() => onOpenSource(source.path)}>
                  <FileText size={ICON_SIZE.lg} className="flex-none text-[color:var(--color-text-tertiary)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 space-y-1 text-left">
                    <span className="block truncate text-body-lg leading-body-lg text-[color:var(--color-text-primary)]">{source.name}</span>
                    <span className="block text-label leading-label text-[color:var(--color-text-tertiary)]">{t('originalMeta', { format: source.format.toUpperCase() || 'FILE', size: formatSourceBytes(source.bytes), pages: source.citedBy.length })}</span>
                  </span>
                  <span className="flex-none text-label leading-label text-[color:var(--color-text-tertiary)]">{t('readOriginal')}</span>
                </RowButton>
              </li>)}
            </ul>
            {sources.length > startingSources.length ? <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('otherOriginals', { count: sources.length - startingSources.length })}</p> : null}
          </section> : null}
        </RowDisclosure>
        {visible && (outdated || (report && displayResult && !activeReport)) ? <p role="status" className="text-label leading-label text-[color:var(--color-text-tertiary)]">{report ? t('report.outdated') : t('outdated')}</p> : null}
        {visible && displayResult ? (
          <motion.section key={displayResult.searchId} initial={reducedMotion ? OVERLAY_RISE_REDUCED : OVERLAY_RISE}
            animate={OVERLAY_SETTLED} transition={reducedMotion ? MOTION.fast : MOTION.base}
            className="space-y-5" data-testid="question-desk-results">
            {!activeReport ? <div className="flex max-w-[var(--measure-doc-column)] flex-wrap items-start justify-between gap-3 border-b border-[color:var(--color-border-soft)] pb-4">
              <div className="min-w-0 flex-1">
                <p aria-live="polite" className="text-label leading-label text-[color:var(--color-text-secondary)]">
                  {t('coverageCompact', { readPages: displayResult.readPages, totalPages: displayResult.totalPages,
                    readSources, totalSources: displayResult.totalSources, omitted: omittedLeads })}
                </p>
                <div data-testid="question-desk-coverage-details" className="mt-2">
                  <Disclosure animated summary={t('coverageDetails')} summaryTestId="question-desk-coverage-toggle">
                    <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{coverage}</p>
                    <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">{limits}</p>
                  </Disclosure>
                </div>
              </div>
              {hasLocalMatches ? reportAction : null}
            </div> : null}
            {!agentReady && !activeReport ? <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('report.agentUnavailable')}</p> : null}
            {activeReport ? <motion.section key={`${activeReport.searchId}:${activeReport.generatedAt}`}
              initial={reducedMotion ? OVERLAY_RISE_REDUCED : OVERLAY_RISE} animate={OVERLAY_SETTLED}
              transition={reducedMotion ? MOTION.fast : MOTION.settle}
              data-testid="question-desk-report" data-question-desk-report="true" data-dock-open={dockOpen ? 'true' : 'false'} aria-labelledby="question-desk-report-title"
              className="pt-2">
              <p role="status" className="sr-only">{t('report.readyNotice')}</p>
              <div ref={printContentRef} data-question-desk-print="true" data-testid="question-desk-print-content">
                <header className="mb-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p data-testid="question-desk-report-masthead" className={`text-caption leading-caption text-[color:var(--color-indigo-text-soft)] ${latinEyebrowClass(locale, 'tracking-[var(--tracking-caps-08)]')}`}>{t('report.masthead')}</p>
                      <p className="mt-1 text-label leading-label text-[color:var(--color-indigo-text-soft)]">{t('report.unreviewed')}</p>
                    </div>
                    {reportActions}
                  </div>
                  <h3 id="question-desk-report-title" className="mt-3 max-w-[var(--measure-doc-column)] text-display font-[var(--font-weight-strong)] leading-display tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">{activeReport.question}</h3>
                  <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
                    <time dateTime={activeReport.generatedAt} data-testid="question-desk-report-generated">{t('report.generated', { time: formatReportTimestamp(activeReport.generatedAt, locale) })}</time>
                    <span>{t('coverageCompact', { readPages: displayResult.readPages, totalPages: displayResult.totalPages,
                      readSources, totalSources: displayResult.totalSources, omitted: omittedLeads })}</span>
                    <div data-report-scope-disclosure="true"><Disclosure animated summary={t('coverageDetails')} summaryTestId="question-desk-coverage-toggle">
                      <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{coverage}</p>
                      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">{limits}</p>
                    </Disclosure></div>
                  </div>
                </header>
                <DraftReport text={activeReport.text} sources={sources} onOpenSource={onOpenSource} />
                <footer className="mt-6 border-t border-[color:var(--color-border-soft)] pt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">
                  <h5 className="font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]">{t('report.searchScope')}</h5>
                  <p className="mt-1">{activeReport.coverage}</p>
                  <p className="mt-1">{activeReport.limits}</p>
                  <p className="mt-2">{t('report.caveat')}</p>
                  <p className="mt-2">{t('report.citationNote')}</p>
                </footer>
              </div>
            </motion.section> : null}
            {!hasLocalMatches && !activeReport ? <section className="max-w-[var(--measure-doc-column)]" data-testid="question-desk-unknown">
              <h3 className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('zeroLocalTitle')}</h3>
              <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t('zeroLocalBody')}</p>
              {agentReady ? <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('zeroLocalAgentNote')}</p> : null}
              <div className="mt-4">{reportAction}</div>
            </section> : null}
            {hasLocalMatches ? <div data-testid="question-desk-evidence-leads" className="border-t border-[color:var(--color-border-soft)] pt-4">
              <Disclosure animated open={!agentReady}
                summary={t('leadsSummary', { claims: displayResult.claims.length, sources: displayResult.sourceHits.length })}
                summaryTestId="question-desk-evidence-toggle">
              <div className="space-y-5">
            {displayResult.claims.length ? <section aria-labelledby="desk-wiki-title">
              <h3 id="desk-wiki-title" className="text-body font-[var(--font-weight-strong)] leading-body">{t('wikiTitle')}</h3>
              <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('wikiCaveat')}</p>
              {displayResult.claims.length ? <ul className="mt-3 space-y-2">{displayResult.claims.map((claim, index) => (
                <li key={`${claim.pageSlug}-${index}`} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accentOnTint', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenWiki(claim.pageSlug)}>{claim.pageTitle}</button>
                    {claim.citations.length === 0 || claim.citations.some((citation) => ['stale', 'missing'].includes(citationState(claim, citation)))
                      ? <StateBadge tone="warning">{t('reviewBadge')}</StateBadge>
                      : claim.citations.some((citation) => citationState(claim, citation) === 'unmeasured')
                        ? <StateBadge tone="neutral">{t('unmeasuredBadge')}</StateBadge>
                        : null}
                  </div>
                  <p className="mt-2 text-body leading-body text-[color:var(--color-text-primary)]">{claim.text.replace(INLINE_CITATION, '').trim()}</p>
                  {claim.citations.length ? <div className="mt-2 flex flex-wrap gap-2">{claim.citations.map((citation) => (
                    <div key={`${citation.path}#${citation.anchor}`} className="flex flex-wrap items-center gap-2">
                      <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accentOnTint', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenSource(citation.path, citation.anchor)}>{citation.path}#{citation.anchor}</button>
                      <span className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">{t(`sourceState.${citationState(claim, citation)}`)}</span>
                      {vaultRoot ? <Chip aria-disabled={jevPreparing || jevSending} onClick={() => void prepareJev(claim, citation)}>{jevPreparing ? t('jev.checking') : t('jev.check')}</Chip> : null}
                      {jevFinding?.pageSlug === claim.pageSlug && jevFinding.claimText === claim.text && jevFinding.citation.path === citation.path && jevFinding.citation.anchor === citation.anchor
                        && jevFinding.pageRaw === pageTexts.get(claim.pageSlug)
                        && jevFinding.sourceMtime === sources.find((source) => source.path === citation.path)?.mtime
                        && (!hashes.has(citation.path) || hashes.get(citation.path) === jevFinding.sourceHash) ? (
                        <div role="status" className="w-full rounded-card border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] p-[var(--card-pad)] text-label leading-label text-[color:var(--color-text-secondary)]" data-testid="question-desk-jev-result">
                          <p>{t(`jev.choice.${jevFinding.judgment.choice}`)}</p>
                          <p className="mt-1">{claim.text.replace(INLINE_CITATION, '').trim()}</p>
                          <p className="mt-1">{claim.pageSlug}.md · {citation.path}#{citation.anchor}</p>
                          <p className="mt-1">{t('jev.advisory')}</p>
                        </div>
                      ) : null}
                    </div>
                  ))}</div> : <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('noCitation')}</p>}
                </li>
              ))}</ul> : <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('noWikiHits')}</p>}
            </section> : null}
            {displayResult.sourceHits.length ? <section aria-labelledby="desk-source-title">
              <h3 id="desk-source-title" className="text-body font-[var(--font-weight-strong)] leading-body">{t('sourceTitle')}</h3>
              {displayResult.sourceHits.length ? <ul className="mt-3 space-y-2">{displayResult.sourceHits.map((hit) => (
                <li key={`${hit.path}#${hit.anchor}`} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                  <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accentOnTint', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenSource(hit.path, hit.anchor)}>{hit.path}#{hit.anchor}</button>
                  <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{hit.text}</p>
                </li>
              ))}</ul> : <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('noSourceHits')}</p>}
            </section> : null}
              </div>
              </Disclosure>
            </div> : null}
            {jevNote ? <p role="status" className="text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="question-desk-jev-note">{jevNote}</p> : null}
          </motion.section>
        ) : null}
      </div>
      <Dialog open={jevSelection !== null} onClose={() => { if (!jevSending) setJevSelection(null); }} size="md" labelledBy="question-desk-jev-title" testId="question-desk-jev-consent" className="max-h-[calc(100vh-var(--chrome-inset)*2)] overflow-y-auto">
        {jevSelection ? <div className="space-y-3">
          <h3 id="question-desk-jev-title" className="text-title font-[var(--font-weight-strong)] leading-title">{t('jev.consentTitle')}</h3>
          <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('jev.transfer', { host: JEV_DESTINATION })}</p>
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{jevSelection.citation.path}#{jevSelection.citation.anchor}</p>
          <pre data-testid="question-desk-jev-payload" className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-[var(--card-pad)] font-mono text-label leading-label">{jevSelection.payload}</pre>
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('jev.keyNote')}</p>
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={jevSending} onClick={() => setJevSelection(null)}>{t('jev.cancel')}</Button><Button variant="primary" disabled={jevSending} onClick={() => void sendJev()} data-testid="question-desk-jev-send">{jevSending ? t('jev.sending') : t('jev.send')}</Button></div>
        </div> : null}
      </Dialog>
    </div>
  );
}
