'use client';

import { useCallback, useEffect, useState } from 'react';

import { isTerminalInstallStage, listenInstallProgress } from './acp-doctor';

/**
 * Counts tools whose install finished while the person was elsewhere, so the rail badge can
 * ask them to come back. Terminal states only: a per-second number in a rail badge flickers.
 * The badge disappears on reaching the destination, like `gitDirtyCount`.
 */
export function useInstallNotice(atDestination: boolean): {
  count: number;
  clear: () => void;
} {
  const [seenIds, setSeenIds] = useState<string[]>([]);

  const clear = useCallback(() => setSeenIds([]), []);

  useEffect(() => {
    let alive = true;
    let stop: (() => void) | null = null;
    void listenInstallProgress(null, (progress) => {
      if (!alive || !isTerminalInstallStage(progress.stage)) return;
      setSeenIds((current) =>
  // Counts tools with something to look at, not events.
        current.includes(progress.runtimeId) ? current : [...current, progress.runtimeId],
      );
    }).then((unlisten) => {
      if (alive) stop = unlisten;
      else unlisten();
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []);

  /*
   * At the destination the count is not drawn rather than cleared: clearing state inside an
   * effect costs another render, and the lint ratchet blocks that shape.
   */
  return { count: atDestination ? 0 : seenIds.length, clear };
}
