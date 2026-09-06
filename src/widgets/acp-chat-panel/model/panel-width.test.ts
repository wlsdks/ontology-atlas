import { describe, expect, it } from 'vitest';

import {
  CHAT_WIDTH_DEFAULT,
  CHAT_WIDTH_MIN,
  CHAT_WIDTH_STORAGE_KEY,
  MAP_COMFORT_WIDTH,
  MAP_MIN_WIDTH,
  RAIL_WIDTH,
  clampChatWidth,
  defaultChatWidth,
  maxChatWidth,
  readStoredChatWidth,
  writeStoredChatWidth,
} from './panel-width';

/**
 * The user decides the width, and **we protect the map's share.**
 *
 * What this file pins is not "it can be dragged" but "dragging cannot kill the
 * map" — the first is visible the moment the screen opens, the second is met only
 * by someone who drags a long way on a wide screen.
 */
describe('대화 패널 폭 — 사용자가 끌되 지도는 지킨다', () => {
  it('넓은 화면에서는 상한이 지도의 몫으로 정해진다', () => {
    // 1512 − 64 (rail) − 480 (map) = 968
    expect(maxChatWidth(1512)).toBe(1512 - RAIL_WIDTH - MAP_MIN_WIDTH);
    expect(clampChatWidth(2000, 1512)).toBe(968);
  });

  it('좁은 화면에서는 하한이 이긴다 — 읽히지 않는 패널을 만들지 않는다', () => {
    /*
     * 800 − 64 − 480 = 256, below the lower bound of 320. Following the arithmetic
     * would turn the panel into vertical text, so a slightly narrower map wins.
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

  /**
   * The width nobody chose still has to be a width somebody would pick. At 460 the composer
   * inside it was 368px, which the two pickers divided into about 181px each; 520 makes it
   * 428px and about 211px each, so the tool and the mode read whole in the footer's two-row
   * shape. It stays far below the 968 ceiling a 1512 screen allows, so the map keeps its share.
   */
  it('the default width opens the dock in its whole shape, not its folded one', () => {
    expect(CHAT_WIDTH_DEFAULT).toBe(520);
    expect(CHAT_WIDTH_DEFAULT).toBeGreaterThan(CHAT_WIDTH_MIN);
    expect(CHAT_WIDTH_DEFAULT).toBeLessThanOrEqual(maxChatWidth(1512));
    expect(defaultChatWidth(1512)).toBe(CHAT_WIDTH_DEFAULT);
    // The default must survive the clamp unchanged — a default the clamp rewrites is not one.
    expect(clampChatWidth(CHAT_WIDTH_DEFAULT, 1512)).toBe(CHAT_WIDTH_DEFAULT);
  });
});

/**
 * **A width somebody chose and a width we chose for them are not folded the same way.**
 *
 * `clampChatWidth` protects `MAP_MIN_WIDTH`, the floor a drag may not cross — the person is
 * holding the edge and watching the map narrow. A default is nobody watching anything, so it
 * stops earlier, at `MAP_COMFORT_WIDTH`.
 *
 * The regression that separated them: raising the default to 520 left the app's own 1040px
 * minimum window a 480px map, and at 480 a relation caption on the map stopped fitting
 * (`tests/e2e/analysis-workbench.spec.ts`, "showing a relationship reveals its hidden endpoint
 * at 1040px"). Nothing about that change went near the map.
 */
describe('대화 패널 폭 — 아무도 안 고른 폭은 지도에 더 양보한다', () => {
  it('leaves the map its comfortable share at the app\u2019s smallest window', () => {
    // 1040 − 64 (rail) − 540 (map comfort) = 436, which is under the 520 ceiling.
    expect(defaultChatWidth(1040)).toBe(1040 - RAIL_WIDTH - MAP_COMFORT_WIDTH);
    expect(defaultChatWidth(1040)).toBe(436);
    // And that is strictly kinder to the map than the drag floor would have been.
    expect(defaultChatWidth(1040)).toBeLessThan(maxChatWidth(1040));
    expect(1040 - RAIL_WIDTH - defaultChatWidth(1040)).toBeGreaterThanOrEqual(MAP_COMFORT_WIDTH);
  });

  it('takes the whole ceiling once the screen can pay for it', () => {
    expect(defaultChatWidth(1512)).toBe(CHAT_WIDTH_DEFAULT);
    expect(defaultChatWidth(1920)).toBe(CHAT_WIDTH_DEFAULT);
    // The step where the ceiling starts to win: 520 + 64 + 540.
    expect(defaultChatWidth(1124)).toBe(CHAT_WIDTH_DEFAULT);
    expect(defaultChatWidth(1123)).toBe(519);
  });

  it('still refuses to make an unreadable panel, and still answers an unmeasurable screen', () => {
    // Below both promises the lower bound wins, exactly as it does for a dragged width.
    expect(defaultChatWidth(800)).toBe(CHAT_WIDTH_MIN);
    expect(defaultChatWidth(Number.NaN)).toBe(CHAT_WIDTH_DEFAULT);
  });

  it('never crosses the drag floor either — the two promises point the same way', () => {
    for (const viewport of [1040, 1280, 1366, 1512, 1920, 2560]) {
      expect(defaultChatWidth(viewport), String(viewport)).toBeLessThanOrEqual(
        maxChatWidth(viewport),
      );
    }
    expect(MAP_COMFORT_WIDTH).toBeGreaterThan(MAP_MIN_WIDTH);
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
