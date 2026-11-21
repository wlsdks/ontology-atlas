'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { readLocalEndpoint } from '@/shared/lib/llm-connection/local-endpoint';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MODEL_DOWNLOAD_HOSTS, probeVectors, revealVectorModel, type VectorPhase, type VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { MOTION } from '@/shared/motion';
import { Button, Dialog } from '@/shared/ui';
import { Check } from 'lucide-react';
import { DialogBody } from '@/shared/ui/surfaces/dialog-sections';
import { controlClass } from '@/shared/ui/control-class';
import { formatSize } from '@/shared/lib/format-size';
import { BUILTIN_MODEL_NAME, choiceIdOf, modelChoices, recommendedChoiceId, type ModelChoice } from '../model/model-choices';
import { prepare, removeModel, stop, useVectorStatus } from '../model/vector-store';

type ProbeAnswer = { probe: VectorProbe } | { failed: true };
type Notice = { kind: 'deleted'; freed: number } | { kind: 'deleteFailed' } | { kind: 'revealFailed' } | null;

type Fact = { id: string; label: string; value: string };

/** Ollama names shown as a copyable command; anything else is described without one. */
const SHELL_SAFE_MODEL_NAME = /^[A-Za-z0-9._:/-]+$/;
const RUNNING_PHASES: readonly VectorPhase[] = ['waitingTurn', 'modelDownloading', 'modelConverting', 'preparing'];

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

/** The folder searches with this choice now: its model is here and answering. */
function isLive(choice: ModelChoice): boolean {
  return choice.inUse && (choice.kind === 'builtin' ? choice.holding === 'ready' : choice.reachable);
}

function ChoiceRow({ choice, selected, working, recommended, onSelect }: { choice: ModelChoice; selected: boolean; working: boolean; recommended: boolean; onSelect: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
  const live = isLive(choice);
  const tag = choice.inUse && working
    ? t('tagWorking')
    : live
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
      <span className={cn('text-label leading-label', live || (choice.inUse && working) ? 'text-[color:var(--color-indigo-accent)]' : 'text-[color:var(--color-text-tertiary)]')}>
        {recommended ? t('tagRecommended', { tag }) : tag}
      </span>
    </button>
  );
}

type WizardStep = 'intro' | 'choose' | 'run';
const WIZARD_STEPS: readonly WizardStep[] = ['intro', 'choose', 'run'];
const WIZARD_KEY = { intro: 'wizard.stepIntro', choose: 'wizard.stepChoose', run: 'wizard.stepRun' } as const;

