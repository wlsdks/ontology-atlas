import { describe, expect, it } from 'vitest';

import { ALIGN_CELL_CAP, ALIGN_ROW_CAP, alignLinesQuadratic, differsOnlyInvisibly } from './align-lines';

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

  it('returns null when the differing middle is above the cell cap', () => {
    const side = Array.from({ length: Math.floor(Math.sqrt(ALIGN_CELL_CAP)) + 1 }, (_, index) => String(index));
    const other = side.map((line) => `other ${line}`);
    expect(alignLinesQuadratic(side, other)).toBeNull();
    expect(alignLinesQuadratic(side.slice(0, 1000), other.slice(0, 1000))).not.toBeNull();
  });
});

describe('trimmed alignment', () => {
  it('aligns two long files that differ in one line', () => {
    const left = Array.from({ length: 2126 }, (_, index) => `line ${index}`);
    const right = [...left];
    right[1000] = 'changed';
    const rows = alignLinesQuadratic(left, right)!;
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(2126);
    expect(rows.filter((row) => row.kind === 'changed')).toHaveLength(1);
    expect(rows[2125]!.left!.no).toBe(2126);
    expect(rows[2125]!.right!.no).toBe(2126);
  });

  it('numbers the suffix by each side when the middles differ in length', () => {
    const rows = alignLinesQuadratic(['a', 'b', 'z'], ['a', 'x', 'y', 'z'])!;
    expect(rows.map((row) => row.kind)).toEqual(['same', 'changed', 'right', 'same']);
    expect(rows[3]).toEqual({ kind: 'same', left: { no: 3, text: 'z' }, right: { no: 4, text: 'z' } });
  });

  it('treats a side that is a prefix of the other as pure additions', () => {
    expect(kinds(['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual(['same', 'same', 'right', 'right']);
    expect(kinds(['a', 'b', 'c', 'd'], ['a', 'b'])).toEqual(['same', 'same', 'left', 'left']);
    expect(kinds(['c', 'd'], ['a', 'b', 'c', 'd'])).toEqual(['right', 'right', 'same', 'same']);
  });

  it('never counts a line twice when head and suffix would overlap', () => {
    const rows = alignLinesQuadratic(['x', 'x'], ['x', 'x', 'x'])!;
    expect(rows.flatMap((row) => (row.left ? [row.left.no] : []))).toEqual([1, 2]);
    expect(rows.flatMap((row) => (row.right ? [row.right.no] : []))).toEqual([1, 2, 3]);
  });

  it('returns null above the row cap even when every line matches', () => {
    const half = Array.from({ length: ALIGN_ROW_CAP / 2 + 1 }, (_, index) => String(index));
    expect(alignLinesQuadratic(half, half)).toBeNull();
  });
});

describe('differsOnlyInvisibly', () => {
  it('sees line endings, trailing spaces and the final newline', () => {
    expect(differsOnlyInvisibly('a\nb', 'a\r\nb')).toBe(true);
    expect(differsOnlyInvisibly('a  \nb', 'a\nb')).toBe(true);
    expect(differsOnlyInvisibly('a\nb\n', 'a\nb')).toBe(true);
  });

  it('is false for identical texts and for visible differences', () => {
    expect(differsOnlyInvisibly('a\nb', 'a\nb')).toBe(false);
    expect(differsOnlyInvisibly('a\nb', 'a\nc')).toBe(false);
    expect(differsOnlyInvisibly(' a', 'a')).toBe(false);
    expect(differsOnlyInvisibly('a\n\n', 'a')).toBe(false);
  });
});
