'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { EXIT_TRANSITION, MOTION, STAGGER } from '@/shared/motion';
import type { FeatureStageMotion } from '@/shared/ui';
import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

export type AutomationClip = 'waiting' | 'read' | 'curious';
export const REVIEW_TRAY_LIMIT = 3;

export interface AutomationScene {
  clip: AutomationClip;
  readOwed: boolean;
  lookOwed: boolean;
  tray: { round: number; slips: number };
}

export type AutomationSceneEvent =
  | { type: 'run'; resting: boolean }
  | { type: 'loop-end' }
  | { type: 'engage'; resting: boolean }
  | { type: 'disengage'; resting: boolean }
  | { type: 'tray-cleared' };

export const AUTOMATION_SCENE_START: AutomationScene = { clip: 'waiting', readOwed: false, lookOwed: false, tray: { round: 0, slips: 0 } };

function withSlip(tray: AutomationScene['tray']): AutomationScene['tray'] {
  return tray.slips < REVIEW_TRAY_LIMIT ? { ...tray, slips: tray.slips + 1 } : { round: tray.round + 1, slips: 1 };
}

/**
 * The scene's one clock: each turn of the hand is a run, Moru reads the linked code, and the read
 * leaves one proposal waiting in the tray. Clips change only where Moru stands in the neutral pose,
 * at a loop's end or inside the waiting and curious clips' neutral hold (`resting`).
 */
export function automationScene(scene: AutomationScene, event: AutomationSceneEvent): AutomationScene {
  switch (event.type) {
    case 'run':
      return scene.clip !== 'read' && event.resting ? { ...scene, clip: 'read' } : { ...scene, readOwed: true };
    case 'loop-end': {
      const tray = scene.clip === 'read' ? withSlip(scene.tray) : scene.tray;
      if (scene.readOwed) return { ...scene, clip: 'read', readOwed: false, tray };
      if (scene.lookOwed) return { ...scene, clip: 'curious', lookOwed: false, tray };
      return { ...scene, clip: 'waiting', tray };
    }
    case 'engage':
      if (scene.clip === 'curious') return scene;
      return scene.clip === 'waiting' && event.resting ? { ...scene, clip: 'curious' } : { ...scene, lookOwed: true };
    case 'disengage':
      return { ...scene, lookOwed: false, clip: scene.clip === 'curious' && event.resting ? 'waiting' : scene.clip };
    case 'tray-cleared':
      return scene.tray.slips === REVIEW_TRAY_LIMIT ? { ...scene, tray: { round: scene.tray.round + 1, slips: 0 } } : scene;
  }
}

const SCENE_CLIPS: readonly AutomationClip[] = ['waiting', 'read', 'curious'];
/** The waiting and curious clips hold the neutral pose for the first half of each loop (`atlasWaitingStep`). */
const NEUTRAL_HOLD_END = 0.48;
const ENGAGED_HAND_RATE = 2;
const FULL_TRAY_HOLD_MS = MOTION.choreography.duration * 2_000;
const TICKS = Array.from({ length: 12 }, (_, index) => index * 30);

