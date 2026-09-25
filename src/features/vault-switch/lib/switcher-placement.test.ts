import { describe, expect, it } from 'vitest';
import { placeSwitcher, SWITCHER_GAP } from './switcher-placement';

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const chip = rect(0, 12, 63, 70);
const rail = rect(0, 0, 64, 949);
const preferred = { width: 416, maxHeight: 640 };

describe('placeSwitcher', () => {
  it('stands beside its chip, one gap past the rail, top aligned with the chip', () => {
    const placed = placeSwitcher({ trigger: chip, rail, viewport: { width: 1512, height: 949 }, ...preferred });
    expect(placed).toEqual({ left: 64 + SWITCHER_GAP, top: 12, width: 416, maxHeight: 640, scrimLeft: 64 });
  });

  it('keeps the same place at every width, so nothing rearranges between sizes', () => {
    const at = (width: number, height: number) =>
      placeSwitcher({ trigger: chip, rail: rect(0, 0, 64, height), viewport: { width, height }, ...preferred });
    const lefts = [at(1040, 720), at(1280, 800), at(1512, 949), at(1920, 1080)].map((p) => [p.left, p.top]);
    expect(new Set(lefts.map(String)).size).toBe(1);
  });

  it('shrinks to the window rather than leaving it', () => {
    const placed = placeSwitcher({ trigger: chip, rail, viewport: { width: 400, height: 300 }, ...preferred });
    expect(placed.left + placed.width).toBe(400 - 16);
    expect(placed.top + placed.maxHeight).toBe(300 - 16);
  });
});
