/**
 * 알림함의 **「여기까지 봤다」 시각** — 볼트별 자리.
 *
 * ## 왜 별도 모듈인가
 *
 * 키 산출을 훅 안에 두면 **되돌려도 아무 시험이 빨개지지 않는다**(실측
 * 2026-08-01: 훅 안에서 범위를 떼어냈는데 등록부 계약 시험이 초록이었다 —
 * 파일이 여전히 범위 함수 이름을 *언급* 했기 때문). 소스에 그 이름이 있는지
 * 보는 검사는 배선의 존재를 못 증명한다. 그래서 산출식을 순수 함수로 꺼내
 * **행동으로** 잠근다(`read-at-storage.test.ts`).
 *
 * ## 무엇이 고장났었나
 *
 * 종전엔 전역 키 하나였다. 피드는 볼트별인데 임계값은 전역이라, **한 볼트에서
 * 벨을 열면 다른 볼트의 안 본 항목이 읽음 처리됐다.** 알림의 유일한 임무가
 * "네가 아직 안 본 것" 을 말하는 것인데, 그 판정이 남의 폴더 때문에 거짓이
 * 된다.
 */
export const READ_AT_KEY_PREFIX = 'atlas.agentActivity.readAt:';

/**
 * 볼트를 모르던 시절의 전역 키. **되읽지 않는다** — 그 시각이 어느 볼트에서
 * 찍힌 것인지 알 방법이 없고, 되읽는 것이 바로 위 결함이다. 한 번 치운다.
 */
export const LEGACY_UNSCOPED_READ_AT_KEY = 'atlas.agentActivity.readAt';

export function readAtStorageKey(vaultScope: string): string {
  return `${READ_AT_KEY_PREFIX}${vaultScope}`;
}

export function readReadAt(vaultScope: string): number {
  if (typeof window === 'undefined') return 0;
  try {
    const parsed = Number.parseInt(
      window.localStorage.getItem(readAtStorageKey(vaultScope)) ?? '',
      10,
    );
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function writeReadAt(vaultScope: string, at: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(readAtStorageKey(vaultScope), String(at));
  } catch {
    // 저장이 막혀도 이벤트로 현재 세션은 읽음이 된다.
  }
}

export function forgetLegacyUnscopedReadAt(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(LEGACY_UNSCOPED_READ_AT_KEY);
  } catch {
    // private mode — skip
  }
}
