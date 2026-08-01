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

/**
 * **지금 화면이 보고 있는 볼트의 정체** — 저장 namespace 가 아니라 *동일성*
 * 판정용 (2026-08-01).
 *
 * ## 왜 `vaultScopeKey` 로는 안 되는가
 *
 * 위 `vaultScopeKey` 는 **저장 자리를 나누는 이름**이라 샘플 둘(도그푸드 ·
 * 예시 쇼핑몰)을 `'server'` 하나로 뭉뚱그린다. 그 값을 "볼트가 바뀌었나" 의
 * 판정에 그대로 쓰면 **샘플↔샘플 전환이 변화로 안 잡힌다** — 화면의 노드는
 * 통째로 갈렸는데 범위는 그대로라, 이 범위를 믿는 정리 로직이 아무것도 안
 * 걷어낸다(2026-08-01 사냥에서 지적됐고 재현됐다). 범위 게이트가 **자기가
 * 막으려던 결함을 인증**하는 자리다.
 *
 * ## 그럼 왜 `vaultScopeKey` 를 넓히지 않는가
 *
 * 그건 핀 · 최근 · 열린 탭의 **저장 자리를 옮기는 일**이다. `'server'` 아래
 * 쌓인 사용자의 기존 목록이 그 순간 고아가 된다 — 고치는 대신 데이터를
 * 잃는다. 그래서 둘은 **일부러 다른 함수**다:
 *
 * | | 쓰는 곳 | 샘플 둘을 |
 * |---|---|---|
 * | `vaultScopeKey` | 저장 키 namespace (핀·최근·탭) | 하나로 본다 (`server`) |
 * | `vaultIdentityScope` | 동일성 판정 · 정리 트리거 · 볼트별 상태 키 | 갈라 본다 (`sample:<source>`) |
 *
 * 새 상태를 볼트별로 나눠야 하면 **이쪽**을 쓴다. 저 위 것은 이미 배포된
 * 저장 자리를 지키는 레거시 계약이다.
 */
export type VaultIdentityScope = `local:${string}` | `sample:${string}`;

export function vaultIdentityScope(args: {
  /** 활성 데이터 소스가 실제로 로드된 로컬 볼트인가. */
  isLocalLoaded: boolean;
  /** 선택된 로컬 폴더 이름. 없으면 샘플 범위로 떨어진다. */
  handleName?: string | null;
  /** static 모드에서 보고 있는 내장 샘플 (`dogfood` | `storefront`). */
  sampleSource: string;
}): VaultIdentityScope {
  if (args.isLocalLoaded && args.handleName) return `local:${args.handleName}`;
  return `sample:${args.sampleSource}`;
}
