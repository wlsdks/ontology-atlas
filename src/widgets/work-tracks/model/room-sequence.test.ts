import { describe, expect, it } from 'vitest';
import type { Box } from './building-layout';
import { FADE_MS, MOVE_MS, SHOW_MS, boxAt, planSequence, type RoomSequence } from './room-sequence';

const box = (x: number, y: number, w = 100, h = 80): Box => ({ x, y, w, h });
type Rooms = [string, Box][];
const plan = (from: Rooms, to: Rooms, { leaving = 0, entering = 0, keeps = [] as string[] } = {}) =>
  planSequence({ from: new Map(from), to: new Map(to), leaving, entering, keepsContent: key => keeps.includes(key) });

const meet = (a: Box, b: Box) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

/** Every moving room's box at each 10 ms of the sequence. */
function frames(sequence: RoomSequence): Map<string, Box>[] {
  const out: Map<string, Box>[] = [];
  for (let time = 0; time <= sequence.totalMs; time += 10) {
    out.push(new Map([...sequence.moves].map(([key, move]) => [key, boxAt(move, sequence, time)])));
  }
  return out;
}

describe('planSequence', () => {
  it('skips every step when nothing moves, leaves or arrives', () => {
    expect(plan([['a', box(0, 0)]], [['a', box(0, 0)]]).totalMs).toBe(0);
  });

  it('carries a room along a clear path and lets a leaving room fade first', () => {
    const sequence = plan([['a', box(200, 0)]], [['a', box(0, 0)]], { leaving: 1 });
    expect(sequence.moves.get('a')?.mode).toBe('carried');
    expect([sequence.exitMs, sequence.moveMs, sequence.showMs]).toEqual([FADE_MS, MOVE_MS, 0]);
  });

  it('resizes a stage room that keeps its content, and moves any other resized or crossing room as its wall', () => {
    expect(plan([['a', box(0, 0)]], [['a', box(0, 0, 60, 40)]], { keeps: ['a'] }).moves.get('a')?.mode).toBe('resized');
    expect(plan([['a', box(0, 0)]], [['a', box(0, 0, 60, 40)]]).moves.get('a')?.mode).toBe('wall');
    const crossing = plan([['a', box(0, 0)], ['b', box(110, 0)]], [['a', box(220, 0)], ['b', box(110, 0)]]);
    expect(crossing.moves.get('a')?.mode).toBe('wall');
  });

  it('staggers the rooms\' fades by at most 80 ms each and 160 ms in all', () => {
    const rooms = (dx: number, w = 100): Rooms => ['a', 'b', 'c', 'd', 'e'].map((key, index) => [key, box(index * 120 + dx, 0, w)]);
    const offsets = [...plan(rooms(0), rooms(10, 60), { keeps: ['a', 'b', 'c', 'd', 'e'] }).moves.values()].map(move => move.offsetMs).sort((a, b) => a - b);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBeLessThanOrEqual(160);
    offsets.slice(1).forEach((offset, index) => expect(offset - offsets[index]).toBeLessThanOrEqual(80));
  });

  it('keeps the slot a stopped room hands to a rising one covered in every frame', () => {
    const stage = box(0, 0);
    const sequence = plan([['stage', stage], ['mini', box(0, 100, 50, 30)]], [['stage', box(0, 100, 50, 30)], ['mini', stage]]);
    for (const frame of frames(sequence)) {
      expect([...frame.values()].some(drawn => drawn.x <= 49 && drawn.y <= 39 && drawn.x + drawn.w >= 51 && drawn.y + drawn.h >= 41)).toBe(true);
    }
  });

  it('resizes the rooms of a merge relayout, their fades staggered, without two of them meeting', () => {
    // Two rows of two at 1920 px become one row of three once the top right room has merged.
    const from: Rooms = [['a', box(104, 94, 882, 416)], ['b', box(104, 522, 882, 416)], ['c', box(998, 522, 882, 416)]];
    const to: Rooms = [['a', box(104, 266, 584, 500)], ['b', box(700, 266, 584, 500)], ['c', box(1296, 266, 584, 500)]];
    const sequence = plan(from, to, { keeps: ['a', 'b', 'c'] });
    expect([...sequence.moves.values()].map(move => move.mode)).toEqual(['resized', 'resized', 'resized']);
    expect(new Set([...sequence.moves.values()].map(move => move.offsetMs)).size).toBe(3);
    for (const frame of frames(sequence)) {
      const [a, b, c] = ['a', 'b', 'c'].map(key => frame.get(key)!);
      expect([meet(a, b), meet(b, c), meet(a, c)]).toEqual([false, false, false]);
    }
    expect(sequence.totalMs).toBeLessThanOrEqual(FADE_MS + MOVE_MS + SHOW_MS + 2 * 160);
  });

  it('passes the corner of a two-leg move still moving, in one beat', () => {
    const from: Rooms = [['a', box(104, 94, 882, 416)], ['b', box(104, 522, 882, 416)], ['c', box(998, 522, 882, 416)]];
    const to: Rooms = [['a', box(104, 266, 584, 500)], ['b', box(700, 266, 584, 500)], ['c', box(1296, 266, 584, 500)]];
    const sequence = plan(from, to, { keeps: ['a', 'b', 'c'] });
    expect(sequence.path).not.toBe('straight');
    for (const move of sequence.moves.values()) {
      const steps: number[] = [];
      for (let time = 0; time < sequence.moveMs; time += 10) {
        const [a, b] = [boxAt(move, sequence, sequence.moveAtMs + time), boxAt(move, sequence, sequence.moveAtMs + time + 10)];
        steps.push(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.x + b.w - a.x - a.w), Math.abs(b.y + b.h - a.y - a.h)));
      }
      // Between easing in and easing out, a step never falls under a third of the fastest before it and then speeds up again.
      const middle = steps.slice(8, -8);
      middle.forEach((step, index) => {
        const peakBefore = Math.max(...middle.slice(0, index + 1));
        const later = Math.max(...middle.slice(index));
        expect(step >= peakBefore / 3 || later <= step * 1.05).toBe(true);
      });
    }
  });

  it('lets a floor shift with its content while a room rises to the stage and the stopped one drops after it', () => {
    // At 1920 px: a floor room rises into a stopped room's stage slot, two floor rooms shift left, the stopped room drops to the end.
    const sequence = plan(
      [['rising', box(196, 532, 309, 76)], ['second', box(513, 532, 309, 76)], ['third', box(830, 532, 309, 76)], ['stopped', box(298, 24, 286, 464)]],
      [['rising', box(298, 24, 286, 464)], ['second', box(196, 532, 309, 76)], ['third', box(513, 532, 309, 76)], ['stopped', box(830, 532, 309, 76)]],
    );
    expect(sequence.moves.get('second')?.mode).toBe('carried');
    expect(sequence.moves.get('third')?.mode).toBe('carried');
    expect(sequence.moves.get('rising')?.mode).toBe('wall');
  });
});
