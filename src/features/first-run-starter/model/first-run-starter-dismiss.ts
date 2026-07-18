/**
 * INDEX 패널 "시작하기" 모듈의 dismiss 정책 — sessionStorage(탭/세션 단위)
 * 순수 read/write 헬퍼.
 *
 * localStorage 를 안 쓰는 이유: "그냥 둘러볼게요" 는 dismiss 이지 opt-out 이
 * 아니다. 새 세션(브라우저를 새로 열면)엔 다시 안내가 뜨는 게 맞는 계약 —
 * 소유자 결정 (`docs/prototypes/first-run-v3-flagship.html` 승인
 * docstring). 영구 vault 복원(별도 계약 — `RootEntryPage`/`useDataSourceMode`
 * 의 vault 상태)과는 다른 축.
 */
export const FIRST_RUN_STARTER_DISMISSED_KEY = 'demo:first-run-starter-dismissed:v1';

export function readFirstRunStarterDismissed(
  key: string = FIRST_RUN_STARTER_DISMISSED_KEY,
): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(key) === '1';
  } catch {
    // private mode 등 — dismiss 상태를 기억 못 해도 모듈이 다시 뜨는 것 뿐,
    // 안전한 폴백.
    return false;
  }
}

export function writeFirstRunStarterDismissed(
  key: string = FIRST_RUN_STARTER_DISMISSED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* private mode — skip, 다음 클릭에도 그냥 다시 시도 */
  }
}
