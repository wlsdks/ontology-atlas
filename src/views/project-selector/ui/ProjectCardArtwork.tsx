'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { MOTION } from '@/shared/motion';
import { framerSpring, SPRING } from '@/shared/motion/spring';
import type { FeatureStageMotion } from '@/shared/ui';
import { BrandWaitingMark } from '@/shared/ui/marks/moru/brand-waiting-mark';
import { OntologyMapKindGlyph } from '@/shared/ui/ontology-node/map-kind-glyph';

export type ProjectCardClip = 'write' | 'waiting';

export interface ProjectCardMoru {
  clip: ProjectCardClip;
  waits: number;
  writeOwed: boolean;
}

export const PROJECT_CARD_WAITS_PER_WRITE = 3;
export const PROJECT_CARD_ARRIVAL: ProjectCardMoru = { clip: 'write', waits: 0, writeOwed: false };
const SCENE_CLIPS: readonly ProjectCardClip[] = ['write', 'waiting'];

/** Both clips start and end on the shared neutral pose, so a swap at a loop's end never jumps a frame. */
export function projectCardAfterLoop(moru: ProjectCardMoru): ProjectCardMoru {
  if (moru.writeOwed) return { clip: 'write', waits: 0, writeOwed: false };
  if (moru.clip === 'write') return { clip: 'waiting', waits: 0, writeOwed: false };
  const waits = moru.waits + 1;
  return waits >= PROJECT_CARD_WAITS_PER_WRITE ? { clip: 'write', waits: 0, writeOwed: false } : { ...moru, waits };
}

export function projectCardOnEngage(moru: ProjectCardMoru, resting: boolean): ProjectCardMoru {
  if (moru.clip === 'write') return moru;
  return resting ? { clip: 'write', waits: 0, writeOwed: false } : { ...moru, writeOwed: true };
}

/** The waiting clip holds its neutral pose for the first half of each loop (`atlasWaitingStep`). */
const NEUTRAL_HOLD_END = 0.48;

function restsOnNeutralPose(cell: HTMLElement | null): boolean {
  const mark = cell?.querySelector<HTMLElement>('[data-testid="brand-waiting-mark"]');
  if (!mark || mark.dataset.moruMotion !== 'waiting' || typeof mark.getAnimations !== 'function') return false;
  const progress = mark.getAnimations()[0]?.effect?.getComputedTiming().progress;
  return typeof progress === 'number' && progress < NEUTRAL_HOLD_END;
}

const CARD_SPRING = framerSpring(SPRING.surface);
const WRITE_START = MOTION.slow.duration;
const LINE_GAP = MOTION.choreography.duration / 10;

const DOMAIN_ROWS = [
  { label: 'w-[46%]', share: 0.82, engaged: 0.94, count: 14, tone: 'bg-[color:var(--color-indigo-accent)]' },
  { label: 'w-[62%]', share: 0.56, engaged: 0.62, count: 9, tone: 'bg-[color:var(--color-text-tertiary)]' },
  { label: 'w-[38%]', share: 0.34, engaged: 0.4, count: 5, tone: 'bg-[color:var(--color-text-quaternary)]' },
] as const;

export function ProjectCardArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const cell = useRef<HTMLSpanElement>(null);
  const [moru, setMoru] = useState(PROJECT_CARD_ARRIVAL);

  useEffect(() => {
    if (reduced) return;
    for (const clip of SCENE_CLIPS) new Image().src = withBasePath(`/brand/mascot-${clip}-row-128.png`);
  }, [reduced]);

  useEffect(() => {
    if (!engaged) return;
    const resting = restsOnNeutralPose(cell.current);
    setMoru((current) => projectCardOnEngage(current, resting));
  }, [engaged]);

  const loopEnded = () => setMoru(projectCardAfterLoop);
  const settle = reduced ? MOTION.fast : arriving && !engaged ? { ...MOTION.expressive } : CARD_SPRING;

  return <div data-project-card-scene aria-hidden className="relative mx-auto flex h-60 w-full items-end justify-center">
    <div className="pointer-events-none absolute bottom-1 left-1/2 h-5 w-56 -translate-x-1/2 bg-[radial-gradient(closest-side,var(--color-overlay-3),transparent)]" />
    <motion.div data-project-card-figure
      initial={reduced ? false : { opacity: 0, y: 16, scale: 0.96 }}
      animate={engaged ? { opacity: 1, y: -6, scale: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={settle}
      className="relative z-[1] mb-5 w-[min(16rem,62%)] flex-none overflow-hidden rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] text-left shadow-[var(--shadow-elevation-2)]">
      <div className="px-3.5 pb-3 pt-3.5">
        <Written order={0} reduced={reduced} className="flex items-center gap-2">
          <OntologyMapKindGlyph kind="project" className="shrink-0" />
          <span className="h-2 w-[58%] rounded-micro bg-[color:var(--color-text-secondary)]" />
        </Written>
        <Written order={1} reduced={reduced} className="mt-2.5 h-1 w-[88%] rounded-micro bg-[color:var(--color-overlay-3)]" />
      </div>
      <ul className="flex flex-col gap-2 border-t border-[color:var(--color-divider)] px-3.5 py-3">
        {DOMAIN_ROWS.map((row, index) => <DomainRow key={row.label} row={row} order={2 + index} engaged={engaged} reduced={reduced} />)}
      </ul>
    </motion.div>
    {/* The 128px cell's lowest drawn row is 21px above its edge; the seal stands on the scene's floor. */}
    <span ref={cell} data-project-card-moru={reduced ? 'still' : moru.clip} className="relative -mb-4 -ml-3 flex-none">
      {reduced
        ? <BrandWaitingMark active held scale={2} motion="waiting" />
        : <BrandWaitingMark key={moru.clip} active scale={2} motion={moru.clip} onLoopEnd={loopEnded} />}
    </span>
  </div>;
}

function Written({ order, reduced, className, children }: { order: number; reduced: boolean; className?: string; children?: ReactNode }) {
  return <motion.div className={className}
    initial={reduced ? false : { clipPath: 'inset(0% 100% 0% 0%)' }}
    animate={{ clipPath: 'inset(0% 0% 0% 0%)' }}
    transition={reduced ? MOTION.fast : { ...MOTION.settle, delay: WRITE_START + order * LINE_GAP }}>
    {children}
  </motion.div>;
}

function DomainRow({ row, order, engaged, reduced }: { row: (typeof DOMAIN_ROWS)[number]; order: number; engaged: boolean; reduced: boolean }) {
  const delay = WRITE_START + order * LINE_GAP;
  return <li className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_1.25rem] items-center gap-2" data-project-card-domain>
    <Written order={order} reduced={reduced} className="flex">
      <span className={`h-1 rounded-micro bg-[color:var(--color-text-quaternary)] ${row.label}`} />
    </Written>
    <span className="h-1.5 overflow-hidden rounded-micro bg-[color:var(--color-overlay-1)]">
      <motion.span className={`block h-full origin-left rounded-micro ${row.tone}`}
        initial={reduced ? false : { scaleX: 0 }}
        animate={{ scaleX: engaged ? row.engaged : row.share }}
        transition={reduced ? MOTION.fast : engaged ? CARD_SPRING : { ...MOTION.expressive, delay }} />
    </span>
    <motion.span className="text-right font-mono text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reduced ? MOTION.fast : { ...MOTION.settle, delay: delay + MOTION.slow.duration }}>
      {row.count}
    </motion.span>
  </li>;
}
