/**
 * 대화 패널의 **폭** — 순수 산수 한 벌 + 저장 자리.
 *
 * ## 왜 값이 아니라 규칙인가
 *
 * 종전 폭은 `w-[420px] xl:w-[480px]` 두 리터럴이었다. 그 두 수는 **누구의
 * 답도 아니었다** — 긴 코드 덩어리를 읽는 사람에게는 좁고, 지도를 보면서
 * 짧게 묻는 사람에게는 넓다. 어느 한 수를 고르는 대신 **사용자가 끌게** 하고,
 * 우리는 그 끌기가 넘으면 안 되는 선만 정한다.
 *
 * ## 넘으면 안 되는 선
 *
 * 이 패널은 지도를 **덮지 않는다**(2026-07-27 「지도가 주」 규칙). 그래서
 * 상한은 취향이 아니라 계산이다 — 화면에서 레일과 지도의 몫을 빼고 남는 것이
 * 이 패널이 가질 수 있는 전부다. 지도가 가져야 하는 최소 폭
 * (`MAP_MIN_WIDTH`)은 이 패널을 처음 들일 때 정한 바닥을 그대로 쓴다.
 *
 * 하한은 **한 줄이 읽히는 폭**이다. 이보다 좁으면 말풍선과 도구 줄이 글자
 * 두세 개마다 접혀서, 패널이 살아 있는데 아무것도 읽을 수 없는 상태가 된다.
 */

/** 한 줄이 읽히는 최소 폭. 이보다 좁으면 대화가 세로 글씨가 된다. */
export const CHAT_WIDTH_MIN = 320;
/** 아무도 끌지 않았을 때의 폭 — 종전 기본값을 그대로 잇는다. */
export const CHAT_WIDTH_DEFAULT = 420;
/** 지도가 지켜야 하는 최소 폭. 이 패널의 상한은 여기서 나온다. */
export const MAP_MIN_WIDTH = 480;
/** 왼쪽 레일. 지도와 함께 화면에서 미리 빠지는 몫이다. */
export const RAIL_WIDTH = 64;
/** 키보드로 한 번 눌렀을 때 움직이는 거리. */
export const CHAT_WIDTH_STEP = 16;

/** 이 화면에서 패널이 가질 수 있는 최대 폭. */
export function maxChatWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth)) return CHAT_WIDTH_DEFAULT;
  // 화면이 아주 좁으면 계산 결과가 하한보다 작아진다. 그때는 하한이 이긴다 —
  // 「읽히지 않는 패널」보다 「지도가 조금 좁은 화면」이 낫다.
  return Math.max(CHAT_WIDTH_MIN, viewportWidth - RAIL_WIDTH - MAP_MIN_WIDTH);
}

/** 끌린 폭을 이 화면에서 허용되는 범위 안으로 접는다. */
export function clampChatWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return CHAT_WIDTH_DEFAULT;
  return Math.round(Math.min(Math.max(width, CHAT_WIDTH_MIN), maxChatWidth(viewportWidth)));
}

/**
 * 저장 자리. 폭은 비밀이 아니고 이 컴퓨터의 취향이라 `localStorage` 에 산다 —
 * 볼트 안 파일로 만들면 폴더를 옮길 때마다 남의 화면 크기를 물려받는다.
 */
export const CHAT_WIDTH_STORAGE_KEY = 'atlas.acp-chat.width';

/** 저장된 폭. 없거나 망가졌으면 `null` — 호출자가 기본값을 쓴다. */
export function readStoredChatWidth(storage: Pick<Storage, 'getItem'>): number | null {
  try {
    const raw = storage.getItem(CHAT_WIDTH_STORAGE_KEY);
    if (raw == null) return null;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    // 저장소가 막힌 브라우저(프라이빗 모드 등)에서도 패널은 열려야 한다.
    return null;
  }
}

export function writeStoredChatWidth(storage: Pick<Storage, 'setItem'>, width: number): void {
  try {
    storage.setItem(CHAT_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // 저장에 실패해도 이번 세션의 폭은 살아 있다 — 조용히 넘어간다.
  }
}
