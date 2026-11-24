import { describe, expect, it } from 'vitest';
import type { Box } from './building-layout';
import { FADE_MS, MOVE_MS, SHOW_MS, boxAt, boxOnPath, planSequence, type RoomMove, type RoomSequence } from './room-sequence';

const box = (x: number, y: number, w = 100, h = 80): Box => ({ x, y, w, h });
type Rooms = [string, Box][];
const plan = (from: Rooms, to: Rooms, { leaving = 0, entering = 0, keeps = [], stage = keeps }: { leaving?: number; entering?: number; keeps?: string[]; stage?: string[] } = {}) =>
  planSequence({ from: new Map(from), to: new Map(to), leaving, entering, keepsContent: key => keeps.includes(key), startsOnStage: key => stage.includes(key) });

const meet = (a: Box, b: Box) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2;

/** Every moving room's box at each 10 ms of the sequence. */
function frames(sequence: RoomSequence): Map<string, Box>[] {
  const out: Map<string, Box>[] = [];
  for (let time = 0; time <= sequence.totalMs; time += 10) {
    out.push(new Map([...sequence.moves].map(([key, move]) => [key, boxAt(move, sequence, time)])));
  }
  return out;
}

/**
 * Steps of a move, each 10 ms, slower than 15% of its peak between the first and the last step that
 * reach half of it: a stop inside a move, which reads as two moves.
 */
