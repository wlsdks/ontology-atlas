import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadStaticVaultSource,
  peekStaticVaultSource,
  resetStaticVaultSourcesForTests,
  staticVaultSourceState,
  subscribeStaticVaultSource,
} from './load-static-vault-source';

describe('loadStaticVaultSource', () => {
  beforeEach(() => resetStaticVaultSourcesForTests());

  it('holds nothing until the sample map asks, then hands out one stable value', async () => {
    expect(peekStaticVaultSource('storefront')).toBeNull();
    expect(staticVaultSourceState('storefront')).toBe('idle');
    const first = await loadStaticVaultSource('storefront');
    expect(first?.manifest.docs.length).toBeGreaterThan(10);
    expect(peekStaticVaultSource('storefront')).toBe(first);
    expect(staticVaultSourceState('storefront')).toBe('ready');
    expect(await loadStaticVaultSource('storefront')).toBe(first);
  });

  it('starts one import for concurrent callers and tells subscribers once', async () => {
    const onChange = vi.fn();
    const stop = subscribeStaticVaultSource(onChange);
    const pending = [loadStaticVaultSource('storefront'), loadStaticVaultSource('storefront')];
    expect(staticVaultSourceState('storefront')).toBe('loading');
    const [a, b] = await Promise.all(pending);
    stop();
    expect(a).toBe(b);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(a?.source).toBe('storefront');
  });
});

describe('a sample that cannot be downloaded', () => {
  beforeEach(() => {
    resetStaticVaultSourcesForTests();
    vi.resetModules();
    vi.doUnmock('../../data/sample-storefront.manifest.json');
  });

  it('retries once, then reports a failure instead of an empty sample', async () => {
    let attempts = 0;
    vi.doMock('../../data/sample-storefront.manifest.json', () => {
      attempts += 1;
      throw new Error('chunk failed');
    });
    const loader = await import('./load-static-vault-source');
    const settled = await loader.loadStaticVaultSource('storefront');
    expect(settled).toBeNull();
    expect(attempts).toBe(2);
    expect(loader.staticVaultSourceState('storefront')).toBe('failed');
    expect(loader.peekStaticVaultSource('storefront')).toBeNull();
    // A failed sample is not asked for again on its own.
    expect(await loader.loadStaticVaultSource('storefront')).toBeNull();
    expect(attempts).toBe(2);
    vi.doUnmock('../../data/sample-storefront.manifest.json');
  });

  it("answers the person's retry with a new document, because the browser would replay the failed import", async () => {
    let attempts = 0;
    vi.doMock('../../data/sample-storefront.manifest.json', () => {
      attempts += 1;
      throw new Error('chunk failed');
    });
    const loader = await import('./load-static-vault-source');
    await loader.loadStaticVaultSource('storefront');
    const reloadDocument = vi.fn();

    void loader.retryStaticVaultSource('storefront', reloadDocument);

    expect(reloadDocument).toHaveBeenCalledTimes(1);
    expect(attempts).toBe(2);
    vi.doUnmock('../../data/sample-storefront.manifest.json');
  });

  it('asks for a sample that has not failed, without reloading anything', async () => {
    const loader = await import('./load-static-vault-source');
    const reloadDocument = vi.fn();

    const sample = await loader.retryStaticVaultSource('storefront', reloadDocument);

    expect(sample?.source).toBe('storefront');
    expect(reloadDocument).not.toHaveBeenCalled();
  });
});
