import { describe, expect, it } from 'vitest';

import {
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultIdentityScope,
  vaultScopeKey,
} from './vault-scope-key';

describe('vaultScopeKey', () => {
  it('scopes a loaded folder by its name, and holds an empty namespace while none is open', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: 'my-vault' })).toBe('local:my-vault');
    expect(vaultScopeKey({ isLocalLoaded: false, handleName: null })).toBe('local:');
  });

  // Mid-load, the folder's key would freeze an empty list as the vault's truth.
  it('stays in the empty namespace before the folder name is known', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: null })).toBe('local:');
  });

  it('uses the same storage key as the /docs namespace', () => {
    expect(pinnedDocsStorageKey('local:my-vault')).toBe('demo:docs-vault:pinned:v1:local:my-vault');
    expect(recentDocsStorageKey('local:my-vault')).toBe('demo:docs-vault:recent:v2:local:my-vault');
  });
});

describe('vaultIdentityScope', () => {
  it('separates folders by name and names the state with none loaded', () => {
    expect(vaultIdentityScope({ isLocalLoaded: true, handleName: 'alpha' })).toBe('local:alpha');
    expect(vaultIdentityScope({ isLocalLoaded: false })).toBe('no-folder');
  });

  it('is the no-folder identity while the folder name is loading', () => {
    expect(vaultIdentityScope({ isLocalLoaded: true, handleName: null })).toBe('no-folder');
  });
});
