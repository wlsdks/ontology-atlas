import { describe, expect, it } from 'vitest';

import { floatingRightBound } from './right-dock-reserve';

/**
 * 지도 위에 떠 있는 것들의 **오른쪽 벽**.
 *
 * 2026-08-16 검수에서 같은 결함이 넷 나왔다 — 알림 · 업데이트 알림 · 호버 카드 ·
 * 오른쪽 클릭 메뉴가 전부 `window.innerWidth` 를 벽으로 삼고 있었다. 지도
 * 오른쪽에 대화 패널이 서면 그 벽은 **패널 너머**를 가리키고, 지도를 설명하는
 * 표면이 패널 위에 적힌다.
 */
describe('떠 있는 것의 오른쪽 벽', () => {
  it('도크가 없으면 화면 끝이 벽이다 — 회귀 0', () => {
    expect(floatingRightBound(1512, 0)).toBe(1512);
  });

  it('도크가 서면 그만큼 앞에서 멈춘다', () => {
    expect(floatingRightBound(1512, 420)).toBe(1092);
    // 사용자가 넓혀 두면 벽도 그만큼 앞으로 온다 — 상수가 아니다.
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
