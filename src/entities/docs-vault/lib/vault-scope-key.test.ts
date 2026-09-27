import { describe, expect, it } from 'vitest';

import {
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultIdentityScope,
  vaultScopeKey,
} from './vault-scope-key';

describe('vaultScopeKey', () => {
  it('uses the bundled scope without a local vault', () => {
    expect(vaultScopeKey({ isLocalLoaded: false, handleName: null })).toBe('server');
  });

  it('scopes a loaded local vault by folder name', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: 'my-vault' })).toBe('local:my-vault');
  });

  // Using the local key mid-load (a handle exists but the manifest does not yet)
  // would freeze an empty list as that vault's truth — stay in bundled scope until loaded.
  it('falls back to the bundled scope before the folder name is known', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: null })).toBe('server');
  });

  it('uses the same storage key as the /docs namespace', () => {
    expect(pinnedDocsStorageKey('server')).toBe('demo:docs-vault:pinned:v1:server');
    expect(recentDocsStorageKey('local:my-vault')).toBe('demo:docs-vault:recent:v2:local:my-vault');
  });
});

describe('vaultIdentityScope', () => {
  it('separates local vaults by folder name', () => {
    expect(
      vaultIdentityScope({ isLocalLoaded: true, handleName: 'alpha', sampleSource: 'dogfood' }),
    ).toBe('local:alpha');
  });

  /**
   * **The most important test in this file.** `vaultScopeKey` collapses both samples
   * into a single `'server'`, so using it to decide "did the vault change?" makes a
   * sample↔sample switch **invisible as a change**. That defect kills cleanup logic
   * silently on that one axis, so this pins that the two values really do differ.
   */
  it('separates the two samples that `vaultScopeKey` merges', () => {
    const dogfood = vaultIdentityScope({ isLocalLoaded: false, sampleSource: 'dogfood' });
    const storefront = vaultIdentityScope({ isLocalLoaded: false, sampleSource: 'storefront' });

    expect(dogfood).toBe('sample:dogfood');
    expect(storefront).toBe('sample:storefront');
    expect(dogfood).not.toBe(storefront);

    // The same two states are indistinguishable under the storage namespace key —
    // which is why this second function exists.
    expect(vaultScopeKey({ isLocalLoaded: false, handleName: null })).toBe(
      vaultScopeKey({ isLocalLoaded: false, handleName: null }),
    );
  });

  it('falls back to the sample scope while the folder name is loading', () => {
    expect(
      vaultIdentityScope({ isLocalLoaded: true, handleName: null, sampleSource: 'storefront' }),
    ).toBe('sample:storefront');
  });
});
