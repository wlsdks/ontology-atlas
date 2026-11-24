import { useEffect, useState } from 'react';
import { readLandedChanges, type LandedRead, type WorktreeRow } from '@/shared/lib/work-status/tauri-work-status';

/**
 * What every worktree's head and standing are: the base branch moves only with them (a pull in its
 * checkout, a branch turning merged), so the landed list is read again only when this changes.
 */
export function landedReadKey(worktrees: readonly WorktreeRow[]): string {
  return worktrees.map(row => `${row.id}\u0000${row.head ?? ''}\u0000${row.standing}`).join('\u0001');
}

/**
 * The base branch's newest landed changes, read once per repository and again whenever `headsKey`
 * moves; one `git log` and one count each time. A failed read keeps what was shown.
 */
export function useLandedChanges(root: string | null, baseBranch: string | null, headsKey: string | null): LandedRead | null {
  const [state, setState] = useState<{ key: string; read: LandedRead } | null>(null);
  const key = root && baseBranch ? `${root}\u0000${baseBranch}` : null;
  useEffect(() => {
    if (!root || !baseBranch || key === null) return;
    let live = true;
    void readLandedChanges(root, baseBranch).then(read => {
      if (live && read) setState({ key, read });
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [root, baseBranch, key, headsKey]);
  return state && state.key === key ? state.read : null;
}
