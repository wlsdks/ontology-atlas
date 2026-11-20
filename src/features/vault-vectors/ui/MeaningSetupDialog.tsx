'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { readLocalEndpoint } from '@/shared/lib/llm-connection/local-endpoint';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MODEL_DOWNLOAD_HOSTS, probeVectors, type VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { MOTION } from '@/shared/motion';
import { Button, Dialog } from '@/shared/ui';
import { formatSize } from '../lib/format-size';
import { prepare } from '../model/vector-store';

/**
 * Wide figures for the layer that holds the box's size before the probe answers: every fact, the
 * disk line and the runner action, so the answer never makes the box grow or shrink.
 */
const SIZING_PROBE: VectorProbe = {
  files: 88_888,
  builtin: {
    onDisk: false, modelBytes: 8.8e9, downloadBytes: 8.8e9, keptBytes: 8.8e9, neededFreeBytes: 8.8e9,
    freeBytes: 8.8e9, memoryBytes: 8.8e9, accelerated: true,
  },
  runner: { state: 'reachable', address: '', models: ['bge-m3:latest'] },
};

type ProbeAnswer = { probe: VectorProbe } | { failed: true };

/** Models the spec's model table never offers (`docs/specs/2026-11-19-search-by-meaning.md`, licence column). */
const NEVER_OFFERED = ['embeddinggemma', 'jina-embeddings-v3'];

const baseName = (model: string) => model.split(':')[0]!.split('/').pop()!.toLowerCase();

/** The runner's model the dialog offers: bge-m3 when Ollama has it, else the first one allowed. */
export function offeredRunnerModel(probe: VectorProbe): string | null {
  const runner = probe.runner;
  if (runner?.state !== 'reachable') return null;
  const allowed = runner.models.filter((model) => !NEVER_OFFERED.some((name) => baseName(model).startsWith(name)));
  return allowed.find((model) => baseName(model) === 'bge-m3') ?? allowed[0] ?? null;
}

