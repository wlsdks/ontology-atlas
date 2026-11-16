'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import {
  AUTO_CHECK_TICK_MS,
  DISMISSED_VERSION_KEY,
  LAST_CHECK_KEY,
  phaseAfterCheck,
  readUpdateAutoCheck,
  shouldCheckForUpdate,
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

const FIRST_CHECK_DELAY_MS = 4_000;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Blocked storage is treated as no memory: failing to remember beats failing to update.
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Even if it cannot be remembered, the update itself continues. */
  }
}

/**
 * The updater's runtime wiring; every judgement is in `update-state.ts`. The plugin is
 * dynamically imported so a desktop-only module stays out of the web bundle.
 */
export function useAppUpdate() {
  const [phase, setPhaseState] = useState<UpdatePhase>({ kind: 'idle' });
  const phaseRef = useRef(phase);
  const setPhase = useCallback((next: UpdatePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  /** The download card was hidden; the download runs on and the next phase speaks again. */
  const [noticeHidden, setNoticeHidden] = useState(false);
  /** The newest version a check found, kept after the notice is dismissed. */
  const [pendingVersion, setPendingVersion] = useState<string | null>(null);
  /** Installed in this session, waiting for a restart; never offered for download again. */
  const [readyVersion, setReadyVersionState] = useState<string | null>(null);
  const readyVersionRef = useRef<string | null>(null);
  const setReadyVersion = useCallback((version: string) => {
    readyVersionRef.current = version;
    setReadyVersionState(version);
  }, []);
  const checkInFlight = useRef<Promise<void> | null>(null);
  // Install once only. Pressing the button twice would download twice.
  const installing = useRef(false);

  const runCheck = useCallback(
    async (manual: boolean) => {
      if (manual) setPhase({ kind: 'checking' });
      try {
        const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
        const update = await checkForUpdate();
        writeStored(LAST_CHECK_KEY, String(Date.now()));
        setPendingVersion(update?.version ?? readyVersionRef.current);
        const next = phaseAfterCheck({
          found: update ? { version: update.version, notes: update.body ?? null } : null,
          manual,
          phase: phaseRef.current,
          readyVersion: readyVersionRef.current,
          dismissedVersion: readStored(DISMISSED_VERSION_KEY),
        });
        if (next) setPhase(next);
      } catch (error) {
        // An automatic check fails quietly and leaves the last-check time alone, so the next tick retries.
        if (manual) {
          setPhase({
            kind: 'failed',
            operation: 'check',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    },
    [setPhase],
  );

  const check = useCallback(
    async (manual = false) => {
      if (
        !shouldCheckForUpdate({
          isDesktop: isDesktopShell(),
          now: Date.now(),
          lastCheckedAt: Number(readStored(LAST_CHECK_KEY)) || null,
          automatic: readUpdateAutoCheck() === 'on',
          manual,
        })
      ) {
        return;
      }
      if (manual && phaseRef.current.kind === 'downloading') {
        // The version being downloaded is the answer; a press brings its card back.
        setNoticeHidden(false);
        return;
      }
      if (checkInFlight.current && !manual) return;
      // A press waits for the automatic request in flight; two never overlap.
      while (checkInFlight.current) await checkInFlight.current;
      const running = runCheck(manual);
      checkInFlight.current = running;
      try {
        await running;
      } finally {
        if (checkInFlight.current === running) checkInFlight.current = null;
      }
    },
    [runCheck],
  );

  const install = useCallback(async () => {
    if (installing.current) return;
    installing.current = true;
    setNoticeHidden(false);
    try {
      const { check: checkForUpdate } = await import('@tauri-apps/plugin-updater');
      const update = await checkForUpdate();
      if (!update) {
        setPhase({ kind: 'idle' });
        return;
      }
      setPendingVersion(update.version);
      if (update.version === readyVersionRef.current) {
        setPhase({ kind: 'ready', version: update.version });
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

      setReadyVersion(update.version);
      setNoticeHidden(false);
      setPhase({ kind: 'ready', version: update.version });
    } catch (error) {
      setNoticeHidden(false);
      setPhase({
        kind: 'failed',
        operation: 'install',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      installing.current = false;
    }
  }, [setPhase, setReadyVersion]);

  const restart = useCallback(async () => {
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  }, []);

  /** "Not now" or "Close": a dismissal is remembered for an offered version only. */
  const dismiss = useCallback(() => {
    const current = phaseRef.current;
    if (current.kind === 'downloading') {
      setNoticeHidden(true);
      return;
    }
    if (current.kind === 'available') writeStored(DISMISSED_VERSION_KEY, current.version);
    setPhase({ kind: 'idle' });
  }, [setPhase]);

  /** Hides the download card without dismissing the version; the ready card comes back. */
  const hide = useCallback(() => setNoticeHidden(true), []);

  useEffect(() => {
    if (!isDesktopShell()) return;
    const evaluate = () => void check(false);
    const evaluateWhenShown = () => {
      if (document.visibilityState === 'visible') evaluate();
    };
    // A beat after entry, so it does not compete with the first screen.
    const firstCheck = window.setTimeout(evaluate, FIRST_CHECK_DELAY_MS);
    const tick = window.setInterval(evaluate, AUTO_CHECK_TICK_MS);
    document.addEventListener('visibilitychange', evaluateWhenShown);
    window.addEventListener('focus', evaluate);
    return () => {
      window.clearTimeout(firstCheck);
      window.clearInterval(tick);
      document.removeEventListener('visibilitychange', evaluateWhenShown);
      window.removeEventListener('focus', evaluate);
    };
  }, [check]);

  return { phase, noticeHidden, pendingVersion, readyVersion, check, install, restart, dismiss, hide };
}
