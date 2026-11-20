'use client';

import { useEffect, useRef, useState } from 'react';
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

import { isRunActive, type WorkRun, type WorkRunPhase } from '../model/work-run';
import { workRuns, type WorkRunDoor } from '../model/work-run-store';
import { useWorkRunElapsed, useWorkRunSnapshot, workCardHoldsSeat } from '../model/use-work-run';
import { useWorkRunCopy, type WorkRunMarks } from './use-work-run-copy';
import { RollingCount } from './RollingCount';
import { WorkRunMoru } from './WorkRunMoru';
import { useSeatStepAside } from './use-seat-step-aside';

/** `.app-update-card[data-state='closed']` and `.app-update-layer-out` fade over `--motion-base`. */
const FADE_OUT_MS = Math.round(MOTION.base.duration * 1_000);

/** Running and asking share one layer, so a permission ask changes words in place, not the card. */
function layerOf(phase: WorkRunPhase): string {
  return phase === 'running' || phase === 'asking' ? 'live' : phase;
}

/**
 * The run's card in the shell's notice seat, on every screen but the one whose stage already
 * shows it. It takes the update notice's box and motion; it never remounts across routes, its
 * box never changes between states, and it glides aside for docks (`useSeatStepAside`).
 */
export function WorkRunCard() {
  const snapshot = useWorkRunSnapshot();
  const open = workCardHoldsSeat(snapshot);
  const { mounted } = usePanelPresence(open, FADE_OUT_MS);
  const [drawn, setDrawn] = useState<WorkRun | null>(snapshot.run);
  if (open && snapshot.run && drawn !== snapshot.run) setDrawn(snapshot.run);
  return (
    <div aria-live="polite" data-testid="work-run-live">
      {mounted && drawn ? <CardBox run={drawn} open={open} /> : null}
    </div>
  );
}

function useLeavingLayer(run: WorkRun) {
  const layer = layerOf(run.phase);
  const [layers, setLayers] = useState<{ current: WorkRun; leaving: WorkRun | null }>({ current: run, leaving: null });
  if (layers.current !== run) {
    const handover = layerOf(layers.current.phase) !== layer;
    setLayers({ current: run, leaving: handover ? layers.current : layers.leaving });
  }
  const leavingId = layers.leaving ? `${layers.leaving.id}:${layers.leaving.phase}` : null;
  useEffect(() => {
    if (!leavingId) return;
    const timer = window.setTimeout(() => setLayers((state) => ({ ...state, leaving: null })), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leavingId]);
  return layers;
}

function CardBox({ run, open }: { run: WorkRun; open: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const layers = useLeavingLayer(run);
  const cardRef = useRef<HTMLDivElement>(null);
  const { probe, shiftPx } = useSeatStepAside(open, cardRef);
  return (
    <div
      ref={cardRef}
      data-testid="work-run-card"
      data-phase={run.phase}
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
      <MoruLight />
      {layers.leaving && !reducedMotion ? (
        <PhaseLayer key={`leaving-${layerOf(layers.leaving.phase)}`} run={layers.leaving} motion="out" />
      ) : null}
      <PhaseLayer key={layerOf(run.phase)} run={run} motion={layers.leaving ? 'in' : 'none'} />
    </div>
  );
}

function MoruLight() {
  return (
    <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-32 max-sm:size-16">
      <span className="absolute top-[72%] left-1/2 h-[130%] w-[150%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-indigo-accent-a32),var(--color-indigo-accent-a12)_45%,transparent)]" />
      <span className="absolute top-[81%] left-1/2 h-[9%] w-[58%] -translate-x-1/2 -translate-y-1/2 bg-[radial-gradient(closest-side,var(--color-shadow-a42),transparent)]" />
    </span>
  );
}

/** The page and the count lead the line; the words around them stay quiet. */
const CARD_MARKS: WorkRunMarks = {
  page: (name) => <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{name}</span>,
  count: (value) => (
    <RollingCount
      value={value}
      className="mr-0.5 text-display leading-display-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
    />
  ),
};

function useDoor() {
  const router = useRouter();
  return (kind: WorkRunDoor) => {
    workRuns.openDoor(kind);
    navigateWithViewTransition(() => router.push(DESTINATION_HREF.library));
  };
}

function PhaseLayer({ run, motion }: { run: WorkRun; motion: 'in' | 'out' | 'none' }) {
  const t = useTranslations('library.check');
  const tCard = useTranslations('workCard');
  const leaving = motion === 'out';
  const active = isRunActive(run);
  const elapsed = useWorkRunElapsed(leaving ? null : run);
  const copy = useWorkRunCopy(run, elapsed, CARD_MARKS);
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
    <div
      data-work-run-layer={leaving ? 'leaving' : 'current'}
      inert={leaving}
      className={cn(
        'absolute inset-0 flex items-center p-3',
        motion === 'in' && 'app-update-layer-in',
        motion === 'out' && 'app-update-layer-out [&_*]:[animation-play-state:paused]',
      )}
    >
      <WorkRunMoru run={run} />
      <div className="ml-[8.25rem] grid min-w-0 flex-1 gap-1 max-sm:ml-[4.5rem]">
        {copy.figures ? (
          // While it runs the count leads; each line is single, so a long page name never moves it.
          <div aria-live="off" className="grid min-w-0 text-label leading-label">
            <p
              data-testid={testId('work-run-title')}
              className="truncate font-[var(--font-weight-strong)] text-[color:var(--color-text-secondary)]"
            >
              {copy.title}
            </p>
            <p data-testid={testId('work-run-figures')} className="mt-1 truncate leading-display tabular-nums text-[color:var(--color-text-tertiary)]">
              {copy.figures}
            </p>
            <p
              data-testid={testId('work-run-line')}
              className={cn('text-[color:var(--color-text-secondary)]', run.phase === 'asking' ? 'line-clamp-2' : 'truncate')}
            >
              {copy.detail}
            </p>
          </div>
        ) : (
          <>
            <p
              data-testid={testId('work-run-title')}
              className="truncate text-body-lg leading-body-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
            >
              {copy.title}
            </p>
            <p
              data-testid={testId('work-run-detail')}
              className="line-clamp-2 min-h-[calc(var(--leading-label)*2)] text-label leading-label text-[color:var(--color-text-secondary)]"
            >
              {copy.detail}
            </p>
          </>
        )}
        <div className="mt-1 flex h-8 min-w-0 items-center gap-2">
          {run.phase === 'running' ? (
            <>
              <div className="min-w-0 flex-1">
                <WorkProgress phase="running" done={run.readCount} total={null} label={tCard('progressLabel', { title: copy.title })} />
              </div>
              <Button size="sm" variant="outline" onClick={() => workRuns.stop()} data-testid={testId('work-run-stop')}>
                {tCard('stop')}
              </Button>
            </>
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
      </div>
    </div>
  );
}
