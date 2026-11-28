import { useCallback, useEffect, useRef, useState, type AnimationEvent, type ReactNode, type RefObject } from 'react';
import { motion, type TargetAndTransition } from 'framer-motion';
import { useTranslations } from 'use-intl';

import { cn } from '@/shared/lib/cn';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { MOTION } from '@/shared/motion';
import { framerSpring, SPRING } from '@/shared/motion/spring';
import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import type { FeatureStageMotion } from '@/shared/ui';

export type PlanningClip = 'folder-open' | 'waiting' | 'compare' | 'hop';

export interface PlanningMoru {
  clip: PlanningClip;
  waits: number;
  hopOwed: boolean;
}

export const PLANNING_WAITS_PER_COMPARE = 2;
export const PLANNING_ARRIVAL: PlanningMoru = { clip: 'folder-open', waits: 0, hopOwed: false };
const SCENE_CLIPS: readonly PlanningClip[] = ['folder-open', 'waiting', 'compare', 'hop'];

/** The clip after the current one returns to the shared neutral pose, so a swap never jumps a frame. */
export function planningAfterLoop(moru: PlanningMoru): PlanningMoru {
  if (moru.hopOwed) return { clip: 'hop', waits: 0, hopOwed: false };
  if (moru.clip !== 'waiting') return { clip: 'waiting', waits: 0, hopOwed: false };
  const waits = moru.waits + 1;
  return waits >= PLANNING_WAITS_PER_COMPARE ? { clip: 'compare', waits: 0, hopOwed: false } : { ...moru, waits };
}

export function planningOnEngage(moru: PlanningMoru, resting: boolean): PlanningMoru {
  if (moru.clip === 'hop') return moru;
  return resting ? { clip: 'hop', waits: 0, hopOwed: false } : { ...moru, hopOwed: true };
}

/** The waiting clip holds its neutral pose for the first half of each loop (`atlasWaitingStep`). */
const NEUTRAL_HOLD_END = 0.48;

function restsOnNeutralPose(cell: HTMLElement | null): boolean {
  const mark = cell?.querySelector<HTMLElement>('[data-testid="brand-waiting-mark"]');
  if (!mark || mark.dataset.moruMotion !== 'waiting' || typeof mark.getAnimations !== 'function') return false;
  const progress = mark.getAnimations()[0]?.effect?.getComputedTiming().progress;
  return typeof progress === 'number' && progress < NEUTRAL_HOLD_END;
}

function useOnscreen(ref: RefObject<HTMLElement | null>, enabled: boolean): boolean {
  const [onscreen, setOnscreen] = useState(false);
  useEffect(() => {
    const scene = ref.current;
    if (!enabled || !scene || typeof IntersectionObserver === 'undefined') return undefined;
    let intersecting = false;
    const update = () => setOnscreen(intersecting && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting === true;
      update();
    });
    observer.observe(scene);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [ref, enabled]);
  return enabled && onscreen;
}

const SHEET_SPRING = framerSpring(SPRING.surface);
const SHEET_RISE_DELAY = MOTION.slow.duration;
const LINE_START = SHEET_RISE_DELAY + MOTION.settle.duration;
const LINE_GAP = MOTION.choreography.duration / 18;

type Side = 'document' | 'mock';
const RESTING = { opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 } as const;
const SHEET_POSE: Record<Side, { from: TargetAndTransition; lean: TargetAndTransition }> = {
  document: { from: { opacity: 0, x: '55%', y: 56, scale: 0.6, rotate: 0 }, lean: { opacity: 1, x: 6, y: -6, scale: 1, rotate: 2 } },
  mock: { from: { opacity: 0, x: '-55%', y: 56, scale: 0.6, rotate: 0 }, lean: { opacity: 1, x: -6, y: -6, scale: 1, rotate: -2 } },
};

