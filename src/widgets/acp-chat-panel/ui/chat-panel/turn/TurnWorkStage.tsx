'use client';

import { useCallback, useEffect, useState } from 'react';

import { useRowDisclosure } from '@/shared/lib/list-rows/use-row-disclosure';
import { withBasePath } from '@/shared/lib/public-pages/base-path';
import { MOTION } from '@/shared/motion';
import { WorkTrail } from '@/shared/motion/work-trail';
import { BrandWaitingMark } from '@/shared/ui/marks/brand-waiting-mark';
import { CELEBRATION_MOTIONS, PLAY_ROW_FRAMES, WORK_ROW_FRAMES } from '@/shared/ui/marks/moru-rows';

import type { TurnActivity, TurnWrites } from '../../turn-activity';
import { workingShimmer } from '../../working-ink';
import { celebrationClip, stageClip } from './moru-playlist';
import type { ChatT, SessionState } from '../types';

const STAGE_ROWS = [...Object.keys(WORK_ROW_FRAMES), ...Object.keys(PLAY_ROW_FRAMES), ...CELEBRATION_MOTIONS];

/** A finishing gesture (`.atlas-moru-greeting`, 24 cells over six expressive beats) and one beat of rest. */
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
  && a.activity.written.concepts === b.activity.written.concepts
  && a.activity.written.relations === b.activity.written.relations
  && a.plan?.done === b.plan?.done
  && a.plan?.total === b.plan?.total;

function writtenLine(t: ChatT, { concepts, relations }: TurnWrites): string | null {
  if (concepts > 0 && relations > 0) return t('work.wrote.both', { concepts, relations });
  if (concepts > 0) return t('work.wrote.concepts', { concepts });
  if (relations > 0) return t('work.wrote.relations', { relations });
  return null;
}

/**
 * The current turn's work, on screen from the send on in a band above the composer, outside the
 * scrolling transcript, so arriving text never moves it. Moru acts the kind of work the turn
 * reports, the line under it names the open call, and the bar is the plan the agent reported or,
 * without one, a sweep that claims no fraction. A finished turn gets one celebration, then the
 * stage folds away so the answer stays the last thing in the conversation.
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

  const turnStarted = shown !== null;
  useEffect(() => {
    // A row first loads when its clip first plays; warm every row a turn can show so a swap is never blank.
    if (!turnStarted) return;
    for (const row of STAGE_ROWS) new Image().src = withBasePath(`/brand/mascot-${row}-row-128.png`);
  }, [turnStarted]);

  // Loops finished in the current kind of work; a new turn or kind starts its playlist over.
  const [loops, setLoops] = useState({ turnId: shown?.turnId, kind: shown?.activity.kind, count: 0 });
  if (shown && (loops.turnId !== shown.turnId || loops.kind !== shown.activity.kind)) {
    setLoops({ turnId: shown.turnId, kind: shown.activity.kind, count: 0 });
  }
  const loopTurnId = shown?.turnId;
  const loopKind = shown?.activity.kind;
  const countLoop = useCallback(() => {
    setLoops((current) => (current.turnId === loopTurnId && current.kind === loopKind ? { ...current, count: current.count + 1 } : current));
  }, [loopTurnId, loopKind]);

  const open = work !== null && !(doneTurnId !== null && dancedTurnId === doneTurnId);
  const { mounted, boxRef, contentRef } = useRowDisclosure(open);
  if (!mounted || !shown) return null;

  const { phase, activity, plan } = shown;
  const done = phase === 'done';
  const clip = done ? celebrationClip(shown.turnId) : stageClip(activity.kind, shown.turnId, loops.count);
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
  // What the turn wrote outranks how many calls it made; the line holds one of them beside the plan.
  const counts = [
    writtenLine(t, activity.written) ?? (activity.steps > 0 ? t('work.steps', { count: activity.steps }) : null),
    plan ? t('work.plan', { done: plan.done, total: plan.total }) : null,
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
      className="ai-row-disclosure -mt-3 shrink-0"
      inert={!open}
    >
      <div ref={contentRef} className="ai-row-disclosure-body">
        <div className="mx-auto grid w-full max-w-[18rem] justify-items-center gap-1 pt-3 text-center">
          <BrandWaitingMark key={clip} active scale={2} motion={clip} onLoopEnd={done ? undefined : countLoop} />
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
          <div className="mt-1 w-40 max-w-full">
            <WorkTrail
              phase={done ? 'done' : 'running'}
              done={plan?.done ?? 0}
              total={plan?.total ?? null}
              label={t('work.progressLabel')}
            />
          </div>
          <span
            data-testid="acp-turn-work-count"
            className="h-[var(--leading-label)] max-w-full truncate text-label leading-label tabular-nums text-[color:var(--color-text-secondary)]"
          >
            {counts.join(' · ')}
          </span>
        </div>
      </div>
    </div>
  );
}
