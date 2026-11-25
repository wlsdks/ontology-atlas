import { useEffect, useState } from 'react';
import { PULSE_RECENT_MS } from '@/shared/lib/work-status/signals/pulse';
import type { WorktreePulse } from '@/shared/lib/work-status/tauri-work-status';

/** The newest counted change in any room, in milliseconds; 0 with none. O(rooms). */
export function newestChangeOf(worktrees: ReadonlyMap<string, WorktreePulse>): number {
  let newest = 0;
  for (const pulse of worktrees.values()) newest = Math.max(newest, pulse.lastChangeAtMs ?? 0);
  return newest;
}

/**
 * The clock the pulse's "just now" and "last minute" are said against: the minute clock, moved up to
 * the newest counted change when one arrives, and once more when that change stops being under a
 * minute old. Nothing re-renders between those moments.
 */
export function usePulseClock(worktrees: ReadonlyMap<string, WorktreePulse>, nowMs: number): number {
  const newest = newestChangeOf(worktrees);
  const [expiredAtMs, setExpiredAtMs] = useState(0);
  useEffect(() => {
    if (newest === 0) return;
    const untilOldMs = newest + PULSE_RECENT_MS - Date.now();
    if (untilOldMs <= 0) return;
    const timer = window.setTimeout(() => setExpiredAtMs(Date.now()), untilOldMs);
    return () => window.clearTimeout(timer);
  }, [newest]);
  return Math.max(nowMs, newest, expiredAtMs);
}
