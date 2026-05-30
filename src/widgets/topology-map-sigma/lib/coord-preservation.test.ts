import { describe, expect, it } from 'vitest';
import Graph from 'graphology';
import {
  snapshotNodeCoords,
  restoreNodeCoords,
} from './coord-preservation';

function graphWith(coords: Record<string, { x: number; y: number }>) {
  const g = new Graph<{ x: number; y: number }>();
  for (const [id, { x, y }] of Object.entries(coords)) g.addNode(id, { x, y });
  return g;
}

describe('snapshotNodeCoords', () => {
  it('captures every node coord', () => {
    const g = graphWith({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
    const snap = snapshotNodeCoords(g);
    expect(snap.get('a')).toEqual({ x: 1, y: 2 });
    expect(snap.get('b')).toEqual({ x: 3, y: 4 });
    expect(snap.size).toBe(2);
  });

  it('skips non-finite coords', () => {
    const g = new Graph<{ x: number; y: number }>();
    g.addNode('a', { x: Number.NaN, y: 0 });
    expect(snapshotNodeCoords(g).has('a')).toBe(false);
  });
});

describe('restoreNodeCoords', () => {
  it('restores cached coords for existing nodes, leaves new nodes untouched', () => {
    // rebuild: a moved (settle), b is new. cache had a at its old spot.
    const rebuilt = graphWith({ a: { x: 99, y: 99 }, b: { x: 5, y: 6 } });
    const cache = new Map([['a', { x: 1, y: 2 }]]);
    const n = restoreNodeCoords(rebuilt, cache);
    expect(n).toBe(1);
    expect(rebuilt.getNodeAttributes('a')).toMatchObject({ x: 1, y: 2 }); // restored
    expect(rebuilt.getNodeAttributes('b')).toMatchObject({ x: 5, y: 6 }); // new — untouched
  });

  it('ignores cached nodes no longer in the graph', () => {
    const g = graphWith({ a: { x: 0, y: 0 } });
    const cache = new Map([
      ['a', { x: 1, y: 1 }],
      ['gone', { x: 9, y: 9 }],
    ]);
    expect(restoreNodeCoords(g, cache)).toBe(1);
  });

  it('no-op for an empty cache (first build)', () => {
    const g = graphWith({ a: { x: 5, y: 6 } });
    expect(restoreNodeCoords(g, new Map())).toBe(0);
    expect(g.getNodeAttributes('a')).toMatchObject({ x: 5, y: 6 });
  });
});
