import { useState, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { vaultIndexPreference } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vectors/vault-vector-source';
import { MOTION } from '@/shared/motion';
import { controlClass } from '@/shared/ui/control-class';
import { usePacedValue } from '../lib/use-paced-value';
import { deskSentence } from '../model/sentence/desk-sentence';
import { deskLine, type DeskLine, type DeskLineAction, type DeskProgress } from '../model/desk-line';
import { useSearchFailure, withSearchFailure } from '../model/search-failure';
import { resume, stop, useVectorStatus } from '../model/vector-store';
import { useVectorRunStage } from '../model/stage/desk-stage-presence';
import { useFinishedInView } from '../model/stage/use-finished-in-view';
import { BUILTIN_MODEL_NAME } from '../model/model-choices';
import { MeaningModelDialog } from './MeaningModelDialog';
import { MeaningGuideCard } from './MeaningGuideCard';
import { meaningGuideSeen } from '../model/guide-seen';
import { MeaningRunStage } from './MeaningRunStage';
import { finishedStage, runStage } from '../model/stage/run-stage';
import { ProgressRing } from './ProgressRing';
import { MiddleCutName } from '@/shared/ui/middle-cut-name/middle-cut-name';

const FILE_NAME_PACE_MS = 1000;
const KEPT_NAME_END = 12;
const PLACEHOLDER = '\u0000';

type DeskPress = Exclude<DeskLineAction, 'openSettings'>;

const TONE_INK: Record<DeskLine['tone'], string> = {
  quiet: 'text-[color:var(--color-text-tertiary)]',
  warning: 'text-[color:var(--color-status-warning)]',
  danger: 'text-[color:var(--color-danger-text)]',
};

function Separator() {
  return <span aria-hidden="true" className="flex-none text-[color:var(--color-text-quaternary)]">·</span>;
}

export function MeaningDeskLine({
  rootPath,
  markdownFiles,
  roomForStage = true,
  onAsk,
}: {
  rootPath: string | null;
  markdownFiles: number;
  /** False while results stand under the field: the job then stays one line, so they never move. */
  roomForStage?: boolean;
  onAsk: () => void;
}) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();
  const indexOn = vaultIndexPreference.use() === 'on';
  const searchFailure = useSearchFailure(rootPath);
  const status = withSearchFailure(useVectorStatus(rootPath), searchFailure);
  const stage = useVectorRunStage(rootPath);
  const source = vaultVectorSource.use(rootPath)?.source ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guided, setGuided] = useState(false);
  const guideSeen = meaningGuideSeen.use() === 'on';
  const line = deskLine({
    status, indexOn, markdownFiles,
    runnerModel: source?.kind === 'runner' ? source.model : null,
  });

  const [heldRing, setHeldRing] = useState<DeskProgress | null>(null);
  const liveRing = line?.progress && line.progress !== 'hold' ? line.progress : null;
  if (liveRing && (heldRing?.measure !== liveRing.measure || heldRing.done !== liveRing.done || heldRing.total !== liveRing.total)) {
    setHeldRing(liveRing);
  }
  const ring = line?.progress === 'hold' ? heldRing : liveRing;
  const ringTrack = ring ? `${ring.measure}:${ring.total}` : 'none';
  const shownPath = usePacedValue(line?.readingPath ?? null, FILE_NAME_PACE_MS);
  const staged = roomForStage ? runStage(status, source) : null;
  const running = staged && { ...staged, readingPath: shownPath };
  const finished = useFinishedInView(running, status);

  if (!line) return <div ref={stage} aria-hidden="true" className="h-6" data-testid="meaning-desk-line" data-state="pending" />;

  const sentence = deskSentence(t, locale, line, ring);
  const transition = reduced ? { duration: 0 } : MOTION.settle;
  const stageEntrance = reduced ? { duration: 0 } : MOTION.expressive;

  const openDialog = (event: MouseEvent<HTMLButtonElement>, together: boolean) => {
    // WebKit does not focus a pressed button, so Escape would have nowhere to return focus.
    event.currentTarget.focus({ preventScroll: true });
    setGuided(together);
    setDialogOpen(true);
  };
  const act = (action: DeskPress, event: MouseEvent<HTMLButtonElement>) => {
    if (rootPath === null) return;
    if (action === 'stop') void stop(rootPath);
    else if (action === 'resume') void resume(rootPath);
    // A download is consented to in the dialog, which states its size and the free room first.
    else openDialog(event, false);
  };
  // The desk opens no Settings: the sentence names the place.
  const action = line.action === 'openSettings' ? null : line.action;
  const modelName = source === null ? null : source.kind === 'builtin' ? BUILTIN_MODEL_NAME : source.model;

  const [readingBefore, readingAfter] = t('readingNow', { file: PLACEHOLDER }).split(PLACEHOLDER);
  // The file slot fills the row and sets the press at its end, where a separator would stand alone.
  const pushesPressRight = line.message === 'preparing' || (line.message === 'updating' && line.progress !== null);

  const rowClass = 'flex h-6 min-w-0 items-center gap-2 text-label leading-label tabular-nums';
  const sentenceRow = (
      <div className="grid min-w-0 flex-1 *:col-start-1 *:row-start-1">
        <AnimatePresence initial={false}>
          <motion.div
            key={line.message}
            data-testid="meaning-desk-sentence"
            className={cn('flex w-full min-w-0 items-center gap-x-1.5', TONE_INK[line.tone])}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            <span className="min-w-0 truncate" title={sentence}>{sentence}</span>
            {line.minutesLeft !== null ? <><Separator /><span className="flex-none" data-testid="meaning-desk-minutes">{t('minutesLeft', { minutes: line.minutesLeft })}</span></> : null}
            {pushesPressRight ? (
              <span className="flex min-w-0 flex-1 items-center gap-x-1.5">
                {shownPath ? <>
                  <Separator />
                  <span className="flex min-w-0 items-center whitespace-pre">
                    <span className="flex-none">{readingBefore}</span>
                    <MiddleCutName path={shownPath} keepEnd={KEPT_NAME_END} testId="meaning-desk-file" />
                    <span className="flex-none">{readingAfter}</span>
                  </span>
                </> : null}
              </span>
            ) : null}
            {action ? <>
              {pushesPressRight ? null : <Separator />}
              <button
                type="button"
                data-testid={`meaning-desk-${action}`}
                onClick={(event) => act(action, event)}
                className={controlClass({ shape: 'link', size: 'md', tone: 'accent', className: 'flex-none whitespace-nowrap' })}
              >
                {t(action)}
              </button>
            </> : null}
          </motion.div>
        </AnimatePresence>
      </div>
  );
  const modelChip = modelName !== null ? (
        <button
          type="button"
          onClick={(event) => openDialog(event, false)}
          aria-label={t('modelButtonLabel', { model: modelName })}
          title={t('modelButtonLabel', { model: modelName })}
          data-testid="meaning-desk-model"
          className={controlClass({ shape: 'chip', size: 'xs', hoverSurface: 'lift', hoverInk: 'strong', className: 'flex-none whitespace-nowrap border-[color:var(--color-border-soft)] text-[color:var(--color-text-secondary)]' })}
        >
          <Cpu aria-hidden="true" className="size-3 flex-none" />
          {t('modelButton', { model: modelName })}
        </button>
      ) : null;
  const shownStage = running ?? (finished && roomForStage ? finishedStage(source) : null);
  const showGuide = !shownStage && roomForStage && !guideSeen && line.message === 'words' && rootPath !== null;
  const dismiss = () => finished?.dismiss();
  const ask = () => {
    finished?.dismiss();
    onAsk();
  };

  return (
    <div
      ref={stage}
      data-testid="meaning-desk-line"
      data-state={line.message}
      data-stage={running?.step ?? (finished ? 'done' : undefined)}
      className={shownStage || showGuide ? 'min-w-0' : rowClass}
    >
      {showGuide ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={stageEntrance}
        >
          <MeaningGuideCard playing={!dialogOpen} onStart={(event) => openDialog(event, true)} onLater={() => meaningGuideSeen.write('on')} />
        </motion.div>
      ) : shownStage ? (
        <motion.div
          initial={reduced ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={stageEntrance}
        >
          <MeaningRunStage
            stage={shownStage}
            done={running ? null : finished}
            download={status?.phase === 'modelDownloading' ? status.model : null}
            measure={ring?.measure ?? null}
            facts={<div data-testid="meaning-desk-facts" className={rowClass}>{sentenceRow}{modelChip}</div>}
            onAsk={ask}
            onDismiss={dismiss}
          />
        </motion.div>
      ) : (
        <>
      <AnimatePresence initial={false}>
        {ring && line.progress !== null ? (
          <motion.span key="ring" className="flex flex-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={transition}>
            <ProgressRing fraction={ring.fraction} measure={ring.measure} track={ringTrack} label={t('ringLabel')} />
          </motion.span>
        ) : null}
      </AnimatePresence>
          {sentenceRow}
          {modelChip}
        </>
      )}
      {rootPath !== null ? (
        <MeaningModelDialog
          open={dialogOpen}
          rootPath={rootPath}
          guided={guided}
          onStarted={() => meaningGuideSeen.write('on')}
          onClose={() => setDialogOpen(false)}
        />
      ) : null}
    </div>
  );
}
