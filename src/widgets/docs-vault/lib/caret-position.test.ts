import { describe, expect, it } from 'vitest';

import { clampMenuToBox } from './caret-position';

/**
 * `caretPoint` itself relies on the browser's line-breaking, so it cannot be
 * measured in jsdom (which does no layout, leaving `offsetTop` always 0). So only
 * the **placement rule** is measured here — that rule is pure arithmetic, and it
 * is also where the accidents happen: a menu leaving the editor gets clipped, or
 * creates a scroll that shifts the text being edited.
 *
 * The caret coordinates themselves are confirmed on a real device (a layer that
 * cannot be proven without a browser).
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
    // 520 + 20 + 6 + 240 = 786 > 600 → flip above
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