export function PlanningSourceArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const t = useTranslations('planning');
  const scene = useRef<HTMLDivElement>(null);
  const cell = useRef<HTMLSpanElement>(null);
  const onscreen = useOnscreen(scene, !reduced);
  const [moru, setMoru] = useState(PLANNING_ARRIVAL);

  useEffect(() => {
    if (reduced) return;
    for (const clip of SCENE_CLIPS) new Image().src = withBasePath(`/brand/mascot-${clip}-row-128.png`);
  }, [reduced]);

  useEffect(() => {
    const resting = restsOnNeutralPose(cell.current);
    setMoru((current) => (engaged ? planningOnEngage(current, resting) : { ...current, hopOwed: false }));
  }, [engaged]);

  const loopEnded = useCallback(() => setMoru(planningAfterLoop), []);
  const gestureEnded = (event: AnimationEvent<HTMLSpanElement>) => {
    if ((event.target as HTMLElement).dataset.moruMotion === 'hop') loopEnded();
  };

  const sheet = (side: Side) => ({
    initial: reduced ? false : SHEET_POSE[side].from,
    animate: engaged ? SHEET_POSE[side].lean : RESTING,
    transition: reduced ? MOTION.fast : arriving && !engaged ? { ...MOTION.expressive, delay: SHEET_RISE_DELAY } : SHEET_SPRING,
  });

  const drift = reduced ? null : 'planning-sheet-drift';
  return <div ref={scene} data-planning-folder-scene data-scene-motion={onscreen ? 'running' : 'paused'} aria-hidden
    className="relative mx-auto h-60 w-full">
    <div className={cn(drift, 'absolute left-[8%] top-2 w-[34%] sm:left-[10%] sm:w-[31%]')}>
      <motion.div data-planning-paper="document" {...sheet('document')} style={{ transformOrigin: '100% 100%' }}
        className="h-44 overflow-hidden rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-3 py-3 shadow-[var(--shadow-elevation-2)]">
        <MarkdownPage heading={t('scene.documentHeading')} reduced={reduced} />
      </motion.div>
    </div>
    <div className={cn(drift && `${drift} planning-sheet-drift-late`, 'absolute right-[8%] top-2 w-[34%] sm:right-[10%] sm:w-[31%]')}>
      <motion.div data-planning-paper="image" {...sheet('mock')} style={{ transformOrigin: '0% 100%' }}
        className="h-44 overflow-hidden rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] p-2 shadow-[var(--shadow-elevation-2)]">
        <ScreenMock reduced={reduced} />
      </motion.div>
    </div>
    <div className="pointer-events-none absolute bottom-1 left-1/2 h-5 w-40 -translate-x-1/2 bg-[radial-gradient(closest-side,var(--color-overlay-3),transparent)]" />
    {/* The 128px cell's lowest drawn row is 21px above its edge; the seal stands on the scene's floor. */}
    <span ref={cell} data-planning-moru={reduced ? 'still' : moru.clip} onAnimationEnd={gestureEnded}
      className="absolute -bottom-4 left-1/2 -translate-x-1/2">
      {reduced
        ? <BrandWaitingMark active held scale={2} motion="waiting" />
        : <BrandWaitingMark key={moru.clip} active scale={2} motion={moru.clip} onLoopEnd={moru.clip === 'hop' ? undefined : loopEnded} />}
    </span>
  </div>;
}

function Written({ order, reduced, className, children }: { order: number; reduced: boolean; className?: string; children?: ReactNode }) {
  return <motion.div className={className}
    initial={reduced ? false : { clipPath: 'inset(0% 100% 0% 0%)' }}
    animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
    transition={reduced ? MOTION.fast : { ...MOTION.base, delay: LINE_START + order * LINE_GAP }}>
    {children}
  </motion.div>;
}

const TEXT = 'h-1 rounded-micro bg-[color:var(--color-overlay-3)]';

function HashMark({ size }: { size: number }) {
  return <svg viewBox="0 0 10 10" width={size} height={size} fill="none" className="flex-none text-[color:var(--color-indigo-accent)]">
    <path d="M3.6 1 2.4 9M7.6 1 6.4 9M1.2 3.6h8M.8 6.4h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>;
}

