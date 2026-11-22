import { useEffect, useRef, useState } from 'react';
import { readActivityStamps, readWorktreeActivity, type WorktreeActivity } from '@/shared/lib/work-status/tauri-work-status';

/** How often the visible screen stats each worktree's `HEAD`, `index` and reflog. */
export const STAMP_INTERVAL_MS = 1000;
/** A worktree is read at most this often, however often its stamp moves. */
export const ACTIVITY_MIN_GAP_MS = 10_000;
/**
 * A worktree an agent works in is read this often even when nothing was staged, so an edit shows
 * within it. Beats share about four reads a minute across every running worktree: a read costs
 * about 150 ms of `git` CPU on a repository of 8,000 files, mostly `git status`.
 */
export const ACTIVITY_BEAT_MS = 15_000;

/** The beat for one worktree when this many are running: 15 s alone, 90 s for six. */
export function beatFor(runningCount: number): number {
  return ACTIVITY_BEAT_MS * Math.max(1, runningCount);
}

interface Visit {
  atMs: number;
  stamp: string | null;
}

/** Whether a worktree's activity is due: never read, its stamp moved, or its beat came, and not read in the last ten seconds. */
export function activityDue(visit: Visit | undefined, stamp: string | undefined, beatMs: number | null, nowMs: number): boolean {
  if (!visit) return true;
  if (nowMs - visit.atMs < ACTIVITY_MIN_GAP_MS) return false;
  return (stamp !== undefined && stamp !== visit.stamp) || (beatMs !== null && nowMs - visit.atMs >= beatMs);
}

/**
 * Each shown worktree's newest commit subjects and uncommitted files. While the screen is visible
 * it stats the worktrees once a second and reads, one worktree at a time and in the order given,
 * those whose `HEAD` or index moved or whose beat came. A worktree nobody works in costs nothing
 * after its first read; a hidden screen asks nothing.
 */
export function useWorktreeActivity(
  root: string | null,
  baseBranch: string | null,
  /** The worktrees shown as rooms, the stage first. */
  keys: readonly string[],
  running: ReadonlySet<string>,
): ReadonlyMap<string, WorktreeActivity> {
  const [state, setState] = useState<{ root: string | null; activity: ReadonlyMap<string, WorktreeActivity> }>({ root: null, activity: new Map() });
  const wanted = useRef({ keys, running, baseBranch });
  useEffect(() => {
    wanted.current = { keys, running, baseBranch };
  }, [keys, running, baseBranch]);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    let busy = false;
    let timer: number | undefined;
    const visits = new Map<string, Visit>();
    const visible = () => document.visibilityState === 'visible';

    const tick = async () => {
      if (busy || !visible()) return;
      busy = true;
      try {
        const stamps = await readActivityStamps(root).catch(() => null);
        for (;;) {
          if (cancelled || !visible()) return;
          const { keys: order, running: live, baseBranch: base } = wanted.current;
          const nowMs = Date.now();
          const beatMs = beatFor(live.size);
          const key = order.find(candidate => activityDue(visits.get(candidate), stamps?.[candidate], live.has(candidate) ? beatMs : null, nowMs));
          if (key === undefined) return;
          visits.set(key, { atMs: nowMs, stamp: stamps?.[key] ?? null });
          const read = await readWorktreeActivity(root, key, base).catch(() => null);
          if (cancelled) return;
          if (read) {
            visits.set(key, { atMs: nowMs, stamp: read.stamp });
            setState(current => {
              const activity = new Map(current.root === root ? current.activity : []);
              activity.set(key, read);
              return { root, activity };
            });
          }
        }
      } finally {
        busy = false;
      }
    };

    const schedule = () => {
      window.clearInterval(timer);
      timer = visible() ? window.setInterval(() => void tick(), STAMP_INTERVAL_MS) : undefined;
      if (timer !== undefined) void tick();
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', schedule);
    };
  }, [root]);

  return state.root === root ? state.activity : EMPTY;
}

const EMPTY: ReadonlyMap<string, WorktreeActivity> = new Map();
