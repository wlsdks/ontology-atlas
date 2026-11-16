import { describe, expect, it } from 'vitest';

import { buildFilmScene } from './film-scene';
import type { StageGraph } from './stage-graph';

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
      for (const v of [n.x, n.y, n.gx, n.gy, n.gz, n.order]) expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('puts the project at the centre and each child beside the concept that contains it', () => {
    expect(Math.hypot(at('project:atlas').x, at('project:atlas').y)).toBe(0);
    const near = Math.hypot(at('capability:a1').x - at('domain:a').x, at('capability:a1').y - at('domain:a').y);
    const far = Math.hypot(at('capability:a1').x - at('domain:b').x, at('capability:a1').y - at('domain:b').y);
    expect(near).toBeLessThan(far);
  });

  it('names each file after the last part of its id and keeps every relation', () => {
    expect(at('capability:a1').file).toBe('a1.md');
    expect(scene.edges).toHaveLength(graph.edges.length);
    expect(scene.edges.every((e) => e.reveal >= 0 && e.reveal <= 1)).toBe(true);
  });
});
