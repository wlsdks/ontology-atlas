import { describe, expect, it } from 'vitest';

import { buildFilmScene, clusterRing, crossesClusters, pickCloseUp, pickNamedFiles, scheduleTyping } from './film-scene';
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

describe('pickCloseUp', () => {
  it('opens a capability held by a domain, with the dependencies it declares', () => {
    const graph: StageGraph = {
      nodes: [node('p', 'project'), node('d', 'domain'), node('c', 'capability'), node('lone', 'capability'), node('e', 'element')],
      edges: [edge('p', 'd', 'contains'), edge('d', 'c', 'contains'), edge('p', 'lone', 'contains'), edge('c', 'e', 'depends'), edge('lone', 'e', 'depends')],
    };
    const scene = buildFilmScene(graph);
    const pick = pickCloseUp(scene);
    expect(pick && scene.nodes[pick.index].id).toBe('c');
    expect(pick && scene.nodes[pick.parent].id).toBe('d');
    expect(pick?.dependencies.map((i) => scene.nodes[i].id)).toEqual(['e']);
  });

  it('names the opened file first, then the most connected files whose names fit', () => {
    const ranked: StageGraph = {
      nodes: [
        { ...node('p', 'project'), fullDegree: 1 },
        { ...node('busy', 'domain'), fullDegree: 9 },
        { ...node('a-very-long-name', 'domain'), fullDegree: 8 },
        { ...node('quiet', 'capability'), fullDegree: 2 },
      ],
      edges: [],
    };
    const scene = buildFilmScene(ranked);
    const fits = (file: string) => file.length <= 10;
    const named = pickNamedFiles(scene, 3, 3, fits).map((i) => scene.nodes[i].id);
    expect(named).toEqual(['quiet', 'busy', 'p']);
  });

  it('opens nothing when no capability declares a dependency', () => {
    const scene = buildFilmScene({ nodes: [node('p', 'project'), node('d', 'domain')], edges: [edge('p', 'd', 'contains')] });
    expect(pickCloseUp(scene)).toBeNull();
  });
});

describe('scheduleTyping', () => {
  const rows = [null, 'domain', 'kind', 'title', null, 'dependency', 'dependency', 'dependency', null].map((role) => ({ role }));
  const landings = [3000, 3400, 3800, 4300, 4650, 5000];
  const times = scheduleTyping(rows, landings, 2640, 380);

  it('finishes each line that becomes a mark on its landing beat', () => {
    const marks = times.filter((_, k) => rows[k]!.role !== null).map((t) => t.to);
    expect(marks).toEqual(landings);
  });

  it('types one line at a time, each after the panel has opened', () => {
    times.slice(1).forEach((t, k) => {
      expect(t.from).toBeGreaterThanOrEqual(times[k]!.to);
      expect(t.to).toBeGreaterThan(t.from);
      expect(t.from).toBeGreaterThanOrEqual(2520);
    });
  });

  it('still types a line when its landing beat has already passed', () => {
    const late = scheduleTyping([{ role: null }, { role: 'kind' }], [100], 2640, 380);
    expect(late[1]!.to).toBeGreaterThan(late[1]!.from);
  });
});
