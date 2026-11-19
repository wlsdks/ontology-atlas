import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyStaticVaultSource,
  loadStaticVaultSource,
  peekStaticVaultSource,
  resetStaticVaultSourcesForTests,
  staticVaultSourceState,
  subscribeStaticVaultSource,
} from './load-static-vault-source';

describe('loadStaticVaultSource', () => {
  beforeEach(() => resetStaticVaultSourcesForTests());

  it('holds nothing until a screen asks, then hands out one stable value per sample', async () => {
    expect(peekStaticVaultSource('storefront')).toBeNull();
    expect(staticVaultSourceState('storefront')).toBe('idle');
    const first = await loadStaticVaultSource('storefront');
    expect(first?.manifest.docs.length).toBeGreaterThan(10);
    expect(peekStaticVaultSource('storefront')).toBe(first);
    expect(staticVaultSourceState('storefront')).toBe('ready');
    expect(await loadStaticVaultSource('storefront')).toBe(first);
    expect(peekStaticVaultSource('dogfood')).toBeNull();
  });

  it('starts one import for concurrent callers and tells subscribers once', async () => {
    const onChange = vi.fn();
    const stop = subscribeStaticVaultSource(onChange);
    const pending = [loadStaticVaultSource('dogfood'), loadStaticVaultSource('dogfood')];
    expect(staticVaultSourceState('dogfood')).toBe('loading');
    const [a, b] = await Promise.all(pending);
    stop();
    expect(a).toBe(b);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(a?.agentSlugPrefix).toBe('ontology/');
    expect(Object.keys(a?.content ?? {}).every((slug) => slug.startsWith('guide/'))).toBe(true);
    expect(a?.contentPreviews?.CHANGELOG?.omittedSections).toBeGreaterThan(0);
  });

  it('keeps the empty sample of the same name for a screen that reads before arrival', () => {
    const empty = emptyStaticVaultSource('dogfood');
    expect(empty.source).toBe('dogfood');
    expect(empty.manifest.docs).toEqual([]);
    expect(emptyStaticVaultSource('dogfood')).toBe(empty);
  });
});

describe('a sample that cannot be downloaded', () => {
  beforeEach(() => {
    resetStaticVaultSourcesForTests();
    vi.resetModules();
  });

  it('retries once, then reports a failure instead of an empty sample, and retries on request', async () => {
    let attempts = 0;
    vi.doMock('../../data/sample-storefront.manifest.json', () => {
      attempts += 1;
      if (attempts <= 2) throw new Error('chunk failed');
      return { default: { version: '1', generatedAt: '', docs: [], backlinksDetail: {}, tags: {}, tree: {} } };
    });
    const loader = await import('./load-static-vault-source');
    const settled = await loader.loadStaticVaultSource('storefront');
    expect(settled).toBeNull();
    expect(attempts).toBe(2);
    expect(loader.staticVaultSourceState('storefront')).toBe('failed');
    expect(loader.peekStaticVaultSource('storefront')).toBeNull();
    // A failed sample is not asked for again on its own; the person's retry asks.
    expect(await loader.loadStaticVaultSource('storefront')).toBeNull();
    expect(attempts).toBe(2);
    const again = await loader.retryStaticVaultSource('storefront');
    expect(again?.source).toBe('storefront');
    expect(loader.staticVaultSourceState('storefront')).toBe('ready');
    vi.doUnmock('../../data/sample-storefront.manifest.json');
  });
});
