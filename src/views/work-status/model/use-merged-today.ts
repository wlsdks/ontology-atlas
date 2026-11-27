import { useEffect, useState } from 'react';
import { readMergedCount, type WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';

/**
 * What every worktree's head and standing are: the base branch moves only with them (a pull in its
 * checkout, a branch turning merged), so the count is read again only when this changes.
 */
export function mergedCountKey(worktrees: readonly WorktreeRow[]): string {
  return worktrees.map(row => `${row.id}\u0000${row.head ?? ''}\u0000${row.standing}`).join('\u0001');
}

/** The start of the reader's calendar day holding `nowMs`, in whole seconds. */
export function dayStartEpochS(nowMs: number): number {
  const date = new Date(nowMs);
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

/**
 * How many changes the base branch took in today, read again when `headsKey` moves or a new day
 * starts; one `git rev-list --count` each time. A failed read keeps what was shown.
 */
export function useMergedToday(root: string | null, baseBranch: string | null, headsKey: string | null, nowMs: number): number | null {
  const [state, setState] = useState<{ key: string; count: number } | null>(null);
  const sinceS = dayStartEpochS(nowMs);
  const key = root && baseBranch ? `${root}\u0000${baseBranch}\u0000${sinceS}` : null;
  useEffect(() => {
    if (!root || !baseBranch || key === null) return;
    let live = true;
    void readMergedCount(root, baseBranch, sinceS).then(count => {
      if (live && count !== null) setState({ key, count });
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [root, baseBranch, sinceS, key, headsKey]);
  return state && state.key === key ? state.count : null;
}
