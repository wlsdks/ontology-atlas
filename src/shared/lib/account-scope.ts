/**
 * Single-user mode helpers.
 *
 * 이 프로젝트는 1 인 도구 모델로 단순화됐다. multi-account 워크스페이스
 * (account scope · membership · `?account=` URL query · sessionStorage
 * fallback) 는 v2 협업 단계에서 다시 도입한다. 현재 코드 path 는 모두
 * 단일 사용자 + 단일 default workspace 가정으로 동작.
 *
 * 하위 호환을 위해 helper 시그니처는 유지하되 내부 동작은 모두 no-op /
 * identity. 호출처는 그대로 두고 점진적으로 정리.
 */

export const ACCOUNT_QUERY_KEY = "account";
/** 활성 workspaceProject 컨테이너 id 의 URL query key (v0.x 에선 사용 안함). */
export const WORKSPACE_PROJECT_QUERY_KEY = "pj";

export function normalizeAccountId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * 과거에는 href 에 `?account=` / `?pj=` 를 자동 상속했지만, single-user
 * 모드에서는 무시하고 href 그대로 반환한다.
 */
export function appendAccountQuery(
  href: string,
  _accountId?: string | null,
): string {
  return href;
}

export function appendWorkspaceProjectQuery(
  href: string,
  _projectId?: string | null,
): string {
  return href;
}

export function readRuntimeWorkspaceProjectId(): string | null {
  return null;
}

/** no-op — sessionStorage 캐시 안 함. */
export function rememberAccountId(_accountId?: string | null): void {
  return;
}

/**
 * 과거에는 query value → sessionStorage → URL fallback 순으로 resolve.
 * single-user 모드에선 명시 value 만 (대부분 호출처에서 null 또는
 * undefined 라 결과도 null). 하위 호환 유지용.
 */
export function resolveAccountId(value?: string | null): string | null {
  return normalizeAccountId(value);
}
