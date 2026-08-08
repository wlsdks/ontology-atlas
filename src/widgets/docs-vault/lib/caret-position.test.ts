import { describe, expect, it } from 'vitest';

import { clampMenuToBox } from './caret-position';

/**
 * `caretPoint` 자체는 브라우저의 줄바꿈 계산에 기대므로 jsdom 에서 잴 수 없다
 * (jsdom 은 레이아웃을 하지 않아 `offsetTop` 이 항상 0 이다). 그래서 여기서는
 * **자리 잡기 규칙**만 잰다 — 그 규칙이 순수 산술이고, 실제로 사고가 나는
 * 지점이기도 하다: 메뉴가 편집기 밖으로 나가면 잘리거나 스크롤을 만들어
 * 편집 중인 글이 흔들린다.
 *
 * 캐럿 좌표 자체는 실기기에서 확인한다(브라우저 없이 증명할 수 없는 층).
 */
describe('clampMenuToBox — 메뉴는 편집기 밖으로 나가지 않는다', () => {
  const box = { width: 800, height: 600 };
  const menu = { width: 320, height: 240 };

  it('자리가 있으면 캐럿 줄 바로 아래에 붙는다', () => {
    const at = clampMenuToBox({
      caret: { top: 100, left: 200, lineHeight: 20 },
      box,
      menu,
    });
    expect(at).toEqual({ top: 126, left: 200 });
  });

  it('아래로 못 펴면 캐럿 위로 뒤집는다 — 잘린 메뉴는 없는 것과 같다', () => {
    const at = clampMenuToBox({
      caret: { top: 520, left: 100, lineHeight: 20 },
      box,
      menu,
    });
    // 520 + 20 + 6 + 240 = 786 > 600 → 위로
    expect(at.top).toBe(520 - 240 - 6);
  });

  it('오른쪽 끝에서는 왼쪽으로 당겨 붙인다', () => {
    const at = clampMenuToBox({
      caret: { top: 100, left: 760, lineHeight: 20 },
      box,
      menu,
    });
    expect(at.left).toBe(800 - 320 - 6);
  });

  it('좁은 편집기에서도 음수로 나가지 않는다', () => {
    const at = clampMenuToBox({
      caret: { top: 10, left: 5, lineHeight: 20 },
      box: { width: 200, height: 120 },
      menu,
    });
    expect(at.left).toBeGreaterThanOrEqual(0);
    expect(at.top).toBeGreaterThanOrEqual(0);
  });
});
