import { useEffect, useState } from 'react';
import { readWorkStatus, readWorkStatusFingerprint, type WorkStatusSnapshot } from '@/shared/lib/work-status/tauri-work-status';

/** How often the visible screen stats Git's worktree records; a change shows within one interval plus one read. */
export const WATCH_INTERVAL_MS = 1000;

export interface WorkStatusRead {
  snapshot: WorkStatusSnapshot | null;
  failed: boolean;
  /** When the shown snapshot was read, for relative times on the rows. */
  readAtMs: number;
}

/**
 * Reads the repository once, then watches `.git/worktrees` while the screen is visible: a cheap
 * stat digest each interval, and a full read only when it changed. A hidden screen asks nothing.
 */
export function useWorkStatus(repositoryPath: string | null): WorkStatusRead {
  const [read, setRead] = useState<WorkStatusRead & { path: string | null }>({ path: null, snapshot: null, failed: false, readAtMs: 0 });

  useEffect(() => {
    if (!repositoryPath) return;
    let cancelled = false;
    let fingerprint: string | null = null;
    let watchRoot = repositoryPath;
    let busy = false;
    let timer: number | undefined;

    const fingerprintOf = (root: string) => readWorkStatusFingerprint(root).catch(() => null);

    /** The digest is taken before the read, so a change during the read shows on the next tick. */
    const load = async () => {
      let digest = await fingerprintOf(watchRoot);
      try {
        const snapshot = await readWorkStatus(repositoryPath);
        if (cancelled) return;
        if (snapshot?.root && snapshot.root !== watchRoot) {
          watchRoot = snapshot.root;
          digest = await fingerprintOf(watchRoot);
        }
        fingerprint = digest;
        setRead({ path: repositoryPath, snapshot, failed: false, readAtMs: Date.now() });
      } catch {
        if (!cancelled) setRead({ path: repositoryPath, snapshot: null, failed: true, readAtMs: Date.now() });
      }
    };

    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const next = await fingerprintOf(watchRoot);
        if (!cancelled && next !== fingerprint) await load();
      } finally {
        busy = false;
      }
    };

    const schedule = () => {
      window.clearInterval(timer);
      timer = document.visibilityState === 'visible' ? window.setInterval(() => void tick(), WATCH_INTERVAL_MS) : undefined;
    };

    /** A session can end while the screen is hidden; coming back reads everything once. */
    const reappear = async () => {
      schedule();
      if (timer === undefined || busy) return;
      busy = true;
      try {
        await load();
      } finally {
        busy = false;
      }
    };

    busy = true;
    void load().finally(() => {
      busy = false;
      if (!cancelled) schedule();
    });
    const onVisibility = () => void reappear();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [repositoryPath]);

  return read.path === repositoryPath ? read : { snapshot: null, failed: false, readAtMs: 0 };
}
