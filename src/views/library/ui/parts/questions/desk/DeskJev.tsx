'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { LibrarySourceRow } from '@/entities/docs-vault';
import { jevClaimEligibility, jevPayloadEligibility, type DeskCitation, type DeskClaim, type LibraryPageFacts } from '@/features/library';
import { buildJevPayload, jevJudge, jevSecretStatus, JEV_DESTINATION, type JevJudgment } from '@/shared/lib/llm-connection/tauri-jev';
import { citedPassage } from '@/shared/lib/library/source-passage';
import { Button, Dialog } from '@/shared/ui';

const INLINE_CITATION = /\[\[src:[^\]]+\]\]/g;

interface JevSelection {
  claim: DeskClaim;
  citation: DeskCitation;
  payload: string;
  page: LibraryPageFacts;
  sourceMtime: number;
  sourceHash: string;
  vaultScope: string;
}

interface LocatedJevFinding {
  judgment: JevJudgment;
  pageSlug: string;
  claimText: string;
  citation: DeskCitation;
  page: LibraryPageFacts;
  sourceMtime: number;
  sourceHash: string;
}

async function digestHex(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}

/**
 * The optional Jev check of one wiki claim against its cited passage. Nothing leaves before the
 * consent dialog's Send, and every await re-checks that the folder, page and source are the ones
 * the preview showed.
 */
export function useDeskJev({ pageFacts, sources, sourceHandles, hashes, vaultRoot, vaultScope }: {
  pageFacts: ReadonlyMap<string, LibraryPageFacts>;
  sources: readonly LibrarySourceRow[];
  sourceHandles: ReadonlyMap<string, FileSystemFileHandle>;
  hashes: ReadonlyMap<string, string>;
  vaultRoot: string | null;
  vaultScope: string;
}) {
  const t = useTranslations('library.questionDesk');
  const [preparing, setPreparing] = useState(false);
  const [selection, setSelection] = useState<JevSelection | null>(null);
  const [finding, setFinding] = useState<LocatedJevFinding | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const requestId = useRef(0);
  const liveScope = useRef(vaultScope);
  const livePageFacts = useRef(pageFacts);
  useEffect(() => {
    liveScope.current = vaultScope;
    livePageFacts.current = pageFacts;
  }, [pageFacts, vaultScope]);
  useEffect(() => () => { requestId.current += 1; }, []);

  const reset = () => {
    requestId.current += 1;
    setPreparing(false);
    setSelection(null);
    setFinding(null);
    setNote(null);
  };

  const prepare = async (claim: DeskClaim, citation: DeskCitation) => {
    if (preparing || sending) return;
    const id = ++requestId.current;
    setPreparing(true);
    setNote(null);
    const handle = sourceHandles.get(citation.path);
    const listed = sources.find((source) => source.path === citation.path);
    const page = pageFacts.get(claim.pageSlug);
    const stillCurrent = () => id === requestId.current
      && liveScope.current === vaultScope
      && livePageFacts.current.get(claim.pageSlug) === page;
    try {
      if (!handle || !listed || !vaultRoot || !page) { setNote(t('jev.missing')); return; }
      let status: Awaited<ReturnType<typeof jevSecretStatus>>;
      try { status = await jevSecretStatus(); }
      catch { if (stillCurrent()) setNote(t('jev.unavailable')); return; }
      if (!stillCurrent()) return;
      if (!status?.stored) { setNote(t('jev.noKey')); return; }
      const file = await handle.getFile();
      if (!stillCurrent()) return;
      const bytes = await file.arrayBuffer();
      if (!stillCurrent()) return;
      const passage = citedPassage(new Uint8Array(bytes), citation.path, citation.anchor);
      const hash = await digestHex(bytes);
      if (!stillCurrent()) return;
      const eligibility = jevClaimEligibility(claim, citation, passage, hash, file.lastModified !== listed.mtime);
      if (eligibility !== 'ready') { setNote(t(`jev.${eligibility}`)); return; }
      const claimText = claim.text.replace(INLINE_CITATION, '').trim();
      const evidence = passage.cited.map((unit) => unit.text).join('\n');
      const payload = buildJevPayload(claimText, evidence);
      const payloadState = jevPayloadEligibility(claimText, evidence, payload);
      if (payloadState !== 'ready') { setNote(t(`jev.${payloadState}`)); return; }
      if (!hash) { setNote(t('jev.obsolete')); return; }
      setSelection({ claim, citation, payload, page, sourceMtime: file.lastModified, sourceHash: hash, vaultScope });
    } catch { if (stillCurrent()) setNote(t('jev.missing')); }
    finally { if (id === requestId.current) setPreparing(false); }
  };

  const send = async () => {
    if (!selection || !vaultRoot || sending) return;
    const selected = selection;
    const id = ++requestId.current;
    setSending(true);
    setNote(null);
    try {
      const source = await sourceHandles.get(selected.citation.path)?.getFile();
      const currentHash = source ? await digestHex(await source.arrayBuffer()) : null;
      if (liveScope.current !== selected.vaultScope || pageFacts.get(selected.claim.pageSlug) !== selected.page || livePageFacts.current.get(selected.claim.pageSlug) !== selected.page || source?.lastModified !== selected.sourceMtime || currentHash !== selected.sourceHash) {
        setSelection(null);
        setNote(t('jev.obsolete'));
        return;
      }
      const judgment = await jevJudge(vaultRoot, selected.payload);
      if (requestId.current !== id || liveScope.current !== selected.vaultScope || livePageFacts.current.get(selected.claim.pageSlug) !== selected.page) return;
      const after = await sourceHandles.get(selected.citation.path)?.getFile();
      const afterHash = after ? await digestHex(await after.arrayBuffer()) : null;
      if (after?.lastModified !== selected.sourceMtime || afterHash !== selected.sourceHash) { setNote(t('jev.obsolete')); setSelection(null); return; }
      if (judgment) setFinding({
        judgment, pageSlug: selected.claim.pageSlug, claimText: selected.claim.text,
        citation: selected.citation, page: selected.page,
        sourceMtime: selected.sourceMtime, sourceHash: selected.sourceHash,
      });
      setSelection(null);
    } catch { setNote(t('jev.failed')); }
    finally { if (requestId.current === id) setSending(false); }
  };

  /** The advice, only while the claim, its page and its source are still the ones it judged. */
  const findingFor = (claim: DeskClaim, citation: DeskCitation) => finding
    && finding.pageSlug === claim.pageSlug && finding.claimText === claim.text
    && finding.citation.path === citation.path && finding.citation.anchor === citation.anchor
    && finding.page === pageFacts.get(claim.pageSlug)
    && finding.sourceMtime === sources.find((source) => source.path === citation.path)?.mtime
    && (!hashes.has(citation.path) || hashes.get(citation.path) === finding.sourceHash)
    ? finding.judgment : null;

  return { preparing, sending, selection, note, prepare, send, reset, findingFor, cancel: () => { if (!sending) setSelection(null); } };
}

