import { describe, expect, it } from 'vitest';

import { sketchConnector, sketchRect, sketchStadium } from './sketch-stroke';

describe('sketch strokes', () => {
  it('draws the same shape from the same seed, every time', () => {
    /*
     * ⚠️ The property the whole surface rests on. This product's claim is that its drawing is
     * derived rather than authored, and a picture that differs between two openings cannot be
     * compared with yesterday's screenshot or reviewed in a diff. The wobble is a hash of the
     * shape's own id, never `Math.random`.
     */
    expect(sketchRect('views', 0, 0, 100, 40)).toEqual(sketchRect('views', 0, 0, 100, 40));
    expect(sketchStadium('routing', 0, 0, 120, 48)).toEqual(
      sketchStadium('routing', 0, 0, 120, 48),
    );
    expect(sketchConnector('a>b', 0, 0, 80, 20, 24)).toBe(sketchConnector('a>b', 0, 0, 80, 20, 24));
  });

  it('draws different shapes from different seeds, so two boxes are not twins', () => {
    expect(sketchRect('views', 0, 0, 100, 40)).not.toEqual(sketchRect('widgets', 0, 0, 100, 40));
  });

  it('draws two passes by default, because one pass is a ruled line', () => {
    expect(sketchRect('views', 0, 0, 100, 40)).toHaveLength(2);
    expect(sketchStadium('routing', 0, 0, 100, 40)).toHaveLength(2);
    expect(sketchRect('views', 0, 0, 100, 40, { passes: 3 })).toHaveLength(3);
  });

  it('stays near the shape it was asked for', () => {
    /* Above roughly 2.5px of drift a 40px-tall box stops reading as a box. This pins that the
       default amplitude keeps every drawn point within a few pixels of the true rectangle. */
    const [pass] = sketchRect('views', 100, 200, 120, 48);
    const numbers = [...(pass ?? '').matchAll(/-?\d+\.\d+/g)].map((match) => Number(match[0]));
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThan(100 - 6);
    expect(Math.max(...xs)).toBeLessThan(220 + 6);
    expect(Math.min(...ys)).toBeGreaterThan(200 - 6);
    expect(Math.max(...ys)).toBeLessThan(248 + 6);
  });

  it('closes its outline: the last point is the first point', () => {
    /*
     * ⚠️ The defect the owner caught by zooming in on 2026-08-28. Each corner used to be drifted
     * twice with different noise, so the shape never met itself and every corner grew a visible
     * tail. A hand re-lands slightly off the line it left, but on the corner it left.
     */
    const [pass] = sketchStadium('routing', 0, 0, 148, 62);
    const start = /^M ([-\d.]+) ([-\d.]+)/.exec(pass ?? '');
    const end = /A [\d.]+ [\d.]+ 0 0 1 ([-\d.]+) ([-\d.]+) Z$/.exec(pass ?? '');
    expect(start?.[1]).toBe(end?.[1]);
    expect(start?.[2]).toBe(end?.[2]);

    const [rectPass] = sketchRect('views', 0, 0, 148, 62);
    const segments = (rectPass ?? '').split('M ').filter(Boolean);
    /* Each segment must end where the next one begins, all the way round. */
    const endOf = (segment: string) => segment.split(', ').at(-1)?.trim();
    const startOf = (segment: string) => segment.split(' Q ')[0]?.trim();
    for (let index = 0; index < segments.length; index += 1) {
      expect(endOf(segments[index]!)).toBe(startOf(segments[(index + 1) % segments.length]!));
    }
  });

  it('gives a stadium real arc caps, not a corner radius', () => {
    /* ISO 5807's terminator is a stadium. A rounded rectangle is a different symbol, so the caps
       are arcs of half the height rather than a large `rx`. */
    const [pass] = sketchStadium('routing', 0, 0, 140, 48);
    /* Half the height, wobbled: the caps are arcs rather than a corner radius, and they are drawn
       by the same unsteady hand as the straight edges. */
    const radius = Number(/A ([\d.]+) /.exec(pass ?? '')?.[1]);
    expect(radius).toBeGreaterThan(23);
    expect(radius).toBeLessThan(25);
  });
});
