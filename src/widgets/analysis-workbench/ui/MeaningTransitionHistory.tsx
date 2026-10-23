'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { readMeaningTransitionHistory } from '@/entities/meaning-transition';
import type { MeaningTransitionCandidate } from '@/shared/lib/meaning-transition/meaning-transition';
import type { MeaningTransitionV2 } from '@/shared/lib/meaning-transition/meaning-transition-v2';
import { getTauriVaultRootPath } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { canArchiveMeaningTransitions, observeMeaningTransitionRoot, readTauriMeaningTransitionArtifact } from '@/shared/lib/meaning-transition/tauri-meaning-transition-archive';
import { Chip, Disclosure, RowButton } from '@/shared/ui';

type Transition = MeaningTransitionCandidate | MeaningTransitionV2;
type ArtifactState = { handle: FileSystemDirectoryHandle; record: MeaningTransitionV2; rows: Array<{ role: 'before' | 'preview' | 'decision'; text: string }> } | null;

async function textDigest(text: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${[...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * What the archive has to say. Everything but `records` and `error` is a quiet state: nothing to
 * pick, only a sentence about why.
 */
export type MeaningTransitionArchiveState = 'no-folder' | 'unavailable' | 'pending' | 'empty' | 'records' | 'error';

export function MeaningTransitionHistory({ handle, open, foldWhenQuiet = false, onStateChange }: {
  handle: FileSystemDirectoryHandle | null;
  open: boolean;
  /** Draws nothing while quiet; the caller shows its own empty state. */
  foldWhenQuiet?: boolean;
  onStateChange?: (state: MeaningTransitionArchiveState) => void;
}) {
  const t = useTranslations('analysisWorkbench.meaningTransitions');
  const workbench = useTranslations('analysisWorkbench');
  const locale = useLocale();
  const latestHandle = useRef(handle);
  useEffect(() => { latestHandle.current = handle; }, [handle]);
  const generation = useRef(0);
  const artifactGeneration = useRef(0);
  const [loaded, setLoaded] = useState<{ handle: FileSystemDirectoryHandle; records: Transition[]; problems: string[]; nextOffset: number | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [listFailure, setListFailure] = useState<{ handle: FileSystemDirectoryHandle; detail: string } | null>(null);
  const [artifactFailure, setArtifactFailure] = useState<{ handle: FileSystemDirectoryHandle; record: MeaningTransitionV2; detail: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactState>(null);
  const rootPath = handle ? getTauriVaultRootPath(handle) : null;
  const available = !!handle && !!rootPath && canArchiveMeaningTransitions();

  const refresh = useCallback(async (offset = 0) => {
    const captured = handle;
    if (!captured || !open || !available) return;
    const run = ++generation.current;
    const current = () => generation.current === run && latestHandle.current === captured;
    setPending(true); setListFailure(null);
    try {
      const page = await readMeaningTransitionHistory({ capturedHandle: captured, isCurrent: current, offset, limit: 20 });
      if (!current()) return;
      setLoaded((previous) => ({
        handle: captured,
        records: offset > 0 && previous?.handle === captured ? [...previous.records, ...page.records] : page.records,
        problems: [...(offset > 0 && previous?.handle === captured ? previous.problems : []), ...page.problems.map((problem) => `${problem.fileName}: ${problem.reason}`)],
        nextOffset: page.nextOffset,
      }));
    } catch (failure) { if (current()) setListFailure({ handle: captured, detail: failure instanceof Error ? failure.message : String(failure) }); }
    finally { if (current()) setPending(false); }
  }, [available, handle, open]);

  useEffect(() => {
    if (!open || !available) return;
    queueMicrotask(() => { void refresh(); });
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ vaultRoot?: string }>).detail;
      if (detail?.vaultRoot === rootPath) void refresh();
    };
    window.addEventListener('atlas-meaning-transitions-changed', update);
    return () => { generation.current += 1; window.removeEventListener('atlas-meaning-transitions-changed', update); };
  }, [available, open, refresh, rootPath]);

  const records = loaded?.handle === handle ? loaded.records : [];
  const selected = records.find((record) => record.eventId === selectedId) ?? records[0] ?? null;
  useEffect(() => {
    const artifactRun = ++artifactGeneration.current;
    if (!open || !handle || !rootPath || !selected || selected.schema !== 'atlas-meaning-transition/v2' || !available) return;
    const captured = handle; const capturedRecord = selected;
    const current = () => latestHandle.current === captured && artifactGeneration.current === artifactRun;
    void (async () => {
      try {
        const identity = await observeMeaningTransitionRoot(rootPath);
        if (!current()) return;
        const refs = [
          ['before', capturedRecord.proposal.artifacts.retainedBefore],
          ['preview', capturedRecord.proposal.artifacts.preview],
          ['decision', capturedRecord.proposal.artifacts.decision],
        ] as const;
        const rows = [] as NonNullable<ArtifactState>['rows'];
        for (const [role, ref] of refs) {
          const text = await readTauriMeaningTransitionArtifact(rootPath, identity, ref.contentDigest);
          if (!current()) return;
          if (await textDigest(text) !== ref.contentDigest) throw new Error(t('artifactMismatch'));
          if (!current()) return;
          rows.push({ role, text });
        }
        setArtifactFailure(null);
        setArtifacts({ handle: captured, record: capturedRecord, rows });
      } catch (failure) { if (current()) setArtifactFailure({ handle: captured, record: capturedRecord, detail: failure instanceof Error ? failure.message : String(failure) }); }
    })();
    return () => { artifactGeneration.current += 1; };
  }, [available, handle, open, rootPath, selected, t]);

  const listError = listFailure?.handle === handle ? listFailure.detail : null;
  const artifactError = artifactFailure?.handle === handle && artifactFailure.record === selected ? artifactFailure.detail : null;
  const selectRecord = (eventId: string) => {
    if (eventId === selected?.eventId) return;
    setArtifactFailure(null);
    setArtifacts(null);
    setSelectedId(eventId);
  };

  const archiveState: MeaningTransitionArchiveState = !handle ? 'no-folder' : !available ? 'unavailable' : listError || artifactError ? 'error'
    : records.length ? 'records' : !pending && loaded?.handle === handle ? 'empty' : 'pending';
  useEffect(() => { onStateChange?.(archiveState); }, [archiveState, onStateChange]);

  const selectedArtifacts = artifacts?.handle === handle && artifacts.record === selected ? artifacts.rows : [];
  const previousLoaded = selected?.schema === 'atlas-meaning-transition/v2' && selected.previous
    ? records.find((record) => record.eventId === selected.previous?.eventId) ?? null : null;
  const summary = useMemo(() => selected?.schema === 'atlas-meaning-transition/v2'
    ? { action: selected.meaningDecision.action, at: selected.meaningDecision.actionAt, task: selected.task.label }
    : selected ? { action: selected.decision.disposition, at: selected.createdAt, task: selected.task.label } : null, [selected]);

  if (foldWhenQuiet && archiveState !== 'records' && archiveState !== 'error') return null;
  return <section aria-labelledby="meaning-transition-history-title" className="space-y-3 rounded-card border border-[color:var(--color-border-soft)] p-[var(--card-pad)]">
    <div className="space-y-1">
      <h3 id="meaning-transition-history-title" className="text-body-lg font-[var(--font-weight-strong)]">{t('title')}</h3>
      <p className="text-label leading-label text-[color:var(--color-text-secondary)]">{t('boundary')}</p>
    </div>
    {!handle ? <p>{t('openFolder')}</p> : !available ? <p>{t('unavailable')}</p> : null}
    {pending ? <p role="status">{t('loading')}</p> : null}
    {[{ scope: 'list', detail: listError, summary: t('readFailed') }, { scope: 'artifact', detail: artifactError, summary: t('artifactReadFailed') }].map(({ scope, detail, summary }) => detail ? <div key={scope} className="space-y-2"><p role="alert" className="rounded-card border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-3 py-2 text-label leading-label text-[color:var(--color-danger-text)]">{summary}</p><Disclosure summary={workbench('errorDetails')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{detail}</pre></Disclosure></div> : null)}
    {available && !pending && loaded?.handle === handle && records.length === 0 && !listError ? <p>{t('empty')}</p> : null}
    {records.length ? <div className="space-y-2" aria-label={t('listLabel')}>{records.map((record) => <RowButton key={record.eventId} active={record === selected} aria-pressed={record === selected} className="w-full" onClick={() => selectRecord(record.eventId)}>
      <span className="min-w-0 flex-1 text-left"><span className="block truncate font-[var(--font-weight-emphasis)]">{record.task.label}</span><span className="block text-caption text-[color:var(--color-text-secondary)]">{new Date(record.createdAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })} · {record.schema === 'atlas-meaning-transition/v2' ? t(`phase.${record.phase}`) : t('legacy')}</span></span>
    </RowButton>)}</div> : null}
    {selected && summary ? <article className="space-y-3 border-t border-[color:var(--color-divider)] pt-3">
      <div className="space-y-1"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('selected')}</p><h4 className="whitespace-pre-wrap break-words text-body font-[var(--font-weight-strong)]">{summary.task}</h4><p className="text-caption text-[color:var(--color-text-secondary)]">{t('action')}: {t(`actions.${summary.action}`)} · {new Date(summary.at).toLocaleString(locale)}</p></div>
      {selected.schema === 'atlas-meaning-transition/v2' ? <>
        <p className="text-caption text-[color:var(--color-text-secondary)]">{t('integrityBoundary')}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-caption"><dt>{t('decisionId')}</dt><dd className="break-all font-mono">{selected.decisionId}</dd><dt>{t('outcome')}</dt><dd>{t(`outcomes.${selected.outcome}`)}</dd><dt>{t('reviewEvidence')}</dt><dd>{t(`authority.${selected.reviewEvidence.status}`)}</dd><dt>{t('correlation')}</dt><dd>{selected.acpCorrelation.status === 'observed' ? `${selected.acpCorrelation.evidence} · ${t(`permission.${selected.acpCorrelation.executionPermission}`)}` : t('unknown')}</dd><dt>{t('codeChecks')}</dt><dd>{t(`authority.${selected.receipts.codeChecks}`)}</dd><dt>{t('merge')}</dt><dd>{t(`authority.${selected.receipts.merge}`)}</dd><dt>{t('deployment')}</dt><dd>{t(`authority.${selected.receipts.deployment}`)}</dd></dl>
        {selected.previous ? <div className="flex flex-wrap items-center gap-2 text-caption"><span>{t('previous')}: <span className="font-mono">{selected.previous.eventId.slice(0, 8)}</span></span>{previousLoaded ? <Chip size="lg" onClick={() => selectRecord(previousLoaded.eventId)}>{t('openPrevious')}</Chip> : <span className="text-[color:var(--color-text-secondary)]">{t('previousNotLoaded')}</span>}</div> : null}
        <section className="space-y-1"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('rationale')}</p><p className="whitespace-pre-wrap break-words">{selected.meaningDecision.rationale ?? t('rationaleMissing')}</p></section>
        <section className="space-y-1"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('acceptedGaps')}</p>{selected.meaningDecision.acceptedGaps.length ? <ul className="list-disc space-y-1 pl-5">{selected.meaningDecision.acceptedGaps.map((gap) => <li key={gap} className="whitespace-pre-wrap break-words">{gap}</li>)}</ul> : <p>{t('none')}</p>}</section>
        <section className="space-y-1"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('remainingQuestions')}</p>{selected.remainingQuestions.length ? <ul className="list-disc space-y-1 pl-5">{selected.remainingQuestions.map((question) => <li key={question} className="whitespace-pre-wrap break-words">{question}</li>)}</ul> : <p>{t('none')}</p>}</section>
        <section className="space-y-2"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('rows')}</p>{selected.rowEvidence.map((row) => <p key={row.rowId} className="text-caption"><span className="font-mono">{row.rowId}</span> · {t(`execution.${row.execution}`)} · {t(`readback.${row.readback}`)}</p>)}</section>
        <Disclosure summary={t('git')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify(selected.git, null, 2)}</pre></Disclosure>
        <section className="space-y-2"><p className="text-caption font-[var(--font-weight-emphasis)] text-[color:var(--color-text-tertiary)]">{t('artifacts')}</p>{selectedArtifacts.length ? selectedArtifacts.map((artifact) => <Disclosure key={artifact.role} summary={t(`artifactRoles.${artifact.role}`)}><pre className="atlas-scroll-quiet mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-caption">{artifact.text}</pre></Disclosure>) : <p role="status" className="text-caption">{artifactError ? t('artifactsUnavailable') : t('loadingArtifacts')}</p>}</section>
      </> : <Disclosure summary={t('legacyDetails')}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{JSON.stringify(selected, null, 2)}</pre></Disclosure>}
    </article> : null}
    {loaded?.handle === handle && loaded.nextOffset !== null ? <Chip size="lg" onClick={() => void refresh(loaded.nextOffset!)}>{t('loadOlder')}</Chip> : null}
    {loaded?.handle === handle && loaded.problems.length ? <Disclosure summary={t('problems', { count: loaded.problems.length })}><pre className="mt-2 whitespace-pre-wrap break-words text-caption">{loaded.problems.join('\n')}</pre></Disclosure> : null}
  </section>;
}
