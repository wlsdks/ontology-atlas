import { useEffect, useState } from 'react';

import { turnLiveness } from '@/features/acp-session';
import { elapsedParts } from '@/shared/lib/elapsed';

import type { ChatT, SessionState } from './types';

export function useTurnClock({ clockPhase, t }: { clockPhase: 'awaiting' | 'thinking' | null; t: ChatT }) {
  const [turnClock, setTurnClock] = useState<{ startedAt: number; nowMs: number } | null>(null);
  useEffect(() => {

    if (!clockPhase) {
      const clear = window.setTimeout(() => setTurnClock(null), 0);
      return () => window.clearTimeout(clear);
    }
    const startedAt = Date.now();
    const tick = () => setTurnClock((current) => ({ startedAt: current?.startedAt ?? startedAt, nowMs: Date.now() }));
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [clockPhase]);
  const turnElapsedLabel = (() => {
    if (!clockPhase || !turnClock) return null;
    const { hours, minutes, seconds } = elapsedParts(turnClock.nowMs - turnClock.startedAt);
    if (hours > 0) return t('elapsedHours', { hours, minutes });
    if (minutes > 0) return t('elapsedMinutes', { minutes, seconds });
    return t('elapsedSeconds', { seconds });
  })();
  return { turnElapsedLabel };
}

export function useTurnSilence({
  busy,
  lastTurnUpdateAt,
  pending,
  status,
}: {
  busy: boolean;
  lastTurnUpdateAt: SessionState['lastTurnUpdateAt'];
  pending: SessionState['pending'];
  status: SessionState['status'];
}) {
  const [silence, setSilence] = useState<{ basis: number; minutes: number } | null>(null);
  useEffect(() => {
    if (!busy || lastTurnUpdateAt === null) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      setSilence(
        turnLiveness(status, lastTurnUpdateAt, now, pending !== null) === 'silent'
          ? {
              basis: lastTurnUpdateAt,
              minutes: Math.max(1, Math.floor((now - lastTurnUpdateAt) / 60_000)),
            }
          : null,
      );
    }, 5_000);
    return () => window.clearInterval(id);
  }, [busy, lastTurnUpdateAt, pending, status]);
  const turnSilent = busy && silence !== null && silence.basis === lastTurnUpdateAt;
  const silentMinutes = silence?.minutes ?? 0;
  return { turnSilent, silentMinutes };
}
