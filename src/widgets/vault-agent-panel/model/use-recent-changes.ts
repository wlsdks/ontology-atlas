import { useEffect, type Dispatch, type SetStateAction } from 'react';

import { gitHistory } from '@/shared/lib/git/tauri-git';

/**
 * Continuity between sessions: this folder's recent commit subjects, so a new conversation inherits
 * past work without storing the conversation. Read only when the panel opens and when an apply
 * finishes (`appliedTally` changes); no background polling.
 */
export function useRecentChanges({
  open,
  vaultPath,
  appliedTally,
  setRecentChanges,
}: {
  open: boolean;
  vaultPath: string | null;
  appliedTally: number;
  setRecentChanges: Dispatch<SetStateAction<readonly string[]>>;
}) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A state that cannot be read (closed, no folder, not git) is **empty history**,
      // not an error. That block simply drops out of the context.
      if (!open || !vaultPath) {
        if (!cancelled) setRecentChanges((current) => (current.length === 0 ? current : []));
        return;
      }
      try {
        const commits = await gitHistory(vaultPath, 5);
        if (cancelled) return;
        setRecentChanges(
          (commits ?? []).map((commit) => `${commit.subject} (${commit.relativeTime})`),
        );
      } catch {
        // Unreadable history does not fail the conversation either: it goes on without that row.
        if (!cancelled) setRecentChanges([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vaultPath, appliedTally, setRecentChanges]);
}
