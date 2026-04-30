export const ACCOUNT_QUERY_KEY = "account";
/**
 * P0-B Phase 6 — workspaceProject 컨테이너 id 의 URL query key. 모든 link
 * 생성기와 페이지 reader 가 이 상수를 공유해야 selector 전환이 navigation
 * 전반에 일관 전파.
 */
export const WORKSPACE_PROJECT_QUERY_KEY = "pj";
const ACCOUNT_SCOPE_STORAGE_KEY = "account-scope:last";

export function normalizeAccountId(value?: string | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function appendAccountQuery(
  href: string,
  accountId?: string | null,
): string {
  const normalizedAccountId =
    normalizeAccountId(accountId) ?? readRuntimeAccountId();
  // P0-B Phase 6 — navigation context (account + workspaceProject) 는 함께
  // 흘러야 하므로, account chain 끝에서 ?pj 자동 상속도 시도. 두 함수가
  // idempotent 라 중복 chain 호출은 동일 결과.
  const withAccount = (() => {
    if (!normalizedAccountId) return href;
    const url = new URL(href, "http://local.test");
    url.searchParams.set(ACCOUNT_QUERY_KEY, normalizedAccountId);
    const query = url.searchParams.toString();
    return query ? `${url.pathname}?${query}` : url.pathname;
  })();
  return appendWorkspaceProjectQuery(withAccount);
}

/**
 * 활성 컨테이너 id 를 query 에 추가한다. 명시 인자가 없으면 현재 URL 의
 * `?pj=` 를 자동 상속해 navigation 일관성 유지. accountId 와 동일한 패턴.
 */
export function appendWorkspaceProjectQuery(
  href: string,
  projectId?: string | null,
): string {
  const normalized = projectId?.trim() || readRuntimeWorkspaceProjectId();
  if (!normalized) return href;

  const url = new URL(href, "http://local.test");
  url.searchParams.set(WORKSPACE_PROJECT_QUERY_KEY, normalized);

  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

function readRuntimeAccountId() {
  if (typeof window === "undefined") return null;
  return normalizeAccountId(
    new URLSearchParams(window.location.search).get(ACCOUNT_QUERY_KEY),
  );
}

export function readRuntimeWorkspaceProjectId(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(
    WORKSPACE_PROJECT_QUERY_KEY,
  );
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

export function rememberAccountId(accountId?: string | null) {
  if (typeof window === "undefined") return;
  const normalizedAccountId = normalizeAccountId(accountId);
  if (normalizedAccountId) {
    window.sessionStorage.setItem(ACCOUNT_SCOPE_STORAGE_KEY, normalizedAccountId);
    return;
  }
  window.sessionStorage.removeItem(ACCOUNT_SCOPE_STORAGE_KEY);
}

function readRememberedAccountId() {
  if (typeof window === "undefined") return null;
  return normalizeAccountId(window.sessionStorage.getItem(ACCOUNT_SCOPE_STORAGE_KEY));
}

export function resolveAccountId(value?: string | null): string | null {
  return (
    normalizeAccountId(value) ??
    readRuntimeAccountId() ??
    readRememberedAccountId()
  );
}
