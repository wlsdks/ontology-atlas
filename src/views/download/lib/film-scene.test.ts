import { describe, expect, it } from 'vitest';

import {
  buildFilmScene,
  clusterRing,
  crossesClusters,
  haloMarks,
  labelBox,
  markRadius,
  pickCloseUp,
  pickNamedFiles,
  placeLabels,
  scheduleRelations,
  scheduleTyping,
  type FilmEdge,
} from './film-scene';
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

describe('markRadius', () => {
  it('grows with relations and stays inside its kind\'s range', () => {
    expect(markRadius('project', 0, true)).toBe(11);
    expect(markRadius('domain', 0, true)).toBe(8);
    expect(markRadius('domain', 400, true)).toBe(10);
    expect(markRadius('capability', 9, true)).toBeGreaterThan(markRadius('capability', 1, true));
    expect(markRadius('capability', 400, true)).toBe(6.5);
    expect(markRadius('element', 0, true)).toBe(3);
    expect(markRadius('element', 400, true)).toBe(4);
  });

  it('draws a phone\'s marks smaller', () => {
    expect(markRadius('project', 0, false)).toBeCloseTo(11 * 0.85);
  });
});

describe('haloMarks', () => {
  it('lights the project, then the cluster hubs, then the busiest marks, never more than asked', () => {
    const busy: StageGraph = {
      nodes: [
        { ...node('p', 'project'), fullDegree: 2 },
        { ...node('d1', 'domain'), fullDegree: 3 },
        { ...node('d2', 'domain'), fullDegree: 4 },
        { ...node('c1', 'capability'), fullDegree: 12 },
        { ...node('c2', 'capability'), fullDegree: 9 },
        { ...node('e1', 'element'), fullDegree: 1 },
      ],
      edges: [edge('p', 'd1', 'contains'), edge('p', 'd2', 'contains'), edge('d1', 'c1', 'contains'), edge('d2', 'c2', 'contains'), edge('c1', 'e1', 'contains')],
    };
    const scene = buildFilmScene(busy);
    const ids = (list: number[]) => list.map((i) => scene.nodes[i]!.id);
    expect(ids(haloMarks(scene))).toEqual(['p', 'd2', 'd1', 'c1', 'c2']);
    expect(ids(haloMarks(scene, 2))).toEqual(['p', 'd2']);
  });
});

describe('scheduleRelations', () => {
  const edges: FilmEdge[] = [
    { from: 0, to: 1, contains: true, reveal: 0 },
    { from: 1, to: 2, contains: false, reveal: 0 },
    { from: 1, to: 3, contains: true, reveal: 0 },
    { from: 2, to: 3, contains: false, reveal: 0 },
    { from: 0, to: 2, contains: false, reveal: 0 },
  ];
  const land = [100, 500, 520, 900];
  const starts = scheduleRelations(edges, land, new Set([4]), { delay: 60, containLead: 90, earliest: 0, lastStart: 2000 });

  it('starts every relation after both its ends have landed', () => {
    edges.forEach((e, k) => {
      if (k === 4) return;
      expect(starts[k]).toBeGreaterThanOrEqual(Math.max(land[e.from]!, land[e.to]!) + 60);
    });
  });

  it('draws a containment line before a relation that lands with it, and the last at the given time', () => {
    expect(starts[2]).toBeLessThan(starts[3]!);
    expect(Math.max(...starts)).toBe(2000);
    expect(starts[0]).toBe(560);
  });

  it('skips relations already drawn', () => {
    expect(starts[4]).toBe(-1);
  });
});
