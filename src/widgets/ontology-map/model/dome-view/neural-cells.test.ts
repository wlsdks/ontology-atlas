import { describe, expect, it } from 'vitest';
import {
  neuralAxonControl,
  neuralCellIsStale,
  neuralCellRadiusPx,
  neuralFocusSets,
  neuralGraphOf,
  neuralTracts,
} from './neural-cells';

const nodes = [
  { id: 'p', kind: 'project' as const, parentId: null },
  { id: 'd1', kind: 'domain' as const, parentId: 'p' },
  { id: 'd2', kind: 'domain' as const, parentId: 'p' },
  { id: 'd3', kind: 'domain' as const, parentId: 'p' },
  { id: 'c1', kind: 'capability' as const, parentId: 'd1' },
  { id: 'c2', kind: 'capability' as const, parentId: 'd1' },
  { id: 'e1', kind: 'element' as const, parentId: 'c1' },
  { id: 'c3', kind: 'capability' as const, parentId: 'd2' },
  { id: 'c4', kind: 'capability' as const, parentId: 'd2' },
];
const depends = (sourceId: string, targetId: string, relationType = 'depends_on') =>
  ({ sourceId, targetId, kind: 'depends' as const, relationType });
const contains = (sourceId: string, targetId: string) => ({ sourceId, targetId, kind: 'contains' as const, relationType: 'contains' });
const edges = [
  contains('d1', 'c1'), contains('d1', 'c2'), contains('c1', 'e1'), contains('d2', 'c3'), contains('d2', 'c4'),
  depends('c1', 'c2'), depends('c1', 'c3'), depends('c2', 'c4'), depends('e1', 'c1'), depends('c4', 'c1'),
  depends('c3', 'c2', 'related_to'),
];
const graph = neuralGraphOf(nodes, edges);
const hubs: Record<string, { x: number; y: number }> = { d1: { x: 0, y: 0 }, d2: { x: 400, y: 0 }, d3: { x: 200, y: 400 } };
const shape = { bow: 0.25, pull: 0.35, gain: 1.5 };
const tracts = neuralTracts(graph, (id) => hubs[id] ?? null, shape);

describe("Neural's route", () => {
  it('bows a same-cluster dependency a little to one side of its chord', () => {
    const control = neuralAxonControl('c1', 'c2', 0, 0, 100, 0, tracts);
    expect(control.x).toBe(50);
    expect(Math.abs(control.y)).toBeGreaterThan(0);
    expect(Math.abs(control.y)).toBeLessThanOrEqual(100 * shape.bow);
  });

  it('bends a cross-cluster dependency through the gap between the two hearts, pulled toward the centre', () => {
    const control = neuralAxonControl('c1', 'c3', 20, -60, 380, -60, tracts);
    const gap = { x: 200, y: 0 };
    // The third heart sits below, so the pull moves the control toward it and away from the gap.
    const centre = { x: 200, y: 400 / 3 };
    const through = { x: gap.x + (centre.x - gap.x) * shape.pull, y: gap.y + (centre.y - gap.y) * shape.pull };
    const mid = { x: 200, y: -60 };
    expect(control.x).toBeCloseTo(mid.x + (through.x - mid.x) * shape.gain);
    expect(control.y).toBeCloseTo(mid.y + (through.y - mid.y) * shape.gain);
    expect(through.y).toBeGreaterThan(gap.y);
    // The curve's midpoint passes below the chord, toward the gap.
    expect(0.25 * -60 + 0.5 * control.y + 0.25 * -60).toBeGreaterThan(-60);
  });

  it('gives every dependency between the same two clusters one shared tract', () => {
    const a = neuralAxonControl('c1', 'c3', 10, 10, 390, 10, tracts);
    const b = neuralAxonControl('c2', 'c4', -10, -10, 410, -10, tracts);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(Math.hypot(20, 20));
  });

  it('routes the same pair the same way on every call', () => {
    expect(neuralAxonControl('c1', 'c2', 0, 0, 100, 0, tracts)).toEqual(neuralAxonControl('c1', 'c2', 0, 0, 100, 0, tracts));
    expect(neuralAxonControl('c1', 'c3', 0, 0, 400, 0, tracts)).toEqual(neuralAxonControl('c1', 'c3', 0, 0, 400, 0, tracts));
  });
});

describe("Neural's cells", () => {
  const sizes = { capabilityPx: 4, capabilityGainPx: 2, elementPx: 2, elementGainPx: 1, domainPx: 7, projectPx: 9 };

  it('draws a capability larger than an element and grows both with the square root of their dependencies', () => {
    expect(neuralCellRadiusPx('capability', 0, sizes)).toBeGreaterThan(neuralCellRadiusPx('element', 0, sizes));
    expect(neuralCellRadiusPx('capability', 9, sizes) - neuralCellRadiusPx('capability', 0, sizes)).toBe(6);
    expect(neuralCellRadiusPx('element', 4, sizes) - neuralCellRadiusPx('element', 0, sizes)).toBe(2);
  });

  it('counts dependencies in both directions and ignores containment and other relations', () => {
    expect(graph.dependencyCount.get('c1')).toBe(4);
    expect(graph.dependencyCount.get('c3')).toBe(1);
    expect(graph.clusterOf.get('e1')).toBe('d1');
    expect(graph.clusterOf.get('c4')).toBe('d2');
  });

  it('splits a focus into what it needs and what needs it', () => {
    const sets = neuralFocusSets(edges, 'c1');
    expect([...sets.needs].sort()).toEqual(['c2', 'c3']);
    expect([...sets.usedBy].sort()).toEqual(['c4', 'e1']);
  });

  it('inks a cell amber only where evidence was read and called it stale', () => {
    const read = new Map([['c1', 'stale' as const], ['c2', 'current' as const]]);
    expect(neuralCellIsStale(read, 'c1')).toBe(true);
    expect(neuralCellIsStale(read, 'c2')).toBe(false);
    expect(neuralCellIsStale(read, 'c3')).toBe(false);
    expect(neuralCellIsStale(null, 'c1')).toBe(false);
  });
});
