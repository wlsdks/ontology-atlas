import { describe, expect, it } from 'vitest';

import {
  pinnedDocsStorageKey,
  recentDocsStorageKey,
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