function MarkdownPage({ heading, reduced }: { heading: string; reduced: boolean }) {
  return <div className="flex flex-col gap-2.5">
    <Written order={0} reduced={reduced} className="flex items-center gap-1.5">
      <HashMark size={10} />
      <span className="truncate text-label leading-label font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)] sm:text-body sm:leading-body">{heading}</span>
    </Written>
    <div className="flex flex-col gap-1.5">
      <Written order={1} reduced={reduced} className={`${TEXT} w-full`} />
      <Written order={2} reduced={reduced} className={`${TEXT} w-[88%]`} />
      <Written order={3} reduced={reduced} className={`${TEXT} w-[56%]`} />
    </div>
    <Written order={4} reduced={reduced} className="mt-0.5 flex items-center gap-1.5">
      <HashMark size={7} />
      <span className="h-1.5 w-[44%] rounded-micro bg-[color:var(--color-text-quaternary)]" />
    </Written>
    <ul className="flex flex-col gap-1.5">
      {['w-[72%]', 'w-[58%]', 'w-[66%]'].map((width, index) => <Written key={width} order={5 + index} reduced={reduced} className="flex items-center gap-1.5">
        <span className="size-1 flex-none rounded-full bg-[color:var(--color-text-tertiary)]" />
        <span className={`${TEXT} ${width}`} />
      </Written>)}
    </ul>
    <Written order={8} reduced={reduced} className="flex flex-col gap-1.5 rounded-micro bg-[color:var(--color-overlay-1)] px-2 py-1.5">
      <span className="h-1 w-[62%] rounded-micro bg-[color:var(--color-indigo-a24)]" />
      <span className="h-1 w-[40%] rounded-micro bg-[color:var(--color-indigo-a24)]" />
    </Written>
  </div>;
}

function Block({ order, reduced, className, children }: { order: number; reduced: boolean; className: string; children?: ReactNode }) {
  return <motion.div className={className}
    initial={reduced ? false : { opacity: 0, y: 4 }}
    animate={{ opacity: 1, y: 0 }}
    transition={reduced ? MOTION.fast : { ...MOTION.settle, delay: LINE_START + order * LINE_GAP * 1.4 }}>
    {children}
  </motion.div>;
}

function ScreenMock({ reduced }: { reduced: boolean }) {
  return <div className="flex h-full flex-col overflow-hidden rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
    <div className="flex items-center gap-1.5 border-b border-[color:var(--color-border-soft)] px-2 py-1.5">
      <Block order={0} reduced={reduced} className="size-2.5 rounded-full bg-[color:var(--color-text-secondary)]" />
      <span className="flex-1" />
      <Block order={0} reduced={reduced} className="h-1 w-3 rounded-micro bg-[color:var(--color-overlay-3)]" />
      <Block order={0} reduced={reduced} className="h-1 w-3 rounded-micro bg-[color:var(--color-overlay-3)]" />
      <Block order={0} reduced={reduced} className="h-2 w-5 rounded-micro bg-[color:var(--color-text-primary)]" />
    </div>
    <div className="flex flex-1 flex-col gap-1.5 p-2">
      <Block order={1} reduced={reduced} className="h-2 w-[70%] rounded-micro bg-[color:var(--color-text-secondary)]" />
      <Block order={2} reduced={reduced} className="h-1 w-[52%] rounded-micro bg-[color:var(--color-overlay-3)]" />
      <Block order={3} reduced={reduced} className="mt-0.5 overflow-hidden rounded-micro bg-[color:var(--color-overlay-2)]">
        <svg viewBox="0 0 120 40" preserveAspectRatio="xMidYMax slice" className="block h-11 w-full" fill="none">
          <circle cx="92" cy="12" r="5" fill="var(--color-text-tertiary)" />
          <path d="M0 40 30 16l18 14 14-10 22 20Z" fill="var(--color-overlay-3)" />
          <path d="M44 40 74 22l46 18Z" fill="var(--color-indigo-line-a32)" />
        </svg>
      </Block>
      <div className="grid grid-cols-3 gap-1.5">
        {[4, 5, 6].map((order) => <Block key={order} order={order} reduced={reduced}
          className="flex h-9 flex-col justify-end gap-1 rounded-micro border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-1">
          <span className="h-1 w-[70%] rounded-micro bg-[color:var(--color-text-quaternary)]" />
          <span className="h-0.5 w-[45%] rounded-micro bg-[color:var(--color-overlay-3)]" />
        </Block>)}
      </div>
    </div>
  </div>;
}
