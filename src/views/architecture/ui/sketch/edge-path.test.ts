import { describe, expect, it } from 'vitest';

import { edgePath, OPPOSED_PAIR_OFFSET } from './edge-path';
import { narrowSkipSwing, skipSwing } from './geometry';
import type { FlowAxis, Placed } from './types';

const BOX_W = 240;
const BOX_H = 58;
const ROW_GAP = 22;
const COL_GAP = 44;
const STEPS = 48;

type Point = readonly [number, number];

function pointsOn(d: string): Point[] {
  const tokens = d.match(/[MCL]|-?\d+(?:\.\d+)?/g) ?? [];
  const points: Point[] = [];
  let at: Point = [0, 0];
  for (let index = 0; index < tokens.length; ) {
    const command = tokens[index];
    const take = (count: number) => tokens.slice(index + 1, index + 1 + count).map(Number);
    if (command === 'M') {
      const [x, y] = take(2);
      at = [x, y];
      points.push(at);
      index += 3;
    } else if (command === 'L') {
      const [x, y] = take(2);
      for (let step = 1; step <= STEPS; step++) {
        const t = step / STEPS;
        points.push([at[0] + (x - at[0]) * t, at[1] + (y - at[1]) * t]);
      }
      at = [x, y];
      index += 3;
    } else {
      const [x1, y1, x2, y2, x, y] = take(6);
      for (let step = 1; step <= STEPS; step++) {
        const t = step / STEPS;
        const u = 1 - t;
        points.push([
          u * u * u * at[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * at[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
        ]);
      }
      at = [x, y];
      index += 7;
    }
  }
  return points;
}

const chain = (axis: FlowAxis): Placed[] =>
  Array.from({ length: 5 }, (_, index) => ({
    id: `role-${index}`,
    x: axis === 'across' ? 60 + index * (BOX_W + COL_GAP) : 400,
    y: axis === 'across' ? 120 : 60 + index * (BOX_H + ROW_GAP),
    shape: 'process' as const,
  }));

const isInside = ([x, y]: Point, face: Placed) =>
  x > face.x + 1 && x < face.x + BOX_W - 1 && y > face.y + 1 && y < face.y + BOX_H - 1;

const LAYOUTS: { name: string; axis: FlowAxis; swingOf: (span: number, lane: number) => number }[] = [
  { name: 'the paired ladder', axis: 'down', swingOf: (span, lane) => skipSwing(span, lane, BOX_W / 2) },
  { name: 'the narrow ladder', axis: 'down', swingOf: (_span, lane) => narrowSkipSwing(lane, BOX_W / 2) },
  { name: 'an across chain', axis: 'across', swingOf: (span, lane) => skipSwing(span, lane, BOX_H / 2) },
];

describe('edgePath', () => {
  it.each(LAYOUTS)('keeps every stroke on $name outside every face, whichever way it runs', ({ axis, swingOf }) => {
    const faces = chain(axis);
    let strokes = 0;
    for (const from of faces) {
      for (const to of faces) {
        if (from === to) continue;
        const run = faces.indexOf(to) - faces.indexOf(from);
        for (const skipSide of ['left', 'right'] as const) {
          for (const lane of [0, 1, 2]) {
            for (const offset of [-OPPOSED_PAIR_OFFSET, 0, OPPOSED_PAIR_OFFSET]) {
              const d = edgePath({
                axis,
                skipSide,
                portShift: offset,
                from,
                to,
                boxW: BOX_W,
                boxH: BOX_H,
                columnSpan: Math.abs(run),
                climbs: run < 0,
                trackOffset: offset,
                swing: Math.abs(run) > 1 ? swingOf(Math.abs(run), lane) : 0,
                colGap: COL_GAP,
                rowGap: ROW_GAP,
              });
              const crossed = pointsOn(d).filter((point) => faces.some((face) => isInside(point, face)));
              expect(crossed, `${from.id} to ${to.id}: ${d}`).toEqual([]);
              strokes += 1;
            }
          }
        }
      }
    }
    expect(strokes).toBe(5 * 4 * 2 * 3 * 3);
  });

  it('nests an opposed pair of side arcs, so the two never touch', () => {
    const [top, , bottom] = chain('down');
    const arc = (from: Placed, to: Placed, lane: number, portShift: number) =>
      pointsOn(
        edgePath({
          axis: 'down',
          skipSide: 'right',
          portShift,
          from,
          to,
          boxW: BOX_W,
          boxH: BOX_H,
          columnSpan: 2,
          climbs: to.y < from.y,
          trackOffset: 0,
          swing: skipSwing(2, lane, BOX_W / 2),
          colGap: COL_GAP,
          rowGap: ROW_GAP,
        }),
      );
    const inner = arc(top, bottom, 0, OPPOSED_PAIR_OFFSET);
    const outer = arc(bottom, top, 1, -OPPOSED_PAIR_OFFSET);
    const nearest = Math.min(
      ...inner.flatMap(([ix, iy]) => outer.map(([ox, oy]) => Math.hypot(ix - ox, iy - oy))),
    );
    expect(nearest).toBeGreaterThan(8);
  });
});
