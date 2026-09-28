import type { KnowledgeGraphEdge, KnowledgeGraphNode } from '@/entities/knowledge-graph';
import {
  computeDomainCensusRows,
  domainCensusById,
  isContainmentRelation,
} from '@/entities/knowledge-graph';
import type { OntologyMapEdge, OntologyMapNode } from '@/widgets/ontology-map';

const RENDERABLE_KIND_LIST = ['project', 'domain', 'capability', 'element'] as const;
const RENDERABLE_KINDS = new Set<string>(RENDERABLE_KIND_LIST);
type RenderableKind = (typeof RENDERABLE_KIND_LIST)[number];

/**
 * Puts the real map engine on `/download`. Home's `buildOntologyMapGraph` is another view's
 * internals (a same-layer cross-import), so only what this stage uses is built here; fields it
 * cannot know (`recentlyUpdated`, `stale`, `ownerKey`, `relationQuality`) stay neutral, never
 * invented. Counts still come from the shared census, or the hub disagrees with the caption.
 * Coordinates are zero: the engine lays out from `contains` edges and ignores them.
 */
export interface StageGraph {
  nodes: OntologyMapNode[];
  edges: OntologyMapEdge[];
}

export function buildStageGraph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): StageGraph {
  const included = nodes.filter((node) => RENDERABLE_KINDS.has(node.kind));
  const includedIds = new Set(included.map((node) => node.id));
  const includedEdges = edges.filter(
    // A self-edge would render as a zero-length line.
    (edge) => edge.from !== edge.to && includedIds.has(edge.from) && includedIds.has(edge.to),
  );

  const fullDegree = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of includedEdges) {
    fullDegree.set(edge.from, (fullDegree.get(edge.from) ?? 0) + 1);
    fullDegree.set(edge.to, (fullDegree.get(edge.to) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  /**
   * The shared census the INDEX tree, `/projects` and home use, counting unique nodes. All four
   * drawn kinds are passed because capability `size` drives its scale, not just engraved numbers.
   */
  const censusById = domainCensusById(
    computeDomainCensusRows(nodes, edges, RENDERABLE_KIND_LIST),
  );
  const descendantCountOf = (id: string) => censusById.get(id)?.total ?? 0;

  /** At most one hub; ties break by ascending id so every build picks the same node. */
  let hubId: string | null = null;
  let hubIncoming = 0;
  for (const node of included) {
    const count = incoming.get(node.id) ?? 0;
    /* Unreferenced nodes never become the hub, or an isolated vault gets a baseless ring; home's adapter twins this. */
    if (count === 0) continue;
    if (count > hubIncoming || (count === hubIncoming && hubId !== null && node.id < hubId)) {
      hubId = node.id;
      hubIncoming = count;
    }
  }

  return {
    nodes: included.map((node) => ({
      id: node.id,
    // The short display title: the full one gets clipped.
      label: node.display ?? node.title,
      kind: node.kind as RenderableKind,
      size: descendantCountOf(node.id),
      x: 0,
      y: 0,
      isHub: node.id === hubId,
      ownerKey: null,
      recentlyUpdated: false,
      stale: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: descendantCountOf(node.id),
    })),
    edges: includedEdges.map((edge) => ({
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? ('contains' as const) : ('depends' as const),
      declaredBySlug: edge.evidenceIds[0] ?? null,
    })),
  };
}