export function DeskJevConsent({ jev }: { jev: ReturnType<typeof useDeskJev> }) {
  const t = useTranslations('library.questionDesk');
  const selection = jev.selection;
  return <Dialog open={selection !== null} onClose={jev.cancel} size="md" labelledBy="question-desk-jev-title" testId="question-desk-jev-consent" className="max-h-[calc(100vh-var(--chrome-inset)*2)] overflow-y-auto">
    {selection ? <div className="space-y-3">
      <h3 id="question-desk-jev-title" className="text-title font-[var(--font-weight-strong)] leading-title">{t('jev.consentTitle')}</h3>
      <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('jev.transfer', { host: JEV_DESTINATION })}</p>
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{selection.citation.path}#{selection.citation.anchor}</p>
      <pre data-testid="question-desk-jev-payload" className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-[var(--card-pad)] font-mono text-label leading-label">{selection.payload}</pre>
      <p className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('jev.keyNote')}</p>
      <div className="flex justify-end gap-2"><Button variant="ghost" disabled={jev.sending} onClick={jev.cancel}>{t('jev.cancel')}</Button><Button variant="primary" disabled={jev.sending} onClick={() => void jev.send()} data-testid="question-desk-jev-send">{jev.sending ? t('jev.sending') : t('jev.send')}</Button></div>
    </div> : null}
  </Dialog>;
}

export function DeskJevResult({ judgment, sentence, where }: { judgment: JevJudgment; sentence: string; where: string }) {
  const t = useTranslations('library.questionDesk');
  return <div role="status" className="relative z-10 mt-2 rounded-card border border-[color:var(--color-indigo-line-a20)] bg-[color:var(--color-indigo-a06)] p-[var(--card-pad)] text-label leading-label text-[color:var(--color-text-secondary)]" data-testid="question-desk-jev-result">
    <p>{t(`jev.choice.${judgment.choice}`)}</p>
    <p className="mt-1">{sentence}</p>
    <p className="mt-1">{where}</p>
    <p className="mt-1">{t('jev.advisory')}</p>
  </div>;
}
