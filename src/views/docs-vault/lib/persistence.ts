import type { VaultMode } from "@/entities/docs-vault";

/**
 * DocsVaultPage 의 URL / localStorage 파싱·저장 헬퍼 (Fire 4-b).
 *
 * 같은 surface 안에서만 사용 — `AdminDocsContent` 가 첫 렌더 시점에 query
 * `?view=` `?audience=` 와 사용자 마지막 선택 (localStorage) 을 결합해 view /
 * source / audience 를 결정.
 *
 * 본 모듈은 순수 함수 + window 가드. `typeof window === 'undefined'` 체크로
 * SSR / 정적 export 시 안전.
 */

export type DocsVaultSource = "server" | "local";
export type DocsVaultView = "doc" | "graph" | "stats" | "folder-topology";
export type DocsVaultAudience = VaultMode | "all";

export const DOCS_VAULT_SOURCE_KEY = "aslan:docs-vault:source";
export const DOCS_VAULT_AUDIENCE_KEY = "aslan:docs-vault:audience";
/** legacy key — 2026-04 이전 사용. 새 audience key 가 비어 있을 때만 fallback. */
const DOCS_VAULT_LEGACY_MODE_KEY = "aslan:docs-vault:mode";

/** URL `?view=` → 검증된 enum. 알 수 없는 값은 'doc' fallback. */
export function parseDocsVaultView(value?: string | null): DocsVaultView {
  if (
    value === "doc" ||
    value === "graph" ||
    value === "stats" ||
    value === "folder-topology"
  ) {
    return value;
  }
  return "doc";
}

/** URL `?audience=` → 검증된 enum. 알 수 없는 값은 'all' fallback. */
export function parseDocsVaultAudience(
  value?: string | null,
): DocsVaultAudience {
  if (value === "planner" || value === "engineer" || value === "all") {
    return value;
  }
  return "all";
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

export function readStoredAudience(): DocsVaultAudience {
  if (typeof window === "undefined") return "all";
  try {
    const v =
      window.localStorage.getItem(DOCS_VAULT_AUDIENCE_KEY) ??
      window.localStorage.getItem(DOCS_VAULT_LEGACY_MODE_KEY);
    if (v === "planner" || v === "engineer" || v === "all") return v;
  } catch {
    /* private mode — skip */
  }
  return "all";
}

export function storeAudience(audience: DocsVaultAudience) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCS_VAULT_AUDIENCE_KEY, audience);
  } catch {
    /* private mode — skip */
  }
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
