'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatSize } from '@/shared/lib/format-size';
import { MODEL_DOWNLOAD_HOSTS, type VectorProbe, type VectorSource } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { Button } from '@/shared/ui';
import { controlClass } from '@/shared/ui/control-class';
import { BUILTIN_MODEL_NAME, isDeletable, isDiskShort, isLive, isSwitching, primaryPress, type ModelChoice } from '../model/model-choices';
import { stop } from '../model/vector-store';

export type Notice = { kind: 'deleted'; freed: number } | { kind: 'deleteFailed' } | { kind: 'revealFailed' } | null;

type Fact = { id: string; label: string; value: string };

/** Ollama names shown as a copyable command; anything else is described without one. */
const SHELL_SAFE_MODEL_NAME = /^[A-Za-z0-9._:/-]+$/;

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

export function MeaningModelDetail({
  choice,
  probe,
  rootPath,
  current,
  working,
  recommended,
  guided,
  notice,
  deleting,
  onStartBuiltin,
  onStartRunner,
  onDelete,
  onShowFolder,
}: {
  choice: ModelChoice;
  probe: VectorProbe;
  rootPath: string;
  current: VectorSource | null;
  working: boolean;
  recommended: boolean;
  guided: boolean;
  notice: Notice;
  deleting: boolean;
  onStartBuiltin: () => void;
  onStartRunner: (choice: Extract<ModelChoice, { kind: 'runner' }>) => void;
  onDelete: () => void;
  onShowFolder: () => void;
}) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const size = (bytes: number) => formatSize(bytes, locale);
  const switching = isSwitching(choice, current, working);
  const diskShort = isDiskShort(probe);

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
    if (choice.holding === 'none') facts.push({ id: 'delete', label: t('factDeleteLabel'), value: t('factDeleteBuiltin') });
    return facts;
  }

  function runnerFacts(choice: Extract<ModelChoice, { kind: 'runner' }>): Fact[] {
    return [
      { id: 'runner-where', label: t('factRunnerWhereLabel'), value: t('factRunnerWhere', { address: choice.baseUrl }) },
      { id: 'sent', label: t('factSentLabel'), value: t('factRunnerSent') },
      {
        id: 'runner-delete',
        label: t('factDeleteLabel'),
        value: SHELL_SAFE_MODEL_NAME.test(choice.model) ? t('factRunnerDelete', { model: choice.model }) : t('factRunnerDeletePlain'),
      },
    ];
  }

  function noticeText(current: Notice): string | null {
    if (current?.kind === 'deleted') return t('modelDeletedFreed', { size: size(current.freed) });
    if (current?.kind === 'deleteFailed') return t('modelDeleteFailed');
    if (current?.kind === 'revealFailed') return t('showFolderFailed');
    return null;
  }

  const builtin = probe.builtin;
  const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
  const maker = choice.kind === 'builtin' ? t('builtinMaker') : t('runnerMaker');
  const message = noticeText(notice);
  const live = isLive(choice);
  const deletable = isDeletable(choice, current, working);
  const primary = primaryPress(choice, working, diskShort);
  const startPrimary = () => (choice.kind === 'builtin' ? onStartBuiltin() : onStartRunner(choice));
  return (
    <div className="flex flex-1 flex-col gap-4" data-testid="meaning-model-detail" data-choice={choice.id}>
      <div>
        <h3 className="text-body-lg font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{name}</h3>
        <p className="text-label leading-label text-[color:var(--color-text-tertiary)]" data-testid="meaning-model-maker">{maker}</p>
      </div>
      <FactList facts={choice.kind === 'builtin' ? builtinFacts(choice, builtin) : runnerFacts(choice)} />
      {working ? (
        <div className="flex flex-wrap items-center gap-3" data-testid="meaning-model-working">
          <p className="text-body leading-body text-[color:var(--color-text-secondary)]">{t(choice.inUse ? 'workingNoteHere' : 'workingNote')}</p>
          <Button variant="outline" size="sm" onClick={() => void stop(rootPath)} data-testid="meaning-model-stop">{t('stop')}</Button>
        </div>
      ) : live ? <p className="text-body leading-body text-[color:var(--color-indigo-accent)]" data-testid="meaning-model-in-use">{t('inUseNote')}</p> : null}
      {switching ? <p className="text-body leading-body text-[color:var(--color-status-warning)]" data-testid="meaning-model-switch-note">{t('switchNote', { files: probe.files })}</p> : null}
      {recommended && choice.kind === 'runner' ? <p className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-model-recommended">{t('recommendedRunner')}</p> : null}
      {choice.kind === 'runner' && !choice.reachable ? <p className="text-body leading-body text-[color:var(--color-status-warning)]">{t('runnerOff')}</p> : null}
      {choice.kind === 'builtin' && choice.holding !== 'ready' && diskShort ? (
        <p className="text-body leading-body text-[color:var(--color-danger-text)]" data-testid="meaning-setup-disk-short">
          {t('diskShort', { needed: size(builtin.neededFreeBytes), free: size(builtin.freeBytes) })}
        </p>
      ) : null}
      {message ? <p role="status" className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-model-notice">{message}</p> : null}
      <div className="mt-auto flex flex-col gap-3 pt-2">
        {choice.kind === 'builtin' && deletable ? (
          <div className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] pt-3">
            <p className="text-label leading-body text-[color:var(--color-text-tertiary)]">
              {choice.holding === 'partial'
                ? t('deletePartialNote', { size: size(builtin.modelBytes) })
                : choice.inUse
                  ? t('deleteNoteInUse', { size: size(builtin.modelBytes) })
                  : t('deleteNote', { size: size(builtin.modelBytes), download: size(builtin.downloadBytes) })}
              {choice.holding === 'ready' ? ` ${t(choice.inUse ? 'deleteEveryFolderToo' : 'deleteEveryFolder')}` : null}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" disabled={deleting} onClick={onDelete} data-testid="meaning-model-delete">
                {t(choice.holding === 'partial' ? 'deletePartial' : 'deleteModel')}
              </Button>
              {builtin.modelDir !== '' ? (
                <button type="button" onClick={onShowFolder} data-testid="meaning-model-show-folder"
                  className={controlClass({ shape: 'link', size: 'md', tone: 'accent', className: 'whitespace-nowrap' })}>
                  {t('showFolder')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {primary && guided ? <p className="text-label leading-body text-[color:var(--color-text-tertiary)]" data-testid="meaning-wizard-after-start">{t('wizard.afterStart')}</p> : null}
        {primary ? (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" disabled={primary.disabled} onClick={startPrimary} data-testid="meaning-setup-primary">
              {primary.label === 'prepare' ? t('prepare', { files: probe.files }) : t(primary.label)}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
