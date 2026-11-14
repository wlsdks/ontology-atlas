import { describe, expect, it } from 'vitest';

import type { ArchitectureRoleEdge } from '@/entities/architecture-record';

import {
  MAX_STROKE_PX,
  MIN_BULGE_PX,
  MIN_STROKE_PX,
  VIOLATION_LANE_GAP_PX,
  buildRoleArcs,
  bulgeForSpan,
  placeArcLabels,
  strokeForCount,
} from './role-arcs';

const ROW_PITCH = 62;
const rowCenterY = (index: number) => index * ROW_PITCH + 30;

function roles(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `r${index}`);
}

/** Every role reaching every role below it, with distinct counts, plus one climbing violation. */
function denseEdges(order: readonly string[]): ArchitectureRoleEdge[] {
  const edges: ArchitectureRoleEdge[] = [];
  order.forEach((from, i) =>
    order.slice(i + 1).forEach((to, j) => edges.push({ fromRole: from, toRole: to, count: (i + 1) * 10 + j })),
  );
  edges.push({ fromRole: order[order.length - 1]!, toRole: order[2]!, count: 1 });
  return edges;
}

describe('arc geometry', () => {
  it('bulges further for a longer span and never past its room', () => {
    const bulges = [1, 2, 3, 4, 5, 6].map((span) => bulgeForSpan(span, 6, 200));
    for (let i = 1; i < bulges.length; i += 1) expect(bulges[i]).toBeGreaterThan(bulges[i - 1]!);
    expect(bulges[5]).toBe(200);
    expect(bulgeForSpan(1, 6, 60)).toBe(MIN_BULGE_PX);
  });

  it('widens with the count inside the 1 to 6 px clamp', () => {
    expect(strokeForCount(0, 97)).toBe(MIN_STROKE_PX);
    expect(strokeForCount(97, 97)).toBe(MAX_STROKE_PX);
    expect(strokeForCount(500, 97)).toBe(MAX_STROKE_PX);
    expect(strokeForCount(10, 97)).toBeLessThan(strokeForCount(40, 97));
  });

  it('draws one arc per crossing between drawn roles and none for same-role or unknown roles', () => {
    const arcs = buildRoleArcs({
      order: ['a', 'b', 'c'],
      edges: [
        { fromRole: 'a', toRole: 'b', count: 4 },
        { fromRole: 'a', toRole: 'a', count: 400 },
        { fromRole: 'a', toRole: 'ghost', count: 9 },
        { fromRole: 'b', toRole: 'c', count: 0 },
      ],
      violatedPairs: new Set(),
      rowCenterY,
      roomPx: 120,
    });
    expect(arcs.map((arc) => `${arc.from}>${arc.to}`)).toEqual(['a>b']);
    expect(arcs[0]!.d.startsWith('M 0 ')).toBe(true);
  });

  it('seats every violation outside every allowed arc', () => {
    const order = roles(7);
    const arcs = buildRoleArcs({
      order,
      edges: denseEdges(order),
      violatedPairs: new Set(['r6>r2']),
      rowCenterY,
      roomPx: 200,
    });
    const allowedOuter = Math.max(...arcs.filter((arc) => !arc.violated).map((arc) => arc.bulgePx));
    const violation = arcs.find((arc) => arc.violated)!;
    expect(violation.bulgePx).toBe(allowedOuter + VIOLATION_LANE_GAP_PX);
  });

  it('keeps the two strokes of an opposed pair apart', () => {
    const arcs = buildRoleArcs({
      order: ['a', 'b'],
      edges: [
        { fromRole: 'a', toRole: 'b', count: 5 },
        { fromRole: 'b', toRole: 'a', count: 2 },
      ],
      violatedPairs: new Set(),
      rowCenterY,
      roomPx: 100,
    });
    const [down, up] = [arcs.find((arc) => arc.from === 'a')!, arcs.find((arc) => arc.from === 'b')!];
    expect(up.bulgePx).toBeGreaterThan(down.bulgePx);
  });
});

describe('arc labels', () => {
  const intersects = (a: { x: number; y: number; widthPx: number }, b: { x: number; y: number; widthPx: number }, height: number) =>
    a.x < b.x + b.widthPx && b.x < a.x + a.widthPx && a.y < b.y + height && b.y < a.y + height;

  it.each([7, 12])('do not collide when every arc of a %i-role profile carries a label', (count) => {
    const order = roles(count);
    const arcs = buildRoleArcs({
      order,
      edges: denseEdges(order),
      violatedPairs: new Set([`${order[count - 1]}>${order[2]}`]),
      rowCenterY,
      roomPx: 200,
    });
    const placed = placeArcLabels(
      arcs.map((arc) => ({
        key: `${arc.from}>${arc.to}`,
        x: arc.apexX + 4,
        widthPx: arc.violated ? 110 : 24,
        anchorY: arc.apexY,
      })),
      16,
      2,
    );
    expect(placed).toHaveLength(arcs.length);
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(intersects(placed[i]!, placed[j]!, 16), `${placed[i]!.key} touches ${placed[j]!.key}`).toBe(false);
      }
    }
  });

  it('leaves a label on its anchor when nothing else is near', () => {
    const [only] = placeArcLabels([{ key: 'a', x: 10, widthPx: 20, anchorY: 100 }], 16, 2);
    expect(only!.y).toBe(92);
  });
});
