/**
 * DocsVaultPage 의 URL / localStorage 파싱·저장 헬퍼.
 *
 * 같은 surface 안에서만 사용 — `DocsVaultContent` 가 첫 렌더 시점에 query
 * `?view=` 와 사용자 마지막 선택 (localStorage) 을 결합해 view / source 를
 * 결정.
 *
 * 본 모듈은 순수 함수 + window 가드. `typeof window === 'undefined'` 체크로
 * SSR / 정적 export 시 안전.
 */

export type DocsVaultSource = "server" | "local";
export type DocsVaultView = "doc" | "folder-topology";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";

/** URL `?view=` → 검증된 enum. 알 수 없는 값은 'doc' fallback. */
export function parseDocsVaultView(value?: string | null): DocsVaultView {
  if (value === "doc" || value === "folder-topology") {
    return value;
  }
  return "doc";
}

export function readStoredSource(): DocsVaultSource {
  if (typeof window === "undefined") return "server";
  try {
    const v = window.localStorage.getItem(DOCS_VAULT_SOURCE_KEY);
    if (v === "server" || v === "local") return v;
  } catch {
    /* private mode — skip */
  }
  return "server";
}

export function storeSource(v: DocsVaultSource) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCS_VAULT_SOURCE_KEY, v);
  } catch {
    /* private mode — skip */
  }
}

export function shouldHonorLocalIntent(
  intent: string | null | undefined,
  isDesktopRuntime: boolean,
): boolean {
  return intent === "local" && isDesktopRuntime;
}

export function isDocsVaultLocalSourceDisabled({
  isDesktopRuntime,
  localVaultStatus,
}: {
  isDesktopRuntime: boolean;
  localVaultStatus: string;
}): boolean {
  return !isDesktopRuntime || localVaultStatus === "unsupported";
}

/**
 * 외부 popout / print 용 HTML 생성 시 사용자 입력 (title / 본문) 를 안전하게
 * 이스케이프. 4 개 entity 만 처리 (SVG / iframe 안 사용 안 하므로 충분).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * React state mutation 을 다음 microtask 로 미루는 한 줄 헬퍼. 호출자가
 * `queueMicrotask` 직접 쓰는 것보다 이름으로 의도 명시 (state 동기화 지연).
 */
export function scheduleStateSync(sync: () => void) {
  queueMicrotask(sync);
}
