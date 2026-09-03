import { describe, expect, it } from 'vitest';
import {
  LISTBOX_MAX_ROWS,
  listboxBottomIsHidden,
  listboxGrowth,
  listboxLeft,
  listboxTopIsHidden,
} from './select-growth';

/** Measured row heights: 30px for one line, 48px for a row carrying a description. */
const SINGLE = 30;
const DOUBLE = 48;
const CHROME = { paddingBlock: 8, borderBlock: 2 };

/** The configuration a real runner produced: 3 chat rows plus 4 embedding rows. */
const REAL_RUNNER = [SINGLE, SINGLE, SINGLE, DOUBLE, DOUBLE, DOUBLE, DOUBLE];

describe('목록의 자람 — 상한이 둘이고 작은 쪽이 이긴다', () => {
  it('실측 러너의 7개는 스크롤 없이 전부 담긴다 (흔한 경우가 스크롤되면 신호가 거짓말이 된다)', () => {
    const growth = listboxGrowth({ ...CHROME, rowHeights: REAL_RUNNER, availableHeight: 600 });
    // Nothing caps it, so the cap is the available space and the box sizes to
    // its own content.
    expect(growth).toEqual({ height: 600, rows: 7, overflowing: false, cappedBy: 'content' });
  });

  /**
   * Regression measured in the installed app, 2026-08-02: capping at the
   * *measured content height* turned the "there is more" affordance on falsely —
   * all 7 rows were visible yet `scrollHeight > clientHeight`. Subpixel rounding
   * or a late web font growing a row by 1px is enough to make the box scroll its
   * own content, so the cap must never track the content.
   */
  it('안 묶일 때의 상한은 내용 높이가 아니다 — 1px 자라도 스크롤이 생기면 안 된다', () => {
    const settled = REAL_RUNNER.map((h) => h + 1);
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
    // Only whole rows count: 8+30+30+30 = 98 fits in 120; the next two-line row
    // would reach 146.
    expect(growth?.rows).toBe(3);
  });

  it('행 높이가 섞여도 반 행을 «담겼다» 고 세지 않는다', () => {
    const growth = listboxGrowth({
      ...CHROME,
      rowHeights: [SINGLE, DOUBLE, DOUBLE],
      // 8 + 30 + 48 = 86 is whole; this height admits only half the third row.
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
    // Just-opened state: nothing hidden above, and the bottom carries "more".
    expect(listboxBottomIsHidden(true, 0, 240, 400)).toBe(true);
  });

  it('끝까지 내리면 아래 신호가 꺼진다', () => {
    expect(listboxBottomIsHidden(true, 160, 240, 400)).toBe(false);
    expect(listboxTopIsHidden(true, 160)).toBe(true);
  });
});

describe('목록의 왼쪽 자리 — 화면 안에 남는 것이 트리거 밑에 남는 것보다 먼저다', () => {
  it('맞으면 트리거의 왼쪽 가장자리를 그대로 쓴다', () => {
    expect(listboxLeft({ triggerLeft: 120, listWidth: 200, viewportWidth: 800, pad: 8 })).toBe(120);
  });

  it('오른쪽을 뚫으면 오른쪽 여백에 닿을 때까지 왼쪽으로 민다 (설치 앱 작성창의 작업 방식 목록, 2026-09-03)', () => {
    // Trigger at 620 in a 1512px window, list 400 wide: 620 + 400 > 1504.
    expect(listboxLeft({ triggerLeft: 620, listWidth: 400, viewportWidth: 1000, pad: 8 })).toBe(592);
  });

  it('창보다 넓은 목록은 왼쪽 여백에서 시작한다 — 두 여백을 다 지킬 수 없으면 시작점을 지킨다', () => {
    expect(listboxLeft({ triggerLeft: 300, listWidth: 1200, viewportWidth: 1000, pad: 8 })).toBe(8);
  });
});
