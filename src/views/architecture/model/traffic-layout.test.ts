import { describe, expect, it } from 'vitest';

import { buildTrafficArcs } from './traffic-layout';

/**
 * The rows this repository's own profile resolves to, deepest last, as `buildArchitectureLayout`
 * returns them. The counts below are the real ones measured on 2026-08-28.
 */
const ROWS = [['routing'], ['app'], ['views'], ['widgets'], ['features'], ['entities'], ['shared']];

describe('buildTrafficArcs', () => {
  it('weighs crossings against the busiest crossing, never against same-role traffic', () => {
    /*
     * ⚠️ The reason this is the first test. `views → views` (223) and `widgets → widgets` (240)
     * are among the largest counts in the measurement and can never be a boundary crossing: the
     * scanner allows same-role imports unconditionally. Letting them set the scale would draw
     * every real crossing as a hairline beside traffic that crosses nothing.
     */
    const arcs = buildTrafficArcs(
      [
        { fromRole: 'widgets', toRole: 'shared', count: 314 },
        { fromRole: 'routing', toRole: 'widgets', count: 1 },
        { fromRole: 'views', toRole: 'views', count: 223 },
      ],
      ROWS,
    );
    const byPair = new Map(arcs.map((arc) => [`${arc.from}>${arc.to}`, arc]));

    expect(byPair.get('widgets>shared')?.weight).toBe(1);
    expect(byPair.get('routing>widgets')?.weight).toBeCloseTo(1 / 314, 5);
    expect(byPair.get('views>views')?.sameRole).toBe(true);
    expect(byPair.get('views>views')?.weight).toBe(0);
  });

  it('counts rows crossed, so a skip reads as a longer drop', () => {
    const arcs = buildTrafficArcs(
      [
        { fromRole: 'routing', toRole: 'app', count: 1 },
        { fromRole: 'routing', toRole: 'shared', count: 45 },
      ],
      ROWS,
    );
    const byPair = new Map(arcs.map((arc) => [`${arc.from}>${arc.to}`, arc]));

    expect(byPair.get('routing>app')?.rowSpan).toBe(1);
    expect(byPair.get('routing>shared')?.rowSpan).toBe(6);
  });

  it('gives a same-role arc no span, because it crosses nothing', () => {
    const arcs = buildTrafficArcs([{ fromRole: 'views', toRole: 'views', count: 223 }], ROWS);
    expect(arcs[0]?.rowSpan).toBe(0);
  });

  it('drops an edge naming a role the profile no longer has', () => {
    /* A record outlives a profile edit: it was measured against the roles of its own moment. */
    expect(buildTrafficArcs([{ fromRole: 'views', toRole: 'gone', count: 9 }], ROWS)).toEqual([]);
    expect(buildTrafficArcs([{ fromRole: 'gone', toRole: 'views', count: 9 }], ROWS)).toEqual([]);
  });

  it('draws the same picture from the same data, whatever order it arrives in', () => {
    const edges = [
      { fromRole: 'views', toRole: 'shared', count: 260 },
      { fromRole: 'widgets', toRole: 'shared', count: 314 },
      { fromRole: 'routing', toRole: 'views', count: 20 },
    ];
    expect(buildTrafficArcs(edges, ROWS)).toEqual(buildTrafficArcs([...edges].reverse(), ROWS));
  });

  it('paints long arcs first, so short ones land on top of them', () => {
    const arcs = buildTrafficArcs(
      [
        { fromRole: 'entities', toRole: 'shared', count: 23 },
        { fromRole: 'routing', toRole: 'shared', count: 45 },
      ],
      ROWS,
    );
    expect(arcs.map((arc) => arc.rowSpan)).toEqual([6, 1]);
  });

  it('has nothing to draw without a record', () => {
    expect(buildTrafficArcs([], ROWS)).toEqual([]);
  });

  it('survives a measurement whose only traffic is same-role', () => {
    /* Nothing crosses, so nothing sets the scale; dividing by that must not produce NaN. */
    const arcs = buildTrafficArcs([{ fromRole: 'views', toRole: 'views', count: 223 }], ROWS);
    expect(arcs[0]?.weight).toBe(0);
  });
});
