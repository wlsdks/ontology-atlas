import { describe, expect, it } from 'vitest';

import { buildFilmScene, clusterRing, crossesClusters, labelBox, placeLabels } from './film-scene';
import type { StageGraph } from '../stage-graph';

const node = (id: string, kind: string) =>
  ({ id, label: id, kind, size: 0, x: 0, y: 0, isHub: false, ownerKey: null, recentlyUpdated: false, stale: false, fullDegree: 0, descendantCount: 0 }) as StageGraph['nodes'][number];
const edge = (source: string, target: string, kind: 'contains' | 'depends') =>
  ({ source, target, relationType: kind, relationQuality: null, evidenceCount: 0, kind, declaredBySlug: null }) as StageGraph['edges'][number];

const graph: StageGraph = {
  nodes: [
    node('project:atlas', 'project'),
    node('domain:a', 'domain'),
    node('domain:b', 'domain'),
    node('capability:a1', 'capability'),
    node('capability:b1', 'capability'),
    node('element:x', 'element'),
    node('element:loose', 'element'),
    node('element:cycle-1', 'element'),
    node('element:cycle-2', 'element'),
  ],
  edges: [
    edge('domain:a', 'capability:a1', 'contains'),
    edge('domain:b', 'capability:b1', 'contains'),
    edge('capability:a1', 'element:x', 'contains'),
    edge('element:cycle-1', 'element:cycle-2', 'contains'),
    edge('element:cycle-2', 'element:cycle-1', 'contains'),
    edge('capability:a1', 'capability:b1', 'depends'),
  ],
};

describe('buildFilmScene', () => {
  const scene = buildFilmScene(graph);
  const at = (id: string) => scene.nodes.find((n) => n.id === id)!;

  it('places every concept, including a containment cycle, at a finite point', () => {
    expect(scene.nodes).toHaveLength(graph.nodes.length);
    for (const n of scene.nodes) {
      for (const v of [n.x, n.y, n.gx, n.gy, n.order]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('puts the project at the centre and each child beside the concept that contains it', () => {
    expect(Math.hypot(at('project:atlas').x, at('project:atlas').y)).toBe(0);
    const near = Math.hypot(at('capability:a1').x - at('domain:a').x, at('capability:a1').y - at('domain:a').y);
    const far = Math.hypot(at('capability:a1').x - at('domain:b').x, at('capability:a1').y - at('domain:b').y);
    expect(near).toBeLessThan(far);
  });

  it('scales the map so its farthest concept reaches radius 1 and the field stays on the stage', () => {
    const reach = Math.max(...scene.nodes.map((n) => Math.hypot(n.x, n.y)));
    expect(reach).toBeCloseTo(1, 6);
    expect(scene.nodes.every((n) => n.gx >= 0 && n.gx <= 1 && n.gy >= 0 && n.gy <= 1)).toBe(true);
  });

  it('sets the largest cluster nearest the root and a smaller one farther out', () => {
    expect(clusterRing(10, 10)).toBeCloseTo(0.42);
    expect(clusterRing(1, 10)).toBeGreaterThan(clusterRing(5, 10));
    expect(clusterRing(0, 10)).toBeCloseTo(0.58);
  });

  it('bows only relations between two clusters, never a containment line', () => {
    const index = (id: string) => scene.nodes.findIndex((n) => n.id === id);
    const across = scene.edges.find((e) => e.from === index('capability:a1') && e.to === index('capability:b1'))!;
    const within = scene.edges.find((e) => e.from === index('capability:a1') && e.to === index('element:x'))!;
    expect(crossesClusters(scene, across)).toBe(true);
    expect(crossesClusters(scene, within)).toBe(false);
  });

  it('names each file after the last part of its id and keeps every relation', () => {
    expect(at('capability:a1').file).toBe('a1.md');
    expect(scene.edges).toHaveLength(graph.edges.length);
    expect(scene.edges.every((e) => e.reveal >= 0 && e.reveal <= 1)).toBe(true);
  });
});

describe('placeLabels', () => {
  /* The opened concept and its dependencies sit within 20px of each other on the real map. */
  const crowd = [
    { x: 300, y: 300, r: 6 },
    { x: 282, y: 312, r: 5 },
    { x: 296, y: 320, r: 5 },
    { x: 312, y: 318, r: 5 },
  ].map((m) => {
    const len = Math.hypot(m.x - 297.5, m.y - 312.5) || 1;
    return { ...m, w: 150, h: 20, out: { x: (m.x - 297.5) / len, y: (m.y - 312.5) / len } };
  });
  const bounds = { l: 0, t: 0, r: 1440, b: 900 };

  it('keeps every name at least the gap away from every other name and every other mark', () => {
    const spots = placeLabels(crowd, { gap: 6, bounds });
    const boxes = spots.map((s, k) => labelBox(crowd[k]!.x + s.dx, crowd[k]!.y + s.dy, crowd[k]!.w, crowd[k]!.h, s.align));
    boxes.forEach((a, i) => {
      boxes.forEach((b, j) => {
        if (i >= j) return;
        const apart = a.r + 6 <= b.l || b.r + 6 <= a.l || a.b + 6 <= b.t || b.b + 6 <= a.t;
        expect(apart, `names ${i} and ${j} meet`).toBe(true);
      });
      crowd.forEach((m, j) => {
        if (i === j) return;
        const clear = a.r + 6 <= m.x - m.r || m.x + m.r + 6 <= a.l || a.b + 6 <= m.y - m.r || m.y + m.r + 6 <= a.t;
        expect(clear, `name ${i} covers mark ${j}`).toBe(true);
      });
    });
  });

  it('keeps names inside the bounds', () => {
    const edge = [{ x: 1430, y: 450, r: 5, w: 120, h: 20, out: { x: 1, y: 0 } }];
    const [spot] = placeLabels(edge, { gap: 6, bounds });
    const box = labelBox(1430 + spot!.dx, 450 + spot!.dy, 120, 20, spot!.align);
    expect(box.r).toBeLessThanOrEqual(1440);
    expect(box.l).toBeGreaterThanOrEqual(0);
  });
});
