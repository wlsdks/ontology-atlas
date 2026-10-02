"use client";

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { withBasePath } from '@/shared/lib/base-path';
import type { AgentActivityFeed } from '../model/use-agent-activity-feed';
import {
  isVerifiedMascotCompletion,
  isVerifiedMascotRead,
  type AgentMascotState,
} from '../model/mascot-state';

const ROW_SOURCE: Readonly<Record<Exclude<AgentMascotState, 'hidden'>, string>> = {
  walk: '/brand/mascot-walk-row.png',
  read: '/brand/mascot-read-row.png',
  success: '/brand/mascot-success-row.png',
};

/** The terminal pose remains long enough to be read after its finite frame cycle. */
export const MASCOT_SUCCESS_HOLD_MS = 1_200;
export const MASCOT_WALK_MS = 600;

/**
 * One truthful, finite mascot journey. It appears only for a verified read-like
 * Atlas operation, walks into the workbench edge, holds READ, and may resolve to
 * SUCCESS only when that same observed sequence receives a terminal completion.
 * There is no idle loop and no inferred work state.
 */
export function AgentMascotPresence({ feed }: { feed: Pick<AgentActivityFeed, 'showStatus' | 'work'> }) {
  const t = useTranslations('agentActivity.mascot');
  const [state, setState] = useState<AgentMascotState>('hidden');
  const [traveling, setTraveling] = useState(false);
  const readSequenceRef = useRef(false);
  const handledCompletionRef = useRef<number | null>(null);
  const walkTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (walkTimerRef.current !== null) window.clearTimeout(walkTimerRef.current);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    },
    [],
  );

  /* The effect is an adapter from an external, polled heartbeat projection into
     a finite visual state machine. Rendering derived state alone cannot preserve
     the WALK hold or the one-time SUCCESS receipt across feed snapshots. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!feed.showStatus) {
      if (walkTimerRef.current !== null) window.clearTimeout(walkTimerRef.current);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
      walkTimerRef.current = null;
      successTimerRef.current = null;
      readSequenceRef.current = false;
      setTraveling(false);
      setState('hidden');
      return;
    }

    if (isVerifiedMascotRead(feed.work)) {
      if (!readSequenceRef.current) {
        if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
        readSequenceRef.current = true;
        setTraveling(true);
        setState('walk');
        walkTimerRef.current = window.setTimeout(() => {
          walkTimerRef.current = null;
          setTraveling(false);
          setState((current) => (current === 'walk' ? 'read' : current));
        }, MASCOT_WALK_MS);
      }
      return;
    }

    if (
      readSequenceRef.current &&
      isVerifiedMascotCompletion(feed.work) &&
      handledCompletionRef.current !== feed.work.updatedAt
    ) {
      handledCompletionRef.current = feed.work.updatedAt;
      readSequenceRef.current = false;
      // Completion may arrive while WALK still owns the travel path. Preserve the
      // in-flight wrapper animation and swap only the truthful pose/status; the
      // walk timer is conditional above, so it cannot regress SUCCESS to READ.
      if (walkTimerRef.current === null) setTraveling(false);
      setState('success');
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
      successTimerRef.current = window.setTimeout(() => {
        successTimerRef.current = null;
        setState('hidden');
      }, MASCOT_SUCCESS_HOLD_MS);
      return;
    }

    if (feed.work.mode === 'idle' || feed.work.mode === 'recent-write') {
      if (walkTimerRef.current !== null) window.clearTimeout(walkTimerRef.current);
      walkTimerRef.current = null;
      setTraveling(false);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
      readSequenceRef.current = false;
      setState('hidden');
    } else if (feed.work.mode === 'live') {
      // A live phase without a verified read tool must not inherit the previous pose.
      if (walkTimerRef.current !== null) window.clearTimeout(walkTimerRef.current);
      walkTimerRef.current = null;
      setTraveling(false);
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
      readSequenceRef.current = false;
      setState('hidden');
    }
  }, [feed.showStatus, feed.work]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (state === 'hidden') return null;

  const label = state === 'walk' ? t('detected') : state === 'read' ? t('reading') : t('success');

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-testid="agent-mascot-presence"
      data-state={state}
      data-traveling={traveling ? 'true' : undefined}
      className="atlas-mascot-presence pointer-events-none relative size-8 shrink-0 overflow-hidden"
    >
      <div
        key={state}
        aria-hidden="true"
        className="atlas-mascot-sprite size-16 origin-top-left scale-50"
        data-mascot-state={state}
        style={{ backgroundImage: `url(${withBasePath(ROW_SOURCE[state])})` }}
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
