'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which screen answers Cmd-K and `?` itself. The shell answers both by default; a screen whose own
 * dialog must answer claims the key while mounted. A claim, not a route list: reading the route
 * needs `useSearchParams`, which fails the static export prerender.
 */
export type ShellKey = 'search' | 'shortcuts';

const claims: Record<ShellKey, number> = { search: 0, shortcuts: 0 };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Whether a mounted screen answers this key itself. */
export function readShellKeyClaimed(key: ShellKey): boolean {
  return claims[key] > 0;
}

/**
 * **This screen answers `key` itself while it is mounted** (and `active`). Counted, so two
 * surfaces holding the same claim release it only when both have gone.
 */
export function useClaimShellKey(key: ShellKey, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    claims[key] += 1;
    emit();
    return () => {
      claims[key] -= 1;
      emit();
    };
  }, [active, key]);
}

/** The shell's side: stand aside while any mounted screen answers `key` itself. */
export function useShellKeyClaimed(key: ShellKey): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readShellKeyClaimed(key),
    () => false,
  );
}
