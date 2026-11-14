'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { FileText, FolderCode, ListChecks, OctagonMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { MOTION, STAGGER } from '@/shared/motion';
import { FeatureStage, FeatureStagePulse, type FeatureStageMotion } from '@/shared/ui';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

const GUARD_YS = [76, 160, 244];
const GUARD_ICONS = [FileText, OctagonMinus, ListChecks];
const TRUNK = 'M104 160H140';

/** One repository and the three steps of the agent's loop the Setup page lists: read, stopped, checked. */
function HarnessGuardArtwork({ arriving, engaged, reduced, labels }: FeatureStageMotion & { labels: string[] }) {
  const beat = MOTION.slow.duration;
  return <div className="relative aspect-square" data-harness-artwork>
    <svg viewBox="0 0 320 320" className="absolute inset-0 h-full w-full text-[color:var(--color-indigo-line-a32)]" fill="none">
      <motion.path d={`${TRUNK}M122 ${GUARD_YS[0]}H140M122 ${GUARD_YS[2]}H140M122 ${GUARD_YS[0]}V${GUARD_YS[2]}`} stroke="currentColor" strokeWidth="2"
        initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={reduced ? MOTION.fast : MOTION.choreography} />
      <FeatureStagePulse d={TRUNK} delay={MOTION.choreography.duration} engaged={engaged} reduced={reduced} />
    </svg>
    <div className="absolute inset-y-0 left-0 flex w-[32.5%] items-center">
      <div className="w-full rounded-card border border-[color:var(--color-indigo-line-a32)] bg-[color:var(--color-panel)] bg-[linear-gradient(180deg,var(--color-overlay-2),transparent_60%)] px-3 py-4 text-left shadow-[var(--shadow-elevation-1)]">
        <FolderCode size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-accent)]" />
        <code className="mt-3 block text-label text-[color:var(--color-text-secondary)]">AGENTS.md</code>
      </div>
    </div>
    <div className="absolute inset-y-6 right-0 left-[43.75%] flex flex-col justify-around gap-4 text-left">
      {labels.map((label, index) => {
        const Icon = GUARD_ICONS[index];
        return <motion.div key={label}
          initial={reduced ? false : { opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={reduced ? MOTION.fast : arriving ? { ...MOTION.expressive, delay: beat * (index + 1) + STAGGER } : MOTION.settle}
          className="flex items-center gap-3 rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] bg-[linear-gradient(180deg,var(--color-overlay-2),transparent_60%)] px-4 py-5 shadow-[var(--shadow-elevation-1)]">
          <Icon size={ICON_SIZE.lg} className="text-[color:var(--color-indigo-accent)]" />
          <span className="text-body-lg font-[var(--font-weight-strong)]">{label}</span>
        </motion.div>;
      })}
    </div>
  </div>;
}

/** The Harness tab when no harness can be read: what the tab shows, why it is empty here, and the one way to fill it. */
export function HarnessUnreadStage({ state, title, body, action, note }: {
  state: 'browser' | 'no-source';
  title: string;
  body: string;
  action: ReactNode;
  note?: string;
}) {
  const t = useTranslations('harness');
  const labels = [t('sections.context.title'), t('sections.guardrails.title'), t('sections.verification.title')];
  return <FeatureStage
    data-testid="harness-unread-stage"
    data-harness-unread={state}
    art={motionState => <HarnessGuardArtwork {...motionState} labels={labels} />}
    title={title}
    body={body}
    action={action}
    note={note}
  />;
}
