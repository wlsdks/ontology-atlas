import { describe, expect, it } from 'vitest';

import { clampMenuToBox } from './caret-position';

/**
 * jsdom has no layout, so only the pure placement rule is tested here; caret coordinates need a
 * real browser.
 */
describe('clampMenuToBox keeps the menu inside the editor', () => {
  const box = { width: 800, height: 600 };
  const menu = { width: 320, height: 240 };

  it('places the menu right below the caret line when there is room', () => {
    const at = clampMenuToBox({
      caret: { top: 100, left: 200, lineHeight: 20 },
      box,
      menu,
    });
    expect(at).toEqual({ top: 126, left: 200 });
  });

  it('flips the menu above the caret when it cannot open downward', () => {
    const at = clampMenuToBox({
      caret: { top: 520, left: 100, lineHeight: 20 },
      box,
      menu,
    });
    // 520 + 20 + 6 + 240 = 786 > 600 → flip above
    expect(at.top).toBe(520 - 240 - 6);
  });

  it('pulls the menu left at the right edge', () => {
    const at = clampMenuToBox({
      caret: { top: 100, left: 760, lineHeight: 20 },
      box,
      menu,
    });
    expect(at.left).toBe(800 - 320 - 6);
  });

  it('never goes negative in a narrow editor', () => {
    const at = clampMenuToBox({
      caret: { top: 10, left: 5, lineHeight: 20 },
      box: { width: 200, height: 120 },
      menu,
    });
    expect(at.left).toBeGreaterThanOrEqual(0);
    expect(at.top).toBeGreaterThanOrEqual(0);
  });
});
