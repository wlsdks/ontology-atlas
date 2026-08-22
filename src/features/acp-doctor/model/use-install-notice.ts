'use client';

import { useCallback, useEffect, useState } from 'react';

import { isTerminalInstallStage, listenInstallProgress } from './acp-doctor';

/**
 * **When an install finishes while you are on another screen, the rail says so.**
 *
 * ## Why (2026-08-21, ledger 90, council prescription)
 *
 * A tool install takes minutes (Node 52MB, npm). There is no reason for a person to sit watching that
 * screen — they look at the map or read documents. But if they do not come back, they **never learn
 * it finished.** Storing "completion while closed" in Rust so the screen can revive it on reopening
 * helps only **someone who came back**.
 *
 * This hook takes the other side: **telling them to come back.**
 *
 * ## What it does not count
 *
 * **It does not count progress.** The council's prescription was "terminal states only" — a rail badge
 * is seen out of the corner of the eye, and a number changing every second there is not read, it
 * flickers. It stands only on `done` or `failed`.
 *
 * ## When it disappears
 *
 * **On reaching that screen.** The badge means "there is something you have not seen", and seeing it
 * removes that meaning. Same grammar as this repository's other record badge (`gitDirtyCount`).
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
  // The same tool finishing twice still gives one badge — what is counted is "tools with something to
  // look at", not the number of events.
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
   * At the destination there is nothing to count — what is being looked at cannot be called unseen.
   * Rather than clearing on arrival it **is not drawn**: clearing state inside an effect costs another
   * render, and this repository's lint ratchet blocks that shape.
   */
  return { count: atDestination ? 0 : seenIds.length, clear };
}
