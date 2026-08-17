import { describe, expect, it } from 'vitest';

import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_MIN,
  CHAT_WIDTH_STORAGE_KEY,
  MAP_MIN_WIDTH,
  RAIL_WIDTH,
  clampChatWidth,
  maxChatWidth,
  readStoredChatWidth,
  writeStoredChatWidth,
} from './panel-width';

/**
 * 폭은 사용자가 정하고, **지도의 몫은 우리가 지킨다.**
 *
 * 이 파일이 못 박는 것은 「끌 수 있다」가 아니라 「끌어도 지도가 안 죽는다」다 —
 * 전자는 화면을 열면 보이고, 후자는 넓은 화면에서 한참 끌어 본 사람만 만난다.
 */
describe('대화 패널 폭 — 사용자가 끌되 지도는 지킨다', () => {
  it('넓은 화면에서는 상한이 지도의 몫으로 정해진다', () => {
    // 1512 − 64(레일) − 480(지도) = 968
    expect(maxChatWidth(1512)).toBe(1512 - RAIL_WIDTH - MAP_MIN_WIDTH);
    expect(clampChatWidth(2000, 1512)).toBe(968);
  });

  it('좁은 화면에서는 하한이 이긴다 — 읽히지 않는 패널을 만들지 않는다', () => {
    /*
     * 800 − 64 − 480 = 256 으로 하한(320)보다 작다. 계산을 그대로 따르면
     * 패널이 세로 글씨가 되므로, 그때는 지도가 조금 좁아지는 쪽을 고른다.
     */
    expect(maxChatWidth(800)).toBe(CHAT_WIDTH_MIN);
    expect(clampChatWidth(600, 800)).toBe(CHAT_WIDTH_MIN);
  });

  it('하한 아래로는 못 내려간다', () => {
    expect(clampChatWidth(100, 1512)).toBe(CHAT_WIDTH_MIN);
  });

  it('잴 수 없는 값은 기본값으로 돌아간다 — 0px 패널을 만들지 않는다', () => {
    expect(clampChatWidth(Number.NaN, 1512)).toBe(CHAT_WIDTH_DEFAULT);
    expect(maxChatWidth(Number.NaN)).toBe(CHAT_WIDTH_DEFAULT);
  });

  it('정수로 떨어진다 — 반 픽셀 폭은 글자를 뭉갠다', () => {
    expect(clampChatWidth(420.4, 1512)).toBe(420);
  });
});

describe('대화 패널 폭 — 저장', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  }

  it('저장한 값을 그대로 되읽는다', () => {
    const storage = fakeStorage();
    writeStoredChatWidth(storage, 512);
    expect(storage.map.get(CHAT_WIDTH_STORAGE_KEY)).toBe('512');
    expect(readStoredChatWidth(storage)).toBe(512);
  });

  it('없거나 망가진 값은 null — 호출자가 기본값을 쓴다', () => {
    expect(readStoredChatWidth(fakeStorage())).toBe(null);
    expect(readStoredChatWidth(fakeStorage({ [CHAT_WIDTH_STORAGE_KEY]: 'wide' }))).toBe(null);
    expect(readStoredChatWidth(fakeStorage({ [CHAT_WIDTH_STORAGE_KEY]: '0' }))).toBe(null);
  });

  it('저장소가 막혀 있어도 터지지 않는다 — 패널은 열려야 한다', () => {
    const blocked = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readStoredChatWidth(blocked)).toBe(null);
    expect(() => writeStoredChatWidth(blocked, 400)).not.toThrow();
  });
});
