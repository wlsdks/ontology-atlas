import { describe, expect, it } from 'vitest';
import { placeAnchoredPopover } from './anchored-popover';

const rect = (left: number, right: number, top = 32, bottom = 68) => ({ left, right, top, bottom });

describe('placeAnchoredPopover', () => {
  it('grows rightward from the trigger when the free map has room (INDEX open at 1512)', () => {
    // Measured before the fix: trigger 544-580, INDEX panel right edge 388, popover 260-580.
    const placed = placeAnchoredPopover({ trigger: rect(544, 580), boundary: rect(412, 1480, 0, 900), width: 320, inset: 0, gap: 8 });
    expect(placed.align).toBe('start');
    expect(placed.left).toBe(544);
    expect(placed.left + placed.width).toBe(864);
    expect(placed.top).toBe(76);
    expect(placed.originX).toBe(18);
  });

  it('shifts left, never past the boundary, when the trigger sits near the right edge', () => {
    const placed = placeAnchoredPopover({ trigger: rect(900, 936), boundary: rect(412, 1000, 0, 900), width: 320, inset: 8, gap: 8 });
    expect(placed.left + placed.width).toBeLessThanOrEqual(992);
    expect(placed.left).toBeGreaterThanOrEqual(420);
    expect(placed.originX).toBeGreaterThan(0);
    expect(placed.originX).toBeLessThanOrEqual(placed.width);
  });

  it('shrinks to the boundary rather than leaving it', () => {
    const placed = placeAnchoredPopover({ trigger: rect(420, 456), boundary: rect(400, 640, 0, 900), width: 320, inset: 8, gap: 8 });
    expect(placed.width).toBe(224);
    expect(placed.left).toBe(408);
  });
});
