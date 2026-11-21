'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { readLocalEndpoint } from '@/shared/lib/llm-connection/local-endpoint';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MODEL_DOWNLOAD_HOSTS, probeVectors, revealVectorModel, type VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { MOTION } from '@/shared/motion';
import { Button, Dialog } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { formatSize } from '../lib/format-size';
import { BUILTIN_MODEL_NAME, choiceIdOf, modelChoices, type ModelChoice } from '../model/model-choices';
import { prepare, removeModel } from '../model/vector-store';

type ProbeAnswer = { probe: VectorProbe } | { failed: true };
type Notice = { kind: 'deleted'; freed: number } | { kind: 'deleteFailed' } | { kind: 'revealFailed' } | null;

type Fact = { id: string; label: string; value: string };

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2.5">
      {facts.map((fact) => (
        <div key={fact.id} className="contents" data-testid={`meaning-setup-fact-${fact.id}`}>
          <dt className="text-label leading-body text-[color:var(--color-text-tertiary)]">{fact.label}</dt>
          <dd className="break-words text-body leading-body text-[color:var(--color-text-primary)]">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Placeholder() {
  const bar = 'h-3 rounded-chip bg-[color:var(--color-overlay-1)]';
  return (
    <div aria-hidden="true" className="flex flex-col gap-3 pt-1" data-testid="meaning-setup-placeholder">
      <div className={`${bar} w-2/5`} />
      {[0.6, 0.75, 0.5, 0.7].map((width) => (
        <div key={width} className="flex gap-4">
          <div className={`${bar} w-14 flex-none`} />
          <div className={bar} style={{ width: `${width * 100}%` }} />
        </div>
      ))}
    </div>
  );
}

function ChoiceRow({ choice, selected, onSelect }: { choice: ModelChoice; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
  const tag = choice.inUse
    ? t('tagInUse')
    : choice.kind === 'runner'
      ? t(choice.reachable ? 'tagRunner' : 'tagRunnerOff')
      : t(choice.holding === 'ready' ? 'tagReady' : choice.holding === 'partial' ? 'tagPartial' : 'tagNone');
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      data-testid={`meaning-model-choice-${choice.id}`}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-chip border px-3 py-2 text-left transition-colors duration-[var(--motion-fast)]',
        selected
          ? 'border-[color:var(--color-indigo-pale-a28)] bg-[color:var(--color-overlay-2)]'
          : 'border-transparent hover:bg-[color:var(--color-overlay-1)]',
      )}
    >
      <span className="w-full truncate text-body leading-body text-[color:var(--color-text-primary)]">{name}</span>
      <span className={cn('text-label leading-label', choice.inUse ? 'text-[color:var(--color-indigo-accent)]' : 'text-[color:var(--color-text-tertiary)]')}>
        {tag}
      </span>
    </button>
  );
}

/**
 * The folder's model for search by meaning: every model it can use on the left, the chosen one's
 * facts and presses on the right. Downloading, switching, deleting the built-in model and showing
 * its folder all happen here; the download states its size and hosts before its press.
 */
export function MeaningModelDialog({ open, rootPath, onClose }: { open: boolean; rootPath: string; onClose: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const titleId = useId();
  const reduced = usePrefersReducedMotion();
  const current = vaultVectorSource.use(rootPath)?.source ?? null;
  const [answer, setAnswer] = useState<ProbeAnswer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);

  const readProbe = useCallback(() => {
    let live = true;
    probeVectors(rootPath, readLocalEndpoint().baseUrl)
      .then((probe) => { if (live) setAnswer({ probe }); })
      .catch(() => { if (live) setAnswer({ failed: true }); });
    return () => { live = false; };
  }, [rootPath]);

  useEffect(() => (open ? readProbe() : undefined), [open, readProbe]);

  const probe = answer && 'probe' in answer ? answer.probe : null;
  const choices = probe ? modelChoices(probe, current) : [];
  const selected = choices.find((choice) => choice.id === (selectedId ?? choiceIdOf(current))) ?? choices[0] ?? null;
  const fade = reduced ? { duration: 0 } : MOTION.settle;
  const size = (bytes: number) => formatSize(bytes, locale);

  const select = (id: string) => {
    setSelectedId(id);
    setNotice(null);
  };

  const startBuiltin = () => {
    if (!probe) return;
    onClose();
    // The one press that may fetch the model: the facts above it state the size and the hosts.
    void prepare(rootPath, { kind: 'builtin' }, !probe.builtin.onDisk);
  };
  const startRunner = (choice: Extract<ModelChoice, { kind: 'runner' }>) => {
    onClose();
    void prepare(rootPath, { kind: 'runner', baseUrl: choice.baseUrl, model: choice.model });
  };
  const deleteBuiltin = async () => {
    if (!probe) return;
    const freed = probe.builtin.modelBytes;
    setDeleting(true);
    const removed = await removeModel();
    setDeleting(false);
    setNotice(removed ? { kind: 'deleted', freed } : { kind: 'deleteFailed' });
    readProbe();
  };
  const showFolder = () => {
    setNotice(null);
    revealVectorModel().catch(() => setNotice({ kind: 'revealFailed' }));
  };

  const switching = current !== null && selected !== null && !selected.inUse;
  const diskShort = probe !== null && probe.builtin.freeBytes < probe.builtin.neededFreeBytes;

  function builtinFacts(choice: Extract<ModelChoice, { kind: 'builtin' }>, builtin: VectorProbe['builtin']): Fact[] {
    const facts: Fact[] = [];
    if (choice.holding === 'ready') {
      facts.push({ id: 'kept', label: t('factKeptLabel'), value: t('factKept', { size: size(builtin.modelBytes) }) });
    } else {
      facts.push({
        id: 'download',
        label: t('factDownloadLabel'),
        value: t('factDownload', { download: size(builtin.downloadBytes), kept: size(builtin.keptBytes), hosts: MODEL_DOWNLOAD_HOSTS.join(', ') }),
      });
    }
    if (choice.holding !== 'none' && builtin.modelDir !== '') {
      facts.push({ id: 'where', label: t('factWhereLabel'), value: builtin.modelDir });
    }
    facts.push(
      { id: 'sent', label: t('factSentLabel'), value: t('factSent') },
      { id: 'memory', label: t('factMemoryLabel'), value: t(builtin.accelerated ? 'factMemory' : 'factMemoryCpu', { memory: size(builtin.memoryBytes) }) },
    );
    return facts;
  }

  function runnerFacts(choice: Extract<ModelChoice, { kind: 'runner' }>): Fact[] {
    return [
      { id: 'runner-where', label: t('factRunnerWhereLabel'), value: t('factRunnerWhere', { address: choice.baseUrl }) },
      { id: 'sent', label: t('factSentLabel'), value: t('factRunnerSent') },
      { id: 'runner-delete', label: t('factDeleteLabel'), value: t('factRunnerDelete', { model: choice.model }) },
    ];
  }

  function noticeText(current: Notice): string | null {
    if (current?.kind === 'deleted') return t('modelDeletedFreed', { size: size(current.freed) });
    if (current?.kind === 'deleteFailed') return t('modelDeleteFailed');
    if (current?.kind === 'revealFailed') return t('showFolderFailed');
    return null;
  }

  function renderDetail(choice: ModelChoice, probe: VectorProbe) {
    const builtin = probe.builtin;
    const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
    const maker = choice.kind === 'builtin' ? t('builtinMaker') : t('runnerMaker');
    const message = noticeText(notice);
    const primary = choice.inUse && !(choice.kind === 'builtin' && choice.holding !== 'ready')
      ? null
      : choice.kind === 'builtin'
        ? { label: choice.holding === 'ready' ? t('prepare', { files: probe.files }) : choice.holding === 'partial' ? t('resumeDownload') : t('downloadAndPrepare'), onPress: startBuiltin, disabled: diskShort }
        : { label: t('prepare', { files: probe.files }), onPress: () => startRunner(choice), disabled: !choice.reachable };
    return (
      <div className="flex min-h-full flex-col gap-4" data-testid="meaning-model-detail" data-choice={choice.id}>
        <div>
          <h3 className="text-body-lg font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{name}</h3>
          <p className="text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="meaning-model-maker">{maker}</p>
        </div>
        <FactList facts={choice.kind === 'builtin' ? builtinFacts(choice, builtin) : runnerFacts(choice)} />
        {choice.inUse ? <p className="text-body leading-body text-[color:var(--color-indigo-accent)]" data-testid="meaning-model-in-use">{t('inUseNote')}</p> : null}
        {switching ? <p className="text-body leading-body text-[color:var(--color-status-warning)]" data-testid="meaning-model-switch-note">{t('switchNote', { files: probe.files })}</p> : null}
        {choice.kind === 'runner' && !choice.reachable ? <p className="text-body leading-body text-[color:var(--color-status-warning)]">{t('runnerOff')}</p> : null}
        {choice.kind === 'builtin' && choice.holding !== 'ready' && diskShort ? (
          <p className="text-body leading-body text-[color:var(--color-danger-text)]" data-testid="meaning-setup-disk-short">
            {t('diskShort', { needed: size(builtin.neededFreeBytes), free: size(builtin.freeBytes) })}
          </p>
        ) : null}
        {message ? <p role="status" className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-model-notice">{message}</p> : null}
        <div className="mt-auto flex flex-col gap-3 pt-2">
          {choice.kind === 'builtin' && choice.holding !== 'none' ? (
            <div className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3">
              <p className="text-label leading-body text-[color:var(--color-text-tertiary)]">
                {choice.holding === 'partial'
                  ? t('deletePartialNote', { size: size(builtin.modelBytes) })
                  : choice.inUse
                    ? t('deleteNoteInUse', { size: size(builtin.modelBytes) })
                    : t('deleteNote', { size: size(builtin.modelBytes), download: size(builtin.downloadBytes) })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" disabled={deleting} onClick={() => void deleteBuiltin()} data-testid="meaning-model-delete">
                  {t(choice.holding === 'partial' ? 'deletePartial' : 'deleteModel')}
                </Button>
                {builtin.modelDir !== '' ? (
                  <button type="button" onClick={showFolder} data-testid="meaning-model-show-folder"
                    className={controlClass({ shape: 'link', size: 'md', tone: 'accent', className: 'whitespace-nowrap' })}>
                    {t('showFolder')}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          {primary ? (
            <div className="flex justify-end">
              <Button variant="primary" size="sm" disabled={primary.disabled} onClick={primary.onPress} data-testid="meaning-setup-primary">
                {primary.label}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      onExited={() => { setAnswer(null); setSelectedId(null); setNotice(null); }}
      size="lg"
      labelledBy={titleId}
      testId="meaning-setup-dialog"
    >
      <div className="flex flex-col gap-4 p-2">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('dialogTitle')}</h2>
            <p className="mt-1 max-w-[70ch] text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-setup-lead">
              {t('lead', { files: probe?.files ?? 0 })}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} data-testid="meaning-setup-cancel">{t('close')}</Button>
        </div>
        <div className="grid min-h-[22rem] gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <div role="group" aria-label={t('choicesLabel')} className="flex flex-col gap-1" data-testid="meaning-model-choices">
            {choices.map((choice) => (
              <ChoiceRow key={choice.id} choice={choice} selected={choice.id === selected?.id} onSelect={() => select(choice.id)} />
            ))}
          </div>
          <div className="min-w-0 rounded-card border border-[color:var(--color-divider)] p-4">
            <AnimatePresence initial={false} mode="wait">
              {answer === null ? (
                <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  <Placeholder />
                </motion.div>
              ) : probe && selected ? (
                <motion.div key={selected.id} className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} data-testid="meaning-setup-facts">
                  {renderDetail(selected, probe)}
                </motion.div>
              ) : (
                <motion.p key="unreadable" className="text-body leading-body text-[color:var(--color-danger-text)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
                  {t('unreadable')}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
