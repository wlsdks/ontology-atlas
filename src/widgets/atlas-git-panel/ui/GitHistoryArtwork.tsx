'use client';

import { motion } from 'framer-motion';

import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';

const RAIL_X = 40;
const ROW = { x: 72, width: 232, height: 48 };
const ROW_YS = [24, 96, 168];
const RAIL = `M${RAIL_X} ${ROW_YS[2] + ROW.height}V${ROW_YS[0]}`;

/** A history rail of three changes, oldest at the bottom; the top one is not recorded yet and becomes a commit while the action is engaged. */
export function GitHistoryArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const beat = MOTION.slow.duration;
  return <svg viewBox="0 0 320 240" className="w-full" fill="none" data-git-artwork>
    <motion.path d={RAIL} stroke="var(--color-indigo-line-a35)" strokeWidth="2" strokeLinecap="round"
      initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduced ? MOTION.fast : MOTION.choreography} />
    <FeatureStagePulse d={RAIL} delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
    {ROW_YS.map((y, index) => {
      const pending = index === 0;
      const recorded = !pending || engaged;
      const order = ROW_YS.length - 1 - index;
      const midY = y + ROW.height / 2;
      return <motion.g key={y}
        initial={reduced ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
        transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: beat * (order + 1) + STAGGER } : MOTION.settle}>
        <rect {...ROW} y={y} rx="10" fill="var(--color-panel)"
          stroke={recorded ? 'var(--color-border-strong)' : 'var(--color-indigo-line-a54)'} strokeDasharray={recorded ? undefined : '4 4'} />
        <rect x={ROW.x + 16} y={midY - 10} width={[120, 96, 136][index]} height="7" rx="3.5" fill="var(--color-text-tertiary)" />
        <rect x={ROW.x + 16} y={midY + 5} width="28" height="5" rx="2.5" fill="var(--color-indigo-a40)" />
        <rect x={ROW.x + 50} y={midY + 5} width="16" height="5" rx="2.5" fill="var(--color-overlay-3)" />
        <circle cx={RAIL_X} cy={midY} r="6" strokeWidth="2"
          fill={recorded ? 'var(--color-indigo-accent)' : 'var(--color-canvas)'} stroke="var(--color-indigo-accent)" />
      </motion.g>;
    })}
  </svg>;
}
