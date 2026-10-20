import { describe, expect, it } from 'vitest';
import { boardCurve, boardLines } from './board-layout';

const box = (left: number, top: number, width = 100, height = 40) => ({ left, top, right: left + width, bottom: top + height });

describe('project board layout', () => {
  it('crosses between rows vertically and stays horizontal inside one row', () => {
    const boxes = new Map([['a', box(0, 0)], ['below', box(300, 100)], ['above', box(0, -100)], ['beside', box(300, 10)]]);
    const [down, up, right, left] = boardLines([{ id: 'down', from: 'a', to: 'below' }, { id: 'up', from: 'a', to: 'above' }, { id: 'right', from: 'a', to: 'beside' }, { id: 'left', from: 'beside', to: 'a' }], boxes);
    expect(down).toMatchObject({ y1: 40, y2: 100, axis: 'y' });
    expect(up).toMatchObject({ y1: 0, y2: -60, axis: 'y' });
    expect(right).toMatchObject({ x1: 100, x2: 300, axis: 'x' });
    expect(left).toMatchObject({ x1: 300, x2: 100, axis: 'x' });
  });

  it('fans every departure on one side out of one point on the card', () => {
    const boxes = new Map([['a', box(100, 0)], ['right', box(400, 200)], ['left', box(-300, 200)], ['under', box(120, 200)]]);
    const lines = boardLines(['right', 'left', 'under'].map(to => ({ id: to, from: 'a', to })), boxes);
    expect(new Set(lines.map(line => `${line.x1},${line.y1}`)).size).toBe(1);
    expect(lines[0]).toMatchObject({ y1: 40 });
    expect(lines[0]!.x1).toBeGreaterThan(100);
    expect(lines[0]!.x1).toBeLessThan(200);
  });

  it('lands every arrival on one side at one point and keeps departures apart from it', () => {
    const boxes = new Map([['a', box(100, 200)], ['left', box(-300, 0)], ['over', box(120, 0)], ['right', box(400, 0)]]);
    const lines = boardLines([{ id: 'in1', from: 'left', to: 'a' }, { id: 'in2', from: 'right', to: 'a' }, { id: 'out', from: 'a', to: 'over' }], boxes);
    const [in1, in2, out] = lines;
    expect(in1).toMatchObject({ x2: in2!.x2, y2: 200 });
    expect(out!.y1).toBe(200);
    expect(out!.x1).toBeGreaterThan(in1!.x2);
  });

  it('draws nothing for an endpoint that is not on the board', () => {
    expect(boardLines([{ id: 'x', from: 'a', to: 'gone' }], new Map([['a', box(0, 0)]]))).toEqual([]);
  });

  it('seats a departure toward its first channel, not toward its far card', () => {
    const boxes = new Map([['a', box(0, 0)], ['far', box(-450, 300)], ['near', box(100, 200)]]);
    const ends = (via: { x: number; enter: number; exit: number }[]) => boardLines([{ id: 'out', from: 'a', to: 'far', via }, { id: 'in', from: 'near', to: 'a' }], boxes);
    const [out, arrival] = ends([{ x: 260, enter: 80, exit: 160 }]);
    expect(out!.x1).toBeGreaterThan(arrival!.x2);
    const [straight, straightArrival] = ends([]);
    expect(straight!.x1).toBeLessThan(straightArrival!.x2);
  });

  it('crosses a skipped lane straight through its channel', () => {
    const boxes = new Map([['a', box(0, 0)], ['c', box(0, 300)]]);
    const [line] = boardLines([{ id: 'skip', from: 'a', to: 'c', via: [{ x: 260, enter: 120, exit: 180 }] }], boxes);
    expect(line).toMatchObject({ y1: 40, y2: 300, axis: 'y' });
    expect(boardCurve(line!)).toContain('C 50 80, 260 80, 260 120 L 260 180');
  });
});
