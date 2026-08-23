import { useCallback, useSyncExternalStore } from 'react';

/**
 * Remembering the chosen scope — a scope picked once persists into the next connection.
 *
 * ## Why the default is project (contrary to the owner's observation)
 *
 * Owner observation: "Most people connect an agent globally rather than per project". That observation is **fully accepted as an
 * option** — it is why global scope exists. But the **default** is not flipped. Two reasons:
 *
 * 1. **Of 12 official docs, zero push global as the default.** One states project explicitly
 *    (Supabase `--scope project`); the rest say nothing and so land on Claude Code's default, `local`.
 * 2. **The reversible side must be the default.** Project scope lives inside the vault, so it shows
 *    in `git diff` and is removed by `git checkout`. Global is the home folder, where neither holds.
 *    A first connection quietly editing home with no trace is not something to make default.
 *
 * So the observation is honoured **as memory rather than as the default** — a user who picks global
 * once starts from global next time. Making them pick again every time would have been the way to
 * ignore that observation.
 */

export type AgentConfigScope = 'project' | 'global';

const STORAGE_KEY = 'ontology-atlas:agent-config-scope';

/** The default. Reason 2 in the preamble above — the reversible side. */
const FALLBACK: AgentConfigScope = 'project';

const listeners = new Set<() => void>();

function read(): AgentConfigScope {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'global' ? 'global' : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** Stores and notifies every consumer in the same tab. The `storage` event fires only in other tabs, so this calls directly. */
export function setAgentConfigScope(scope: AgentConfigScope): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, scope);
  } catch {
    // A failed write (Safari private mode and the like) just means it is not remembered this session.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentConfigScope(): AgentConfigScope {
  const getSnapshot = useCallback(() => read(), []);
  const getServerSnapshot = useCallback(() => FALLBACK, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
