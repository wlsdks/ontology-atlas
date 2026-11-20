'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { usePanelPresence } from '@/shared/lib/render-timing/use-presence';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Button } from '@/shared/ui/controls/button';

import { isRunActive, type WorkRun, type WorkRunPhase } from '../model/work-run';
import type { ScheduledRun } from '../model/scheduled-run';
import { isMeaningActive, type MeaningRun } from '../model/meaning-run';
import { turnPageDoor, type TurnRun } from '../model/turn-run';
import { workRuns, type SeatRun } from '../model/work-run-store';
import { useCheckDoor, useOpenScheduledRun, useTurnDoor } from './use-run-doors';
import {
  isSeatRunActive,
  seatRuns,
  useMeaningProgress,
  useWaitedLabel,
  useWorkRunElapsed,
  useWorkRunSnapshot,
} from '../model/use-work-run';
import { turnTint, useTurnRunCopy } from './use-turn-run-copy';
import { useWorkRunCopy, type WorkRunMarks } from './use-work-run-copy';
import { scheduledTint, useScheduledRunCopy, type SeatTint } from './use-scheduled-run-copy';
import { RollingCount } from './RollingCount';
import { MeaningRunMoru, WorkRunMoru } from './WorkRunMoru';
import { useMeaningRunCopy, type MeaningFigure } from './use-meaning-run-copy';
import { WorkRunsDialog } from './WorkRunsDialog';
import { useSeatStepAside } from './use-seat-step-aside';
import { WORK_CARD_ATTRIBUTE } from './use-clear-of-work-card';

/** `.app-update-card[data-state='closed']` and `.app-update-layer-out` fade over `--motion-base`. */
const FADE_OUT_MS = Math.round(MOTION.base.duration * 1_000);

/** Running and asking share one layer, so a permission ask changes words in place, not the card. */
function layerOf(entry: SeatRun): string {
  if (entry.kind === 'scheduled' || entry.kind === 'meaning') return `${entry.key}:${entry.run.phase}`;
  if (entry.kind === 'turn') {
    const { phase } = entry.run;
    return `${entry.key}:${phase === 'running' || phase === 'asking' ? 'live' : phase}`;
  }
  const { phase } = entry.run;
  return `${entry.key}:${phase === 'running' || phase === 'asking' ? 'live' : phase}`;
}

/**
 * The runs' card in the shell's notice seat, on every screen but the one whose stage already
 * shows them. It names the latest run and counts the rest; it never remounts across routes, its
 * box never changes between states, and it glides aside for docks (`useSeatStepAside`).
 */
export function WorkRunCard() {
  const snapshot = useWorkRunSnapshot();
  const seated = seatRuns(snapshot);
  const named = seated.at(-1) ?? null;
  const open = named !== null;
  const { mounted } = usePanelPresence(open, FADE_OUT_MS);
  const [drawn, setDrawn] = useState<SeatRun | null>(named);
  if (named && drawn !== named && (drawn?.key !== named.key || drawn.run !== named.run)) setDrawn(named);
  const [listOpen, setListOpen] = useState(false);
  if (listOpen && !open) setListOpen(false);
  const others = open ? seated.slice(0, -1) : [];
  return (
    <div aria-live="polite" data-testid="work-run-live">
      {mounted && drawn ? <CardBox entry={drawn} open={open} others={others} onOpenList={() => setListOpen(true)} /> : null}
      {/* Mounted only while there is a list to open, so a screen with no run carries none of it. */}
      {others.length > 0 || listOpen ? <WorkRunsDialog open={listOpen && open} runs={seated} onClose={() => setListOpen(false)} /> : null}
    </div>
  );
}

