import { bundledVaultManifest } from './bundled-manifest';
import type { StaticVaultSource } from './static-vault-source';

/**
 * The site's sample map (`/sample`) is the one bundled vault that arrives at run time: fetched with `import()` when the page asks, so no other route ships its JSON and the installed app never fetches it. Build-time callers and `/download` keep the synchronous `resolveStaticVaultSource`.
 */
type LoadableSample = 'storefront';

const loaded = new Map<LoadableSample, StaticVaultSource>();
const inflight = new Map<LoadableSample, Promise<StaticVaultSource | null>>();
const failed = new Set<LoadableSample>();
const listeners = new Set<() => void>();

// The build fixes the JSON's schema, so the adapter casts it once.
async function importSource(): Promise<StaticVaultSource> {
  const [manifest, content] = await Promise.all([
    import('../../data/sample-storefront.manifest.json'),
    import('../../data/sample-storefront.content.json'),
  ]);
  return {
    source: 'storefront',
    manifest: bundledVaultManifest(manifest.default),
    content: content.default as Record<string, string>,
  };
}

/** The sample if it has arrived, else null. Stable between calls so a store snapshot can return it. */
export function peekStaticVaultSource(source: LoadableSample): StaticVaultSource | null {
  return loaded.get(source) ?? null;
}

/**
 * Where a sample stands: `idle` (never asked), `loading`, `ready`, or `failed` (the import and its
 * one retry both failed, so a screen says so instead of drawing an empty folder).
 */
export type StaticVaultSourceState = 'idle' | 'loading' | 'ready' | 'failed';

export function staticVaultSourceState(source: LoadableSample): StaticVaultSourceState {
  if (loaded.has(source)) return 'ready';
  if (failed.has(source)) return 'failed';
  return inflight.has(source) ? 'loading' : 'idle';
}

export function subscribeStaticVaultSource(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const RETRY_DELAY_MS = 300;

async function importWithRetry(): Promise<StaticVaultSource> {
  try {
    return await importSource();
  } catch {
    // A chunk that failed once is often a dropped connection; one more try before saying so.
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return importSource();
  }
}

/**
 * Starts the import once per sample. The promise never rejects: it resolves to the sample, or to
 * null after the failure is recorded, so a waiting screen wakes either way and reads the state.
 */
export function loadStaticVaultSource(source: LoadableSample): Promise<StaticVaultSource | null> {
  const ready = loaded.get(source);
  if (ready) return Promise.resolve(ready);
  if (failed.has(source)) return Promise.resolve(null);
  let pending = inflight.get(source);
  if (!pending) {
    pending = importWithRetry().then(
      (value) => {
        loaded.set(source, value);
        inflight.delete(source);
        notify();
        return value;
      },
      () => {
        failed.add(source);
        inflight.delete(source);
        notify();
        return null;
      },
    );
    inflight.set(source, pending);
  }
  return pending;
}

export function retryStaticVaultSource(source: LoadableSample): Promise<StaticVaultSource | null> {
  failed.delete(source);
  return loadStaticVaultSource(source);
}

export const bundledSamples = {
  peek: peekStaticVaultSource,
  state: staticVaultSourceState,
  subscribe: subscribeStaticVaultSource,
  load: loadStaticVaultSource,
  retry: retryStaticVaultSource,
};

/** Test isolation: forgets every loaded sample so a test can watch the load itself. */
export function resetStaticVaultSourcesForTests(): void {
  loaded.clear();
  inflight.clear();
  failed.clear();
}
