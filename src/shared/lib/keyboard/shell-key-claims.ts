import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which screen answers Cmd-K and `?` itself. The shell answers both by default; a screen whose own
 * dialog must answer claims the key while mounted. A claim, not a route list: the shell keeps no
 * table from route to key, so a screen that gains a dialog needs no edit here.
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

export function useShellKeyClaimed(key: ShellKey): boolean {
  return useSyncExternalStore(
    subscribe,
    () => readShellKeyClaimed(key),
    () => false,
  );
}
