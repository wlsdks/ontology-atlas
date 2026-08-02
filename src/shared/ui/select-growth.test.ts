import { describe, expect, it } from 'vitest';
import {
  LISTBOX_MAX_ROWS,
  listboxBottomIsHidden,
  listboxGrowth,
  listboxTopIsHidden,
} from './select-growth';

/** 실측 행 높이 — 한 줄 행 30px, 「임베딩 전용」 설명이 붙는 두 줄 행 48px. */
const SINGLE = 30;
const DOUBLE = 48;
const CHROME = { paddingBlock: 8, borderBlock: 2 };

/** 실측 러너가 실제로 내놓은 구성 — 대화 3 + 임베딩 4. */
const REAL_RUNNER = [SINGLE, SINGLE, SINGLE, DOUBLE, DOUBLE, DOUBLE, DOUBLE];

describe('목록의 자람 — 상한이 둘이고 작은 쪽이 이긴다', () => {
  it('실측 러너의 7개는 스크롤 없이 전부 담긴다 (흔한 경우가 스크롤되면 신호가 거짓말이 된다)', () => {
    const growth = listboxGrowth({ ...CHROME, rowHeights: REAL_RUNNER, availableHeight: 600 });
    // 상한은 남은 자리 그대로 — 아무것도 안 묶으므로 상자는 자기 내용대로 큰다.
    expect(growth).toEqual({ height: 600, rows: 7, overflowing: false, cappedBy: 'content' });
  });

  /**
   * 2026-08-02 설치 앱 실측 회귀 — 상한을 **측정한 내용 높이**로 잡았더니
   * 7개가 전부 보이는데도 `scrollHeight > clientHeight` 라 「더 있다」
   * 어포던스가 거짓으로 켜졌다. 서브픽셀·늦게 온 웹폰트로 행이 1px 만 자라도
   * 상자가 자기 내용을 스크롤한다. 상한은 내용을 따라가는 값이면 안 된다.
   */
  it('안 묶일 때의 상한은 내용 높이가 아니다 — 1px 자라도 스크롤이 생기면 안 된다', () => {
    const settled = REAL_RUNNER.map((h) => h + 1); // 폰트가 늦게 와서 행이 자랐다
    const growth = listboxGrowth({ ...CHROME, rowHeights: settled, availableHeight: 600 });
    expect(growth?.overflowing).toBe(false);
    expect(growth?.height).toBeGreaterThan(settled.reduce((a, b) => a + b, 0) + 10);
  });

  it('행 상한을 넘으면 그때부터 안쪽 스크롤이다', () => {
    const rowHeights = Array.from({ length: 12 }, () => SINGLE);
    const growth = listboxGrowth({ ...CHROME, rowHeights, availableHeight: 900 });
    expect(growth?.rows).toBe(LISTBOX_MAX_ROWS);
    expect(growth?.height).toBe(SINGLE * LISTBOX_MAX_ROWS + 10);
    expect(growth?.overflowing).toBe(true);
    expect(growth?.cappedBy).toBe('rows');
  });

  it('행 상한이 남아도 자리가 없으면 자리가 이긴다 (창 아래쪽 트리거)', () => {
    const growth = listboxGrowth({ ...CHROME, rowHeights: REAL_RUNNER, availableHeight: 120 });
    expect(growth?.height).toBe(120);
    expect(growth?.overflowing).toBe(true);
    expect(growth?.cappedBy).toBe('space');
    // 담기는 행만 센다 — 8+30+30+30 = 98 ≤ 120, 다음 두 줄 행은 146 이라 못 담는다.
    expect(growth?.rows).toBe(3);
  });

  it('행 높이가 섞여도 반 행을 «담겼다» 고 세지 않는다', () => {
    const growth = listboxGrowth({
      ...CHROME,
      rowHeights: [SINGLE, DOUBLE, DOUBLE],
      // 8 + 30 + 48 = 86 까지가 온전하고, 세 번째 행의 절반만 들어가는 높이.
      availableHeight: 110,
    });
    expect(growth?.rows).toBe(2);
    expect(growth?.overflowing).toBe(true);
  });

  it('재료가 없으면 판정하지 않는다 — 0px 로 접는 것보다 손대지 않는 편이 낫다', () => {
    expect(listboxGrowth({ ...CHROME, rowHeights: [], availableHeight: 600 })).toBeNull();
    expect(listboxGrowth({ ...CHROME, rowHeights: [SINGLE], availableHeight: 0 })).toBeNull();
    expect(listboxGrowth({ ...CHROME, rowHeights: [Number.NaN], availableHeight: 600 })).toBeNull();
  });
});

describe('스크롤 어포던스 — 없는 넘침을 광고하지 않는다', () => {
  it('상한에 안 닿았으면 어떤 스크롤 값에서도 신호가 없다', () => {
    expect(listboxTopIsHidden(false, 40)).toBe(false);
    expect(listboxBottomIsHidden(false, 0, 200, 400)).toBe(false);
  });

  it('상한에 닿았어도 맨 위에 있으면 위는 가려진 것이 없다', () => {
    expect(listboxTopIsHidden(true, 0)).toBe(false);
    // 열자마자의 상태 — 위는 멀쩡하고 «더 있다» 는 아래가 나른다.
    expect(listboxBottomIsHidden(true, 0, 240, 400)).toBe(true);
  });

  it('끝까지 내리면 아래 신호가 꺼진다', () => {
    expect(listboxBottomIsHidden(true, 160, 240, 400)).toBe(false);
    expect(listboxTopIsHidden(true, 160)).toBe(true);
  });
});
