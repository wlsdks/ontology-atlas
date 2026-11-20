'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/navigation';
import { DESTINATION_HREF } from '@/shared/config/destinations';
import { cn } from '@/shared/lib/cn';
import { navigateWithViewTransition } from '@/shared/lib/navigation/route-view-transition';
import { usePanelPresence } from '@/shared/lib/render-timing/use-presence';
import { usePrefersReducedMotion } from '@/shared/lib/render-timing/use-prefers-reduced-motion';
import { MOTION } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/work-progress';
import { Button } from '@/shared/ui/controls/button';

import { isCountedActive, type CountedRun } from '../model/counted-run';
import { isRunActive, type WorkRun, type WorkRunPhase } from '../model/work-run';
import { workRuns, type WorkRunDoor } from '../model/work-run-store';
import {
  activeRuns,
  seatRun,
  useCountedProgress,
  useWorkRunElapsed,
  useWorkRunSnapshot,
  type SeatRun,
} from '../model/use-work-run';
import { useCountedCopy, type CountedFigure } from './use-counted-copy';
import { useWorkRunCopy, type WorkRunMarks } from './use-work-run-copy';
import { RollingCount } from './RollingCount';
import { CountedRunMoru, WorkRunMoru } from './WorkRunMoru';
import { RunsDialog } from './RunsDialog';
import { useSeatStepAside } from './use-seat-step-aside';
import { WORK_CARD_ATTRIBUTE } from './use-clear-of-work-card';

/** `.app-update-card[data-state='closed']` and `.app-update-layer-out` fade over `--motion-base`. */
const FADE_OUT_MS = Math.round(MOTION.base.duration * 1_000);

/** Running and asking share one layer, so a permission ask changes words in place, not the card. */
function layerOf(phase: WorkRunPhase): string {
  return phase === 'running' || phase === 'asking' ? 'live' : phase;
}

/** Each counted phase is its own layer, so a phase change crossfades in place. */
function seatLayer(seat: SeatRun): string {
  return seat.kind === 'check' ? layerOf(seat.run.phase) : `meaning-${seat.run.phase}`;
}

const sameSeat = (a: SeatRun | null, b: SeatRun) => a !== null && a.kind === b.kind && a.run === b.run;

/**
 * The run's card in the shell's notice seat, on every screen but the one whose stage already
 * shows it. It takes the update notice's box and motion; it never remounts across routes, its
 * box never changes between states or kinds of run, and it glides aside for docks
 * (`useSeatStepAside`). Of two runs it shows the one the person started last.
 */
export function WorkRunCard() {
  const snapshot = useWorkRunSnapshot();
  const seat = seatRun(snapshot);
  const open = seat !== null;
  const { mounted } = usePanelPresence(open, FADE_OUT_MS);
  const [drawn, setDrawn] = useState<SeatRun | null>(seat);
  if (seat && !sameSeat(drawn, seat)) setDrawn(seat);
  const others = activeRuns(snapshot).filter((entry) => entry.kind !== drawn?.kind);
  return (
    <div aria-live="polite" data-testid="work-run-live">
      {mounted && drawn ? <CardBox seat={drawn} open={open} othersRunning={open ? others.length : 0} /> : null}
    </div>
  );
}

