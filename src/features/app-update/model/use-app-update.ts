'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import {
  DISMISSED_VERSION_KEY,
  LAST_CHECK_KEY,
  shouldCheckForUpdate,
  shouldSurfaceVersion,
  type UpdatePhase,
} from './update-state';

/**
 * The updater's runtime wiring.
 *
 * Every judgement is made by the pure functions in `update-state.ts`; this only connects them to the
 * Tauri plugin and `localStorage` — policy mixed with side effects makes "when does it speak up"
 * untestable.
 *
 * The plugin is brought in by **dynamic import**. This app ships one static export for both web and
 * desktop, so a desktop-only module must not enter the web bundle.
 */
export function useAppUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: 'idle' });
  // Install once only. Pressing the button twice would download twice.
  const installing = useRef(false);

  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Where access is blocked (private mode and the like) it is treated as "no memory" — failing to
      // remember is better than failing to update.
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* Even if it cannot be remembered, the update itself continues. */
    }
  };

  const check = useCallback(async (manual = false) => {
    if (
      !shouldCheckForUpdate({
        isDesktop: isDesktopShell(),
        now: Date.now(),
        lastCheckedAt: Number(read(LAST_CHECK_KEY)) || null,
        manual,
      })
    ) {
      return;
    }

    /*
     * ⚠️ **An automatic check speaks only for "a new version exists"** (corrected by measurement,
     * 2026-08-20). In every other case it **does not touch the state at all.**
     *
     * The automatic path used to use `checking` and `idle` too. So when a scheduled automatic check
     * fired right after the user pressed "check for updates", it **silently erased** the answer they
     * had just received — a screen where pressing something makes it appear and then vanish without a word.
     *
     * And it happened **only on failure**: on success `LAST_CHECK_KEY` is written and the automatic
     * check skips on the interval, while a failure does not write it and the automatic check runs
     * anyway. This repository's endpoint has no final release today and so **always fails** — meaning
     * this defect was the default path, not an edge case.
     *
     * It was also the original intent. As the toast's own documentation records: *"the `checking`
     * stage is not drawn … it speaks first when the result is 'a new version exists'."* The code was
     * not keeping that promise.
     */
    if (manual) setPhase({ kind: 'checking' });
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      write(LAST_CHECK_KEY, String(Date.now()));

      if (!update) {
        if (manual) setPhase({ kind: 'current' });
        return;
      }
      if (!manual && !shouldSurfaceVersion(update.version, read(DISMISSED_VERSION_KEY))) {
        // A version already dismissed. Move on quietly, but **leave the screen alone.**
        return;
      }
      setPhase({ kind: 'available', version: update.version, notes: update.body ?? null });
    } catch (error) {
      // An automatic check's failure passes quietly — there is no reason to speak to the user because
      // the network is down. Failure is reported only when the user pressed it themselves.
      // **"Quietly" is not "erase"** — that confusion was the defect described above.
      if (manual) {
        setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      }
    }
  }, []);

  const install = useCallback(async () => {
    if (installing.current) return;
    installing.current = true;
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      if (!update) {
        setPhase({ kind: 'idle' });
        return;
      }

      let received = 0;
      let total: number | null = null;
      setPhase({ kind: 'downloading', version: update.version, received, total });

      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null;
        } else if (event.event === 'Progress') {
          received += event.data.chunkLength;
          setPhase({ kind: 'downloading', version: update.version, received, total });
        }
      });

      setPhase({ kind: 'ready', version: update.version });
    } catch (error) {
      setPhase({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      installing.current = false;
    }
  }, []);

  const restart = useCallback(async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }, []);

  const dismiss = useCallback(() => {
    setPhase((current) => {
      // A dismissal is remembered for that version only. The next version must ask again.
      if (current.kind === 'available') write(DISMISSED_VERSION_KEY, current.version);
      return { kind: 'idle' };
    });
  }, []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    // It checks a beat later rather than immediately on entry, so it does not compete with the first
    // screen appearing. An update has never been urgent.
    const timer = window.setTimeout(() => void check(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [check]);

  return { phase, check, install, restart, dismiss };
}
