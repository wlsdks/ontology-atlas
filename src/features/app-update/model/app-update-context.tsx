'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAppUpdate } from './use-app-update';
import type { UpdatePhase } from './update-state';

/**
 * Exactly one update state machine for the app, or settings and the toast disagree and the
 * daily timer runs twice (one value, one place: .claude/rules/forbidden.md). Absent (the web), consumers get `null` and draw nothing.
 */
export interface AppUpdateValue {
  readonly phase: UpdatePhase;
  /** The user pressed it themselves — check now, ignoring the once-a-day interval. */
  readonly checkNow: () => void;
  readonly install: () => void;
  readonly restart: () => void;
  readonly dismiss: () => void;
}

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { phase, check, install, restart, dismiss } = useAppUpdate();
  const value = useMemo<AppUpdateValue>(
    () => ({
      phase,
      checkNow: () => void check(true),
      install: () => void install(),
      restart: () => void restart(),
      dismiss,
    }),
    [phase, check, install, restart, dismiss],
  );
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

/** `null` when absent. The consumer then draws nothing. */
export function useAppUpdateContext(): AppUpdateValue | null {
  return useContext(AppUpdateContext);
}
