'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useAppUpdate, type UpdateSessionState } from './use-app-update';

/**
 * Exactly one updater wiring for the app, or the periodic timers run twice. Absent (the web),
 * consumers get `null` and draw nothing.
 */
export interface AppUpdateValue extends Omit<UpdateSessionState, 'dismissedAt'> {
  readonly checkNow: () => void;
  readonly install: () => void;
  readonly restart: () => void;
  readonly dismiss: () => void;
  readonly hide: () => void;
  readonly showNotice: () => void;
}

const AppUpdateContext = createContext<AppUpdateValue | null>(null);

export function AppUpdateProvider({ children }: { children: ReactNode }) {
  const { check, install, restart, dismiss, hide, showNotice, ...state } = useAppUpdate();
  const { phase, noticeHidden, pendingVersion, readyVersion, lastCheckedAt, dismissedVersion } = state;
  const value = useMemo<AppUpdateValue>(
    () => ({
      phase,
      noticeHidden,
      pendingVersion,
      readyVersion,
      lastCheckedAt,
      dismissedVersion,
      checkNow: () => void check(true),
      install: () => void install(),
      restart: () => void restart(),
      dismiss,
      hide,
      showNotice,
    }),
    [phase, noticeHidden, pendingVersion, readyVersion, lastCheckedAt, dismissedVersion, check, install, restart, dismiss, hide, showNotice],
  );
  return <AppUpdateContext.Provider value={value}>{children}</AppUpdateContext.Provider>;
}

export function useAppUpdateContext(): AppUpdateValue | null {
  return useContext(AppUpdateContext);
}
