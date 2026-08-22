/**
 * Which built-in sample vault to show when no vault is selected (static mode). Two
 * values:
 *
 * - **storefront** (default) — an example business a non-developer (planning,
 *   marketing, leadership) recognises instantly (`samples/storefront/`).
 * - **dogfood** — the vault describing the code of this app itself (`docs/ontology/`).
 *
 * **Why storefront is the default** (switched 2026-07-26). With dogfood on the first
 * screen, a first-time visitor meets names like `Dev Route Smoke`, `Resolve Write
 * Target`, and `Clean Next Dev Cache` — at exactly the spot where the tour says
 * "press one of the bright dots". At the moment they have to decide whether this tool
 * is relevant to them, they are looking at somebody else's build scripts.
 *
 * Dogfood is persuasive because it **exists** ("we describe ourselves in our own
 * format"), not because it occupies the default slot. So the proof goes to whoever
 * opens it and the understanding goes to everyone: one click away, under an honest
 * name.
 *
 * Once a vault is loaded (local mode) this preference is ignored entirely — the
 * user's disk always wins (`.claude/rules/architecture.md`, single source of truth).
 */

export type SampleSource = 'dogfood' | 'storefront';

const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

export function readSampleSourcePreference(): SampleSource {
  if (typeof window === 'undefined') return 'storefront';
  try {
    const raw = window.localStorage.getItem(SAMPLE_SOURCE_KEY);
    // An explicit choice is honoured: a changed default never undoes what someone
    // picked. The new default applies only when nothing is stored, i.e. only when
    // they never chose.
    return raw === 'dogfood' ? 'dogfood' : 'storefront';
  } catch {
    // Private mode and the like — fall back safely to the in-session default.
    return 'storefront';
  }
}

// ── Shared reactive store ─────────────────────────────────────────
// Several components consume this preference at once: the first-run card's segmented
// control (writes) and useOntologyInsight (reads → topology / INDEX / counts). With
// independent useState in each, changing it on the card left the map unchanged until
// a reload — a defect measured in 2026-07. One module-level store plus
// useSyncExternalStore re-renders every consumer immediately, and cross-tab storage
// events are picked up as well.
const listeners = new Set<() => void>();
let cachedSnapshot: SampleSource | null = null;

function handleStorageEvent(event: StorageEvent): void {
  if (event.key !== SAMPLE_SOURCE_KEY) return;
  cachedSnapshot = null;
  for (const listener of listeners) listener();
}

/**
 * Drops the cache only, so the next read consults storage again.
 *
 * For test isolation. Calling `localStorage.removeItem` alone leaves the module cache
 * holding the previous test's value, isolation leaks, and any test that passes in
 * that state is **accidentally relying on what the previous test left behind** — as
 * the 2026-07-26 default switch actually exposed. Clear the cache whenever you clear
 * storage.
 */
export function resetSampleSourceCacheForTests(): void {
  cachedSnapshot = null;
}

export function subscribeSampleSource(onChange: () => void): () => void {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent);
  }
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent);
    }
  };
}

export function getSampleSourceSnapshot(): SampleSource {
  if (cachedSnapshot == null) cachedSnapshot = readSampleSourcePreference();
  return cachedSnapshot;
}

// SSR and hydration have no localStorage, so they always use the **default**. The
// first screen pre-rendered by the static export is what a first-time visitor sees,
// so matching the default keeps hydration from shifting; only someone who chose
// dogfood re-renders right afterwards.
export function getSampleSourceServerSnapshot(): SampleSource {
  return 'storefront';
}

export function writeSampleSourcePreference(source: SampleSource): void {
  cachedSnapshot = source;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SAMPLE_SOURCE_KEY, source);
    } catch {
      /* Private mode — skip persisting; the store value holds for the session. */
    }
  }
  for (const listener of listeners) listener();
}
