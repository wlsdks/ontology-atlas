import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ribbonPath } from './film-ribbon';

/** A `Path2D` that keeps the points it was given, in order. */
class RecordedPath {
  points: { op: string; x: number; y: number }[] = [];
  moveTo(x: number, y: number) {
    this.points.push({ op: 'move', x, y });
  }
  lineTo(x: number, y: number) {
    this.points.push({ op: 'line', x, y });
  }
  closePath() {
    this.points.push({ op: 'close', x: 0, y: 0 });
  }
}

beforeEach(() => vi.stubGlobal('Path2D', RecordedPath));
afterEach(() => vi.unstubAllGlobals());

const straight = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 100, y: 0 },
];

describe('a tapered ribbon along a line', () => {
  it('is empty when the part shown has fewer than two points', () => {
    const path = ribbonPath(straight, 8, 0.5, 0.5, true) as unknown as RecordedPath;
    expect(path.points).toEqual([]);
  });

  it('is as wide as asked at the wide end and a hair wide at the other', () => {
    const path = ribbonPath(straight, 8, 0, 1, true) as unknown as RecordedPath;
    const lines = path.points.filter((point) => point.op === 'line');
    const left = lines.slice(0, 3);
    const right = lines.slice(3).reverse();
    const widthAt = (index: number) => Math.abs(left[index]!.y - right[index]!.y);
    expect(widthAt(0)).toBeCloseTo(8 + 0.5);
    expect(widthAt(2)).toBeCloseTo(0.5);
    expect(widthAt(1)).toBeCloseTo(4 + 0.5);
  });

  it('puts the wide end at the other side when it does not start wide', () => {
    const path = ribbonPath(straight, 8, 0, 1, false) as unknown as RecordedPath;
    const lines = path.points.filter((point) => point.op === 'line');
    const widthAt = (index: number) => Math.abs(lines[index]!.y - lines[5 - index]!.y);
    expect(widthAt(0)).toBeCloseTo(0.5);
    expect(widthAt(2)).toBeCloseTo(8 + 0.5);
  });

  it('closes the outline and starts where the line starts', () => {
    const path = ribbonPath(straight, 8, 0, 1, true) as unknown as RecordedPath;
    expect(path.points[0]).toMatchObject({ op: 'move', x: 0 });
    expect(path.points.at(-1)!.op).toBe('close');
  });
});