function restsOnNeutralPose(cell: HTMLElement | null): boolean {
  const mark = cell?.querySelector<HTMLElement>('[data-testid="brand-waiting-mark"]');
  if (!mark || mark.dataset.moruMotion === 'read' || typeof mark.getAnimations !== 'function') return false;
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

function useHandRate(hand: RefObject<HTMLElement | null>, rate: number) {
  useEffect(() => {
    const sweep = hand.current?.getAnimations?.()[0];
    if (!sweep) return undefined;
    const from = sweep.playbackRate;
    const start = performance.now();
    const spanMs = MOTION.expressive.duration * 1_000;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / spanMs);
      sweep.playbackRate = from + (rate - from) * t * t * (3 - 2 * t);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [hand, rate]);
}

export function AutomationScheduleArtwork({ engaged, reduced, name, cadence }: FeatureStageMotion & { name: string; cadence: string }) {
  const t = useTranslations('automations');
  const sceneRef = useRef<HTMLDivElement>(null);
  const cell = useRef<HTMLSpanElement>(null);
  const hand = useRef<HTMLDivElement>(null);
  const onscreen = useOnscreen(sceneRef, !reduced);
  const [scene, dispatch] = useReducer(automationScene, AUTOMATION_SCENE_START);

  useEffect(() => {
    if (reduced) return;
    for (const clip of SCENE_CLIPS) new Image().src = withBasePath(`/brand/mascot-${clip}-row-128.png`);
  }, [reduced]);

  useEffect(() => {
    dispatch({ type: engaged ? 'engage' : 'disengage', resting: restsOnNeutralPose(cell.current) });
  }, [engaged]);
  useHandRate(hand, engaged ? ENGAGED_HAND_RATE : 1);

  const full = scene.tray.slips === REVIEW_TRAY_LIMIT;
  useEffect(() => {
    if (!full) return undefined;
    const timer = window.setTimeout(() => dispatch({ type: 'tray-cleared' }), FULL_TRAY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [full]);

  const loopEnded = useCallback(() => dispatch({ type: 'loop-end' }), []);
  const handCameRound = () => dispatch({ type: 'run', resting: restsOnNeutralPose(cell.current) });
  const slips = reduced ? 1 : scene.tray.slips;
  const enter = (order: number) => ({
    initial: reduced ? false : { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: reduced ? MOTION.fast : { ...MOTION.expressive, delay: order * STAGGER * 4 },
  });

  return <div ref={sceneRef} data-automation-artwork data-scene-motion={onscreen ? 'running' : 'paused'} data-review-slips={slips}>
    <motion.div data-testid="automations-ghost-row" {...enter(0)}
      className="overflow-hidden rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-left shadow-[var(--shadow-elevation-1)]">
      <div className="grid grid-cols-1 items-center gap-x-4 px-[var(--card-pad)] py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <span className="block truncate text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{name}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-body text-[color:var(--color-text-tertiary)]">
            <CalendarClock size={ICON_SIZE.sm} aria-hidden className="flex-none" />
            <span className="truncate">{t('state.on')}</span>
          </span>
        </div>
        <span className="mt-0.5 block truncate text-body text-[color:var(--color-text-secondary)] sm:mt-0">{cadence}</span>
      </div>
    </motion.div>
    <div className="mt-3 flex items-end justify-center">
      <motion.div {...enter(1)} className="relative mb-5 size-20 flex-none">
        <svg viewBox="0 0 80 80" className="absolute inset-0" fill="none">
          <circle cx="40" cy="40" r="35" stroke="var(--color-border-strong)" strokeWidth="1.5" />
          {TICKS.map((angle) => <line key={angle} x1="40" y1={angle % 90 === 0 ? 9 : 10} x2="40" y2={angle === 0 ? 17 : 14}
            transform={`rotate(${angle} 40 40)`} strokeLinecap="round" strokeWidth={angle === 0 ? 2 : 1.25}
            stroke={angle === 0 ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)'} />)}
        </svg>
        <div ref={hand} data-automation-hand onAnimationIteration={(event) => { if (event.target === event.currentTarget) handCameRound(); }}
          className={reduced ? 'absolute inset-0' : 'automation-dial-hand absolute inset-0'}>
          <div className="absolute inset-[6px] rounded-full bg-[conic-gradient(from_270deg,transparent,var(--color-indigo-line-a32)_90deg,transparent_90deg)]" />
          <span className="absolute left-1/2 top-[11px] h-[29px] w-0.5 -translate-x-1/2 rounded-full bg-[color:var(--color-indigo-accent)]" />
        </div>
        <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-indigo-accent)]" />
      </motion.div>
      <motion.span {...enter(2)} ref={cell} data-automation-moru={reduced ? 'still' : scene.clip} className="-mx-1.5 flex-none">
        {reduced
          ? <BrandWaitingMark active held scale={2} motion="waiting" />
          : <BrandWaitingMark key={scene.clip} active scale={2} motion={scene.clip} onLoopEnd={loopEnded} />}
      </motion.span>
      <motion.div {...enter(3)} data-automation-tray
        className="relative mb-5 h-24 w-32 flex-none rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]">
        <div className="flex items-center justify-between gap-1.5 px-2 pt-1.5">
          <span className="min-w-0 text-left text-label leading-label text-[color:var(--color-text-tertiary)]">{t('scene.reviewTray')}</span>
          <motion.span key={slips} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={MOTION.settle}
            className="grid min-w-4 flex-none place-items-center rounded-chip border border-[color:var(--color-border-soft)] px-1 font-mono text-label leading-label tabular-nums text-[color:var(--color-text-secondary)]">
            {slips}
          </motion.span>
        </div>
        <span className="absolute inset-x-2 bottom-2 h-9 rounded-micro border border-dashed border-[color:var(--color-border-soft)]" />
        <AnimatePresence>
          <motion.div key={scene.tray.round} className="absolute inset-x-2 bottom-2 h-12"
            exit={{ opacity: 0, y: 6, transition: { ...EXIT_TRANSITION, duration: MOTION.slow.duration } }}>
            {Array.from({ length: slips }, (_, index) => <ProposalSlip key={index} index={index} reduced={reduced} />)}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  </div>;
}

function ProposalSlip({ index, reduced }: { index: number; reduced: boolean }) {
  return <motion.div data-proposal-slip
    initial={reduced ? false : { opacity: 0, x: -112, y: -28, rotate: -6, scale: 0.9 }}
    animate={{ opacity: 1, x: 0, y: -index * 6, rotate: 0, scale: 1 }}
    transition={reduced ? MOTION.fast : MOTION.expressive}
    className="absolute inset-x-0 bottom-0 flex h-9 flex-col justify-center gap-1 rounded-micro border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] px-2 shadow-[var(--shadow-elevation-1)]">
    <span className="h-1 w-[58%] rounded-micro bg-[color:var(--color-text-secondary)]" />
    <span className="h-1 w-[80%] rounded-micro bg-[color:var(--color-overlay-3)]" />
  </motion.div>;
}
