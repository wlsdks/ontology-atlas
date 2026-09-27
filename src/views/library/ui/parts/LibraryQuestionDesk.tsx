'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';
import {
  buildQuestionDeskBrief,
  countDeskReadablePages,
  findDeskClaims,
  findDeskSourceHits,
  jevClaimEligibility,
  jevPayloadEligibility,
  planDeskSourceReads,
  questionTerms,
  type DeskCitation,
  type DeskClaim,
  type DeskSourceHit,
} from '@/features/library';
import { buildJevPayload, jevJudge, jevSecretStatus, JEV_DESTINATION, type JevJudgment } from '@/shared/lib/tauri-jev';
import { citedPassage, sourceUnits, type SourceUnit } from '@/shared/lib/source-passage';
import { controlClass } from '@/shared/ui/control-class';
import { Button, Chip, Dialog } from '@/shared/ui';
import { Input } from '@/shared/ui/input';
import { StateBadge } from './StateBadge';

const INLINE_CITATION = /\[\[src:[^\]]+\]\]/g;

interface DeskResult {
  question: string;
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
}

async function digestHex(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/** The Wiki tab's local question desk. All source reads start with Search, never with typing. */
export function LibraryQuestionDesk({
  docs,
  pageTexts,
  sources,
  sourceHandles,
  hashes,
  vaultRoot,
  vaultScope,
  agentReady,
  onBrowse,
  onAsk,
  onOpenWiki,
  onOpenSource,
}: {
  docs: readonly VaultDoc[];
  pageTexts: ReadonlyMap<string, string>;
  sources: readonly LibrarySourceRow[];
  sourceHandles: ReadonlyMap<string, FileSystemFileHandle>;
  hashes: ReadonlyMap<string, string>;
  vaultRoot: string | null;
  vaultScope: string;
  agentReady: boolean;
  onBrowse: () => void;
  onAsk: (brief: string, question: string) => void;
  onOpenWiki: (slug: string) => void;
  onOpenSource: (path: string, anchor: string) => void;
}) {
  const t = useTranslations('library.questionDesk');
  const locale = useLocale();
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<DeskResult | null>(null);
  const [reading, setReading] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const [jevStored, setJevStored] = useState(false);
  const [jevSelection, setJevSelection] = useState<JevSelection | null>(null);
  const [jevFinding, setJevFinding] = useState<LocatedJevFinding | null>(null);
  const [jevNote, setJevNote] = useState<string | null>(null);
  const [jevSending, setJevSending] = useState(false);
  const searchId = useRef(0);
  /** Only the current folder's inventoried versions, in memory; no persisted search index. */
  const sourceUnitsByStamp = useRef(new Map<string, SourceUnit[]>());
  const jevRequestId = useRef(0);
  const liveScope = useRef(vaultScope);
  const livePageTexts = useRef(pageTexts);
  useEffect(() => {
    liveScope.current = vaultScope;
    livePageTexts.current = pageTexts;
  }, [pageTexts, vaultScope]);

  useEffect(() => {
    let live = true;
    void jevSecretStatus().then((status) => { if (live) setJevStored(Boolean(status?.stored)); }).catch(() => { if (live) setJevStored(false); });
    return () => { live = false; };
  }, [vaultScope]);
  useEffect(() => () => { searchId.current += 1; jevRequestId.current += 1; }, []);

  const listingVersion = JSON.stringify([
    docs.filter((doc) => doc.slug.startsWith('wiki/')).map((doc) => [doc.slug, doc.mtime ?? null]),
    sources.map((source) => [source.path, source.mtime, source.bytes]),
  ]);
  const displayResult = result && result.question === question.trim() && result.listingVersion === listingVersion && result.readPages === countDeskReadablePages(docs, pageTexts)
    ? result : null;
  const outdated = result !== null && displayResult === null;

  const search = async () => {
    const asked = question.trim();
    if (!asked || reading || jevSending) return;
    const id = ++searchId.current;
    jevRequestId.current += 1;
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
        question: asked, listingVersion: searchedVersion, claims: wiki.claims, sourceHits: hits.slice(0, 8),
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
    setJevNote(null);
    setJevFinding(null);
    const handle = sourceHandles.get(citation.path);
    const listed = sources.find((source) => source.path === citation.path);
    const pageRaw = pageTexts.get(claim.pageSlug);
    if (!handle || !listed || !vaultRoot || !pageRaw) { setJevNote(t('jev.missing')); return; }
    try {
      const file = await handle.getFile();
      const bytes = await file.arrayBuffer();
      const passage = citedPassage(new Uint8Array(bytes), citation.path, citation.anchor);
      const hash = await digestHex(bytes);
      const eligibility = jevClaimEligibility(claim, citation, passage, hash, file.lastModified !== listed.mtime);
      if (eligibility !== 'ready') { setJevNote(t(`jev.${eligibility}`)); return; }
      const claimText = claim.text.replace(INLINE_CITATION, '').trim();
      const evidence = passage.cited.map((unit) => unit.text).join('\n');
      const payload = buildJevPayload(claimText, evidence);
      const payloadState = jevPayloadEligibility(claimText, evidence, payload);
      if (payloadState !== 'ready') { setJevNote(t(`jev.${payloadState}`)); return; }
      if (!hash || liveScope.current !== vaultScope || livePageTexts.current.get(claim.pageSlug) !== pageRaw) { setJevNote(t('jev.obsolete')); return; }
      setJevSelection({ claim, citation, payload, pageRaw, sourceMtime: file.lastModified, sourceHash: hash, vaultScope });
    } catch { setJevNote(t('jev.missing')); }
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
      if (judgment) setJevFinding({ judgment, pageSlug: selected.claim.pageSlug, claimText: selected.claim.text, citation: selected.citation });
      setJevSelection(null);
    } catch { setJevNote(t('jev.failed')); }
    finally { if (jevRequestId.current === requestId) setJevSending(false); }
  };

  const coverage = displayResult ? t('coverage', {
    readPages: displayResult.readPages, totalPages: displayResult.totalPages,
    readSources: displayResult.plannedSources - displayResult.unreadableSources - displayResult.changedSources,
    totalSources: displayResult.totalSources,
  }) : '';
  const limits = displayResult ? t('limits', {
    unreadable: displayResult.unreadableSources, changed: displayResult.changedSources,
    skipped: displayResult.totalSources - displayResult.plannedSources,
    omitted: displayResult.omittedClaims + displayResult.omittedSources,
  }) : '';
  return (
    <div data-testid="library-question-desk" className="atlas-scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-6 max-lg:pb-[calc(var(--topology-mobile-bottom-tab-reserve)+12px)]">
      <div className="mx-auto w-full max-w-[var(--measure-doc-column)] space-y-5">
        <header>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">{t('eyebrow')}</p>
            <Chip className="lg:hidden" tone="muted" onClick={onBrowse} data-testid="question-desk-browse">{t('browse')}</Chip>
          </div>
          <h2 className="mt-1 text-title font-[var(--font-weight-signature)] leading-title text-[color:var(--color-text-primary)]">{t('title')}</h2>
          <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{t('intro')}</p>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); void search(); }} className="flex flex-wrap items-end gap-2 max-sm:flex-col max-sm:items-stretch">
          <Input label={t('questionLabel')} value={question} readOnly={jevSending} onChange={(event) => {
            searchId.current += 1;
            setQuestion(event.target.value);
            setReading(false);
            setReadCount(0);
            setResult(null);
            setJevSelection(null);
            setJevFinding(null);
            setJevNote(null);
          }} className="min-w-48 flex-1 max-sm:w-full" data-testid="question-desk-input" />
          <Button type="submit" variant="primary" className="max-sm:w-full" disabled={!question.trim() || reading || jevSending} data-testid="question-desk-search">{reading ? t('reading', { read: readCount }) : t('search')}</Button>
        </form>
        {outdated ? <p role="status" className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('outdated')}</p> : null}
        {displayResult ? (
          <section className="space-y-5" data-testid="question-desk-results">
            <div className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
              <p aria-live="polite" className="text-label leading-label text-[color:var(--color-text-secondary)]">{coverage}</p>
              <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">{limits}</p>
            </div>
            {displayResult.claims.length === 0 && displayResult.sourceHits.length === 0 ? <p className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="question-desk-unknown">{t('unknown')}</p> : null}
            <section aria-labelledby="desk-wiki-title">
              <h3 id="desk-wiki-title" className="text-body font-[var(--font-weight-strong)] leading-body">{t('wikiTitle')}</h3>
              <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('wikiCaveat')}</p>
              {displayResult.claims.length ? <ul className="mt-3 space-y-2">{displayResult.claims.map((claim, index) => (
                <li key={`${claim.pageSlug}-${index}`} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accent', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenWiki(claim.pageSlug)}>{claim.pageTitle}</button>
                    {claim.citations.length === 0 || claim.citations.some((citation) => ['stale', 'missing'].includes(citationState(claim, citation)))
                      ? <StateBadge tone="warning">{t('reviewBadge')}</StateBadge>
                      : claim.citations.some((citation) => citationState(claim, citation) === 'unmeasured')
                        ? <StateBadge tone="neutral">{t('unmeasuredBadge')}</StateBadge>
                        : null}
                  </div>
                  <p className="mt-2 text-body leading-body text-[color:var(--color-text-primary)]">{claim.text.replace(INLINE_CITATION, '').trim()}</p>
                  {claim.citations.length ? <div className="mt-2 flex flex-wrap gap-2">{claim.citations.map((citation) => (
                    <div key={`${citation.path}#${citation.anchor}`} className="flex flex-wrap items-center gap-2">
                      <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accent', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenSource(citation.path, citation.anchor)}>{citation.path}#{citation.anchor}</button>
                      <span className="text-caption leading-caption text-[color:var(--color-text-tertiary)]">{t(`sourceState.${citationState(claim, citation)}`)}</span>
                      {jevStored && vaultRoot ? <Chip onClick={() => void prepareJev(claim, citation)}>{t('jev.check')}</Chip> : null}
                      {jevFinding?.pageSlug === claim.pageSlug && jevFinding.claimText === claim.text && jevFinding.citation.path === citation.path && jevFinding.citation.anchor === citation.anchor ? (
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
            </section>
            <section aria-labelledby="desk-source-title">
              <h3 id="desk-source-title" className="text-body font-[var(--font-weight-strong)] leading-body">{t('sourceTitle')}</h3>
              {displayResult.sourceHits.length ? <ul className="mt-3 space-y-2">{displayResult.sourceHits.map((hit) => (
                <li key={`${hit.path}#${hit.anchor}`} className="rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)]">
                  <button type="button" className={controlClass({ shape: 'link', size: 'md', tone: 'accent', hoverInk: 'strong', className: 'underline' })} onClick={() => onOpenSource(hit.path, hit.anchor)}>{hit.path}#{hit.anchor}</button>
                  <p className="mt-2 text-body leading-body text-[color:var(--color-text-secondary)]">{hit.text}</p>
                </li>
              ))}</ul> : <p className="mt-3 text-label leading-label text-[color:var(--color-text-tertiary)]">{t('noSourceHits')}</p>}
            </section>
            <div className="border-t border-[color:var(--color-border-soft)] pt-4">
              <Button variant="outline" disabled={!agentReady} onClick={() => {
                if (!vaultRoot) return;
                onAsk(buildQuestionDeskBrief({ question: displayResult.question, vaultRoot, locale, claims: displayResult.claims, sourceHits: displayResult.sourceHits, coverage: `${coverage} ${limits}` }), displayResult.question);
              }} data-testid="question-desk-ask">{t('ask')}</Button>
              <p className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]">{agentReady ? t('askNote') : t('askUnavailable')}</p>
              {jevNote ? <p role="status" className="mt-2 text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="question-desk-jev-note">{jevNote}</p> : null}
            </div>
          </section>
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
