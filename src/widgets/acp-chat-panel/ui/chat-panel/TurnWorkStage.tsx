'use client';

import { useEffect, useState } from 'react';

import { useRowDisclosure } from '@/shared/lib/list-rows/use-row-disclosure';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { MOTION } from '@/shared/motion';
import { WorkProgress } from '@/shared/motion/work-progress';
import { BrandWaitingMark, type WorkMotion } from '@/shared/ui/marks/brand-waiting-mark';

import type { TurnActivity, TurnActivityKind } from '../turn-activity';
import { workingShimmer } from '../working-ink';
import type { ChatT, SessionState } from './types';

/** The clip Moru acts beside each observed kind of work; the answer is typed, like a command. */
const CLIP: Readonly<Record<TurnActivityKind, WorkMotion>> = {
  thinking: 'think',
  reading: 'read',
  searching: 'search',
  writing: 'write',
  running: 'code',
  answering: 'code',
};

/** The finishing dance (`.atlas-moru-greeting`, six expressive beats) and one beat of rest. */
export const TURN_DONE_HOLD_MS = Math.round(MOTION.expressive.duration * 1_000) * 7;

export interface TurnWork {
  /** The request this work answers; a new one starts a new stage. */
  turnId: string;
  phase: 'working' | 'done';
  activity: TurnActivity;
  plan: SessionState['reportedPlan'];
}

const sameWork = (a: TurnWork, b: TurnWork) =>
  a.turnId === b.turnId
  && a.phase === b.phase
  && a.activity.kind === b.activity.kind
  && a.activity.label?.kind === b.activity.label?.kind
  && a.activity.label?.text === b.activity.label?.text
  && a.activity.target === b.activity.target
  && a.activity.steps === b.activity.steps
  && a.plan?.done === b.plan?.done
  && a.plan?.total === b.plan?.total;

/**
 * The current turn's work, on screen from the send on: Moru acts the kind of work the turn
 * reports, the line under it names the open call, and the bar is the plan the agent reported or,
 * without one, a sweep that claims no fraction. A finished turn gets one dance, then the stage
 * folds away so the answer stays the last thing in the conversation.
 */
export function TurnWorkStage({ t, work }: { t: ChatT; work: TurnWork | null }) {
  // The last work stays drawn while the stage folds away after a stop or a finish.
  const [shown, setShown] = useState(work);
  if (work && (!shown || !sameWork(work, shown))) setShown(work);
  const [dancedTurnId, setDancedTurnId] = useState<string | null>(null);
  const doneTurnId = work?.phase === 'done' ? work.turnId : null;

  useEffect(() => {
    if (doneTurnId === null) return undefined;
    const timer = window.setTimeout(() => setDancedTurnId(doneTurnId), TURN_DONE_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [doneTurnId]);

  useEffect(() => {
    // A clip's row first loads when its kind of work first appears; warm them so a swap is not blank.
    for (const clip of [...new Set(Object.values(CLIP)), 'success']) {
      new Image().src = withBasePath(`/brand/mascot-${clip}-row-128.png`);
    }
  }, []);

  const open = work !== null && !(doneTurnId !== null && dancedTurnId === doneTurnId);
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  if (!mounted || !shown) return null;

  const { phase, activity, plan } = shown;
  const done = phase === 'done';
  const clip = done ? 'success' : CLIP[activity.kind];
  const label = activity.label;
  const headline = done
    ? t('work.done')
    : label && label.text
      ? label.kind === 'known'
        ? t(`tool.${label.text}`)
        : label.kind === 'kind'
          ? t(`toolKind.${label.text}`)
          : label.text
      : t(activity.kind === 'answering' ? 'work.answering' : 'work.thinking');
  const counts = [
    plan ? t('work.plan', { done: plan.done, total: plan.total }) : null,
    activity.steps > 0 ? t('work.steps', { count: activity.steps }) : null,
  ].filter((part) => part !== null);

  return (
    <div
      ref={boxRef}
      role="group"
      aria-label={t('work.progressLabel')}
      data-testid="acp-turn-work"
      data-state={open ? 'open' : 'closed'}
      data-work-phase={phase}
      data-work-kind={activity.kind}
      className="ai-row-disclosure shrink-0"
      inert={!open}
    >
      <div ref={contentRef} className="ai-row-disclosure-body">
        <div className="mx-auto grid w-full max-w-[18rem] justify-items-center gap-1 pb-3 text-center">
          <BrandWaitingMark key={clip} active scale={2} motion={clip} />
          <span
            data-testid="acp-turn-work-now"
            className={`mt-1 max-w-full truncate text-body text-[color:var(--color-text-primary)] ${done ? '' : workingShimmer(true)}`}
          >
            {headline}
          </span>
          <span
            data-testid="acp-turn-work-detail"
            className="h-[var(--leading-caption)] max-w-full truncate text-caption leading-caption text-[color:var(--color-text-tertiary)]"
          >
            {done ? null : activity.target}
          </span>
          <div className="mt-1 w-full">
            <WorkProgress
              phase={done ? 'done' : 'running'}
              done={plan?.done ?? 0}
              total={plan?.total ?? null}
              label={t('work.progressLabel')}
            />
          </div>
          <span
            data-testid="acp-turn-work-count"
            className="h-[var(--leading-label)] text-label leading-label tabular-nums text-[color:var(--color-text-tertiary)]"
          >
            {counts.join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
}
