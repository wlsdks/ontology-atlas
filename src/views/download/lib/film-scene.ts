import type { StageGraph } from './stage-graph';

export type FilmKind = 'project' | 'domain' | 'capability' | 'element';

export interface FilmNode {
  id: string;
  label: string;
  file: string;
  kind: FilmKind;
  depth: number;
  /** Final place on the map, in a unit disc around the root. */
  x: number;
  y: number;
  /** Place among the floating files: a grid cell with a depth for parallax, all in [-1, 1]. */
  gx: number;
  gy: number;
  gz: number;
  /** 0..1 order of flight, outward from the centre. */
  order: number;
  /** A stable 0..1 value per node, for the curve of its flight. */
  seed: number;
}

export interface FilmEdge {
  from: number;
  to: number;
  contains: boolean;
  /** 0..1: when the line starts drawing within the relations act. */
  reveal: number;
}

export interface FilmScene {
  nodes: FilmNode[];
  edges: FilmEdge[];
}

const CLUSTER_RING = 0.5;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * A radial tree over the `contains` relations: the project at the centre, each child on the next
 * ring inside a wedge sized by how many leaves it holds. Nodes with no container hang off the root.
 */
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
  leaves[rootIndex] = (children.get(rootIndex) ?? [])
    .filter((child) => depth[child] === 1)
    .reduce((sum, child) => sum + leaves[child], 0) || 1;

  /*
   * Like the app's map: each first-ring concept is a cluster on a circle around the root, its
   * children ring it, and their children fan outward from them.
   */
  const px = new Array<number>(graph.nodes.length).fill(0);
  const py = new Array<number>(graph.nodes.length).fill(0);
  const angle = new Array<number>(graph.nodes.length).fill(0);
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
      angle[child] = a;
      px[child] = px[i] + Math.cos(a) * radius;
      py[child] = py[i] + Math.sin(a) * radius;
      fan(child, a, Math.min(share, 1.9), radius * 0.48);
      start += share;
    }
  };
  const clusters = kidsOf(rootIndex);
  const most = Math.max(1, ...clusters.map((c) => leaves[c]));
  clusters.forEach((c, k) => {
    const a = (k / clusters.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / clusters.length;
    const r = clusters.length === 1 ? 0 : CLUSTER_RING;
    angle[c] = a;
    px[c] = Math.cos(a) * r;
    py[c] = Math.sin(a) * r;
    fan(c, a, Math.PI * 2, 0.2 * Math.max(0.6, Math.sqrt(leaves[c] / most)));
  });

  const count = graph.nodes.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count * 1.1)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const byOrder = graph.nodes
    .map((_, i) => i)
    .sort((a, b) => depth[a] - depth[b] || Math.atan2(py[a], px[a]) - Math.atan2(py[b], px[b]));
  const orderOf = new Map(byOrder.map((i, rank) => [i, rank / Math.max(1, count - 1)]));
  const gridOrder = graph.nodes.map((_, i) => i).sort((a, b) => hash(graph.nodes[a].id) - hash(graph.nodes[b].id));
  const cellOf = new Map(gridOrder.map((i, cell) => [i, cell]));

  const nodes: FilmNode[] = graph.nodes.map((node, i) => {
    const seed = hash(node.id);
    const cell = cellOf.get(i) ?? 0;
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    return {
      id: node.id,
      label: node.label,
      file: `${node.id.split(/[/:]/).pop() ?? node.id}.md`,
      kind: node.kind as FilmKind,
      depth: depth[i],
      x: px[i],
      y: py[i],
      gx: cols === 1 ? 0 : ((col + (row % 2) * 0.5) / cols) * 2 - 1 + (seed - 0.5) * 0.04,
      gy: rows === 1 ? 0 : (row / (rows - 1)) * 2 - 1 + (hash(`${node.id}#y`) - 0.5) * (1.6 / rows),
      gz: hash(`${node.id}#z`),
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

/** The file the film opens: a capability inside a domain that declares the most dependencies. */
export interface FilmCloseUp {
  index: number;
  parent: number;
  dependencies: number[];
}

export function pickCloseUp(scene: FilmScene): FilmCloseUp | null {
  let best: FilmCloseUp | null = null;
  scene.nodes.forEach((node, i) => {
    if (node.kind !== 'capability') return;
    const holder = scene.edges.find((edge) => edge.contains && edge.to === i);
    if (!holder || scene.nodes[holder.from]?.kind !== 'domain') return;
    const dependencies = scene.edges
      .filter((edge) => !edge.contains && edge.from === i && edge.to !== i)
      .map((edge) => edge.to);
    if (dependencies.length === 0) return;
    /* Two or three reads cleanly on the card; more only lengthens the line. */
    const score = Math.min(dependencies.length, 3);
    if (!best || score > Math.min(best.dependencies.length, 3)) {
      best = { index: i, parent: holder.from, dependencies: dependencies.slice(0, 3) };
    }
  });
  return best;
}
