import { typeAllowed } from '../query-operation/query-primitives.mjs';
import { normalizeCycle } from './topology-shape.mjs';
import { compareText } from '../../compare-text.mjs';

/**
 * Every simple cycle over the allowed relation types, up to `maxDepth` hops, with the shortest
 * `limit` of them kept. Johnson's minimum-vertex rule finds each cycle once, from its lowest-ranked
 * node. Setup sorts the nodes and indexes the edges, O(V log V + E); the search then costs
 * O(searchBudget · (out-degree + log limit)). A hit budget is reported, never hidden.
 */
export function findDependencyCycles({ nodes, outgoing, typeSet, maxDepth, limit, searchBudget }) {
  const rank = new Map(
    [...nodes].sort((a, b) => compareText(a.slug, b.slug)).map((node, index) => [node.slug, index]),
  );
  const successors = new Map();
  for (const [from, list] of outgoing) {
    const edgeByTarget = new Map();
    for (const edge of list) {
      if (edge.resolved && typeAllowed(edge.via, typeSet) && rank.has(edge.to) && !edgeByTarget.has(edge.to)) {
        edgeByTarget.set(edge.to, edge);
      }
    }
    if (rank.has(from) && edgeByTarget.size > 0) successors.set(from, [...edgeByTarget.values()]);
  }
  const shortest = [];
  let longestKept = Number.POSITIVE_INFINITY;
  const path = [];
  const edgePath = [];
  let totalCycles = 0;
  let expandedStates = 0;
  let truncatedByBudget = false;

  for (const start of [...successors.keys()].sort((a, b) => rank.get(a) - rank.get(b))) {
    if (maxDepth === 0 || truncatedByBudget) break;
    expand(rank.get(start), start);
  }
  keepShortest();

  return { shortest, totalCycles, expandedStates, truncatedByBudget };

  function expand(startRank, current) {
    if (expandedStates >= searchBudget) {
      truncatedByBudget = true;
      return;
    }
    expandedStates += 1;
    path.push(current);
    for (const edge of successors.get(current) ?? []) {
      if (edge.to === path[0]) {
        record(edge);
      } else if (path.length < maxDepth && rank.get(edge.to) > startRank && !path.includes(edge.to)) {
        edgePath.push(edge);
        expand(startRank, edge.to);
        edgePath.pop();
        if (truncatedByBudget) break;
      }
    }
    path.pop();
  }

  function record(closingEdge) {
    totalCycles += 1;
    if (path.length > longestKept) return;
    const cycle = normalizeCycle(path, [...edgePath, closingEdge]);
    shortest.push({ ...cycle, sortKey: cycle.nodes.join('\0') });
    if (shortest.length === 2 * limit) keepShortest();
  }

  function keepShortest() {
    shortest.sort((a, b) => a.nodes.length - b.nodes.length || compareText(a.sortKey, b.sortKey));
    shortest.length = Math.min(shortest.length, limit);
    if (shortest.length === limit) longestKept = shortest[limit - 1].nodes.length - 1;
  }
}

/**
 * Prerequisite-first layers of the selected dependency edges, by layered Kahn's algorithm over
 * deduplicated edge pairs (adjacency Map of Sets, indegree Map): O((V + E) log V), since each layer
 * and adjacency set is sorted for a stable order. `blocked` holds what a cycle keeps from any layer.
 */
export function layerByPrerequisites({ nodes, edges, typeSet, includeIsolated }) {
  const selectedEdges = edges.filter((edge) => edge.resolved && typeAllowed(edge.via, typeSet));
  const slugs = new Set();
  const adjacency = new Map();
  const indegree = new Map();
  const edgePairs = new Set();

  if (includeIsolated) {
    for (const node of nodes) slugs.add(node.slug);
  }

  for (const edge of selectedEdges) {
    slugs.add(edge.from);
    slugs.add(edge.to);
    const prerequisite = edge.to;
    const dependent = edge.from;
    const pairKey = `${prerequisite}\0${dependent}`;
    if (edgePairs.has(pairKey)) continue;
    edgePairs.add(pairKey);
    if (!adjacency.has(prerequisite)) adjacency.set(prerequisite, new Set());
    adjacency.get(prerequisite).add(dependent);
    indegree.set(dependent, (indegree.get(dependent) || 0) + 1);
    if (!indegree.has(prerequisite)) indegree.set(prerequisite, 0);
  }

  for (const slug of slugs) {
    if (!adjacency.has(slug)) adjacency.set(slug, new Set());
    if (!indegree.has(slug)) indegree.set(slug, 0);
  }

  const ordered = [];
  const layers = [];
  let ready = [...slugs].filter((slug) => indegree.get(slug) === 0).sort();
  let rank = 0;

  while (ready.length > 0) {
    const layer = ready;
    layers.push({ rank, slugs: layer });
    for (const slug of layer) ordered.push({ rank, slug });

    const nextReady = [];
    for (const slug of layer) {
      for (const next of [...(adjacency.get(slug) || [])].sort()) {
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) nextReady.push(next);
      }
    }
    ready = [...new Set(nextReady)].sort();
    rank += 1;
  }

  const blocked = [...slugs]
    .filter((slug) => (indegree.get(slug) || 0) > 0)
    .sort()
    .map((slug) => ({ slug, remainingInDegree: indegree.get(slug) }));

  return { selectedEdges, slugCount: slugs.size, ordered, layers, blocked };
}
