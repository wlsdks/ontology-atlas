/**
 * 첫 방문 폴더-우선 온보딩 (소유자 지시 2026-07-24) — "처음 화면을 열었을 때
 * 폴더 미지정 상태면 폴더 지정 유도부터 시작해야 한다. 건너뛰기는 제공."
 *
 * 첫 방문(샘플 모드 정착 + 이 플래그 미기록)에 사전 안내 시트
 * (`VaultOpenGuideSheet`)를 1회 자동으로 연다. 시트의 "다음에"(건너뛰기)를
 * 누르면 닫히고, 그때부터 자동 가이드 투어(HomePage)가 이어받는다 —
 * 투어의 stacked-transient 가드가 시트 열림 동안 발화를 미루므로 순서가
 * 자연히 "폴더 유도 → (건너뛰면) 투어" 가 된다.
 *
 * localStorage(영구)인 이유: 폴더 지정 강권은 첫 만남 한 번이면 충분하다 —
 * 매 세션 다시 밀어붙이면 '둘러보기만' 하려는 사용자를 매번 가로막는다.
 * 수동 경로(폴더 CTA 클릭 → 같은 시트)는 항상 남는다.
 */
export const VAULT_GUIDE_AUTO_OPENED_KEY = 'vault-open-guide:auto:v1';

export function readVaultGuideAutoOpened(
  key: string = VAULT_GUIDE_AUTO_OPENED_KEY,
): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    // private mode — 자동 오픈을 포기(true 취급)해 반복 강권을 막는다.
    return true;
  }
}

export function writeVaultGuideAutoOpened(
  key: string = VAULT_GUIDE_AUTO_OPENED_KEY,
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* private mode — skip */
  }
}