function Facts({ probe, sizing = false }: { probe: VectorProbe; sizing?: boolean }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const size = (bytes: number) => formatSize(bytes, locale);
  const { builtin } = probe;
  const facts: Array<[string, string, string]> = [
    ['model', t('factModelLabel'), t('factModel')],
    ...(builtin.onDisk ? [] : [['download', t('factDownloadLabel'), t('factDownload', { download: size(builtin.downloadBytes), kept: size(builtin.keptBytes), hosts: MODEL_DOWNLOAD_HOSTS.join(', ') })] as [string, string, string]]),
    ['sent', t('factSentLabel'), t('factSent')],
    ['memory', t('factMemoryLabel'), t(builtin.accelerated ? 'factMemory' : 'factMemoryCpu', { memory: size(builtin.memoryBytes) })],
    ['delete', t('factDeleteLabel'), t('factDelete')],
  ];
  return (
    <>
      <p className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid={sizing ? undefined : 'meaning-setup-lead'}>
        {t('lead', { files: probe.files })}
      </p>
      <dl className="mt-4 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5">
        {facts.map(([id, label, fact]) => (
          <div key={id} className="contents" data-testid={sizing ? undefined : `meaning-setup-fact-${id}`}>
            <dt className="text-label leading-body text-[color:var(--color-text-tertiary)]">{label}</dt>
            <dd className="text-body leading-body text-[color:var(--color-text-primary)]">{fact}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function DiskShort({ probe, sizing = false }: { probe: VectorProbe; sizing?: boolean }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  return (
    <p className="text-body leading-body text-[color:var(--color-danger-text)]" data-testid={sizing ? undefined : 'meaning-setup-disk-short'}>
      {t('diskShort', { needed: formatSize(probe.builtin.neededFreeBytes, locale), free: formatSize(probe.builtin.freeBytes, locale) })}
    </p>
  );
}

function Placeholder() {
  const bar = 'h-3 rounded-chip bg-[color:var(--color-overlay-1)]';
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 pt-1" data-testid="meaning-setup-placeholder">
      <div className={`${bar} w-full`} />
      <div className={`${bar} w-4/5`} />
      <div className="mt-3 flex flex-col gap-3">
        {[0.5, 0.7, 0.6, 0.75, 0.55].map((width) => (
          <div key={width} className="flex gap-4">
            <div className={`${bar} w-14 flex-none`} />
            <div className={bar} style={{ width: `${width * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grid cells stacked in one place: the box takes the larger of the two, so it holds its size. */
function Stack({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`grid *:col-start-1 *:row-start-1 ${className ?? ''}`}>{children}</div>;
}

/**
 * The consent for search by meaning: what it does and reads, the model and where it comes from,
 * what stays and what is sent, the memory it takes and where to delete it. The primary press
 * stores the choice, starts the job and closes in the same frame; the job runs behind.
 */
export function MeaningSetupDialog({ open, rootPath, onClose }: { open: boolean; rootPath: string; onClose: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const titleId = useId();
  const runnerFactsId = useId();
  const reduced = usePrefersReducedMotion();
  const [answer, setAnswer] = useState<ProbeAnswer | null>(null);

  useEffect(() => {
    if (!open) return;
    let current = true;
    probeVectors(rootPath, readLocalEndpoint().baseUrl)
      .then((probe) => { if (current) setAnswer({ probe }); })
      .catch(() => { if (current) setAnswer({ failed: true }); });
    return () => {
      current = false;
    };
  }, [open, rootPath]);

  const probe = answer && 'probe' in answer ? answer.probe : null;
  const diskShort = probe !== null && probe.builtin.freeBytes < probe.builtin.neededFreeBytes;
  const runnerModel = probe ? offeredRunnerModel(probe) : null;
  const fade = reduced ? { duration: 0 } : MOTION.settle;

  const close = () => onClose();
  const startBuiltin = () => {
    close();
    // The one press that may fetch the model: it says the size and free room above it.
    void prepare(rootPath, { kind: 'builtin' }, !probe?.builtin.onDisk);
  };
  const startRunner = () => {
    if (!probe?.runner || runnerModel === null) return;
    const baseUrl = probe.runner.address;
    close();
    void prepare(rootPath, { kind: 'runner', baseUrl, model: runnerModel });
  };
  const primaryLabel = probe?.builtin.onDisk ? t('prepare', { files: probe.files }) : t('downloadAndPrepare');
  const widestPrimary = [t('prepare', { files: SIZING_PROBE.files }), t('downloadAndPrepare')].sort((a, b) => b.length - a.length)[0];

  return (
    <Dialog open={open} onClose={close} onExited={() => setAnswer(null)} size="md" labelledBy={titleId} testId="meaning-setup-dialog">
      <div className="p-2">
        <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">
          {t('dialogTitle')}
        </h2>
        <Stack className="mt-3">
          <div aria-hidden="true" className="invisible flex flex-col gap-4">
            <div><Facts probe={SIZING_PROBE} sizing /></div>
            <DiskShort probe={SIZING_PROBE} sizing />
          </div>
          <AnimatePresence initial={false}>
            {answer === null ? (
              <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                <Placeholder />
              </motion.div>
            ) : (
              <motion.div key="facts" className="flex flex-col gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade} data-testid="meaning-setup-facts">
                {probe ? <div><Facts probe={probe} /></div> : <p className="text-body leading-body text-[color:var(--color-danger-text)]">{t('unreadable')}</p>}
                {diskShort ? <DiskShort probe={probe} /> : null}
              </motion.div>
            )}
          </AnimatePresence>
        </Stack>
        <Stack className="mt-5">
          <div className="flex flex-wrap items-end justify-end gap-2 self-end">
            <Button variant="ghost" size="sm" onClick={close} data-testid="meaning-setup-cancel">{t('cancel')}</Button>
            {runnerModel !== null ? (
              <Button variant="outline" size="sm" onClick={startRunner} data-testid="meaning-setup-runner"
                aria-describedby={runnerFactsId}>
                {t('useRunner', { model: runnerModel })}
              </Button>
            ) : null}
            <Button variant="primary" size="sm" disabled={probe === null || diskShort} onClick={startBuiltin} data-testid="meaning-setup-primary">
              {primaryLabel}
            </Button>
          </div>
          <div aria-hidden="true" className="invisible flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" disabled tabIndex={-1}>{t('cancel')}</Button>
            <Button variant="outline" size="sm" disabled tabIndex={-1}>{t('useRunner', { model: 'bge-m3:latest' })}</Button>
            <Button variant="primary" size="sm" disabled tabIndex={-1}>{widestPrimary}</Button>
          </div>
        </Stack>
        {/* The runner choice states its own facts: where it runs, and that each question is logged. */}
        <Stack className="mt-2">
          <p aria-hidden="true" className="invisible text-right text-label leading-label">{t('runnerFacts', { model: 'bge-m3:latest' })}</p>
          {runnerModel !== null ? (
            <p id={runnerFactsId} className="text-right text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="meaning-setup-runner-facts">
              {t('runnerFacts', { model: runnerModel })}
            </p>
          ) : null}
        </Stack>
      </div>
    </Dialog>
  );
}
