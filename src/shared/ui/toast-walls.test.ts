import { describe, expect, it } from 'vitest';

import {
  resolveToastLane,
  TOAST_FLOOR_MAX_SHARE,
  TOAST_LANE_MIN_WIDTH_PX,
  type ToastWallRect,
} from './toast-walls';

const wall = (side: 'left' | 'right', left: number, right: number): ToastWallRect => ({
  side,
  left,
  right,
  top: 0,
  width: right - left,
  height: 800,
});

const floor = (top: number, height: number): ToastWallRect => ({
  side: 'bottom',
  left: 1200,
  right: 1488,
  top,
  width: 288,
  height,
});

/*
 * The toast's free lane (2026-09-24). The numbers are the map's measured walls at 1512:
 * rail 0–64, INDEX expanded 88–388 or its tab 64–90, the dock from 1004.
 */
describe('resolveToastLane', () => {
  it('no walls is the whole viewport — the 2026-09-07 centre', () => {
    expect(resolveToastLane(1512, 900, [])).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it('the innermost left wall wins: INDEX beside the rail', () => {
    expect(resolveToastLane(1512, 900, [wall('left', 0, 64), wall('left', 88, 388)])).toEqual({
      left: 388,
      right: 0,
      bottom: 0,
    });
  });

  it('the dock is a right wall measured from the viewport edge', () => {
    expect(resolveToastLane(1512, 900, [wall('left', 64, 90), wall('right', 1004, 1500)])).toEqual({
      left: 90,
      right: 508,
      bottom: 0,
    });
  });

  it('a wall with no area is not a wall — a hidden rail, an unmounted tab', () => {
    const hidden: ToastWallRect = { side: 'left', left: 0, right: 0, top: 0, width: 0, height: 0 };
    expect(resolveToastLane(900, 900, [hidden])).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it('a lane narrower than the floor falls back to the viewport — a panel drawn as a sheet', () => {
    const lane = resolveToastLane(800, 900, [wall('left', 0, 300), wall('right', 450, 800)]);
    expect(800 - 300 - 350).toBeLessThan(TOAST_LANE_MIN_WIDTH_PX);
    expect(lane).toEqual({ left: 0, right: 0, bottom: 0 });
  });

  it('the highest floor wall lifts the toast — the readout and the first-visit hint', () => {
    expect(resolveToastLane(1512, 900, [floor(816, 60), floor(838, 30)]).bottom).toBe(84);
  });

  it('a floor wall taller than the share is a sheet, not a floor', () => {
    const tall = 900 * TOAST_FLOOR_MAX_SHARE + 1;
    expect(resolveToastLane(1512, 900, [floor(900 - tall, tall)]).bottom).toBe(0);
  });
});
