import type { DomeViewKind } from './types';

interface NeuralNodeInput {
  id: string;
  kind: DomeViewKind;
  parentId: string | null;
}

interface NeuralEdgeInput {
  sourceId: string;
  targetId: string;
  kind: 'contains' | 'depends';
  relationType: string;
}

/** The only relation Neural draws: membership is the cluster, and other relations stay in the panel. */
export function isNeuralDependency(edge: NeuralEdgeInput): boolean {
  return edge.kind === 'depends' && edge.relationType === 'depends_on';
}

/** Neural's reading of the graph: which cluster a concept sits in and how many dependencies it carries. */
export interface NeuralGraph {
  /** Concept id → id of the domain whose cluster it belongs to; a domain maps to itself. */
  clusterOf: ReadonlyMap<string, string>;
  /** Dependencies in either direction, per concept. */
  dependencyCount: ReadonlyMap<string, number>;
  domainIds: readonly string[];
}

const MAX_PARENT_HOPS = 8;
const graphs = new WeakMap<readonly NeuralEdgeInput[], NeuralGraph>();

/** O(n · parent depth + e), cached per edge list: a world rebuild makes a new list. */
export function neuralGraphOf(nodes: readonly NeuralNodeInput[], edges: readonly NeuralEdgeInput[]): NeuralGraph {
  const cached = graphs.get(edges);
  if (cached) return cached;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const clusterOf = new Map<string, string>();
  const domainIds: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'domain') domainIds.push(node.id);
    let cursor: NeuralNodeInput | undefined = node;
    for (let hop = 0; cursor && hop < MAX_PARENT_HOPS; hop += 1) {
      if (cursor.kind === 'domain') {
        clusterOf.set(node.id, cursor.id);
        break;
      }
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
  }
  const dependencyCount = new Map<string, number>();
  for (const edge of edges) {
    if (!isNeuralDependency(edge)) continue;
    dependencyCount.set(edge.sourceId, (dependencyCount.get(edge.sourceId) ?? 0) + 1);
    dependencyCount.set(edge.targetId, (dependencyCount.get(edge.targetId) ?? 0) + 1);
  }
  const graph = { clusterOf, dependencyCount, domainIds: domainIds.sort() };
  graphs.set(edges, graph);
  return graph;
}

export interface NeuralCellSizes {
  capabilityPx: number;
  capabilityGainPx: number;
  elementPx: number;
  elementGainPx: number;
  domainPx: number;
  projectPx: number;
}

/** A capability is larger than an element; both grow with the square root of their dependencies. */
export function neuralCellRadiusPx(kind: DomeViewKind, dependencies: number, sizes: NeuralCellSizes): number {
  const grown = Math.sqrt(Math.max(0, dependencies));
  if (kind === 'capability') return sizes.capabilityPx + sizes.capabilityGainPx * grown;
  if (kind === 'element') return sizes.elementPx + sizes.elementGainPx * grown;
  return kind === 'domain' ? sizes.domainPx : sizes.projectPx;
}

/** What the focus needs (it depends on them) and what needs it. */
export function neuralFocusSets(edges: readonly NeuralEdgeInput[], focusId: string): { needs: Set<string>; usedBy: Set<string> } {
  const needs = new Set<string>();
  const usedBy = new Set<string>();
  for (const edge of edges) {
    if (!isNeuralDependency(edge) || edge.sourceId === edge.targetId) continue;
    if (edge.sourceId === focusId) needs.add(edge.targetId);
    else if (edge.targetId === focusId) usedBy.add(edge.sourceId);
  }
  return { needs, usedBy };
}

/** Amber only where evidence was read and called the concept stale; unread evidence is never amber. */
export function neuralCellIsStale(evidence: ReadonlyMap<string, 'current' | 'stale' | 'unknown'> | null, id: string): boolean {
  return evidence !== null && evidence.get(id) === 'stale';
}

export interface NeuralRouteShape {
  /** Largest sideways bow of a same-cluster axon, as a share of its length. */
  bow: number;
  /** How far a tract's gap point is pulled toward the view's centre, 0..1. */
  pull: number;
  /** How far the control point is pushed past the gap point, so the curve itself passes near it. */
  gain: number;
}

export interface NeuralTracts {
  graph: NeuralGraph;
  hubX: ReadonlyMap<string, number>;
  hubY: ReadonlyMap<string, number>;
  centreX: number;
  centreY: number;
  shape: NeuralRouteShape;
}

/** The cluster hearts where `positionOf` places them this frame, and their mean as the view's centre. O(domains). */
export function neuralTracts(
  graph: NeuralGraph,
  positionOf: (id: string) => { x: number; y: number } | null,
  shape: NeuralRouteShape,
): NeuralTracts {
  const hubX = new Map<string, number>();
  const hubY = new Map<string, number>();
  let sumX = 0;
  let sumY = 0;
  for (const id of graph.domainIds) {
    const at = positionOf(id);
    if (!at) continue;
    hubX.set(id, at.x);
    hubY.set(id, at.y);
    sumX += at.x;
    sumY += at.y;
  }
  const count = Math.max(1, hubX.size);
  return { graph, hubX, hubY, centreX: sumX / count, centreY: sumY / count, shape };
}

/** FNV-1a over both ends, so a pair always bows the same way and the opposite pair need not. */
function pairSeed(sourceId: string, targetId: string): number {
  let hash = 2166136261;
  const mix = (text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  };
  mix(sourceId);
  mix('\u0000');
  mix(targetId);
  return (hash >>> 0) / 2 ** 32;
}

/**
 * The quadratic control of one dependency, in the same space as its ends. Inside a cluster it bows a
 * little; between clusters it bends through the gap between the two hearts, pulled toward the
 * centre, so every dependency between the same two clusters shares one tract. O(1).
 */
export function neuralAxonControl(
  sourceId: string,
  targetId: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  tracts: NeuralTracts,
): { x: number; y: number } {
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const from = tracts.graph.clusterOf.get(sourceId);
  const to = tracts.graph.clusterOf.get(targetId);
  const hubAX = from === undefined ? undefined : tracts.hubX.get(from);
  const hubBX = to === undefined ? undefined : tracts.hubX.get(to);
  if (from === to || hubAX === undefined || hubBX === undefined) {
    const bow = (pairSeed(sourceId, targetId) - 0.5) * tracts.shape.bow * 2;
    return { x: mx - (by - ay) * bow, y: my + (bx - ax) * bow };
  }
  const gapX = (hubAX + hubBX) / 2;
  const gapY = (tracts.hubY.get(from!)! + tracts.hubY.get(to!)!) / 2;
  const throughX = gapX + (tracts.centreX - gapX) * tracts.shape.pull;
  const throughY = gapY + (tracts.centreY - gapY) * tracts.shape.pull;
  return { x: mx + (throughX - mx) * tracts.shape.gain, y: my + (throughY - my) * tracts.shape.gain };
}
