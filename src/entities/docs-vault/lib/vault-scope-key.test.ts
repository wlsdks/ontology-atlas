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

  // 로드 중(handle 은 있는데 아직 manifest 가 없는) 순간에 로컬 키를 쓰면
  // 빈 목록을 그 볼트의 진실로 굳혀버린다 — 로드 완료 전엔 번들 범위 유지.
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
   * **이 시험이 이 파일에서 가장 중요하다.** `vaultScopeKey` 는 샘플 둘을
   * `'server'` 하나로 뭉뚱그리므로, 그 값을 "볼트가 바뀌었나" 판정에 쓰면
   * 샘플↔샘플 전환이 **변화로 안 잡힌다**. 정리 로직이 그 축에서만 조용히
   * 죽는 결함이라, 두 값이 실제로 갈리는지를 여기서 못 박는다.
   */
  it('샘플 둘은 서로 다른 범위다 — `vaultScopeKey` 가 뭉뚱그리는 바로 그 축', () => {
    const dogfood = vaultIdentityScope({ isLocalLoaded: false, sampleSource: 'dogfood' });
    const storefront = vaultIdentityScope({ isLocalLoaded: false, sampleSource: 'storefront' });

    expect(dogfood).toBe('sample:dogfood');
    expect(storefront).toBe('sample:storefront');
    expect(dogfood).not.toBe(storefront);

    // 같은 두 상태를 저장 namespace 키로 보면 구별되지 않는다 — 그래서 이
    // 함수가 따로 존재한다.
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
