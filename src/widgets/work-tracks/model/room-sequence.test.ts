import { describe, expect, it } from 'vitest';
import { EXIT_MS, MOVE_MS, SHOW_MS, boxDuring, planSequence, type RoomPath } from './room-sequence';

const box = (x: number, y: number, w = 100, h = 80) => ({ x, y, w, h });
const plan = (from: [string, ReturnType<typeof box>][], to: [string, ReturnType<typeof box>][], leaving = 0, entering = 0) =>
  planSequence({ from: new Map(from), to: new Map(to), leaving, entering });

describe('planSequence', () => {
  it('skips every step when nothing moves, leaves or arrives', () => {
    const sequence = plan([['a', box(0, 0)]], [['a', box(0, 0)]]);
    expect([sequence.exitMs, sequence.moveMs, sequence.showMs]).toEqual([0, 0, 0]);
  });

  it('carries a room along a clear path and waits for a room that leaves first', () => {
    const sequence = plan([['a', box(200, 0)]], [['a', box(0, 0)]], 1);
    expect(sequence.moves.get('a')?.carried).toBe(true);
    expect([sequence.exitMs, sequence.moveMs, sequence.showMs]).toEqual([EXIT_MS, MOVE_MS, 0]);
  });

  it('moves a room as its wall when its size changes or its path crosses a room', () => {
    const resized = plan([['a', box(0, 0)]], [['a', box(0, 0, 60, 40)]]);
    expect(resized.moves.get('a')?.carried).toBe(false);
    expect(resized.showMs).toBe(SHOW_MS);
    const crossing = plan([['a', box(0, 0)], ['b', box(110, 0)]], [['a', box(220, 0)], ['b', box(110, 0)]]);
    expect(crossing.moves.get('a')?.carried).toBe(false);
  });

  it('sends a room into a box before the room giving it up leaves, the larger arrival first in a trade', () => {
    const sequence = plan([['stage', box(0, 0)], ['mini', box(0, 100, 50, 30)]], [['stage', box(0, 100, 50, 30)], ['mini', box(0, 0)]]);
    expect(sequence.waves).toBe(2);
    expect(sequence.moves.get('mini')?.wave).toBe(0);
    expect(sequence.moves.get('stage')?.wave).toBe(1);
    expect(boxDuring(sequence.moves.get('stage')!, 2, 0.5)).toEqual(box(0, 0));
    expect(boxDuring(sequence.moves.get('mini')!, 2, 0.5)).toEqual(box(0, 0));
  });

  it('slides the rooms of a merge relayout one axis at a time so no two walls cross', () => {
    // Two rows of two at 1920 px become one row of three once the top right room has merged.
    const from = [['a', box(104, 94, 882, 416)], ['b', box(104, 522, 882, 416)], ['c', box(998, 522, 882, 416)]] as [string, ReturnType<typeof box>][];
    const to = [['a', box(104, 266, 584, 500)], ['b', box(700, 266, 584, 500)], ['c', box(1296, 266, 584, 500)]] as [string, ReturnType<typeof box>][];
    const sequence = plan(from, to);
    const crossings = (path: RoomPath) => {
      let count = 0;
      for (let step = 0; step <= 32; step += 1) {
        const [a, b, c] = ['a', 'b', 'c'].map(key => boxDuring(sequence.moves.get(key)!, 1, step / 32, path));
        const meet = (p: typeof a, q: typeof a) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 2 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 2;
        count += [meet(a, b), meet(b, c), meet(a, c)].filter(Boolean).length;
      }
      return count;
    };
    expect(sequence.path).toBe('acrossFirst');
    expect(crossings('straight')).toBeGreaterThan(0);
    expect(crossings(sequence.path)).toBe(0);
  });

  it('lets a floor shift with its content while a room rises to the stage and the stopped one drops after it', () => {
    // At 1920 px: a floor room rises into a stopped room's stage slot, two floor rooms shift left, the stopped room drops to the end.
    const sequence = plan(
      [['rising', box(196, 532, 309, 76)], ['second', box(513, 532, 309, 76)], ['third', box(830, 532, 309, 76)], ['stopped', box(298, 24, 286, 464)]],
      [['rising', box(298, 24, 286, 464)], ['second', box(196, 532, 309, 76)], ['third', box(513, 532, 309, 76)], ['stopped', box(830, 532, 309, 76)]],
    );
    const wave = (key: string) => sequence.moves.get(key)!.wave;
    expect(sequence.moves.get('second')?.carried).toBe(true);
    expect(sequence.moves.get('third')?.carried).toBe(true);
    expect(wave('rising')).toBeLessThan(wave('stopped'));
    expect(wave('third')).toBeLessThan(wave('stopped'));
  });
});
