'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { isDesktopShell } from '@/shared/lib/desktop-shell/desktop-shell';
import {
  AUTO_CHECK_TICK_MS,
  CHECK_TIMEOUT_MS,
  DISMISSED_AT_KEY,
  DISMISSED_VERSION_KEY,
  LAST_CHECK_KEY,
  feedServesPlatform,
  phaseAfterCheck,
  phaseAfterFailedCheck,
  readUpdateAutoCheck,
  shouldCheckForUpdate,
  type UpdatePhase,
} from './update-state';

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
    /* Even if it cannot be remembered, the update itself continues; memory below still holds it. */
  }
}

export interface UpdateSessionState {
  readonly phase: UpdatePhase;
  readonly noticeHidden: boolean;
  readonly pendingVersion: string | null;
  readonly readyVersion: string | null;
  readonly lastCheckedAt: number | null;
  readonly dismissedVersion: string | null;
  readonly dismissedAt: number | null;
}

const SERVER_STATE: UpdateSessionState = {
  phase: { kind: 'idle' },
  noticeHidden: false,
  pendingVersion: null,
  readyVersion: null,
  lastCheckedAt: null,
  dismissedVersion: null,
  dismissedAt: null,
};

/*
 * The update state lives for the process, not for a mount: the provider remounts when the locale
 * changes, and a version installed or downloading in this session must survive that.
 */
let session: UpdateSessionState | null = null;
const listeners = new Set<() => void>();
let lastAttemptAt: number | null = null;
let consecutiveFailures = 0;
let checkInFlight: Promise<void> | null = null;
let manualCheckPending = false;
let installing = false;

function readSession(): UpdateSessionState {
  if (!session) {
    const last = Number(readStored(LAST_CHECK_KEY));
    const dismissedAt = Number(readStored(DISMISSED_AT_KEY));
    session = {
      ...SERVER_STATE,
      lastCheckedAt: Number.isFinite(last) && last > 0 ? last : null,
      dismissedVersion: readStored(DISMISSED_VERSION_KEY) || null,
      dismissedAt: Number.isFinite(dismissedAt) && dismissedAt > 0 ? dismissedAt : null,
    };
  }
  return session;
}

function patchSession(patch: Partial<UpdateSessionState>): void {
  session = { ...readSession(), ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readPlatform(): string {
  return window.navigator.platform || window.navigator.userAgent;
}

async function fetchUpdate() {
  const { check } = await import('@tauri-apps/plugin-updater');
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The plugin's own timeout covers the network; the race also covers a bridge that never answers.
  const unanswered = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('update check timed out')), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([check({ timeout: CHECK_TIMEOUT_MS }), unanswered]);
  } finally {
    clearTimeout(timer);
  }
}

async function requestCheck(manual: boolean): Promise<void> {
  lastAttemptAt = Date.now();
  try {
    const update = await fetchUpdate();
    const now = Date.now();
    consecutiveFailures = 0;
    writeStored(LAST_CHECK_KEY, String(now));
    const state = readSession();
    const next = phaseAfterCheck({
      found: update ? { version: update.version, notes: update.body ?? null } : null,
      manual,
      phase: state.phase,
      readyVersion: state.readyVersion,
      dismissedVersion: state.dismissedVersion,
      dismissedAt: state.dismissedAt,
      now,
    });
    patchSession({
      lastCheckedAt: now,
      pendingVersion: update?.version ?? state.readyVersion,
      ...(next ? { phase: next } : {}),
    });
  } catch (error) {
    consecutiveFailures += 1;
    const next = phaseAfterFailedCheck({
      manual,
      readyVersion: readSession().readyVersion,
      message: error instanceof Error ? error.message : String(error),
    });
    if (next) patchSession({ phase: next });
  }
}

async function runCheck(manual: boolean): Promise<void> {
  const running = requestCheck(manual);
  checkInFlight = running;
  try {
    await running;
  } finally {
    if (checkInFlight === running) checkInFlight = null;
  }
}

