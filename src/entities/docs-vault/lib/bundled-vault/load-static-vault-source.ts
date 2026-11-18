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
const inflight = new Map<SampleSource, Promise<StaticVaultSource>>();
const listeners = new Set<() => void>();

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

export function subscribeStaticVaultSource(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function publish(source: SampleSource, value: StaticVaultSource): StaticVaultSource {
  loaded.set(source, value);
  inflight.delete(source);
  for (const listener of listeners) listener();
  return value;
}

/** Starts the import once per sample; a failed import settles as the empty sample, never a stuck screen. */
export function loadStaticVaultSource(source: SampleSource): Promise<StaticVaultSource> {
  const ready = loaded.get(source);
  if (ready) return Promise.resolve(ready);
  let pending = inflight.get(source);
  if (!pending) {
    pending = importSource(source).then(
      (value) => publish(source, value),
      () => publish(source, EMPTY[source]),
    );
    inflight.set(source, pending);
  }
  return pending;
}

/** The one handle a screen's hook takes: read empty, peek, subscribe, and start the download. */
export const bundledSamples = {
  empty: emptyStaticVaultSource,
  peek: peekStaticVaultSource,
  subscribe: subscribeStaticVaultSource,
  load: loadStaticVaultSource,
};

/** Test isolation: forgets every loaded sample so a test can watch the load itself. */
export function resetStaticVaultSourcesForTests(): void {
  loaded.clear();
  inflight.clear();
}
