'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * **Which screen answers ⌘K and `?` itself** (2026-09-26).
 *
 * The shortcut sheet lists ⌘K and `?` under Navigation, the section it shows on every screen,
 * and the `G`-leader keys it teaches beside them are wired once in the shell, so they work
 * everywhere. ⌘K and `?` were not: each was wired by the screen that drew its dialog, and only the
 * map, a project page and Insights drew one. Measured on 2026-09-25 against a real folder, both
 * keys did nothing on Library, Git, Automations, Agents and the harness (0 of 5 each), so the
 * sheet promised two keys a person could only use on three of eight destinations — and could not
 * even be opened on the other five to find that out.
 *
 * So the shell answers both keys by default. A screen whose own dialog must answer instead says
 * so here for as long as it is mounted, and the shell stands aside:
 *
 * | key | claimed by | why that screen keeps its own |
 * |---|---|---|
 * | `search` (⌘K) | the map | its search selects on the canvas and joins the map's Esc order |
 * | `search` (⌘K) | ontology documents | ⌘K is that workspace's own palette (search · command · tag) |
 * | `search` (⌘K) | a project page | its palette opens in place over the project |
 * | `shortcuts` (`?`) | the map | the sheet closes the map's other surfaces and returns focus to its `?` button |
 *
 * **A claim, not a route list.** Deciding by address would have to know that `/` is the map only
 * with a folder open, and that the Library's Ontology tab is the documents workspace — which the
 * shell cannot read without `useSearchParams`, and that call fails the static export's prerender
 * (`AppShell`, the MCP guide note). The screen that owns the key is the one that knows.
 *
 * A module store rather than a context, like `map-navigation-pending`: the claims have one reader
 * (the shell), no provider has to wrap the page tree, and a screen rendered on its own in a unit
 * test claims into nothing that matters.
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