function useLeavingLayer(seat: SeatRun) {
  const layer = seatLayer(seat);
  const [layers, setLayers] = useState<{ current: SeatRun; leaving: SeatRun | null }>({ current: seat, leaving: null });
  if (!sameSeat(layers.current, seat)) {
    const handover = seatLayer(layers.current) !== layer;
    setLayers({ current: seat, leaving: handover ? layers.current : layers.leaving });
  }
  const leavingId = layers.leaving ? `${layers.leaving.kind}:${layers.leaving.run.id}:${layers.leaving.run.phase}` : null;
  useEffect(() => {
    if (!leavingId) return;
    const timer = window.setTimeout(() => setLayers((state) => ({ ...state, leaving: null })), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leavingId]);
  return layers;
}

function CardBox({ seat, open, othersRunning }: { seat: SeatRun; open: boolean; othersRunning: number }) {
  const reducedMotion = usePrefersReducedMotion();
  const layers = useLeavingLayer(seat);
  const cardRef = useRef<HTMLDivElement>(null);
  const { probe, shiftPx } = useSeatStepAside(open, cardRef);
  return (
    <div
      ref={cardRef}
      data-testid="work-run-card"
      {...{ [WORK_CARD_ATTRIBUTE]: '' }}
      data-kind={seat.kind}
      data-phase={seat.run.phase}
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
      <MoruLight tint={tintOf(seat)} phase={seat.run.phase} />
      {layers.leaving && !reducedMotion ? (
        <SeatLayer key={`leaving-${seatLayer(layers.leaving)}`} seat={layers.leaving} motion="out" />
      ) : null}
      <SeatLayer key={seatLayer(seat)} seat={seat} motion={layers.leaving ? 'in' : 'none'} />
      <MoreRunning count={othersRunning} />
    </div>
  );
}

function SeatLayer({ seat, motion }: { seat: SeatRun; motion: LayerMotion }) {
  return seat.kind === 'check' ? <PhaseLayer run={seat.run} motion={motion} /> : <MeaningLayer run={seat.run} motion={motion} />;
}

type LayerMotion = 'in' | 'out' | 'none';
type Tint = 'success' | 'warning' | null;

function tintOf(seat: SeatRun): Tint {
  const phase = seat.run.phase;
  if (phase === 'found' || phase === 'clean' || phase === 'ready') return 'success';
  if (phase === 'failed' || phase === 'unreadable') return 'warning';
  return null;
}

/** The light under Moru says how it ended before a word is read; the ladders' nearest steps. */
const LIGHT_BY_TINT: Record<NonNullable<Tint>, string> = {
  success: 'bg-[radial-gradient(closest-side,var(--color-success-a35),var(--color-success-a12)_45%,transparent)]',
  warning: 'bg-[radial-gradient(closest-side,var(--color-amber-source-a34),var(--color-amber-source-a12)_45%,transparent)]',
};
const LIGHT_WHILE_RUNNING = 'bg-[radial-gradient(closest-side,var(--color-indigo-accent-a32),var(--color-indigo-accent-a12)_45%,transparent)]';

function MoruLight({ tint, phase }: { tint: Tint; phase: string }) {
  const tinted = tint ? LIGHT_BY_TINT[tint] : undefined;
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
        data-tint={tint ? phase : undefined}
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

const COUNT_CLASS = 'mr-0.5 text-display leading-display-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]';

/** The count leads; the page being read is the line's one bright word. */
const CARD_MARKS: WorkRunMarks = {
  page: (name) => <span className="font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{name}</span>,
  count: (value) => <RollingCount value={value} className={COUNT_CLASS} />,
};

const CARD_FIGURE: CountedFigure = (value, format) => (
  <RollingCount value={value} format={format} className={cn(COUNT_CLASS, 'mr-1')} />
);

function useDoor() {
  const router = useRouter();
  return (kind: WorkRunDoor) => {
    workRuns.openDoor(kind);
    navigateWithViewTransition(() => router.push(DESTINATION_HREF.library));
  };
}

/** Title pinned to the top and buttons to the bottom, so no state moves either row. */
function LayerFrame({ moru, motion, children }: { moru: ReactNode; motion: LayerMotion; children: ReactNode }) {
  return (
    <div
      data-work-run-layer={motion === 'out' ? 'leaving' : 'current'}
      inert={motion === 'out'}
      className={cn(
        'absolute inset-0 flex p-3',
        motion === 'in' && 'app-update-layer-in',
        motion === 'out' && 'app-update-layer-out [&_*]:[animation-play-state:paused]',
      )}
    >
      {moru}
      <div className="ml-[8.25rem] grid h-full min-w-0 flex-1 content-between max-sm:ml-[4.5rem]">{children}</div>
    </div>
  );
}

function Title({ text, small, testId }: { text: string; small: boolean; testId?: string }) {
  return (
    <p
      data-testid={testId}
      className={small
        ? 'truncate text-label leading-label text-[color:var(--color-text-tertiary)]'
        : 'truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]'}
    >
      {text}
    </p>
  );
}

/** The bar along the card's foot; it fills only where a total is known. */
function FootBar({ done, total, label, slow }: { done: number; total: number | null; label: string; slow?: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 h-0.5 [&>[role=progressbar]]:h-full [&>[role=progressbar]]:rounded-none',
        // Figures arrive four times a second, so each step eases into the next without a rest.
        slow && '[&_[data-work-fill]]:duration-[var(--motion-slow)]',
      )}
    >
      <WorkProgress phase="running" done={done} total={total} label={label} />
    </div>
  );
}

