'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStage, FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';

const TRUNK_X = 56;
const SEAM_X = 196;
const MAIN_X = 276;
/** Three worktrees branching from one session: one at work, one past the push seam, one merged. */
const BRANCHES = [
  { y: 112, end: 150, ink: 'var(--work-session-1)' },
  { y: 168, end: 236, ink: 'var(--work-session-1)' },
  { y: 224, end: MAIN_X, ink: 'var(--work-unheld)' },
];

/** A session's trunk, its worktrees branching off it, and the push seam they cross: the board in miniature. */
function TracksArtwork({ arriving, engaged, reduced }: FeatureStageMotion) {
  const draw = reduced ? MOTION.fast : MOTION.choreography;
  return (
    <div className="relative aspect-square">
      <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full" fill="none">
        <rect x={SEAM_X} y="40" width={320 - SEAM_X} height="248" rx="10" fill="var(--work-ground-server)" />
        <path d={`M${SEAM_X} 40v248`} stroke="var(--work-seam)" strokeWidth="1" />
        <path d={`M${MAIN_X} 64v208`} stroke="var(--color-text-secondary)" strokeWidth="3" strokeLinecap="round" />
        <motion.path d={`M${TRUNK_X} 72V212`} stroke="var(--work-session-1)" strokeWidth="2"
          initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
        <FeatureStagePulse d={`M${TRUNK_X} 72V212`} delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
        <circle cx={TRUNK_X} cy="72" r="7" fill="var(--color-canvas)" stroke="var(--work-session-1)" strokeWidth="3" />
        {BRANCHES.map((branch, index) => (
          <motion.path key={branch.y} d={`M${TRUNK_X} ${branch.y - 12}q0 12 12 12H${branch.end}`} stroke={branch.ink} strokeWidth="2" strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
            transition={reduced ? MOTION.fast : { ...MOTION.slow, delay: MOTION.base.duration + index * STAGGER * 3 }} />
        ))}
        {BRANCHES.map((branch, index) => (
          <motion.circle key={`head-${branch.y}`} cx={branch.end} cy={branch.y} r="6" fill={branch.ink}
            initial={reduced ? false : { opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: engaged && index === 0 ? 1.25 : 1 }}
            transition={reduced ? MOTION.fast : arriving ? { ...MOTION.slow, delay: MOTION.slow.duration + index * STAGGER * 3 } : MOTION.settle} />
        ))}
      </svg>
    </div>
  );
}

export type WorkStatusStageState = 'choose' | 'not-repository' | 'unreadable' | 'git-missing' | 'empty';

export function WorkStatusStage({ state, title, body, action }: { state: WorkStatusStageState; title: string; body?: string; action?: ReactNode }) {
  return (
    <FeatureStage
      data-testid="work-status-stage"
      data-work-status-state={state}
      art={motionState => <TracksArtwork {...motionState} />}
      title={title}
      body={body}
      action={action}
    />
  );
}
