import { neuralGraphOf, type NeuralGraph } from './neural-cells';

/** What a change to the focus reaches: every concept that depends on it, directly or through others. */
export interface NeuralImpact {
  focusId: string;
  /** Concept id → its fewest dependency hops from the focus; the focus itself is absent. */
  distance: ReadonlyMap<string, number>;
  /** `countAt[d - 1]` concepts lie at distance d. */
  countAt: readonly number[];
  /** The farthest distance, 0 when nothing depends on the focus. */
  hops: number;
}

/** Breadth-first over `graph.dependentsOf`, so a distance is the fewest hops and a cycle ends: O(V + E). */
export function neuralImpact(graph: Pick<NeuralGraph, 'dependentsOf'>, focusId: string): NeuralImpact {
  const distance = new Map<string, number>();
  const countAt: number[] = [];
  const queue = [focusId];
  const seen = new Set(queue);
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    const next = id === focusId ? 1 : distance.get(id)! + 1;
    for (const dependent of graph.dependentsOf.get(id) ?? []) {
      if (seen.has(dependent)) continue;
      seen.add(dependent);
      distance.set(dependent, next);
      countAt[next - 1] = (countAt[next - 1] ?? 0) + 1;
      queue.push(dependent);
    }
  }
  return { focusId, distance, countAt, hops: countAt.length };
}

interface MapEdgeInput {
  source: string;
  target: string;
  kind: 'contains' | 'depends';
  relationType: string;
}
const mapGraphs = new WeakMap<readonly MapEdgeInput[], NeuralGraph>();

/** The impact over the map's own edge list, for chrome outside the canvas; its graph is built once per list. */
export function neuralImpactOfMapEdges(edges: readonly MapEdgeInput[], focusId: string): NeuralImpact {
  let graph = mapGraphs.get(edges);
  if (!graph) {
    graph = neuralGraphOf([], edges.map((edge) => ({ sourceId: edge.source, targetId: edge.target, kind: edge.kind, relationType: edge.relationType })));
    mapGraphs.set(edges, graph);
  }
  return neuralImpact(graph, focusId);
}

/** Each node index's distance in the impact: 0 the focus, −1 outside it. O(nodes + impact). */
export function impactHopsByIndex(impact: NeuralImpact, indexOf: ReadonlyMap<string, number>, nodeCount: number): Int32Array {
  const hopOf = new Int32Array(nodeCount).fill(-1);
  const focusIndex = indexOf.get(impact.focusId);
  if (focusIndex !== undefined) hopOf[focusIndex] = 0;
  for (const [id, distance] of impact.distance) {
    const i = indexOf.get(id);
    if (i !== undefined) hopOf[i] = distance;
  }
  return hopOf;
}

/**
 * The change crosses a dependency one hop outward when its target is at distance d and its source at
 * d + 1, from `impactHopsByIndex`; −1 is outside the impact.
 */
export function isOutwardHop(targetHop: number, sourceHop: number): boolean {
  return targetHop >= 0 && sourceHop === targetHop + 1;
}

/** One hop's travel: `hopMs`, shortened equally when the whole spread would outlast `wholeMs`. */
export function neuralSpreadHopMs(hops: number, hopMs: number, wholeMs: number): number {
  return hops * hopMs > wholeMs ? wholeMs / hops : hopMs;
}

/**
 * How many hops the spread has travelled, 0..`hops`: hop k runs on (k − 1, k] and starts as hop
 * k − 1 arrives. Complete at once under reduced motion.
 */
export function neuralSpreadAt(nowMs: number, startMs: number, hops: number, hopMs: number, reducedMotion: boolean): number {
  if (reducedMotion || hopMs <= 0) return hops;
  return Math.min(hops, Math.max(0, (nowMs - startMs) / hopMs));
}
