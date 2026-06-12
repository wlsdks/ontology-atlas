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

function nodeKindRank(attrs: SigmaNodeAttrs): number {
  return ONTOLOGY_KIND_RANK[attrs.ontologyTopKind ?? ''] ?? 3;
}

function edgePriority(attrs: SigmaEdgeAttrs): number {
  if (attrs.kind === 'contains' || attrs.relationType === 'contains') return 0;
  if (attrs.kind === 'depends-on' || attrs.relationType === 'depends_on') return 1;
  return 2;
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
  const candidates = graph
    .neighbors(rootNode)
    .filter((neighbor) => graph.hasNode(neighbor))
    .map((neighbor) => {
      const attrs = graph.getNodeAttributes(neighbor);
      const edge = graph.edge(rootNode, neighbor) ?? graph.edge(neighbor, rootNode);
      const edgeAttrs = edge ? graph.getEdgeAttributes(edge) : undefined;
      return {
        id: neighbor,
        degree: graph.degree(neighbor),
        rank: nodeKindRank(attrs),
        priority: edgeAttrs ? edgePriority(edgeAttrs) : 3,
      };
    })
    .sort((a, b) => {
      const aChild = a.rank > rootRank ? 0 : 1;
      const bChild = b.rank > rootRank ? 0 : 1;
      return (
        a.priority - b.priority ||
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
