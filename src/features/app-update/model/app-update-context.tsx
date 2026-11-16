'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAppUpdate } from './use-app-update';
import type { UpdatePhase } from './update-state';

/**
 * Exactly one update state machine for the app, or settings and the notice disagree and the
 * periodic timer runs twice. Absent (the web), consumers get `null` and draw nothing.
 */
export interface AppUpdateValue {
  readonly phase: UpdatePhase;
  /** The download card was hidden; the phase is still `downloading`. */
  readonly noticeHidden: boolean;
  /** A version a check found available or installed, until a check says current. */
  readonly pendingVersion: string | null;
  /** Installed in this session and waiting for a restart. */
  readonly readyVersion: string | null;
  /** The user pressed it themselves — check now, ignoring the interval. */
  readonly checkNow: () => void;
  readonly install: () => void;
  readonly restart: () => void;
  readonly dismiss: () => void;
  readonly hide: () => void;
}

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { phase, noticeHidden, pendingVersion, readyVersion, check, install, restart, dismiss, hide } =
    useAppUpdate();
  const value = useMemo<AppUpdateValue>(
    () => ({
      phase,
      noticeHidden,
      pendingVersion,
      readyVersion,
      checkNow: () => void check(true),
      install: () => void install(),
      restart: () => void restart(),
      dismiss,
      hide,
    }),
    [phase, noticeHidden, pendingVersion, readyVersion, check, install, restart, dismiss, hide],
  );
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

/** `null` when absent. The consumer then draws nothing. */
export function useAppUpdateContext(): AppUpdateValue | null {
  return useContext(AppUpdateContext);
}