function useLeavingLayer(entry: SeatRun) {
  const [layers, setLayers] = useState<{ current: SeatRun; leaving: SeatRun | null }>({ current: entry, leaving: null });
  if (layers.current !== entry) {
    const handover = layerOf(layers.current) !== layerOf(entry);
    setLayers({ current: entry, leaving: handover ? layers.current : layers.leaving });
  }
  const leavingId = layers.leaving ? layerOf(layers.leaving) : null;
  useEffect(() => {
    if (!leavingId) return;
    const timer = window.setTimeout(() => setLayers((state) => ({ ...state, leaving: null })), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leavingId]);
  return layers;
}

function meaningTint(run: MeaningRun): SeatTint {
  if (run.phase === 'ready') return 'success';
  return run.phase === 'failed' ? 'amber' : 'running';
}

function tintOfCheck(phase: WorkRunPhase): SeatTint {
  if (phase === 'found' || phase === 'clean') return 'success';
  if (phase === 'failed' || phase === 'unreadable') return 'amber';
  return 'running';
}

function CardBox({ entry, open, others, onOpenList }: {
  entry: SeatRun;
  open: boolean;
  others: readonly SeatRun[];
  onOpenList: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const layers = useLeavingLayer(entry);
  const cardRef = useRef<HTMLDivElement>(null);
  const { probe, shiftPx } = useSeatStepAside(open, cardRef);
  const tint = entry.kind === 'check'
    ? tintOfCheck(entry.run.phase)
    : entry.kind === 'meaning'
      ? meaningTint(entry.run)
      : entry.kind === 'turn' ? turnTint(entry.run) : scheduledTint(entry.run);
  return (
    <div
      ref={cardRef}
      data-testid="work-run-card"
      {...{ [WORK_CARD_ATTRIBUTE]: '' }}
      data-run-kind={entry.kind}
      data-phase={entry.run.phase}
      data-state={open ? 'open' : 'closed'}
      // A floor wall: notifications stand above the card instead of over it.
      data-toast-wall={open ? 'bottom' : undefined}
      inert={!open}
      className={cn(
        'app-update-card pointer-events-auto fixed z-50 h-36 w-[min(25rem,calc(100vw-2rem))] overflow-clip max-sm:h-30',
        'right-4 bottom-[var(--app-work-card-bottom-offset,var(--app-toast-bottom-offset,calc(var(--app-toast-bottom-reserve,0px)_+_16px)))]',
        'rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] shadow-[var(--shadow-elevation-2)]',
      )}
      style={shiftPx > 0 ? { translate: `${-shiftPx}px 0` } : undefined}
    >
      <span ref={probe} aria-hidden className="pointer-events-none invisible absolute h-0 w-[var(--app-toast-right-offset,16px)]" />
      <MoruLight tint={tint} tintKey={entry.kind === 'scheduled' ? tint : entry.run.phase} />
      {layers.leaving && !reducedMotion ? (
        <EntryLayer key={`leaving-${layerOf(layers.leaving)}`} entry={layers.leaving} motion="out" others={[]} onOpenList={onOpenList} />
      ) : null}
      <EntryLayer key={layerOf(entry)} entry={entry} motion={layers.leaving ? 'in' : 'none'} others={others} onOpenList={onOpenList} />
    </div>
  );
}

const LIGHT_BY_TINT: Record<Exclude<SeatTint, 'running'>, string> = {
  success: 'bg-[radial-gradient(closest-side,var(--color-success-a35),var(--color-success-a12)_45%,transparent)]',
  amber: 'bg-[radial-gradient(closest-side,var(--color-amber-source-a34),var(--color-amber-source-a12)_45%,transparent)]',
};
const LIGHT_WHILE_RUNNING = 'bg-[radial-gradient(closest-side,var(--color-indigo-accent-a32),var(--color-indigo-accent-a12)_45%,transparent)]';

/** The light under Moru says how it ended before a word is read; the ladders' nearest steps. */
function MoruLight({ tint, tintKey }: { tint: SeatTint; tintKey: string }) {
  const tinted = tint === 'running' ? undefined : LIGHT_BY_TINT[tint];
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-32 max-sm:size-16">
      <span
        className={cn(
          'absolute top-[72%] left-1/2 h-[130%] w-[150%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-[var(--motion-slow)] ease-[var(--motion-ease)]',
          LIGHT_WHILE_RUNNING,
          tinted && 'opacity-0',
        )}
      />
      <span
        data-testid="work-run-light"
        data-tint={tinted ? tintKey : undefined}
        className={cn(
          'absolute top-[72%] left-1/2 h-[130%] w-[150%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-[var(--motion-slow)] ease-[var(--motion-ease)]',
          tinted ?? LIGHT_WHILE_RUNNING,
          tinted ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span className="absolute top-[81%] left-1/2 h-[9%] w-[58%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-shadow-a42),transparent)]" />
    </span>
  );
}

/** The count leads; the page being read is the line's one bright word. */
const CARD_MARKS: WorkRunMarks = {
  page: (name) => <span className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{name}</span>,
  count: (value) => (
    <RollingCount
      value={value}
      className="mr-0.5 text-display leading-display-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
    />
  ),
};

/** The document being checked is the card's largest line; the count rolls inside the figures. */
const SCHEDULED_MARKS: WorkRunMarks = {
  page: (name) => name,
  count: (value) => (
    <RollingCount value={value} className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]" />
  ),
};

interface LayerProps {
  entry: SeatRun;
  motion: 'in' | 'out' | 'none';
  others: readonly SeatRun[];
  onOpenList: () => void;
}

function EntryLayer(props: LayerProps) {
  const { entry } = props;
  if (entry.kind === 'meaning') return <MeaningLayer {...props} run={entry.run} />;
  if (entry.kind === 'turn') return <TurnLayer {...props} run={entry.run} />;
  return entry.kind === 'check'
    ? <PhaseLayer {...props} run={entry.run} />
    : <ScheduledLayer {...props} run={entry.run} />;
}

function LayerFrame({ motion, children }: { motion: LayerProps['motion']; children: ReactNode }) {
  const leaving = motion === 'out';
  return (
    <div
      data-work-run-layer={leaving ? 'leaving' : 'current'}
      inert={leaving}
      className={cn(
        'absolute inset-0 flex p-3',
        motion === 'in' && 'app-update-layer-in',
        motion === 'out' && 'app-update-layer-out [&_*]:[animation-play-state:paused]',
      )}
    >
      {children}
    </div>
  );
}

/** "1 more running" names what else the card speaks for, and opens the list of runs. */
function MoreRuns({ others, onOpenList, testId }: { others: readonly SeatRun[]; onOpenList: () => void; testId: (id: string) => string | undefined }) {
  const tCard = useTranslations('workCard');
  if (others.length === 0) return null;
  const allRunning = others.every(isSeatRunActive);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={onOpenList}
      aria-haspopup="dialog"
      data-testid={testId('work-run-more')}
      className="ml-auto touch-hit-expand whitespace-nowrap text-[color:var(--color-text-secondary)]"
    >
      {tCard(allRunning ? 'moreRunning' : 'moreRuns', { count: others.length })}
    </Button>
  );
}

function PhaseLayer({ run, motion, others, onOpenList }: LayerProps & { run: WorkRun }) {
  const t = useTranslations('library.check');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const active = isRunActive(run);
  const elapsed = useWorkRunElapsed(leaving ? null : run);
  const copy = useWorkRunCopy(run, elapsed, CARD_MARKS, 'card');
  const openDoor = useCheckDoor();
  const testId = (id: string) => (leaving ? undefined : id);

  const primary = run.phase === 'asking'
    ? { label: t('review'), onClick: () => openDoor('conversation'), id: 'work-run-review' }
    : run.phase === 'found'
      ? { label: t('openResults'), onClick: () => openDoor('results'), id: 'work-run-open-results' }
      : run.phase === 'unreadable' || run.phase === 'failed'
        ? { label: t('openConversation'), onClick: () => openDoor('conversation'), id: 'work-run-open-conversation' }
        : null;

  return (
    <LayerFrame motion={motion}>
      <WorkRunMoru run={run} />
      {/* Title pinned to the top and buttons to the bottom, so no state moves either row. */}
      <div className="ml-[8.25rem] grid h-full min-w-0 flex-1 content-between max-sm:ml-[4.5rem]">
        {copy.figures ? (
          <p
            data-testid={testId('work-run-title')}
            className="truncate text-label leading-label text-[color:var(--color-text-tertiary)]"
          >
            {copy.title}
          </p>
        ) : (
          <p
            data-testid={testId('work-run-title')}
            className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
          >
            {copy.title}
          </p>
        )}
        {copy.figures ? (
          <div aria-live="off" className="grid min-w-0">
            <p data-testid={testId('work-run-figures')} className="truncate text-label leading-display tabular-nums text-[color:var(--color-text-tertiary)]">
              {copy.figures}
            </p>
            <p
              data-testid={testId('work-run-line')}
              className={cn(
                'text-[color:var(--color-text-secondary)]',
                run.phase === 'asking' ? 'line-clamp-2 text-label leading-label' : 'truncate text-body leading-body',
              )}
            >
              {copy.detail}
            </p>
          </div>
        ) : (
          <p
            data-testid={testId('work-run-detail')}
            className="line-clamp-2 text-label leading-label text-[color:var(--color-text-secondary)]"
          >
            {copy.detail}
          </p>
        )}
        <div className="flex h-8 min-w-0 items-center gap-2">
          {run.phase === 'running' ? (
            <Button size="sm" variant="outline" onClick={() => workRuns.stop()} data-testid={testId('work-run-stop')}>
              {tCard('stop')}
            </Button>
          ) : null}
          {primary ? (
            <Button size="sm" onClick={primary.onClick} data-testid={testId(primary.id)}>
              {primary.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (active ? workRuns.hideActive() : workRuns.close())}
            data-testid={testId(active ? 'work-run-hide' : 'work-run-close')}
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {active ? tCard('hide') : tCard('close')}
          </Button>
          <MoreRuns others={others} onOpenList={onOpenList} testId={testId} />
        </div>
      </div>
      {run.phase === 'running' ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none">
          <WorkProgress phase="running" done={run.readCount} total={null} label={tCard('progressLabel', { title: copy.title })} />
        </div>
      ) : null}
    </LayerFrame>
  );
}

function ScheduledLayer({ run, motion, others, onOpenList }: LayerProps & { run: ScheduledRun }) {
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const running = run.phase === 'running';
  const elapsed = useWorkRunElapsed(leaving ? null : run);
  const copy = useScheduledRunCopy(run, elapsed, SCHEDULED_MARKS);
  const openRun = useOpenScheduledRun();
  const key = `scheduled:${run.id}`;
  const testId = (id: string) => (leaving ? undefined : id);

  return (
    <LayerFrame motion={motion}>
      <WorkRunMoru run={copy.moru} />
      {/* Title pinned to the top and buttons to the bottom, so no state moves either row. */}
      <div className="ml-[8.25rem] grid h-full min-w-0 flex-1 content-between max-sm:ml-[4.5rem]">
        {running ? (
          <p data-testid={testId('work-run-title')} className="truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
            {copy.title}
          </p>
        ) : (
          <p
            data-testid={testId('work-run-title')}
            className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
          >
            {copy.title}
          </p>
        )}
        {running ? (
          <div aria-live="off" className="grid min-w-0">
            <p
              data-testid={testId('work-run-line')}
              title={run.document ?? undefined}
              className={cn(
                'truncate text-title leading-title',
                run.document
                  ? 'font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-secondary)]',
              )}
            >
              {copy.line}
            </p>
            <p data-testid={testId('work-run-figures')} className="truncate text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]">
              {copy.figures}
            </p>
          </div>
        ) : (
          <p data-testid={testId('work-run-detail')} className="line-clamp-2 text-label leading-label text-[color:var(--color-text-secondary)]">
            {copy.line}
          </p>
        )}
        <div className="flex h-8 min-w-0 items-center gap-2">
          {running ? (
            <Button size="sm" variant="outline" onClick={() => workRuns.stopRun(key)} data-testid={testId('work-run-stop')}>
              {tCard('stop')}
            </Button>
          ) : (
            <Button size="sm" onClick={() => openRun(run)} data-testid={testId('work-run-open-run')}>
              {tCard('scheduled.openRun')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (running ? workRuns.hideActive() : workRuns.closeRun(key))}
            data-testid={testId(running ? 'work-run-hide' : 'work-run-close')}
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {running ? tCard('hide') : tCard('close')}
          </Button>
          <MoreRuns others={others} onOpenList={onOpenList} testId={testId} />
        </div>
      </div>
      {running ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none">
          <WorkProgress phase="running" done={run.checkedCount} total={null} label={tCard('progressLabel', { title: copy.title })} />
        </div>
      ) : null}
    </LayerFrame>
  );
}

/** The meaning run's lead figure rolls like the check's count. */
const MEANING_FIGURE: MeaningFigure = (value, format) => (
  <RollingCount
    value={value}
    format={format}
    className="mr-0.5 text-display leading-display-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
  />
);

/** The figures a leaving layer drew last, so it fades out as it was rather than with the next phase's. */
function useLayerProgress(leaving: boolean) {
  const live = useMeaningProgress();
  const [held] = useState(live);
  return leaving ? held : live;
}

function MeaningLayer({ entry, run, motion, others, onOpenList }: LayerProps & { run: MeaningRun }) {
  const t = useTranslations('workCard.meaning');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const progress = useLayerProgress(leaving);
  const copy = useMeaningRunCopy(run, progress?.runId === run.id ? progress : null, MEANING_FIGURE);
  const active = isMeaningActive(run);
  const testId = (id: string) => (leaving ? undefined : id);
  const primary = run.phase === 'ready'
    ? { label: t('ask'), kind: 'ask' as const, id: 'work-run-ask' }
    : run.phase === 'failed'
      ? { label: t('openLibrary'), kind: 'library' as const, id: 'work-run-open-library' }
      : null;

  return (
    <LayerFrame motion={motion}>
      <MeaningRunMoru phase={run.phase} />
      {/* Title pinned to the top and buttons to the bottom, so no state moves either row. */}
      <div className="ml-[8.25rem] grid h-full min-w-0 flex-1 content-between max-sm:ml-[4.5rem]">
        <p
          data-testid={testId('work-run-title')}
          className={copy.lead !== null
            ? 'truncate text-label leading-label text-[color:var(--color-text-tertiary)]'
            : 'truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]'}
        >
          {copy.title}
          {copy.remaining ? (
            <>
              <span aria-hidden className="px-1.5 text-[color:var(--color-text-quaternary)]">·</span>
              <span data-testid={testId('work-run-minutes')}>{copy.remaining}</span>
            </>
          ) : null}
        </p>
        {copy.lead !== null ? (
          <div aria-live="off" className="grid min-w-0">
            <p data-testid={testId('work-run-figures')} className="truncate text-label leading-display tabular-nums text-[color:var(--color-text-tertiary)]">
              {copy.lead}
            </p>
            <div data-testid={testId('work-run-line')} className="flex min-w-0 truncate text-body leading-body text-[color:var(--color-text-secondary)]">
              {copy.line}
            </div>
          </div>
        ) : (
          <p data-testid={testId('work-run-detail')} className="line-clamp-2 text-label leading-label text-[color:var(--color-text-secondary)]">
            {copy.line}
          </p>
        )}
        <div className="flex h-8 min-w-0 items-center gap-2">
          {active ? (
            <Button size="sm" variant="outline" onClick={() => workRuns.stopRun(entry.key)} data-testid={testId('work-run-stop')}>
              {tCard('stop')}
            </Button>
          ) : null}
          {primary ? (
            <Button size="sm" onClick={() => workRuns.openMeaningDoor(entry.key, primary.kind)} data-testid={testId(primary.id)}>
              {primary.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (active ? workRuns.hideActive() : workRuns.closeRun(entry.key))}
            data-testid={testId(active ? 'work-run-hide' : 'work-run-close')}
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {active ? tCard('hide') : tCard('close')}
          </Button>
          <MoreRuns others={others} onOpenList={onOpenList} testId={testId} />
        </div>
      </div>
      {copy.bar ? (
        // Figures arrive four times a second, so each step eases into the next without a rest.
        <div className="absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none [&_[data-work-fill]]:duration-[var(--motion-slow)]">
          <WorkProgress phase="running" done={copy.bar.done} total={copy.bar.total} label={tCard('progressLabel', { title: copy.title })} />
        </div>
      ) : null}
    </LayerFrame>
  );
}

/** A Library turn that may write: its door's name, files written and the line, or what it waits on. */
function TurnLayer({ run, motion, others, onOpenList }: LayerProps & { run: TurnRun }) {
  const tCheck = useTranslations('library.check');
  const tTurn = useTranslations('workCard.turn');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const live = run.phase === 'running' || run.phase === 'asking';
  const active = live || run.phase === 'stopping';
  const elapsed = useWorkRunElapsed(leaving ? null : run);
  const waited = useWaitedLabel(leaving ? null : run.ask?.since ?? null);
  const copy = useTurnRunCopy(run, elapsed, waited, CARD_MARKS);
  const openDoor = useTurnDoor();
  const testId = (id: string) => (leaving ? undefined : id);
  const page = turnPageDoor(run);
  const primary = run.phase === 'asking'
    ? { label: tCheck('review'), onClick: () => openDoor({ turnId: run.id, kind: 'conversation' }), id: 'work-run-review' }
    : page
      ? { label: tTurn('openPage'), onClick: () => openDoor({ turnId: run.id, kind: 'page', page }), id: 'work-run-open-page' }
      : !active && run.phase !== 'switched'
        ? { label: tCheck('openConversation'), onClick: () => openDoor({ turnId: run.id, kind: 'conversation' }), id: 'work-run-open-conversation' }
        : null;

  return (
    <LayerFrame motion={motion}>
      <WorkRunMoru run={copy.moru} />
      {/* Title pinned to the top and buttons to the bottom, so no state moves either row. */}
      <div className="ml-[8.25rem] grid h-full min-w-0 flex-1 content-between max-sm:ml-[4.5rem]">
        {live ? (
          <p data-testid={testId('work-run-title')} className="truncate text-label leading-label text-[color:var(--color-text-tertiary)]">
            {copy.title}
          </p>
        ) : (
          <p
            data-testid={testId('work-run-title')}
            className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
          >
            {copy.title}
          </p>
        )}
        {live ? (
          <div aria-live="off" className="grid min-w-0">
            <p data-testid={testId('work-run-figures')} className="truncate text-label leading-display tabular-nums text-[color:var(--color-text-tertiary)]">
              {copy.figures}
            </p>
            <p
              data-testid={testId('work-run-line')}
              className={cn(
                'text-[color:var(--color-text-secondary)]',
                run.phase === 'asking' ? 'line-clamp-2 text-label leading-label' : 'truncate text-body leading-body',
              )}
            >
              {copy.detail}
            </p>
          </div>
        ) : (
          <p data-testid={testId('work-run-detail')} className="line-clamp-2 text-label leading-label text-[color:var(--color-text-secondary)]">
            {copy.detail}
          </p>
        )}
        <div className="flex h-8 min-w-0 items-center gap-2">
          {run.phase === 'running' ? (
            <Button size="sm" variant="outline" onClick={() => workRuns.stopRun(`turn:${run.id}`)} data-testid={testId('work-run-stop')}>
              {tCard('stop')}
            </Button>
          ) : null}
          {primary ? (
            <Button size="sm" onClick={primary.onClick} data-testid={testId(primary.id)}>
              {primary.label}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (active ? workRuns.hideActive() : workRuns.closeRun(`turn:${run.id}`))}
            data-testid={testId(active ? 'work-run-hide' : 'work-run-close')}
            className="touch-hit-expand text-[color:var(--color-text-secondary)]"
          >
            {active ? tCard('hide') : tCard('close')}
          </Button>
          <MoreRuns others={others} onOpenList={onOpenList} testId={testId} />
        </div>
      </div>
      {live ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none',
            run.phase === 'asking' && '[&_[data-work-sweep]]:[animation-play-state:paused]',
          )}
        >
          <WorkProgress phase="running" done={run.written.length} total={null} label={tCard('progressLabel', { title: copy.title })} />
        </div>
      ) : null}
    </LayerFrame>
  );
}
