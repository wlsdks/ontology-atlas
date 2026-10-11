import { describe, expect, it } from 'vitest';

import { floatingRightBound } from './right-dock-reserve';

/**
 * The **right-hand wall** for everything floating over the map.
 *
 * A 2026-08-16 review found the same defect four times over — toasts, update
 * notices, hover cards, and the context menu all treated `window.innerWidth` as the
 * wall. With a chat panel standing to the right of the map, that wall points
 * **beyond the panel**, and surfaces describing the map get drawn on top of it.
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
