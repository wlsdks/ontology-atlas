/**
 * DocsVaultPage 의 URL / localStorage 파싱·저장 헬퍼.
 *
 * 같은 surface 안에서만 사용 — `DocsVaultContent` 가 첫 렌더 시점에 query
 * `?view=` 와 사용자 마지막 선택 (localStorage) 을 결합해 view / source 를
 * 결정.
 *
 * 본 모듈은 순수 함수 + window 가드. `typeof window === 'undefined'` 체크로
 * SSR / 정적 export 시 안전.
 *
 * [docs-chrome-round, 2026-07] 문서함 점검 패널이 밴드→중앙 모달로 바뀌며
 * `readStoredContractOpen`/`storeContractOpen`(옛 `DOCS_VAULT_CONTRACT_OPEN_KEY`)
 * 를 의도적으로 제거했다 — 모달은 페이지 로드마다 열려 있으면 modality 위반이라
 * open 상태를 persist 하지 않고 항상 닫힌 채 시작한다(design-prescription.md
 * ③-5). 토글 자체는 `DocsVaultContent` 의 순수 컴포넌트 state 로 세션 내에서만
 * 유지된다.
 */

import { VaultConflictError } from "@/features/docs-vault-local";

export type DocsVaultSource = "server" | "local";
// P5a — folder-topology (Sigma mini map) 은 kind 스키마와 경쟁하는 제3그래프
// 어휘라 제거됐다(.qa-scratch/docs-identity-2026-07/verdict.md 빼기②). 'doc'
// 만 남아 union 이 아니지만, 호출부 (`parseDocsVaultView`/`replaceDocsVaultUrlState`)
// 의 계약을 그대로 유지해 회귀 diff 를 최소화한다.
export type DocsVaultView = "doc";

export const DOCS_VAULT_SOURCE_KEY = "demo:docs-vault:source";
export const DOCS_VAULT_LIST_COLLAPSED_KEY = "demo:docs-vault:list-collapsed";

/**
 * 문서 목록 aside 접힘 여부 — docs-chrome-round design-prescription.md ③-4.
 * 작업공간 취향이라 세션·새로고침 넘어 유지(localStorage). 기본 false(펼침).
 * SSR/정적 export 안전 가드.
 */
export function readStoredListCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.localStorage.getItem(DOCS_VAULT_LIST_COLLAPSED_KEY);
    if (v === "1") return true;
    if (v === "0") return false;
  } catch {
    /* private mode — skip */
  }
  return false;
}

export function storeListCollapsed(collapsed: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DOCS_VAULT_LIST_COLLAPSED_KEY,
      collapsed ? "1" : "0",
    );
  } catch {
    /* private mode — skip */
  }
}

/** URL `?view=` → 검증된 enum. 알 수 없는 값은 'doc' fallback. 'doc' 하나뿐인
 *  union 이라 사실상 상수 반환이지만, 호출부 시그니처(과거엔 view 여러 종) 는
 *  유지 — 미래 view 재도입 시 이 함수 하나만 갱신. */
export function parseDocsVaultView(value?: string | null): DocsVaultView {
  void value;
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

/**
 * C5 — should landing on 문서함 auto-prefer the local source? True only when a
 * local vault is actually loaded AND the current source isn't already local.
 * Guards the one trust bug: a live vault must never be silently replaced by the
 * Sample (`server`) source just because that was the last stored preference.
 * Callers apply this ONCE per mount (a ref) so a later deliberate switch to
 * Sample is respected — this only covers the initial landing.
 */
export function shouldPreferLocalOnLanding(
  localVaultStatus: string,
  currentSource: DocsVaultSource,
): boolean {
  return localVaultStatus === "loaded" && currentSource !== "local";
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
  // P1b (N1) — 웹 세션도 local intent 를 존중한다. 같은 브라우저에서
  // 빌더는 이미 vault 에 쓰기까지 허용하는데 문서함만 데스크톱 게이트로
  // 막는 것은 표면 간 모순 계약이었다. FSA 미지원 브라우저는
  // `localVaultStatus === 'unsupported'` 쪽 게이트가 막는다.
  void isDesktopRuntime;
  return intent === "local";
}

export function shouldShowDogfoodVaultHint({
  dogfood,
  isDesktopRuntime,
  source,
  hasLocalManifest,
}: {
  dogfood: string | null | undefined;
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  hasLocalManifest: boolean;
}): boolean {
  return dogfood === "1" && isDesktopRuntime && source === "local" && !hasLocalManifest;
}

export function shouldSwitchToDogfoodVault({
  dogfood,
  isDesktopRuntime,
  source,
  localVaultStatus,
  currentRootPath,
  dogfoodRootPath,
  dogfoodRootPaths,
}: {
  dogfood: string | null | undefined;
  isDesktopRuntime: boolean;
  source: DocsVaultSource;
  localVaultStatus: string;
  currentRootPath: string | null | undefined;
  dogfoodRootPath: string;
  dogfoodRootPaths?: readonly string[];
}): boolean {
  const acceptedRootPaths = dogfoodRootPaths ?? [dogfoodRootPath];
  if (!currentRootPath) return false;
  return (
    dogfood === "1" &&
    isDesktopRuntime &&
    source === "local" &&
    localVaultStatus === "loaded" &&
    !acceptedRootPaths.includes(currentRootPath)
  );
}

export function isDocsVaultLocalSourceDisabled({
  isDesktopRuntime,
  localVaultStatus,
}: {
  isDesktopRuntime: boolean;
  localVaultStatus: string;
}): boolean {
  // P1b (N1) — 게이트는 능력(FSA 지원 여부)만 본다. 런타임(웹/데스크톱)
  // 은 더 이상 게이트가 아니다 — 빌더와 같은 계약.
  void isDesktopRuntime;
  return localVaultStatus === "unsupported";
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
  // P1b (N1) — welcome(폴더 열기 CTA 포함)도 능력 기준: 웹 FSA 세션에서도
  // 로컬 소스에 진입하면 열기 표면이 있어야 한다. 데스크톱 전용 요소
  // (dogfood 경로 힌트)는 shouldShowDogfoodVaultHint 가 따로 게이트한다.
  void isDesktopRuntime;
  return (
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