async function checkForUpdates(manual = false): Promise<void> {
  const state = readSession();
  if (
    !shouldCheckForUpdate({
      isDesktop: isDesktopShell(),
      now: Date.now(),
      lastCheckedAt: state.lastCheckedAt,
      automatic: readUpdateAutoCheck() === 'on',
      manual,
      lastAttemptAt,
      consecutiveFailures,
      feedServesPlatform: feedServesPlatform(readPlatform()),
    })
  ) {
    return;
  }
  if (!manual) {
    if (!checkInFlight) await runCheck(false);
    return;
  }
  if (state.phase.kind === 'downloading' || installing) {
    // The version being downloaded is the answer; a press brings its card back.
    patchSession({ noticeHidden: false });
    return;
  }
  // One press at a time: a second press while one waits or runs queues nothing.
  if (manualCheckPending) return;
  manualCheckPending = true;
  patchSession({ phase: { kind: 'checking' } });
  try {
    while (checkInFlight) await checkInFlight;
    await runCheck(true);
  } finally {
    manualCheckPending = false;
  }
}

async function install(): Promise<void> {
  // Install once only. Pressing twice, or again after a remount, would download twice.
  if (installing) return;
  installing = true;
  patchSession({ noticeHidden: false });
  try {
    const update = await fetchUpdate();
    if (!update) {
      patchSession({ phase: { kind: 'idle' }, pendingVersion: readSession().readyVersion });
      return;
    }
    patchSession({ pendingVersion: update.version });
    if (update.version === readSession().readyVersion) {
      patchSession({ phase: { kind: 'ready', version: update.version } });
      return;
    }

    let received = 0;
    let total: number | null = null;
    patchSession({ phase: { kind: 'downloading', version: update.version, received, total } });

    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? null;
      } else if (event.event === 'Progress') {
        received += event.data.chunkLength;
        patchSession({ phase: { kind: 'downloading', version: update.version, received, total } });
      }
    });

    patchSession({ readyVersion: update.version, noticeHidden: false, phase: { kind: 'ready', version: update.version } });
  } catch (error) {
    patchSession({
      noticeHidden: false,
      phase: { kind: 'failed', operation: 'install', message: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    installing = false;
  }
}

async function restart(): Promise<void> {
  const { relaunch } = await import('@tauri-apps/plugin-process');
  await relaunch();
}

function dismiss(): void {
  const { phase } = readSession();
  if (phase.kind === 'downloading') {
    patchSession({ noticeHidden: true });
    return;
  }
  if (phase.kind === 'available') {
    const now = Date.now();
    writeStored(DISMISSED_VERSION_KEY, phase.version);
    writeStored(DISMISSED_AT_KEY, String(now));
    patchSession({ dismissedVersion: phase.version, dismissedAt: now, phase: { kind: 'idle' } });
    return;
  }
  patchSession({ phase: { kind: 'idle' } });
}

function hide(): void {
  patchSession({ noticeHidden: true });
}

function showNotice(): void {
  patchSession({ noticeHidden: false });
}

const readServerState = () => SERVER_STATE;

/** Every judgement is in `update-state.ts`. The plugin is dynamically imported so a desktop-only module stays out of the web bundle. Mount it once: its timers are the automatic checks. */
export function useAppUpdate() {
  const state = useSyncExternalStore(subscribe, readSession, readServerState);

  useEffect(() => {
    if (!isDesktopShell()) return;
    const evaluate = () => void checkForUpdates(false);
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
  }, []);

  return { ...state, check: checkForUpdates, install, restart, dismiss, hide, showNotice };
}

const readPendingVersion = () => readSession().pendingVersion;
const readReadyVersion = () => readSession().readyVersion;
const readNothing = () => null;

export function usePendingUpdate(): { pendingVersion: string | null; readyVersion: string | null } {
  return {
    pendingVersion: useSyncExternalStore(subscribe, readPendingVersion, readNothing),
    readyVersion: useSyncExternalStore(subscribe, readReadyVersion, readNothing),
  };
}
