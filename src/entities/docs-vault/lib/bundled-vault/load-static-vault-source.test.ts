import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  emptyStaticVaultSource,
  loadStaticVaultSource,
  peekStaticVaultSource,
  resetStaticVaultSourcesForTests,
  subscribeStaticVaultSource,
} from './load-static-vault-source';

describe('loadStaticVaultSource', () => {
  beforeEach(() => resetStaticVaultSourcesForTests());

  it('holds nothing until a screen asks, then hands out one stable value per sample', async () => {
    expect(peekStaticVaultSource('storefront')).toBeNull();
    const first = await loadStaticVaultSource('storefront');
    expect(first.manifest.docs.length).toBeGreaterThan(10);
    expect(peekStaticVaultSource('storefront')).toBe(first);
    expect(await loadStaticVaultSource('storefront')).toBe(first);
    expect(peekStaticVaultSource('dogfood')).toBeNull();
  });

  it('starts one import for concurrent callers and tells subscribers once', async () => {
    const onChange = vi.fn();
    const stop = subscribeStaticVaultSource(onChange);
    const [a, b] = await Promise.all([loadStaticVaultSource('dogfood'), loadStaticVaultSource('dogfood')]);
    stop();
    expect(a).toBe(b);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(a.agentSlugPrefix).toBe('ontology/');
    expect(Object.keys(a.content).every((slug) => slug.startsWith('guide/'))).toBe(true);
    expect(a.contentPreviews?.CHANGELOG?.omittedSections).toBeGreaterThan(0);
  });

  it('keeps the empty sample of the same name for a screen that reads before arrival', () => {
    const empty = emptyStaticVaultSource('dogfood');
    expect(empty.source).toBe('dogfood');
    expect(empty.manifest.docs).toEqual([]);
    expect(emptyStaticVaultSource('dogfood')).toBe(empty);
  });
});
