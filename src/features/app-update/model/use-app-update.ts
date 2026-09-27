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

/** What the updater remembers here; an unreadable store answers "nothing remembered". */
export function readUpdateMemory(): { lastCheckedAt: number | null; dismissedVersion: string | null } {
  try {
    const last = Number(window.localStorage.getItem(LAST_CHECK_KEY));
    return {
      lastCheckedAt: Number.isFinite(last) && last > 0 ? last : null,
      dismissedVersion: window.localStorage.getItem(DISMISSED_VERSION_KEY) || null,
    };
  } catch {
    return { lastCheckedAt: null, dismissedVersion: null };
  }
}

/**
 * The updater's runtime wiring; every judgement is in `update-state.ts`. The plugin is
 * dynamically imported so a desktop-only module stays out of the web bundle.
 */
export function useAppUpdate() {
  const [phase, setPhase] = useState<UpdatePhase>({ kind: 'idle' });
  // Install once only. Pressing the button twice would download twice.
  const installing = useRef(false);

  const read = (key: string) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // Blocked storage is treated as no memory: failing to remember beats failing to update.
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

    /* An automatic check speaks only for "a new version exists" and otherwise leaves the state alone,
     * or it erases the answer to a manual check. */
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
      // An automatic check fails quietly; quietly never means erasing the state.
      if (manual) {
        setPhase({
          kind: 'failed',
          operation: 'check',
          message: error instanceof Error ? error.message : String(error),
        });
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
      setPhase({
        kind: 'failed',
        operation: 'install',
        message: error instanceof Error ? error.message : String(error),
      });
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
    // A beat after entry, so it does not compete with the first screen.
    const timer = window.setTimeout(() => void check(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [check]);

  return { phase, check, install, restart, dismiss };
}
