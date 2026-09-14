import { describe, expect, it } from 'vitest';
import { projectDomeEdgeControl } from './dome-edge';
import type { DomeNodeFrame } from './dome-view';

const edge = { sourceId: 'a', targetId: 'b', kind: 'depends' as const,
  ax: 0, ay: 0, bx: 400, by: 0, controlX: -300, controlY: 500 };
const frame = new Map<string, DomeNodeFrame>([
  ['a', { dx: 20, dy: 30, s: 1, a: 1, u: 0 }],
  ['b', { dx: -80, dy: 30, s: 1, a: 1, u: 1 }],
]);

describe('the drawn 3D edge', () => {
  for (const arrangement of ['ownership', 'strata', 'coupling'] as const) {
    it(`${arrangement}: bounds a relation arc near its actual moving endpoints at every zoom`, () => {
      for (const scale of [0.25, 1, 4]) {
        const control = projectDomeEdgeControl(edge, frame, arrangement, scale);
        expect(control.x).toBe(170);
        expect(control.y).toBeGreaterThan(30);
        expect((control.y - 30) * scale).toBeLessThanOrEqual(16);
      }
    });
    it(`${arrangement}: separates reciprocal facts without a loop or a false junction`, () => {
      const forward = projectDomeEdgeControl(edge, frame, arrangement, 1);
      const reverse = projectDomeEdgeControl({ ...edge, sourceId: 'b', targetId: 'a',
        ax: edge.bx, ay: edge.by, bx: edge.ax, by: edge.ay }, frame, arrangement, 1);
      expect(forward.x).toBe(reverse.x);
      expect(forward.y).toBeGreaterThan(30);
      expect(reverse.y).toBeLessThan(30);
    });
  }
  it('keeps Cone/Strata containment straight while Neural branches have a shallow curve', () => {
    const contains = { ...edge, kind: 'contains' as const };
    for (const arrangement of ['ownership', 'strata'] as const) {
      expect(projectDomeEdgeControl(contains, frame, arrangement, 1)).toEqual({ x: 170, y: 30 });
    }
    expect(projectDomeEdgeControl(contains, frame, 'coupling', 1).y).toBeGreaterThan(30);
  });
  it('preserves the flat curve before assembly and handles a coincident projected pair', () => {
    expect(projectDomeEdgeControl(edge, null, 'coupling', 1)).toEqual({ x: -300, y: 500 });
    const same = { ...edge, bx: 100, by: 0 };
    expect(projectDomeEdgeControl(same, frame, 'coupling', 1)).toEqual({ x: 20, y: 30 });
  });
  it('fades Neural branch curvature instead of snapping when the destination changes', () => {
    const contains = { ...edge, kind: 'contains' as const };
    const curved = projectDomeEdgeControl(contains, frame, 'coupling', 1, 1);
    const straight = projectDomeEdgeControl(contains, frame, 'ownership', 1, 0);
    const middle = projectDomeEdgeControl(contains, frame, 'ownership', 1, 0.5);
    expect(middle.x).toBe((curved.x + straight.x) / 2);
    expect(middle.y).toBe((curved.y + straight.y) / 2);
  });
});
