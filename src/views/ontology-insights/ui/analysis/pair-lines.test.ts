import { describe, expect, it } from 'vitest';
import { pairArrow, pairCurve, pairLines, type CardBox } from './pair-lines';

const box = (left: number, top: number): CardBox => ({ left, right: left + 100, top, bottom: top + 36 });

describe('pairLines', () => {
  it('runs each line from the source card right edge to the target card left edge', () => {
    const [line] = pairLines([{ id: 'e', from: 'a', to: 'b' }], new Map([['a', box(0, 0)], ['b', box(300, 0)]]));
    expect(line).toEqual({ id: 'e', x1: 100, y1: 18, x2: 300, y2: 18 });
  });

  it('orders the ports of one card by where its lines end, so they do not cross', () => {
    const boxes = new Map([['a', box(0, 0)], ['upper', box(300, 0)], ['lower', box(300, 80)]]);
    const lines = pairLines([{ id: 'to-lower', from: 'a', to: 'lower' }, { id: 'to-upper', from: 'a', to: 'upper' }], boxes);
    const y1 = Object.fromEntries(lines.map(line => [line.id, line.y1]));
    expect(y1['to-upper']).toBeLessThan(y1['to-lower']!);
  });

  it('lands every line that reaches one card on a single arrowhead', () => {
    const boxes = new Map([['upper', box(0, 0)], ['lower', box(0, 80)], ['b', box(300, 40)]]);
    const lines = pairLines([{ id: 'one', from: 'upper', to: 'b' }, { id: 'two', from: 'lower', to: 'b' }], boxes);
    expect(lines.map(line => line.y2)).toEqual([58, 58]);
  });

  it('skips a link whose card is not on screen', () => {
    expect(pairLines([{ id: 'e', from: 'a', to: 'gone' }], new Map([['a', box(0, 0)]]))).toEqual([]);
  });
});

describe('pair line geometry', () => {
  it('stops the stroke where the arrowhead begins and lands the tip on the card edge', () => {
    const line = { id: 'e', x1: 100, y1: 18, x2: 300, y2: 58 };
    expect(pairCurve(line)).toBe('M 100 18 C 196.5 18, 196.5 58, 293 58');
    expect(pairArrow(line)).toBe('293,54.5 300,58 293,61.5');
  });
});
