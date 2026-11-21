import type { StageGraph } from '../stage-graph';

export type FilmKind = 'project' | 'domain' | 'capability' | 'element';

export interface FilmNode {
  id: string;
  label: string;
  file: string;
  kind: FilmKind;
  depth: number;
  degree: number;
  x: number;
  y: number;
  cluster: number;
  parent: number;
  gx: number;
  gy: number;
  layer: 0 | 1 | 2;
  order: number;
  seed: number;
}

export interface FilmEdge {
  from: number;
  to: number;
  contains: boolean;
  reveal: number;
}

export interface FilmScene {
  nodes: FilmNode[];
  edges: FilmEdge[];
}

const CLUSTER_START_ANGLE = -0.35;
const FIELD_COLUMNS = 12;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function clusterRing(leaves: number, most: number): number {
  return 0.42 + 0.16 * (1 - Math.sqrt(leaves / Math.max(1, most)));
}

export function buildFilmScene(graph: StageGraph): FilmScene {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const parent = new Map<number, number>();
  for (const edge of graph.edges) {
    if (edge.kind !== 'contains') continue;
    const from = index.get(edge.source);
    const to = index.get(edge.target);
    if (from === undefined || to === undefined || parent.has(to)) continue;
    parent.set(to, from);
  }

  const rootIndex = Math.max(0, graph.nodes.findIndex((node) => node.kind === 'project'));
  const children = new Map<number, number[]>();
  const attach = (child: number, of: number) => children.set(of, [...(children.get(of) ?? []), child]);
  /* A containment cycle would leave its members unreachable, so reachability is checked below. */
  graph.nodes.forEach((_, i) => {
    if (i === rootIndex) return;
    const up = parent.get(i);
    attach(i, up === undefined || up === i ? rootIndex : up);
  });

  const depth = new Array<number>(graph.nodes.length).fill(-1);
  const leaves = new Array<number>(graph.nodes.length).fill(1);
  const visit = (i: number, d: number): number => {
    depth[i] = d;
    let count = 0;
    for (const child of children.get(i) ?? []) {
      if (depth[child] !== -1) continue;
      count += visit(child, d + 1);
    }
    leaves[i] = Math.max(1, count);
    return leaves[i];
  };
  visit(rootIndex, 0);
  graph.nodes.forEach((_, i) => {
    if (depth[i] === -1) {
      attach(i, rootIndex);
      visit(i, 1);
    }
  });

  const px = new Array<number>(graph.nodes.length).fill(0);
  const py = new Array<number>(graph.nodes.length).fill(0);
  const cluster = new Array<number>(graph.nodes.length).fill(rootIndex);
  const treeParent = new Array<number>(graph.nodes.length).fill(rootIndex);
  const kidsOf = (i: number) =>
    (children.get(i) ?? [])
      .filter((child) => depth[child] === depth[i] + 1)
      .sort((a, b) => graph.nodes[a].id.localeCompare(graph.nodes[b].id));
  const fan = (i: number, base: number, span: number, radius: number) => {
    const kids = kidsOf(i);
    const total = kids.reduce((sum, child) => sum + leaves[child], 0) || 1;
    let start = base - span / 2;
    for (const child of kids) {
      const share = (span * leaves[child]) / total;
      const a = start + share / 2;
      const reach = radius * (1 + (hash(graph.nodes[child].id) - 0.5) * 0.36);
      cluster[child] = cluster[i];
      treeParent[child] = i;
      px[child] = px[i] + Math.cos(a) * reach;
      py[child] = py[i] + Math.sin(a) * reach;
      fan(child, a, Math.min(share, 1.9), radius * 0.48);
      start += share;
    }
  };
  const clusters = kidsOf(rootIndex);
  const most = Math.max(1, ...clusters.map((c) => leaves[c]));
  clusters.forEach((c, k) => {
    const a = CLUSTER_START_ANGLE + (k / clusters.length) * Math.PI * 2;
    const r = clusters.length === 1 ? 0 : clusterRing(leaves[c], most);
    cluster[c] = c;
    px[c] = Math.cos(a) * r;
    py[c] = Math.sin(a) * r;
    fan(c, a, Math.PI * 2, 0.2 * Math.max(0.6, Math.sqrt(leaves[c] / most)));
  });
  const reach = Math.max(1e-6, ...px.map((x, i) => Math.hypot(x, py[i])));

  const count = graph.nodes.length;
  const rows = Math.max(1, Math.ceil(count / FIELD_COLUMNS));
  const byOrder = graph.nodes
    .map((_, i) => i)
    .sort((a, b) => depth[a] - depth[b] || Math.atan2(py[a], px[a]) - Math.atan2(py[b], px[b]));
  const orderOf = new Map(byOrder.map((i, rank) => [i, rank / Math.max(1, count - 1)]));
  const gridOrder = graph.nodes.map((_, i) => i).sort((a, b) => hash(graph.nodes[a].id) - hash(graph.nodes[b].id));
  const cellOf = new Map(gridOrder.map((i, cell) => [i, cell]));

  const nodes: FilmNode[] = graph.nodes.map((node, i) => {
    const seed = hash(node.id);
    const cell = cellOf.get(i) ?? 0;
    const col = cell % FIELD_COLUMNS;
    const row = Math.floor(cell / FIELD_COLUMNS);
    return {
      id: node.id,
      label: node.label,
      file: `${node.id.split(/[/:]/).pop() ?? node.id}.md`,
      kind: node.kind as FilmKind,
      depth: depth[i],
      degree: node.fullDegree,
      x: px[i] / reach,
      y: py[i] / reach,
      cluster: cluster[i],
      parent: treeParent[i],
      gx: (col + 0.5 + (hash(`${node.id}#x`) - 0.5) * 0.7) / FIELD_COLUMNS,
      gy: (row + 0.5 + (hash(`${node.id}#y`) - 0.5) * 0.7) / rows,
      layer: Math.min(2, Math.floor(hash(`${node.id}#z`) * 3)) as 0 | 1 | 2,
      order: orderOf.get(i) ?? 0,
      seed,
    };
  });

  const maxDepth = Math.max(1, ...depth);
  const edges: FilmEdge[] = [];
  for (const edge of graph.edges) {
    const from = index.get(edge.source);
    const to = index.get(edge.target);
    if (from === undefined || to === undefined) continue;
    const near = Math.min(depth[from], depth[to]);
    const turn = (((Math.atan2(py[from], px[from]) + Math.PI / 2) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    edges.push({
      from,
      to,
      contains: edge.kind === 'contains',
      reveal: Math.min(1, (near + (turn / (Math.PI * 2)) * 0.8) / (maxDepth + 0.8)),
    });
  }
  return { nodes, edges };
}


export function crossesClusters(scene: FilmScene, edge: FilmEdge): boolean {
  const a = scene.nodes[edge.from];
  const b = scene.nodes[edge.to];
  return !edge.contains && a.depth > 0 && b.depth > 0 && a.cluster !== b.cluster;
}

export interface LabelRequest {
  x: number;
  y: number;
  r: number;
  w: number;
  h: number;
  out: { x: number; y: number };
}

export interface LabelSpot {
  dx: number;
  dy: number;
  align: 'start' | 'center' | 'end';
  leader: boolean;
}

interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export function labelBox(x: number, y: number, w: number, h: number, align: LabelSpot['align']): Rect {
  const l = align === 'center' ? x - w / 2 : align === 'end' ? x - w : x;
  return { l, t: y - h / 2, r: l + w, b: y + h / 2 };
}

const overlapArea = (a: Rect, b: Rect, gap: number) => {
  const ox = Math.min(a.r + gap, b.r) - Math.max(a.l - gap, b.l);
  const oy = Math.min(a.b + gap, b.b) - Math.max(a.t - gap, b.t);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};

/**
 * Places names in order so no two boxes come within `gap` of each other or of another name's
 * mark, and each stays inside `bounds`. A name first tries the eight spots around its mark; in a
 * crowd it stands off along its outward direction, joined to its mark by a leader line. When no
 * spot is free the least-covered one is taken.
 */
export function placeLabels(requests: readonly LabelRequest[], { gap, bounds }: { gap: number; bounds: Rect }): LabelSpot[] {
  const taken: Rect[] = [];
  const marks: Rect[] = requests.map(({ x, y, r }) => ({ l: x - r, t: y - r, r: x + r, b: y + r }));
  return requests.map((req, k) => {
    const near = req.r + 6;
    const side = req.r + 8;
    const options: LabelSpot[] = [
      { dx: 0, dy: near + req.h / 2, align: 'center', leader: false },
      { dx: 0, dy: -near - req.h / 2, align: 'center', leader: false },
      { dx: side, dy: 0, align: 'start', leader: false },
      { dx: -side, dy: 0, align: 'end', leader: false },
      { dx: side, dy: near, align: 'start', leader: false },
      { dx: -side, dy: near, align: 'end', leader: false },
      { dx: side, dy: -near, align: 'start', leader: false },
      { dx: -side, dy: -near, align: 'end', leader: false },
    ];
    const align: LabelSpot['align'] = req.out.x > 0.35 ? 'start' : req.out.x < -0.35 ? 'end' : 'center';
    for (let step = 1; step <= 16; step += 1) {
      const reach = req.r + 16 + step * 10;
      options.push({ dx: req.out.x * reach, dy: req.out.y * reach, align, leader: true });
    }
    let best = options[0]!;
    let least = Infinity;
    for (const o of options) {
      const box = labelBox(req.x + o.dx, req.y + o.dy, req.w, req.h, o.align);
      const outside =
        Math.max(0, bounds.l - box.l) + Math.max(0, box.r - bounds.r) + Math.max(0, bounds.t - box.t) + Math.max(0, box.b - bounds.b);
      let cost = outside * req.h * 4;
      for (const t of taken) cost += overlapArea(box, t, gap);
      marks.forEach((m, j) => {
        if (j !== k) cost += overlapArea(box, m, gap);
      });
      if (cost < least) {
        best = o;
        least = cost;
      }
      if (cost === 0) break;
    }
    taken.push(labelBox(req.x + best.dx, req.y + best.dy, req.w, req.h, best.align));
    return best;
  });
}