function dips(sequence: RoomSequence, move: RoomMove): string[] {
  const speeds: number[] = [];
  for (let time = 0; time < sequence.moveMs; time += 10) {
    const [a, b] = [boxAt(move, sequence, sequence.moveAtMs + time), boxAt(move, sequence, sequence.moveAtMs + time + 10)];
    speeds.push(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.x + b.w - a.x - a.w), Math.abs(b.y + b.h - a.y - a.h), Math.hypot(b.x - a.x, b.y - a.y)));
  }
  const peak = Math.max(...speeds);
  const [first, last] = [speeds.findIndex(value => value >= peak / 2), speeds.findLastIndex(value => value >= peak / 2)];
  return speeds.flatMap((value, index) => index > first && index < last && value < 0.15 * peak ? [`${index * 10} ms: ${value.toFixed(1)} of ${peak.toFixed(1)}`] : []);
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
    const sequence = plan([['stage', stage], ['mini', box(0, 100, 50, 30)]], [['stage', box(0, 100, 50, 30)], ['mini', stage]], { stage: ['stage'] });
    for (const frame of frames(sequence)) {
      expect([...frame.values()].some(drawn => drawn.x <= 49 && drawn.y <= 39 && drawn.x + drawn.w >= 51 && drawn.y + drawn.h >= 41)).toBe(true);
    }
  });

  it('keeps each stage slot covered between the planner\'s samples when a stage room slides into the next slot', () => {
    // At 1776 px: a stage room stops and drops to the floor, the stage room left of it slides into its
    // slot, and a floor room rises into the slot that one leaves; a second floor room shifts left.
    const stage = (x: number) => box(x, 84, 584, 288);
    const floor = (x: number) => box(x, 388, 389, 96);
    const sequence = plan(
      [['slides', stage(104)], ['stops', stage(700)], ['stays', stage(1296)], ['rises', floor(300)], ['shifts', floor(697)], ['far', floor(1094)]],
      [['slides', stage(700)], ['stops', floor(697)], ['stays', stage(1296)], ['rises', stage(104)], ['shifts', floor(300)], ['far', floor(1094)]],
      { keeps: ['slides'], stage: ['slides', 'stops', 'stays'] },
    );
    const centres = [{ x: 104 + 292, y: 84 + 144 }, { x: 700 + 292, y: 84 + 144 }];
    const covers = (drawn: Box, point: { x: number; y: number }) => drawn.x <= point.x && drawn.x + drawn.w >= point.x && drawn.y <= point.y && drawn.y + drawn.h >= point.y;
    const bare: string[] = [];
    // Half a millisecond: finer than any step the planner checks at.
    for (let time = 0; time <= sequence.totalMs; time += 0.5) {
      const drawn = [...sequence.moves.values()].map(move => boxAt(move, sequence, time));
      centres.forEach((centre, slot) => {
        if (!drawn.some(each => covers(each, centre))) bare.push(`slot ${slot} at ${time} ms`);
      });
    }
    expect(bare).toEqual([]);
  });

  it('moves the rooms of a merge relayout on one curve each, crossing rooms as walls, without two drawn rooms meeting', () => {
    // Two rows of two at 1920 px become one row of three once the top right room has merged. The top
    // left room and the one below it overlap across the whole move, so no curve keeps both drawn.
    const from: Rooms = [['a', box(104, 94, 882, 416)], ['b', box(104, 522, 882, 416)], ['c', box(998, 522, 882, 416)]];
    const to: Rooms = [['a', box(104, 266, 584, 500)], ['b', box(700, 266, 584, 500)], ['c', box(1296, 266, 584, 500)]];
    const sequence = plan(from, to, { keeps: ['a', 'b', 'c'] });
    expect(new Set([...sequence.moves.values()].map(move => move.offsetMs)).size).toBe(3);
    for (const frame of frames(sequence)) {
      const drawn = [...frame].filter(([key]) => sequence.moves.get(key)?.mode !== 'wall').map(([, at]) => at);
      drawn.forEach((one, index) => drawn.slice(index + 1).forEach(other => expect(meet(one, other)).toBe(false)));
    }
    for (const move of sequence.moves.values()) expect(dips(sequence, move)).toEqual([]);
    expect(sequence.totalMs).toBeLessThanOrEqual(FADE_MS + MOVE_MS + SHOW_MS + 2 * 160);
  });

  it('bends a room around a still one on an arc, both axes moving together through the middle', () => {
    const sequence = plan([['a', box(0, 0)], ['still', box(150, 90, 60, 40)]], [['a', box(300, 200)], ['still', box(150, 90, 60, 40)]], { keeps: ['a'] });
    const move = sequence.moves.get('a')!;
    expect(sequence.path).not.toBe('straight');
    expect(move.mode).toBe('carried');
    let together = 0;
    for (let time = 0; time < sequence.moveMs; time += 10) {
      const [a, b] = [boxAt(move, sequence, sequence.moveAtMs + time), boxAt(move, sequence, sequence.moveAtMs + time + 10)];
      expect(meet(a, box(150, 90, 60, 40))).toBe(false);
      if (Math.abs(b.x - a.x) > 0.5 && Math.abs(b.y - a.y) > 0.5) together += 1;
    }
    expect(together * 10).toBeGreaterThanOrEqual(60);
    expect(dips(sequence, move)).toEqual([]);
  });

  it('keeps one pace on an arc, however unequal the two legs', () => {
    const move: RoomMove = { from: box(998, 122, 882, 416), to: box(104, 224, 584, 640), mode: 'resized', wave: 0, offsetMs: 0 };
    for (const overlap of [0.6, 0.4, 0.2]) {
      const speeds: number[] = [];
      for (let step = 0; step < 48; step += 1) {
        const [a, b] = [boxOnPath(move, 1, 'acrossFirst', step / 48, overlap), boxOnPath(move, 1, 'acrossFirst', (step + 1) / 48, overlap)];
        speeds.push(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), Math.abs(b.x + b.w - a.x - a.w), Math.abs(b.y + b.h - a.y - a.h)));
      }
      const median = [...speeds].sort((a, b) => a - b)[24];
      expect(Math.max(...speeds), `overlap ${overlap}`).toBeLessThan(3 * median);
    }
  });

  it('lets a floor shift with its content while a room rises to the stage and the stopped one drops after it', () => {
    // At 1920 px: a floor room rises into a stopped room's stage slot, two floor rooms shift left, the stopped room drops to the end.
    const sequence = plan(
      [['rising', box(196, 532, 309, 76)], ['second', box(513, 532, 309, 76)], ['third', box(830, 532, 309, 76)], ['stopped', box(298, 24, 286, 464)]],
      [['rising', box(298, 24, 286, 464)], ['second', box(196, 532, 309, 76)], ['third', box(513, 532, 309, 76)], ['stopped', box(830, 532, 309, 76)]],
      { stage: ['stopped'] },
    );
    expect(sequence.moves.get('second')?.mode).toBe('carried');
    expect(sequence.moves.get('third')?.mode).toBe('carried');
    expect(sequence.moves.get('rising')?.mode).toBe('wall');
  });

  it('shifts a floor row one slot together with its content when no stage room moves', () => {
    // A gutter passes a floor slot's centre for a few milliseconds; only a stage slot may not show that.
    const floor = (index: number) => box(104 + index * 397, 388, 389, 96);
    const stage: Rooms = [['left', box(104, 84, 584, 288)], ['right', box(700, 84, 584, 288)]];
    const sequence = plan([...stage, ['b', floor(1)], ['c', floor(2)], ['d', floor(3)]], [...stage, ['b', floor(0)], ['c', floor(1)], ['d', floor(2)]]);
    expect(sequence.waves).toBe(1);
    expect([...sequence.moves.values()].map(move => move.mode)).toEqual(['carried', 'carried', 'carried']);
  });
});
