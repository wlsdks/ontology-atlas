'use client';

import { motion } from 'framer-motion';
import { KeyRound, Lock } from 'lucide-react';

import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';

const KEY = { x: 16, y: 72, width: 56, height: 56 };
const STORE = { x: 168, y: 40, width: 136, height: 120 };
const KEY_MID_Y = KEY.y + KEY.height / 2;
const WIRE = `M${KEY.x + KEY.width + 6} ${KEY_MID_Y}H${STORE.x}`;
const MASK_DOTS = [0, 1, 2, 3, 4, 5];

/** A key on the left travelling into this computer's locked store on the right, where it is kept masked. */
export function ModelKeyArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const beat = MOTION.slow.duration;
  const after = (index: number, step: number) => reduced ? MOTION.fast : { ...MOTION.expressive, delay: beat * step + STAGGER * index };
  return <svg data-model-key-artwork viewBox="0 0 320 200" className="w-full" fill="none">
    <motion.g initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={after(0, 1)}>
      <rect {...STORE} rx="12" fill="var(--color-panel)" stroke="var(--color-border-strong)" />
      <Lock x={STORE.x + 16} y={STORE.y + 16} width="20" height="20" className="text-[color:var(--color-text-secondary)]" />
      <rect x={STORE.x + 16} y={STORE.y + 92} width="72" height="6" rx="3" fill="var(--color-overlay-3)" />
    </motion.g>
    <motion.g
      initial={reduced ? false : { opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: engaged ? 6 : 0 }}
      transition={reduced ? MOTION.fast : arriving ? MOTION.expressive : MOTION.settle}
    >
      <rect {...KEY} rx="10" fill="var(--color-overlay-1)" stroke="var(--color-border-soft)" />
      <KeyRound x={KEY.x + 16} y={KEY.y + 16} width="24" height="24" className="text-[color:var(--color-indigo-accent)]" />
    </motion.g>
    <motion.path d={WIRE} stroke={engaged ? 'var(--color-indigo-line-a54)' : 'var(--color-indigo-line-a35)'} strokeWidth="2"
      initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={after(0, 2)} />
    <FeatureStagePulse d={WIRE} delay={beat * 4} engaged={engaged} reduced={reduced} />
    <motion.circle cx={STORE.x} cy={KEY_MID_Y} r="5" fill="var(--color-indigo-accent)"
      initial={reduced ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={after(0, 3)} />
    {MASK_DOTS.map((dot) => <motion.circle key={dot} cx={STORE.x + 22 + dot * 16} cy={KEY_MID_Y + 6} r="4" fill="var(--color-text-tertiary)"
      initial={reduced ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={after(dot, 3.5)} />)}
  </svg>;
}
