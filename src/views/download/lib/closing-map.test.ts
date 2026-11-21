import { describe, expect, it } from 'vitest';

import { bundledRelations, bundleRoute, pointAlong, treePath } from './closing-map';
import { buildFilmScene } from './film/film-scene';
import type { StageGraph } from './stage-graph';

const node = (id: string, kind: string) =>
  ({ id, label: id, kind, size: 0, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, stale: false, fullDegree: 0, descendantCount: 0 }) as StageGraph['nodes'][number];
const edge = (source: string, target: string, kind: 'contains' | 'depends') =>
  ({ source, target, relationType: kind, relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null }) as StageGraph['edges'][number];

const scene = buildFilmScene({
  nodes: [
    node('p', 'project'),
    node('a', 'domain'),
    node('b', 'domain'),
    node('a1', 'capability'),
    node('a2', 'capability'),
    node('b1', 'capability'),
    node('x', 'element'),
  ],
  edges: [
    edge('p', 'a', 'contains'),
    edge('p', 'b', 'contains'),
    edge('a', 'a1', 'contains'),
    edge('a', 'a2', 'contains'),
    edge('b', 'b1', 'contains'),
    edge('a1', 'x', 'contains'),
    /* A second container: drawn as a bundle, not a second branch. */
    edge('a2', 'x', 'contains'),
    edge('a1', 'b1', 'depends'),
    edge('b1', 'a1', 'depends'),
  ],
});
const at = (id: string) => scene.nodes.findIndex((n) => n.id === id);
const ids = (path: number[]) => path.map((i) => scene.nodes[i]!.id);

describe('closing map bundling', () => {
  it('routes a relation through its nearest shared container', () => {
    expect(ids(treePath(scene, at('a1'), at('b1')))).toEqual(['a1', 'a', 'p', 'b', 'b1']);
    expect(ids(treePath(scene, at('a2'), at('x')))).toEqual(['a2', 'a', 'a1', 'x']);
  });

  it('bundles every relation that is not a drawn branch, once per pair', () => {
    const bundled = bundledRelations(scene).map(({ from, to, crosses }) => [scene.nodes[from]!.id, scene.nodes[to]!.id, crosses]);
    expect(bundled).toEqual([
      ['a2', 'x', false],
      ['a1', 'b1', true],
    ]);
  });

  it('starts and ends a route on its two concepts', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 50, y: 80 },
      { x: 100, y: 0 },
      { x: 150, y: -80 },
      { x: 200, y: 0 },
    ];
    const route = bundleRoute(0, 1, points);
    const out = { x: 0, y: 0 };
    expect(pointAlong(route, 0, out)).toEqual({ x: 0, y: 0 });
    expect(pointAlong(route, 1, out)).toEqual({ x: 200, y: 0 });
    expect(route.cumulativeLength[route.cumulativeLength.length - 1]).toBeGreaterThan(200);
  });
});
