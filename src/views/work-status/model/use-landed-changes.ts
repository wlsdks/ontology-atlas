import { useEffect, useState } from 'react';
import { readLandedChanges, type LandedChange } from '@/shared/lib/work-status/tauri-work-status';

/**
 * The base branch's newest landed changes. Read again whenever `readAtMs` moves (the page reread
 * the worktrees, so a merge may have landed) and once a minute through `nowMs`; one `git log`
 * each time. A failed read keeps what was shown.
 */
export function useLandedChanges(root: string | null, baseBranch: string | null, readAtMs: number | null, nowMs: number): LandedChange[] | null {
  const [state, setState] = useState<{ key: string; changes: LandedChange[] } | null>(null);
  const key = root && baseBranch ? `${root}\u0000${baseBranch}` : null;
  const minute = Math.floor(nowMs / 60_000);
  useEffect(() => {
    if (!root || !baseBranch || key === null) return;
    let live = true;
    void readLandedChanges(root, baseBranch).then(changes => {
      if (live && changes) setState({ key, changes });
    }).catch(() => {});
    return () => {
      live = false;
    };
  }, [root, baseBranch, key, readAtMs, minute]);
  return state && state.key === key ? state.changes : null;
}