function PhaseLayer({ run, motion }: { run: WorkRun; motion: LayerMotion }) {
  const t = useTranslations('library.check');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const active = isRunActive(run);
  const elapsed = useWorkRunElapsed(leaving ? null : run);
  const copy = useWorkRunCopy(run, elapsed, CARD_MARKS, 'card');
  const openDoor = useDoor();
  const testId = (id: string) => (leaving ? undefined : id);

  const primary = run.phase === 'asking'
    ? { label: t('review'), onClick: () => openDoor('conversation'), id: 'work-run-review' }
    : run.phase === 'found'
      ? { label: t('openResults'), onClick: () => openDoor('results'), id: 'work-run-open-results' }
      : run.phase === 'unreadable' || run.phase === 'failed'
        ? { label: t('openConversation'), onClick: () => openDoor('conversation'), id: 'work-run-open-conversation' }
        : null;

  return (
    <LayerFrame moru={<WorkRunMoru run={run} />} motion={motion}>
      <Title text={copy.title} small={copy.figures !== null} testId={testId('work-run-title')} />
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
        <p data-testid={testId('work-run-detail')} className="line-clamp-2 text-label leading-label text-[color:var(--color-text-secondary)]">
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
          onClick={() => (active ? workRuns.hide() : workRuns.close())}
          data-testid={testId(active ? 'work-run-hide' : 'work-run-close')}
          className="touch-hit-expand text-[color:var(--color-text-secondary)]"
        >
          {active ? tCard('hide') : tCard('close')}
        </Button>
      </div>
      {run.phase === 'running' ? <FootBar done={run.readCount} total={null} label={tCard('progressLabel', { title: copy.title })} /> : null}
    </LayerFrame>
  );
}

/** The figures a leaving layer drew last, so it fades out as it was rather than with the next phase's. */
function useLayerProgress(leaving: boolean) {
  const live = useCountedProgress();
  const [held] = useState(live);
  return leaving ? held : live;
}

function MeaningLayer({ run, motion }: { run: CountedRun; motion: LayerMotion }) {
  const t = useTranslations('workCard.meaning');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const progress = useLayerProgress(leaving);
  const copy = useCountedCopy(run, progress?.runId === run.id ? progress : null, CARD_FIGURE);
  const active = isCountedActive(run);
  const testId = (id: string) => (leaving ? undefined : id);
  const primary = run.phase === 'ready'
    ? { label: t('ask'), kind: 'ask' as const, id: 'work-run-ask' }
    : run.phase === 'failed'
      ? { label: t('openLibrary'), kind: 'library' as const, id: 'work-run-open-library' }
      : null;

  return (
    <LayerFrame moru={<CountedRunMoru run={run} />} motion={motion}>
      <Title text={copy.title} small={copy.lead !== null} testId={testId('work-run-title')} />
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
          <Button size="sm" variant="outline" onClick={() => workRuns.stopCounted()} data-testid={testId('work-run-stop')}>
            {tCard('stop')}
          </Button>
        ) : null}
        {primary ? (
          <Button size="sm" onClick={() => workRuns.openCountedDoor(primary.kind)} data-testid={testId(primary.id)}>
            {primary.label}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (active ? workRuns.hideCounted() : workRuns.closeCounted())}
          data-testid={testId(active ? 'work-run-hide' : 'work-run-close')}
          className="touch-hit-expand text-[color:var(--color-text-secondary)]"
        >
          {active ? tCard('hide') : tCard('close')}
        </Button>
      </div>
      {copy.bar ? <FootBar done={copy.bar.done} total={copy.bar.total} label={tCard('progressLabel', { title: copy.title })} slow /> : null}
    </LayerFrame>
  );
}

/**
 * "1 more running" stands in its own corner of the action row from the card's first paint, so
 * its arrival moves no press; it opens the list of running work.
 */
function MoreRunning({ count }: { count: number }) {
  const tCard = useTranslations('workCard');
  const [open, setOpen] = useState(false);
  const shown = count > 0;
  if (open && !shown) setOpen(false);
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        aria-hidden={shown ? undefined : true}
        tabIndex={shown ? undefined : -1}
        inert={!shown}
        onClick={(event) => {
          // WebKit does not focus a pressed button, so Escape would have nowhere to return focus.
          event.currentTarget.focus({ preventScroll: true });
          setOpen(true);
        }}
        data-testid="work-run-more"
        data-shown={shown ? 'true' : 'false'}
        className={cn(
          'touch-hit-expand absolute right-3 bottom-3 text-[color:var(--color-text-secondary)] transition-opacity duration-[var(--motion-base)] ease-[var(--motion-ease)]',
          shown ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {tCard('moreRunning', { count: Math.max(1, count) })}
      </Button>
      <RunsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
