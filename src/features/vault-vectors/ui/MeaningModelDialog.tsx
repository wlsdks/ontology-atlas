'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { readLocalEndpoint } from '@/shared/lib/llm-connection/local-endpoint';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { probeVectors, revealVectorModel, type VectorPhase, type VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { MOTION } from '@/shared/motion';
import { Button, Dialog } from '@/shared/ui';
import { DialogBody } from '@/shared/ui/surfaces/dialog-sections';
import { BUILTIN_MODEL_NAME, choiceIdOf, choiceTag, isLive, modelChoices, recommendedChoiceId, type ModelChoice } from '../model/model-choices';
import { prepare, removeModel, useVectorStatus } from '../model/vector-store';
import { MeaningModelDetail, type Notice } from './MeaningModelDetail';
import { WizardIntro, WizardSteps, type WizardStep } from './MeaningSetupWizard';

type ProbeAnswer = { probe: VectorProbe } | { failed: true };
const RUNNING_PHASES: readonly VectorPhase[] = ['waitingTurn', 'modelDownloading', 'modelConverting', 'preparing'];

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

function ChoiceRow({ choice, selected, working, recommended, onSelect }: { choice: ModelChoice; selected: boolean; working: boolean; recommended: boolean; onSelect: () => void }) {
  const t = useTranslations('library.questionDesk.meaning');
  const name = choice.kind === 'builtin' ? BUILTIN_MODEL_NAME : choice.model;
  const live = isLive(choice);
  const tag = t(choiceTag(choice, working));
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
                  <MeaningModelDetail
                    choice={selected}
                    probe={probe}
                    rootPath={rootPath}
                    current={current}
                    working={working}
                    recommended={selected.id === recommendedId}
                    guided={guided}
                    notice={notice}
                    deleting={deleting}
                    onStartBuiltin={startBuiltin}
                    onStartRunner={startRunner}
                    onDelete={() => void deleteBuiltin()}
                    onShowFolder={showFolder}
                  />
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
