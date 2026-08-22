'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAppUpdate } from './use-app-update';
import type { UpdatePhase } from './update-state';

/**
 * Keeps **exactly one** app-update state machine for the whole app.
 *
 * ## Why it became necessary (2026-08-20)
 *
 * Only the toast inside `AppShell` used this hook. Then settings gained a "check for updates" button,
 * making two consumers, and each calling `useAppUpdate()` gives **two state machines** — settings
 * showing "a new version exists" while the toast says nothing, or the once-a-day automatic check
 * timer running twice.
 *
 * The same rule this repository set for values: **never hold one concept's value in two places and
 * treat both as correct** (`.claude/rules/forbidden.md`).
 *
 * ## What happens where it is absent
 *
 * `null` comes back, and the consumer then **draws nothing** — not pretending an absent capability
 * exists is this repository's degradation rule, and on the web `useAppUpdate` does not check at all.
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
