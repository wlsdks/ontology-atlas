import { describe, expect, it } from 'vitest';

import { ALIGN_CELL_CAP, alignLinesQuadratic } from './align-lines';

const kinds = (left: string[], right: string[]) => alignLinesQuadratic(left, right)!.map((row) => row.kind);

describe('alignLinesQuadratic', () => {
  it('pairs identical inputs line by line', () => {
    const rows = alignLinesQuadratic(['a', 'b'], ['a', 'b'])!;
    expect(rows.map((row) => row.kind)).toEqual(['same', 'same']);
    expect(rows[1]).toEqual({ kind: 'same', left: { no: 2, text: 'b' }, right: { no: 2, text: 'b' } });
  });

  it('leaves the left cell empty for an insertion', () => {
    const rows = alignLinesQuadratic(['a', 'c'], ['a', 'b', 'c'])!;
    expect(rows.map((row) => row.kind)).toEqual(['same', 'right', 'same']);
    expect(rows[1]).toEqual({ kind: 'right', left: null, right: { no: 2, text: 'b' } });
    expect(rows[2]!.left!.no).toBe(2);
    expect(rows[2]!.right!.no).toBe(3);
  });

  it('leaves the right cell empty for a deletion', () => {
    const rows = alignLinesQuadratic(['a', 'b', 'c'], ['a', 'c'])!;
    expect(rows.map((row) => row.kind)).toEqual(['same', 'left', 'same']);
    expect(rows[1]).toEqual({ kind: 'left', left: { no: 2, text: 'b' }, right: null });
  });

  it('pairs one changed line in the middle', () => {
    const rows = alignLinesQuadratic(['a', 'b', 'c'], ['a', 'x', 'c'])!;
    expect(rows.map((row) => row.kind)).toEqual(['same', 'changed', 'same']);
    expect(rows[1]).toEqual({ kind: 'changed', left: { no: 2, text: 'b' }, right: { no: 2, text: 'x' } });
  });

  it('pairs a run one line from each side and keeps the remainder one-sided', () => {
    expect(kinds(['a', 'b1', 'b2', 'b3', 'z'], ['a', 'x', 'z'])).toEqual(['same', 'changed', 'left', 'left', 'same']);
    expect(kinds(['a', 'y', 'z'], ['a', 'x1', 'x2', 'z'])).toEqual(['same', 'changed', 'right', 'same']);
  });

  it('handles empty against non-empty', () => {
    expect(kinds([], ['a', 'b'])).toEqual(['right', 'right']);
    expect(kinds(['a'], [])).toEqual(['left']);
    expect(alignLinesQuadratic([], [])).toEqual([]);
  });

  it('keeps repeated equal lines in order and numbers every line once', () => {
    const left = ['x', 'x', 'x', 'y'];
    const right = ['x', 'y', 'x'];
    const rows = alignLinesQuadratic(left, right)!;
    expect(rows.flatMap((row) => (row.left ? [row.left.no] : []))).toEqual([1, 2, 3, 4]);
    expect(rows.flatMap((row) => (row.right ? [row.right.no] : []))).toEqual([1, 2, 3]);
    expect(rows.filter((row) => row.kind === 'same')).toHaveLength(2);
    expect(alignLinesQuadratic(left, right)).toEqual(rows);
  });

  it('returns null above the cell cap', () => {
    const side = Array.from({ length: Math.floor(Math.sqrt(ALIGN_CELL_CAP)) + 1 }, (_, index) => String(index));
    expect(alignLinesQuadratic(side, side)).toBeNull();
    expect(alignLinesQuadratic(side.slice(0, 1000), side.slice(0, 1000))).not.toBeNull();
  });
});
