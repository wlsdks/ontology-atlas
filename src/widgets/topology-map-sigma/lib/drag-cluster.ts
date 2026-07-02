import type Graph from 'graphology';
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from './graph-build';

const ONTOLOGY_KIND_RANK: Record<string, number> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
  unknown: 4,
};

const DEFAULT_MAX_CLUSTER_SIZE = 12;
const MAX_STRUCTURAL_WALK_DEPTH = 3;

interface DragClusterCandidate {
  id: string;
  depth: number;
  degree: number;
  rank: number;
  pathPriority: number;
}

function nodeKindRank(attrs: SigmaNodeAttrs): number {
  return ONTOLOGY_KIND_RANK[attrs.ontologyTopKind ?? ''] ?? 3;
}

function edgePriority(attrs: SigmaEdgeAttrs): number {
  if (attrs.kind === 'contains' || attrs.relationType === 'contains') return 0;
  if (attrs.kind === 'depends-on' || attrs.relationType === 'depends_on') return 1;
  return 2;
}

function edgeAttrsBetween(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  source: string,
  target: string,
): SigmaEdgeAttrs | undefined {
  const edge = graph.edge(source, target) ?? graph.edge(target, source);
  return edge ? graph.getEdgeAttributes(edge) : undefined;
}

export function collectSigmaDragCluster(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  rootNode: string,
  maxClusterSize = DEFAULT_MAX_CLUSTER_SIZE,
): Set<string> {
  const cluster = new Set<string>();
  if (!graph.hasNode(rootNode)) return cluster;
  cluster.add(rootNode);

  const rootAttrs = graph.getNodeAttributes(rootNode);
  const rootRank = nodeKindRank(rootAttrs);
  const candidates: DragClusterCandidate[] = [];
  const seen = new Set([rootNode]);
  const queue: DragClusterCandidate[] = [
    {
      id: rootNode,
      depth: 0,
      degree: graph.degree(rootNode),
      rank: rootRank,
      pathPriority: 0,
    },
  ];

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    if (current.depth >= MAX_STRUCTURAL_WALK_DEPTH) continue;
    const neighbors = graph
      .neighbors(current.id)
      .filter((neighbor) => graph.hasNode(neighbor) && !seen.has(neighbor))
      .map((neighbor) => {
        const attrs = graph.getNodeAttributes(neighbor);
        const edgeAttrs = edgeAttrsBetween(graph, current.id, neighbor);
        const rank = nodeKindRank(attrs);
        const priority = edgeAttrs ? edgePriority(edgeAttrs) : 3;
        const childBias = rank > current.rank ? 0 : 2;
        return {
          id: neighbor,
          degree: graph.degree(neighbor),
          rank,
          priority,
          pathPriority: current.pathPriority + priority * 10 + childBias,
        };
      })
      .sort((a, b) => {
        const aChild = a.rank > current.rank ? 0 : 1;
        const bChild = b.rank > current.rank ? 0 : 1;
        return (
          a.priority - b.priority ||
          aChild - bChild ||
          a.id.localeCompare(b.id) ||
          b.degree - a.degree
        );
      });

    for (const neighbor of neighbors) {
      seen.add(neighbor.id);
      const candidate = {
        id: neighbor.id,
        depth: current.depth + 1,
        degree: neighbor.degree,
        rank: neighbor.rank,
        pathPriority: neighbor.pathPriority,
      };
      candidates.push(candidate);
      if (neighbor.priority === 0 && neighbor.rank > current.rank) {
        queue.push(candidate);
      }
    }
  }

  candidates.sort((a, b) => {
    const aChild = a.rank > rootRank ? 0 : 1;
    const bChild = b.rank > rootRank ? 0 : 1;
    return (
      a.pathPriority - b.pathPriority ||
      a.depth - b.depth ||
      aChild - bChild ||
      a.id.localeCompare(b.id) ||
      b.degree - a.degree
    );
  });

  for (const candidate of candidates) {
    if (cluster.size >= maxClusterSize) break;
    cluster.add(candidate.id);
  }
  return cluster;
}

export function snapshotSigmaDragClusterOffsets(
  graph: Graph<SigmaNodeAttrs, SigmaEdgeAttrs>,
  rootNode: string,
  cluster: ReadonlySet<string>,
): Map<string, { dx: number; dy: number }> {
  const offsets = new Map<string, { dx: number; dy: number }>();
  if (!graph.hasNode(rootNode)) return offsets;
  const rootAttrs = graph.getNodeAttributes(rootNode);
  for (const node of cluster) {
    if (!graph.hasNode(node)) continue;
    const attrs = graph.getNodeAttributes(node);
    offsets.set(node, {
      dx: attrs.x - rootAttrs.x,
      dy: attrs.y - rootAttrs.y,
    });
  }
  return offsets;
}
