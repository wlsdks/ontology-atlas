/**
 * 문서 최근/고정 목록의 **볼트 범위 키** (#61).
 *
 * 최근 열람과 고정은 볼트마다 따로 남아야 한다 — 5개짜리 로컬 볼트를 열었는데
 * 번들 샘플에서 고정해 둔 문서가 섞여 나오면, 사용자는 자기가 지금 무엇을
 * 보고 있는지 알 수 없다.
 *
 * `/docs` 는 이미 이 규칙을 지키고 있었지만, 지도의 문서함 빠른 드로어는
 * `'server'` 를 하드코딩해 **활성 로컬 볼트와 무관한 번들 문서의 고정/최근**을
 * 보여줬다 (opus5 검수 2026-07-25). 두 표면이 같은 규칙을 쓰도록 산출식을 한
 * 곳으로 모은다 — entities 레이어라 두 widget 이 모두 import 할 수 있다
 * (widget→widget import 는 FSD 경계에서 금지).
 */
export type VaultScopeKey = 'server' | `local:${string}`;

export const PINNED_DOCS_STORAGE_PREFIX = 'demo:docs-vault:pinned:v1:';
export const RECENT_DOCS_STORAGE_PREFIX = 'demo:docs-vault:recent:v2:';

export function vaultScopeKey(args: {
  /** 활성 데이터 소스가 실제로 로드된 로컬 볼트인가. */
  isLocalLoaded: boolean;
  /** 선택된 로컬 폴더 이름. 없으면 번들 범위로 떨어진다. */
  handleName?: string | null;
}): VaultScopeKey {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return 'server';
}

export function pinnedDocsStorageKey(scope: VaultScopeKey): string {
  return `${PINNED_DOCS_STORAGE_PREFIX}${scope}`;
}

export function recentDocsStorageKey(scope: VaultScopeKey): string {
  return `${RECENT_DOCS_STORAGE_PREFIX}${scope}`;
}
