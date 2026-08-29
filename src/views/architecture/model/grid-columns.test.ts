import { describe, expect, it } from 'vitest';

import { gridColumnsForWidth } from './grid-columns';

/**
 * The numbers below are the occupant grid's own: `minmax(200px, 1fr)` with a 10px gap. On
 * 2026-08-28 the installed app's module column measured ~512 logical px, which is two tracks
 * wide (410 fits, 620 does not) while the preview still showed three cards — that is the hole
 * this arithmetic closes.
 */
const MIN = 200;
const GAP = 10;

describe('gridColumnsForWidth', () => {
  it('counts the gap between tracks and not after the last one', () => {
    /* Two tracks need 200 + 10 + 200 = 410; a third needs 620. */
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
