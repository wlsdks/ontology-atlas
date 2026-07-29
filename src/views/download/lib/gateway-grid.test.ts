import { describe, expect, it } from 'vitest';
import { computeGatewaySafeInset } from './gateway-grid';

describe('computeGatewaySafeInset', () => {
  it('오늘의 세 원자값이 예전 하드코딩 544 와 같은 값을 낸다', () => {
    // 이 줄이 마이그레이션의 증인이다 — `app/globals.css` 에 리터럴로 박혀
    // 있던 544 가 파생식에서 그대로 나온다는 것.
    expect(computeGatewaySafeInset({ gutter: 40, plateWidth: 480, plateGap: 24 })).toBe(544);
  });

  it('홈통이 자라면 예약폭도 같이 자란다 — 손으로 다시 더하지 않는다', () => {
    expect(computeGatewaySafeInset({ gutter: 64, plateWidth: 480, plateGap: 24 })).toBe(568);
    expect(computeGatewaySafeInset({ gutter: 96, plateWidth: 480, plateGap: 24 })).toBe(600);
  });

  it('음수 틈은 판 뒤로 지도를 밀어 넣는 의도된 입력이다', () => {
    // 예약폭(400)이 판 오른끝(40+480=520)보다 왼쪽이면 그 사이 120px 을
    // 지도 잉크가 지나간다 — 판이 지도를 덮는다.
    expect(computeGatewaySafeInset({ gutter: 40, plateWidth: 480, plateGap: -120 })).toBe(400);
  });

  it('아무리 밀어 넣어도 0 아래로는 안 간다', () => {
    // 예약폭이 음수가 되면 카메라가 화면 밖을 예약하는 셈이라 의미가 없다.
    expect(computeGatewaySafeInset({ gutter: 40, plateWidth: 480, plateGap: -9999 })).toBe(0);
  });
});
