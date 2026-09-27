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

describe('listboxGrowth takes the smaller of the row cap and the space cap', () => {
  it('fits all seven rows of the measured runner without scrolling', () => {
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
  it('does not overflow when uncapped rows grow by 1px', () => {
    const settled = REAL_RUNNER.map((h) => h + 1);
    const growth = listboxGrowth({ ...CHROME, rowHeights: settled, availableHeight: 600 });
    expect(growth?.overflowing).toBe(false);
    expect(growth?.height).toBeGreaterThan(settled.reduce((a, b) => a + b, 0) + 10);
  });

  it('scrolls inside once the row cap is exceeded', () => {
    const rowHeights = Array.from({ length: 12 }, () => SINGLE);
    const growth = listboxGrowth({ ...CHROME, rowHeights, availableHeight: 900 });
    expect(growth?.rows).toBe(LISTBOX_MAX_ROWS);
    expect(growth?.height).toBe(SINGLE * LISTBOX_MAX_ROWS + 10);
    expect(growth?.overflowing).toBe(true);
    expect(growth?.cappedBy).toBe('rows');
  });

  it('caps by space when the space runs out before the row cap', () => {
    const growth = listboxGrowth({ ...CHROME, rowHeights: REAL_RUNNER, availableHeight: 120 });
    expect(growth?.height).toBe(120);
    expect(growth?.overflowing).toBe(true);
    expect(growth?.cappedBy).toBe('space');
    // Only whole rows count: 8+30+30+30 = 98 fits in 120; the next two-line row
    // would reach 146.
    expect(growth?.rows).toBe(3);
  });

  it('does not count a half-visible row as fitted when heights are mixed', () => {
    const growth = listboxGrowth({
      ...CHROME,
      rowHeights: [SINGLE, DOUBLE, DOUBLE],
      // 8 + 30 + 48 = 86 is whole; this height admits only half the third row.
      availableHeight: 110,
    });
    expect(growth?.rows).toBe(2);
    expect(growth?.overflowing).toBe(true);
  });

  it('returns null without rows, space or finite heights', () => {
    expect(listboxGrowth({ ...CHROME, rowHeights: [], availableHeight: 600 })).toBeNull();
    expect(listboxGrowth({ ...CHROME, rowHeights: [SINGLE], availableHeight: 0 })).toBeNull();
    expect(listboxGrowth({ ...CHROME, rowHeights: [Number.NaN], availableHeight: 600 })).toBeNull();
  });
});

describe('scroll affordance', () => {
  it('shows no signal at any scroll offset while not overflowing', () => {
    expect(listboxTopIsHidden(false, 40)).toBe(false);
    expect(listboxBottomIsHidden(false, 0, 200, 400)).toBe(false);
  });

  it('hides nothing above at the top of an overflowing list', () => {
    expect(listboxTopIsHidden(true, 0)).toBe(false);
    // Just-opened state: nothing hidden above, and the bottom carries "more".
    expect(listboxBottomIsHidden(true, 0, 240, 400)).toBe(true);
  });

  it('clears the bottom signal at the end of the list', () => {
    expect(listboxBottomIsHidden(true, 160, 240, 400)).toBe(false);
    expect(listboxTopIsHidden(true, 160)).toBe(true);
  });
});

describe('listboxLeft keeps the list inside the viewport before under the trigger', () => {
  it('uses the trigger left edge when the list fits', () => {
    expect(listboxLeft({ triggerLeft: 120, listWidth: 200, viewportWidth: 800, pad: 8 })).toBe(120);
  });

  it('shifts left to the right margin when the list would cross the right edge', () => {
    // Trigger at 620 in a 1512px window, list 400 wide: 620 + 400 > 1504.
    expect(listboxLeft({ triggerLeft: 620, listWidth: 400, viewportWidth: 1000, pad: 8 })).toBe(592);
  });

  it('starts a list wider than the viewport at the left margin', () => {
    expect(listboxLeft({ triggerLeft: 300, listWidth: 1200, viewportWidth: 1000, pad: 8 })).toBe(8);
  });
});
