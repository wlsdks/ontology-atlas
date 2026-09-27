import { describe, expect, it } from 'vitest';

import { gridColumnsForWidth } from './grid-columns';

/** The occupant grid's own numbers: `minmax(200px, 1fr)` with a 10px gap. */
const MIN = 200;
const GAP = 10;

describe('gridColumnsForWidth', () => {
  it('counts the gap between tracks and not after the last one', () => {
    expect(gridColumnsForWidth(410, MIN, GAP)).toBe(2);
    expect(gridColumnsForWidth(619, MIN, GAP)).toBe(2);
    expect(gridColumnsForWidth(620, MIN, GAP)).toBe(3);
  });

  it('resolves the installed app module column to two columns — the measured hole', () => {
    expect(gridColumnsForWidth(512, MIN, GAP)).toBe(2);
  });

  it('never reports zero columns, however little room there is', () => {
    expect(gridColumnsForWidth(1, MIN, GAP)).toBe(1);
    expect(gridColumnsForWidth(0, MIN, GAP)).toBe(1);
    expect(gridColumnsForWidth(-40, MIN, GAP)).toBe(1);
  });

  it('treats an unmeasured element as one column rather than as many', () => {
    expect(gridColumnsForWidth(Number.NaN, MIN, GAP)).toBe(1);
    expect(gridColumnsForWidth(Number.POSITIVE_INFINITY, MIN, GAP)).toBe(1);
    expect(gridColumnsForWidth(800, 0, GAP)).toBe(1);
  });
});
