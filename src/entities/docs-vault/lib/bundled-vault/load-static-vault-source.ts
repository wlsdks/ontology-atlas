import type { SampleSource } from '@/shared/lib/vault-folder/sample-source';
import type { VaultManifest } from '../../model/types';
import { DOGFOOD_AGENT_SLUG_PREFIX } from './dogfood-slug-prefix';
import type { StaticVaultSource } from './static-vault-source';

/**
 * The browser's way to the bundled vault: each sample is fetched with `import()` the first time a
 * screen shows it, so no route ships its JSON up front and the installed app, which never renders a
 * sample (docs/DECISIONS.md, 2026-08-30), never fetches one. Build-time callers (sitemap, route
 * params, Open Graph cards) and `/download`, whose hero map draws the dogfood vault before paint,
 * keep the synchronous `resolveStaticVaultSource`.
 */

const loaded = new Map<SampleSource, StaticVaultSource>();
const inflight = new Map<SampleSource, Promise<StaticVaultSource | null>>();
const failed = new Set<SampleSource>();
const listeners = new Set<() => void>();
/** The sample that arrived last, so a screen keeps it on show while the next one downloads. */
let lastReady: StaticVaultSource | null = null;

// JSON imports infer unions as `string`; the build fixes the schema, so this casts once.
async function importSource(source: SampleSource): Promise<StaticVaultSource> {
  if (source === 'storefront') {
    const [manifest, content] = await Promise.all([
      import('../../data/sample-storefront.manifest.json'),
      import('../../data/sample-storefront.content.json'),
    ]);
    return {
      source: 'storefront',
      manifest: manifest.default as VaultManifest,
      content: content.default as Record<string, string>,
    };
  }
  const [manifest, content, changelog] = await Promise.all([
    import('../../data/manifest.json'),
    import('../../data/gateway-content.json'),
    import('../../data/gateway-changelog.json'),
  ]);
  return {
    source: 'dogfood',
    manifest: manifest.default as VaultManifest,
    content: content.default as Record<string, string>,
    contentPreviews: {
      CHANGELOG: changelog.default as { body: string; omittedSections: number },
    },
    agentSlugPrefix: DOGFOOD_AGENT_SLUG_PREFIX,
  };
}

const EMPTY_MANIFEST: VaultManifest = {
  version: '',
  generatedAt: '',
  docs: [],
  backlinksDetail: {},
  tags: {},
  tree: { name: 'root', path: '', type: 'dir' },
};

const EMPTY: Record<SampleSource, StaticVaultSource> = {
  dogfood: {
    source: 'dogfood',
    manifest: EMPTY_MANIFEST,
    content: {},
    agentSlugPrefix: DOGFOOD_AGENT_SLUG_PREFIX,
  },
  storefront: { source: 'storefront', manifest: EMPTY_MANIFEST, content: {} },
};

/** What a screen reads before a sample arrives, and for good where none is ever loaded. */
export function emptyStaticVaultSource(source: SampleSource): StaticVaultSource {
  return EMPTY[source];
}

/** The sample if it has arrived, else null. Stable between calls so a store snapshot can return it. */
export function peekStaticVaultSource(source: SampleSource): StaticVaultSource | null {
  return loaded.get(source) ?? null;
}

/**
 * Where a sample stands: `idle` (never asked), `loading`, `ready`, or `failed` (the import and its
 * one retry both failed, so a screen says so instead of drawing an empty folder).
 */
export type StaticVaultSourceState = 'idle' | 'loading' | 'ready' | 'failed';

export function staticVaultSourceState(source: SampleSource): StaticVaultSourceState {
  if (loaded.has(source)) return 'ready';
  if (failed.has(source)) return 'failed';
  return inflight.has(source) ? 'loading' : 'idle';
}

export function lastReadyStaticVaultSource(): StaticVaultSource | null {
  return lastReady;
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

async function importWithRetry(source: SampleSource): Promise<StaticVaultSource> {
  try {
    return await importSource(source);
  } catch {
    // A chunk that failed once is often a dropped connection; one more try before saying so.
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return importSource(source);
  }
}

/**
 * Starts the import once per sample. The promise never rejects: it resolves to the sample, or to
 * null after the failure is recorded, so a suspended screen wakes either way and reads the state.
 */
export function loadStaticVaultSource(source: SampleSource): Promise<StaticVaultSource | null> {
  const ready = loaded.get(source);
  if (ready) return Promise.resolve(ready);
  if (failed.has(source)) return Promise.resolve(null);
  let pending = inflight.get(source);
  if (!pending) {
    pending = importWithRetry(source).then(
      (value) => {
        loaded.set(source, value);
        lastReady = value;
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

/** Forgets a recorded failure and imports again; the screen's "Try again". */
export function retryStaticVaultSource(source: SampleSource): Promise<StaticVaultSource | null> {
  failed.delete(source);
  return loadStaticVaultSource(source);
}

/** The one handle a screen's hook takes: read empty, peek, subscribe, and start the download. */
export const bundledSamples = {
  empty: emptyStaticVaultSource,
  peek: peekStaticVaultSource,
  lastReady: lastReadyStaticVaultSource,
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
  lastReady = null;
}
