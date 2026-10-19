import { describe, expect, it } from 'vitest';
import { boardLines } from './board-layout';

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

  it('spreads lines that share a side in the order of their far ends and keeps them on the card', () => {
    const boxes = new Map([['a', box(100, 0)], ['right', box(400, 200)], ['left', box(-300, 200)], ['under', box(120, 200)]]);
    const lines = boardLines(['right', 'left', 'under'].map(to => ({ id: to, from: 'a', to })), boxes);
    const x = Object.fromEntries(lines.map(line => [line.id, line.x1]));
    expect(x.left).toBeLessThan(x.under!);
    expect(x.under).toBeLessThan(x.right!);
    for (const line of lines) expect(line.x1).toBeGreaterThan(100);
    for (const line of lines) expect(line.x1).toBeLessThan(200);
  });

  it('draws nothing for an endpoint that is not on the board', () => {
    expect(boardLines([{ id: 'x', from: 'a', to: 'gone' }], new Map([['a', box(0, 0)]]))).toEqual([]);
  });
});
