'use client';

import { useId, useRef, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { isTauriVaultRuntime } from '@/shared/lib/vault-folder/tauri-vault-fs';
import { vaultIndexPreference } from '@/shared/lib/vault-folder/tauri-vault-index';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';
import { MOTION } from '@/shared/motion';
import { controlClass } from '@/shared/ui/control-class';
import { formatSize } from '@/shared/lib/format-size';
import { usePacedValue } from '../lib/use-paced-value';
import { modelFailedSentence } from '../model/model-failed-sentence';
import { deskLine, type DeskLine, type DeskLineAction, type DeskProgress } from '../model/desk-line';
import { useSearchFailure, withSearchFailure } from '../model/search-failure';
import { resume, stop, useVectorStatus } from '../model/vector-store';
import { useVectorRunStage } from '../model/desk-stage-presence';
import { useFinishedInView } from '../model/use-finished-in-view';
import { BUILTIN_MODEL_NAME } from '../model/model-choices';
import { MeaningModelDialog } from './MeaningModelDialog';
import { MeaningGuideCard } from './MeaningGuideCard';
import { meaningGuideSeen } from '../model/guide-seen';
import { MeaningRunStage } from './MeaningRunStage';
import { finishedStage, runStage } from '../model/run-stage';
import { ProgressRing } from './ProgressRing';

const FILE_NAME_PACE_MS = 1000;
/** The end of a file name kept whole when its middle is cut: enough for a word and the extension. */
const KEPT_NAME_END = 12;
const PLACEHOLDER = '\u0000';

const noSubscribe = () => () => undefined;

const TONE_INK: Record<DeskLine['tone'], string> = {
  quiet: 'text-[color:var(--color-text-tertiary)]',
  warning: 'text-[color:var(--color-status-warning)]',
  danger: 'text-[color:var(--color-danger-text)]',
};

/**
 * The file's name alone, its middle giving way first so the ending and extension stay readable;
 * the full path is its description.
 */
function MiddleCutName({ path }: { path: string }) {
  const pathId = useId();
  const name = path.split('/').pop() || path;
  const cut = Math.max(0, name.length - KEPT_NAME_END);
  return <>
    <span className="flex min-w-0" title={path} aria-describedby={pathId} data-testid="meaning-desk-file">
      <span className="min-w-0 truncate">{name.slice(0, cut)}</span>
      <span className="flex-none whitespace-pre">{name.slice(cut)}</span>
    </span>
    <span id={pathId} hidden>{path}</span>
  </>;
}

function Separator() {
  return <span aria-hidden="true" className="flex-none text-[color:var(--color-text-quaternary)]">·</span>;
}

/**
 * The line under the Wiki desk's question field: how search runs now, the press that sets up search
 * by meaning, and the job's progress while it prepares. One row of label type in every state.
 */
export function MeaningDeskLine({
  rootPath,
  markdownFiles,
  onOpenSettings,
  roomForStage = true,
}: {
  rootPath: string | null;
  markdownFiles: number;
  /** Settings › Privacy · data; without it the sentence names the place and offers no press. */
  onOpenSettings?: () => void;
  /** False while results stand under the field: the job then stays one line, so they never move. */
  roomForStage?: boolean;
}) {
  const t = useTranslations('library.questionDesk.meaning');
  const locale = useLocale();
  const reduced = usePrefersReducedMotion();
  const isApp = useSyncExternalStore(noSubscribe, isTauriVaultRuntime, () => false);
  const indexOn = vaultIndexPreference.use() === 'on';
  const searchFailure = useSearchFailure(isApp ? rootPath : null);
  const status = withSearchFailure(useVectorStatus(isApp ? rootPath : null), searchFailure);
  const stage = useVectorRunStage(isApp ? rootPath : null);
  const source = vaultVectorSource.use(rootPath)?.source ?? null;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guided, setGuided] = useState(false);
  const guideSeen = meaningGuideSeen.use() === 'on';
  const line = deskLine({
    status, isApp, indexOn, markdownFiles,
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
  const staged = isApp && roomForStage ? runStage(status, source) : null;
  const running = staged && { ...staged, readingPath: shownPath };
  const finished = useFinishedInView(running, status);
  const frame = useRef<HTMLDivElement>(null);

  if (!line) return <div ref={stage} aria-hidden="true" className="h-6" data-testid="meaning-desk-line" data-state="pending" />;

  const fraction = ring && ring.total > 0 ? Math.min(1, ring.done / ring.total) : 0;
  const sentence = sentenceOf(line, ring, ring?.done ?? 0);
  const transition = reduced ? { duration: 0 } : MOTION.settle;
  const stageEntrance = reduced ? { duration: 0 } : MOTION.expressive;

  const act = (action: DeskLineAction, event: MouseEvent<HTMLButtonElement>) => {
    if (rootPath === null) return;
    // A download is consented to in the dialog, which states its size and the free room first.
    if (action === 'setup' || action === 'downloadAgain' || action === 'continueDownload') {
      // WebKit does not focus a pressed button, so Escape would have nowhere to return focus.
      event.currentTarget.focus({ preventScroll: true });
      setGuided(false);
      setDialogOpen(true);
    } else if (action === 'stop') void stop(rootPath);
    else if (action === 'resume') void resume(rootPath);
    else onOpenSettings?.();
  };
  const action = line.action === 'openSettings' && !onOpenSettings ? null : line.action;
  const modelName = source === null ? null : source.kind === 'builtin' ? BUILTIN_MODEL_NAME : source.model;
  const openModels = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    setGuided(false);
    setDialogOpen(true);
  };
  const setUpTogether = (event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    setGuided(true);
    setDialogOpen(true);
  };

  function sentenceOf(current: DeskLine, progress: DeskProgress | null, done: number): string {
    switch (current.message) {
      case 'modelDownloading': {
        const total = progress?.total ?? 0;
        return t('modelDownloading', {
          percent: total > 0 ? Math.floor((done / total) * 100) : 0,
          done: formatSize(done, locale),
          total: formatSize(total, locale),
        });
      }
      case 'modelDownloadPaused':
        return t('modelDownloadPaused', { done: formatSize(current.values.done ?? 0, locale), total: formatSize(current.values.total ?? 0, locale) });
      case 'preparing':
        return t('preparing', { done: Math.floor(done), total: progress?.total ?? 0 });
      case 'modelFailed':
        return modelFailedSentence(t, current.values.detail ?? null);
      case 'modelDownloadFailed':
      case 'writeFailed':
        return t(current.message, { detail: t('failureDetail', { code: (current.values.detail ?? '').replaceAll('-', '_') }) });
      default:
        return t(current.message, current.values);
    }
  }

  const [readingBefore, readingAfter] = t('readingNow', { file: PLACEHOLDER }).split(PLACEHOLDER);
  const web = line.message === 'web';
  // The file slot fills the row and sets the press at its end, where a separator would stand alone.
  const pushesPressRight = line.message === 'preparing' || (line.message === 'updating' && line.progress !== null);

  const rowClass = cn('flex min-w-0 items-center gap-2 text-label leading-label tabular-nums', web ? 'min-h-6' : 'h-6');
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
            <span className={web ? 'min-w-0' : 'min-w-0 truncate'} title={web ? undefined : sentence}>{sentence}</span>
            {line.minutesLeft !== null ? <><Separator /><span className="flex-none" data-testid="meaning-desk-minutes">{t('minutesLeft', { minutes: line.minutesLeft })}</span></> : null}
            {pushesPressRight ? (
              <span className="flex min-w-0 flex-1 items-center gap-x-1.5">
                {shownPath ? <>
                  <Separator />
                  <span className="flex min-w-0 items-center whitespace-pre">
                    <span className="flex-none">{readingBefore}</span>
                    <MiddleCutName path={shownPath} />
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
  const modelChip = modelName !== null && isApp && !web ? (
        <button
          type="button"
          onClick={openModels}
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
  // First use: the sample of search by meaning stands where its real stage will run.
  const showGuide = !shownStage && isApp && roomForStage && !guideSeen && line.message === 'words' && rootPath !== null;
  const dismiss = () => finished?.dismiss();
  const ask = () => {
    finished?.dismiss();
    frame.current?.closest('form')?.querySelector<HTMLInputElement>('input')?.focus();
  };

  return (
    <div
      ref={(element) => {
        frame.current = element;
        stage(element);
      }}
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
          <MeaningGuideCard playing={!dialogOpen} onStart={setUpTogether} onLater={() => meaningGuideSeen.write('on')} />
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
            <ProgressRing fraction={fraction} measure={ring.measure} track={ringTrack} label={t('ringLabel')} />
          </motion.span>
        ) : null}
      </AnimatePresence>
          {sentenceRow}
          {modelChip}
        </>
      )}
      {rootPath !== null && isApp ? (
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
