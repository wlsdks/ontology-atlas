'use client';

import { motion } from 'framer-motion';
import { CalendarClock, Check } from 'lucide-react';

import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

const RUN_XS = [64, 160, 256];
const LINE_Y = 40;
const RESULT = { width: 56, height: 44 };

/** One example schedule over a time line; the line draws once and each run on it leaves a result. */
export function AutomationScheduleArtwork({ arriving, engaged, reduced, name, cadence }: FeatureStageMotion & { name: string; cadence: string }) {
  const beat = MOTION.slow.duration;
  const after = (index: number) => reduced ? MOTION.fast : { ...MOTION.expressive, delay: beat * (index + 1) };
  return <div data-automation-artwork>
    <motion.div data-testid="automations-ghost-row"
      initial={reduced ? false : { opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={reduced ? MOTION.fast : MOTION.expressive}
      className="flex items-center gap-3 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-panel)] bg-[linear-gradient(180deg,var(--color-overlay-2),transparent_60%)] px-4 py-4 text-left shadow-[var(--shadow-elevation-1)]">
      <CalendarClock size={ICON_SIZE.lg} className="flex-none text-[color:var(--color-indigo-accent)]" />
      <span className="min-w-0">
        <span className="block break-words text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">{name}</span>
        <span className="mt-1 block text-body text-[color:var(--color-text-secondary)]">{cadence}</span>
      </span>
    </motion.div>
    <svg viewBox="0 0 320 132" className="mt-2 w-full" fill="none">
      <motion.path d={`M24 ${LINE_Y}H296`} stroke="var(--color-indigo-line-a35)" strokeWidth="2" strokeLinecap="round"
        initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduced ? MOTION.fast : MOTION.choreography} />
      <FeatureStagePulse d={`M24 ${LINE_Y}H296`} delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
      {RUN_XS.map((x, index) => <g key={x}>
        <motion.circle cx={x} cy={LINE_Y} r="6" fill="var(--color-indigo-accent)"
          initial={reduced ? false : { opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={after(index)} />
        <motion.g
          initial={reduced ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: engaged ? -4 : 0 }}
          transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: beat * (index + 1) + STAGGER } : { ...MOTION.settle, delay: STAGGER * index }}
        >
          <path d={`M${x} ${LINE_Y + 10}V${LINE_Y + 28}`} stroke="var(--color-border-strong)" strokeWidth="2" strokeLinecap="round" />
          <rect x={x - RESULT.width / 2} y={LINE_Y + 32} {...RESULT} rx="10" fill="var(--color-overlay-1)" stroke="var(--color-border-soft)" />
          <Check x={x - 10} y={LINE_Y + 44} width="20" height="20" className="text-[color:var(--color-text-secondary)]" />
        </motion.g>
      </g>)}
    </svg>
  </div>;
}
