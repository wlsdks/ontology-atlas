import { describe, expect, it } from 'vitest';
import { placeSwitcher, SWITCHER_GAP } from './switcher-placement';

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const chip = rect(0, 12, 63, 70);
const preferred = { width: 416, maxHeight: 640 };

describe('placeSwitcher', () => {
  it('stands beside the chip when nothing is in the way (off the map)', () => {
    const placed = placeSwitcher({
      trigger: chip,
      viewport: { width: 1512, height: 949 },
      toolbar: null,
      obstacles: [],
      ...preferred,
    });
    expect(placed).toEqual({ left: 63 + SWITCHER_GAP, top: 70, width: 416, maxHeight: 640 });
  });

  it('opens past the open INDEX, on the toolbar start line and under the toolbar (1512)', () => {
    const placed = placeSwitcher({
      trigger: chip,
      viewport: { width: 1512, height: 949 },
      toolbar: rect(412, 32, 1480, 68),
      obstacles: [rect(88, 24, 388, 463)],
      ...preferred,
    });
    expect(placed.left).toBe(412);
    expect(placed.top).toBe(68 + SWITCHER_GAP);
    expect(placed.width).toBe(416);
  });

  it('clears the collapsed INDEX tab even where the toolbar box starts under it (1040)', () => {
    const placed = placeSwitcher({
      trigger: chip,
      viewport: { width: 1040, height: 720 },
      toolbar: rect(88, 24, 1016, 112),
      obstacles: [rect(64, 84, 90, 180)],
      ...preferred,
    });
    expect(placed.left).toBe(90 + SWITCHER_GAP);
    expect(placed.top).toBe(112 + SWITCHER_GAP);
    expect(placed.maxHeight).toBe(720 - 16 - 120);
  });

  it('shrinks to the free map rather than leaving it', () => {
    const placed = placeSwitcher({
      trigger: chip,
      viewport: { width: 700, height: 600 },
      toolbar: rect(412, 24, 676, 60),
      obstacles: [rect(88, 24, 388, 463)],
      ...preferred,
    });
    expect(placed.left + placed.width).toBe(676);
  });
});
