/**
 * Which built-in sample vault to show when no vault is selected: `storefront` (default,
 * `samples/storefront/`) or `dogfood` (`docs/ontology/`). Ignored once a vault is loaded.
 */

export type SampleSource = 'dogfood' | 'storefront';

const SAMPLE_SOURCE_KEY = 'demo:sample-source:v1';

function readSampleSourcePreference(): SampleSource {
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
 * Test isolation: drops only the module cache. Clear it whenever storage is cleared, or a test
 * silently relies on the previous test's value.
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