/** Where the setup-together walk stands: what happens, then the model, then the run on the desk. */
function WizardSteps({ at }: { at: WizardStep }) {
  const t = useTranslations('library.questionDesk.meaning');
  const index = WIZARD_STEPS.indexOf(at);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label leading-label" data-testid="meaning-wizard-steps" data-wizard-step={at}>
      {WIZARD_STEPS.map((step, position) => {
        const state = position < index ? 'done' : position === index ? 'now' : 'next';
        return (
          <li key={step} data-step-state={state} aria-current={state === 'now' ? 'step' : undefined} className="flex items-center gap-2">
            {position > 0 ? <span aria-hidden className={cn('h-px w-5', state === 'next' ? 'bg-[color:var(--color-overlay-3)]' : 'bg-[color:var(--color-indigo-line-a40)]')} /> : null}
            <span aria-hidden className={cn(
              'grid size-4 place-items-center rounded-full tabular-nums',
              state === 'done' ? 'bg-[color:var(--color-indigo-a24)] text-[color:var(--color-indigo-pale-a92)]'
                : state === 'now' ? 'bg-[color:var(--color-indigo-accent)] text-[color:var(--color-text-on-accent)]'
                  : 'border border-[color:var(--color-overlay-3)] text-[color:var(--color-text-tertiary)]',
            )}>
              {state === 'done' ? <Check className="size-2.5" strokeWidth={3} /> : position + 1}
            </span>
            <span className={state === 'now' ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-tertiary)]'}>{t(WIZARD_KEY[step])}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The walk's first step: the three things preparation does, with this computer's and this folder's
 * own figures, before any model is chosen or anything is fetched.
 */
function WizardIntro({ probe, runners, onNext }: { probe: VectorProbe; runners: number; onNext: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const size = (bytes: number) => formatSize(bytes, locale);
  const builtin = probe.builtin;
  const short = !builtin.onDisk && builtin.freeBytes < builtin.neededFreeBytes;
  const rows = [
    {
      id: 'download',
      title: t('wizard.download'),
      body: builtin.onDisk
        ? t('wizard.downloadKept', { model: BUILTIN_MODEL_NAME })
        : t('wizard.downloadNeeded', { model: BUILTIN_MODEL_NAME, hosts: MODEL_DOWNLOAD_HOSTS.join(', '), size: size(builtin.downloadBytes) }),
      more: runners > 0 ? t('wizard.runnerToo', { count: runners }) : null,
    },
    { id: 'fit', title: t('wizard.fit'), body: t('wizard.fitBody'), more: null },
    { id: 'read', title: t('wizard.read'), body: t('wizard.readBody', { files: probe.files }), more: null },
  ];
  return (
    <div className="flex flex-col gap-5" data-testid="meaning-wizard-intro">
      <h3 className="text-body-lg font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t('wizard.introTitle')}</h3>
      <ol className="flex flex-col gap-4">
        {rows.map((row, index) => (
          <li key={row.id} className="flex gap-3" data-testid={`meaning-wizard-row-${row.id}`}>
            <span aria-hidden className="grid size-6 flex-none place-items-center rounded-full bg-[color:var(--color-indigo-a14)] text-label leading-label tabular-nums text-[color:var(--color-indigo-pale-a92)]">{index + 1}</span>
            <div className="min-w-0 pt-0.5">
              <p className="text-body leading-body text-[color:var(--color-text-primary)]">{row.title}</p>
              <p className="mt-0.5 max-w-[64ch] text-body leading-body text-[color:var(--color-text-secondary)]">{row.body}</p>
              {row.more ? <p className="mt-1 text-body leading-body text-[color:var(--color-indigo-accent)]">{row.more}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--color-divider)] pt-3">
        {builtin.onDisk ? <span /> : (
          <p className={cn('text-label leading-label tabular-nums', short ? 'text-[color:var(--color-danger-text)]' : 'text-[color:var(--color-text-tertiary)]')} data-testid="meaning-wizard-room">
            {t('wizard.room', { free: size(builtin.freeBytes), needed: size(builtin.neededFreeBytes) })}
          </p>
        )}
        <Button variant="primary" size="sm" onClick={onNext} data-testid="meaning-wizard-next">{t('wizard.next')}</Button>
      </div>
    </div>
  );
}

/**
 * The folder's model for search by meaning: every model it can use on the left, the chosen one's
 * facts and presses on the right. Downloading, switching, deleting the built-in model and showing
 * its folder all happen here; the download states its size and hosts before its press.
 */
export function MeaningModelDialog({ open, rootPath, guided = false, onStarted, onClose }: {
  open: boolean;
  rootPath: string;
  /** Opened to set up together: what happens first, then the model. */
  guided?: boolean;
  /** A press here started preparing. */
  onStarted?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const titleId = useId();
  const reduced = usePrefersReducedMotion();
  const current = vaultVectorSource.use(rootPath)?.source ?? null;
  const status = useVectorStatus(rootPath);
  // A pass that runs holds the folder: switching or downloading again waits for its end or a Stop.
  const working = status !== null && (status.busy || RUNNING_PHASES.includes(status.phase));
  const [answer, setAnswer] = useState<ProbeAnswer | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [deleting, setDeleting] = useState(false);
  const [introRead, setIntroRead] = useState(false);
  const wizardStep: WizardStep | null = guided ? (introRead ? 'choose' : 'intro') : null;

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
  const recommendedId = current === null && choices.length > 0 ? recommendedChoiceId(choices) : null;
  const selected = choices.find((choice) => choice.id === (selectedId ?? recommendedId ?? choiceIdOf(current))) ?? choices[0] ?? null;
  const fade = reduced ? { duration: 0 } : MOTION.settle;
  const size = (bytes: number) => formatSize(bytes, locale);

  const select = (id: string) => {
    setSelectedId(id);
    setNotice(null);
  };

  const startBuiltin = () => {
    if (!probe) return;
    onClose();
    onStarted?.();
    // The one press that may fetch the model: the facts above it state the size and the hosts.
    void prepare(rootPath, { kind: 'builtin' }, !probe.builtin.onDisk);
  };
  const startRunner = (choice: Extract<ModelChoice, { kind: 'runner' }>) => {
    onClose();
    onStarted?.();
    void prepare(rootPath, { kind: 'runner', baseUrl: choice.baseUrl, model: choice.model });
  };
  const deleteBuiltin = async () => {
    if (!probe) return;
    const freed = probe.builtin.modelBytes;
    setDeleting(true);
    const removed = await removeModel();
    setNotice(removed ? { kind: 'deleted', freed } : { kind: 'deleteFailed' });
    try {
      setAnswer({ probe: await probeVectors(rootPath, readLocalEndpoint().baseUrl) });
    } catch {
      setAnswer({ failed: true });
    }
    setDeleting(false);
  };
  const showFolder = () => {
    setNotice(null);
    revealVectorModel().catch(() => setNotice({ kind: 'revealFailed' }));
  };

  const switching = current !== null && selected !== null && !selected.inUse && !working;
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

  function renderDetail(choice: ModelChoice, probe: VectorProbe) {
    const builtin = probe.builtin;
    const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
    const maker = choice.kind === 'builtin' ? t('builtinMaker') : t('runnerMaker');
    const message = noticeText(notice);
    const live = isLive(choice);
    const holdsModel = choice.kind === 'builtin' && choice.holding !== 'none';
    const deletable = holdsModel && !(working && current?.kind === 'builtin');
    const primary = working || live
      ? null
      : choice.kind === 'builtin'
        ? { label: choice.holding === 'ready' ? t('prepare', { files: probe.files }) : choice.holding === 'partial' ? t('resumeDownload') : t('downloadAndPrepare'), onPress: startBuiltin, disabled: diskShort }
        : { label: t('prepare', { files: probe.files }), onPress: () => startRunner(choice), disabled: !choice.reachable };
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
        {choice.id === recommendedId && choice.kind === 'runner' ? <p className="text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-model-recommended">{t('recommendedRunner')}</p> : null}
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
          {primary && guided ? <p className="text-label leading-body text-[color:var(--color-text-tertiary)]" data-testid="meaning-wizard-after-start">{t('wizard.afterStart')}</p> : null}
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
      onExited={() => { setAnswer(null); setSelectedId(null); setNotice(null); setIntroRead(false); }}
      size="lg"
      labelledBy={titleId}
      testId="meaning-setup-dialog"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-2">
        <div className="flex shrink-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-title font-[var(--font-weight-strong)] leading-title text-[color:var(--color-text-primary)]">{t(guided ? 'setup' : 'dialogTitle')}</h2>
            {wizardStep ? <div className="mt-2"><WizardSteps at={wizardStep} /></div> : (
              <p className="mt-1 max-w-[70ch] text-body leading-body text-[color:var(--color-text-secondary)]" data-testid="meaning-setup-lead">
                {t('lead', { files: probe?.files ?? 0 })}
              </p>
            )}
          </div>
          <div className="flex flex-none items-center gap-1">
            {wizardStep === 'choose' ? <Button variant="ghost" size="sm" onClick={() => setIntroRead(false)} data-testid="meaning-wizard-back">{t('wizard.back')}</Button> : null}
            <Button variant="ghost" size="sm" onClick={onClose} data-testid="meaning-setup-cancel">{t('close')}</Button>
          </div>
        </div>
        <DialogBody>
        <AnimatePresence initial={false} mode="wait">
        {wizardStep === 'intro' ? (
          <motion.div key="intro" className="min-h-[22rem] rounded-card border border-[color:var(--color-divider)] p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
            {probe ? <WizardIntro probe={probe} runners={choices.filter((choice) => choice.kind === 'runner' && choice.reachable).length} onNext={() => setIntroRead(true)} />
              : answer === null ? <Placeholder /> : <p className="text-body leading-body text-[color:var(--color-danger-text)]">{t('unreadable')}</p>}
          </motion.div>
        ) : (
        <motion.div key="choose" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
        <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-start">
          <div role="group" aria-label={t('choicesLabel')} className="atlas-scroll-quiet flex flex-col gap-1 sm:max-h-[26rem] sm:overflow-y-auto" data-testid="meaning-model-choices">
            {choices.map((choice) => (
              <ChoiceRow key={choice.id} choice={choice} selected={choice.id === selected?.id} working={working} recommended={choice.id === recommendedId} onSelect={() => select(choice.id)} />
            ))}
          </div>
          <div className="flex min-h-[22rem] min-w-0 flex-col rounded-card border border-[color:var(--color-divider)] p-4">
            <AnimatePresence initial={false} mode="wait">
              {answer === null ? (
                <motion.div key="placeholder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  <Placeholder />
                </motion.div>
              ) : probe && selected ? (
                <motion.div key={selected.id} className="flex flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} data-testid="meaning-setup-facts">
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
        </motion.div>
        )}
        </AnimatePresence>
        </DialogBody>
      </div>
    </Dialog>
  );
}
