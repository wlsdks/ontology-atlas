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

import { VaultConflictError } from "@/features/docs-vault-local";

export type DocsVaultSource = "server" | "local";
export type DocsVaultView = "doc" | "folder-topology";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";
export const DOCS_VAULT_CONTRACT_OPEN_KEY = "demo:docs-vault:contract-open";

/**
 * 상단 소스-계약 스트립(01 FILES · 02 GRAPH · 03 AGENT)의 펼침 여부.
 * 기본 true — 처음 방문자는 오리엔테이션을 보고, 한 번 접으면 그 선호가
 * 유지된다(돌아오는 사용자는 본문에 바로 집중). SSR/정적 export 안전 가드.
 */
export function readStoredContractOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(DOCS_VAULT_CONTRACT_OPEN_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* private mode — skip */
  }
  return true;
}

export function storeContractOpen(open: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DOCS_VAULT_CONTRACT_OPEN_KEY, open ? "1" : "0");
  } catch {
    /* private mode — skip */
  }
}

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

export function shouldShowDesktopVaultWelcome({
  isDesktopRuntime,
  source,
  localVaultStatus,
  hasLocalManifest,
}: {
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  localVaultStatus: string;
  hasLocalManifest: boolean;
}): boolean {
  return (
    isDesktopRuntime &&
    source === "local" &&
    !hasLocalManifest &&
    (localVaultStatus === "idle" ||
      localVaultStatus === "opening" ||
      localVaultStatus === "loading")
  );
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

/**
 * 에디터 저장 핸들러. `saveDoc` 으로 버퍼를 persist 한다.
 *
 * **데이터 손실 가드 (핵심):** read↔write 사이에 .md 가 외부(다른 에디터 / AI
 * MCP)로 바뀌면 saveDoc 이 `VaultConflictError` 를 throw 한다. 이 에러를 여기서
 * *swallow* 하면 (구버전 onSave 가 그랬음) 호출한 에디터의 doSave 가 resolve 를
 * 성공으로 오인해 버퍼를 phantom-clean 하고 "저장됨" 을 띄운다 → dirty 가 false 가
 * 되어 #5(a) poll 가드가 풀리고, 다음 poll re-fetch 가 미저장 편집을 silent
 * overwrite 한다. 따라서 conflict 든 일반 에러든 **항상 re-throw** 한다. 에디터는
 * 이 throw 를 근거로 버퍼를 dirty 로 유지해 손실을 막는다.
 *
 * `onConflict` 는 사용자 알림(toast 등) 부수효과 hook — 호출돼도 에러는 재던져진다.
 */
export async function persistEditorSave(
  saveDoc: (
    slug: string,
    content: string,
    opts: { expectedMtime?: number },
  ) => Promise<unknown>,
  args: { slug: string; content: string; expectedMtime?: number },
  onConflict?: (err: VaultConflictError) => void,
): Promise<void> {
  try {
    await saveDoc(args.slug, args.content, { expectedMtime: args.expectedMtime });
  } catch (err) {
    if (err instanceof VaultConflictError) {
      onConflict?.(err);
    }
    throw err; // 절대 swallow 금지 — 에디터가 throw 로 dirty 를 유지해야 함
  }
}
