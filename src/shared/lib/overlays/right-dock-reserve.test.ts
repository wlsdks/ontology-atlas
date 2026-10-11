import { describe, expect, it } from 'vitest';

import { floatingRightBound } from './right-dock-reserve';

/**
 * Floating surfaces over the map must stop at the left edge of a right-docked panel, not at
 * `window.innerWidth`.
 */
describe('떠 있는 것의 오른쪽 벽', () => {
  it('도크가 없으면 화면 끝이 벽이다 — 회귀 0', () => {
    expect(floatingRightBound(1512, 0)).toBe(1512);
  });

  it('도크가 서면 그만큼 앞에서 멈춘다', () => {
    expect(floatingRightBound(1512, 420)).toBe(1092);
    // Widening the dock moves the wall in by the same amount — this is not a constant.
    expect(floatingRightBound(1512, 968)).toBe(544);
  });

  it('도크가 화면보다 넓다고 나와도 음수가 되지 않는다', () => {
    expect(floatingRightBound(800, 1200)).toBe(0);
  });

  it('잴 수 없는 값은 벽을 만들지 않는다', () => {
    expect(floatingRightBound(Number.NaN, 420)).toBe(0);
    expect(floatingRightBound(1512, Number.NaN)).toBe(1512);
  });
});
