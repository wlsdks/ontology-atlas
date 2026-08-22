import { describe, expect, it } from 'vitest';

import {
  pinnedDocsStorageKey,
  recentDocsStorageKey,
  vaultIdentityScope,
  vaultScopeKey,
} from './vault-scope-key';

describe('vaultScopeKey', () => {
  it('로컬 볼트가 없으면 번들 범위', () => {
    expect(vaultScopeKey({ isLocalLoaded: false, handleName: null })).toBe('server');
  });

  it('로컬 볼트가 로드되면 폴더 이름으로 범위를 나눈다', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: 'my-vault' })).toBe('local:my-vault');
  });

  // Using the local key mid-load (a handle exists but the manifest does not yet)
  // would freeze an empty list as that vault's truth — stay in bundled scope until loaded.
  it('폴더 이름이 아직 없으면 번들 범위로 떨어진다', () => {
    expect(vaultScopeKey({ isLocalLoaded: true, handleName: null })).toBe('server');
  });

  it('저장 키는 기존 /docs 네임스페이스와 정확히 같다 — 두 표면이 같은 목록을 본다', () => {
    expect(pinnedDocsStorageKey('server')).toBe('demo:docs-vault:pinned:v1:server');
    expect(recentDocsStorageKey('local:my-vault')).toBe('demo:docs-vault:recent:v2:local:my-vault');
  });
});

describe('vaultIdentityScope — 동일성 판정용 정확한 범위', () => {
  it('로컬 볼트는 폴더 이름으로 갈린다', () => {
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
  it('샘플 둘은 서로 다른 범위다 — `vaultScopeKey` 가 뭉뚱그리는 바로 그 축', () => {
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

  it('폴더 이름이 아직 없으면 샘플 범위로 떨어진다 — 로드 중을 새 볼트로 오인하지 않는다', () => {
    expect(
      vaultIdentityScope({ isLocalLoaded: true, handleName: null, sampleSource: 'storefront' }),
    ).toBe('sample:storefront');
  });
});
