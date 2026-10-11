'use client';

import { useSyncExternalStore } from 'react';

/**
 * Corrects prerendered HTML with browser-only facts. Static export freezes them as "no" and
 * hydration does not repair attribute mismatches; `false` means knowing only what the server
 * knows. `useSyncExternalStore` tells React the server and client snapshots differ.
 */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
