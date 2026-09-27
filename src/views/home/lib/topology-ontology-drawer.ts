import {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  classifyTopologyRelationQuality,
  type TopologyRelationQualityBreakdown,
} from "./topology-analysis";

/**
 * Node facts shared by the canvas popover and the significance line, which project it without
 * recompute.
 */

export interface TopologyOntologyDrawerRelation {
  edge: KnowledgeGraphEdge;
  other: KnowledgeGraphNode | null;
  direction: "incoming" | "outgoing";
  provenance: TopologyRelationProvenance;
}

export type TopologyRelationProvenance =
  | "source_backed"
  | "authored"
  | "needs_review";

interface TopologyOntologyDrawerReach {
  /** Transitive incoming closure: the blast radius, as CLI `blast-radius --direction incoming`. */
  dependents: number;
  /** Transitive outgoing closure. */
  dependencies: number;
}

export interface TopologyOntologyDrawerModel {
  sourceSlug: string | null;
  /**
   * Set only when `sourceSlug` is this node's own `.md`; a relation-named node's `sourceSlug` is
   * another document.
   */
  ownDocumentSlug: string | null;
  /** Null when the node has its own document. */
  mentionedInSlug: string | null;
  /** The source of the first incoming edge from a `kind: domain` node. */
  ownerDomain: { id: string; title: string } | null;
  incomingCount: number;
  outgoingCount: number;
  relationCounts: Array<{ type: string; count: number }>;
  provenanceCounts: Array<{ provenance: TopologyRelationProvenance; count: number }>;
  relationQuality: TopologyRelationQualityBreakdown;
  previewRelations: TopologyOntologyDrawerRelation[];
  /** The transitive impact that 1-hop degree understates, shared with the agent brief. */
  reach: TopologyOntologyDrawerReach;
}

export function buildTopologyOntologyDrawerModel(
  node: KnowledgeGraphNode,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  previewLimit = 5,
): TopologyOntologyDrawerModel {
  const nodeById = new Map(nodes.map((candidate) => [candidate.id, candidate]));
  const incoming = edges.filter((edge) => edge.to === node.id);
  const outgoing = edges.filter((edge) => edge.from === node.id);
  const relationTypeCounts = new Map<string, number>();
  const provenanceCounts = new Map<TopologyRelationProvenance, number>();
  const relationQuality: TopologyRelationQualityBreakdown = {
    strong: 0,
    supported: 0,
    weak: 0,
    review: 0,
  };

  for (const edge of [...incoming, ...outgoing]) {
    relationTypeCounts.set(edge.type, (relationTypeCounts.get(edge.type) ?? 0) + 1);
    const provenance = classifyTopologyRelationProvenance(edge);
    provenanceCounts.set(provenance, (provenanceCounts.get(provenance) ?? 0) + 1);
    relationQuality[classifyTopologyRelationQuality(edge)] += 1;
  }

  const previewRelations: TopologyOntologyDrawerRelation[] = [
    ...outgoing.map((edge) => ({
      edge,
      other: nodeById.get(edge.to) ?? null,
      direction: "outgoing" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
    ...incoming.map((edge) => ({
      edge,
      other: nodeById.get(edge.from) ?? null,
      direction: "incoming" as const,
      provenance: classifyTopologyRelationProvenance(edge),
    })),
  ].slice(0, Math.max(0, previewLimit));

  // Reuses the reachability engine (BFS, O(V + E)); depth = node count reaches the full closure
  // through cycles.
  // limit 1 because `summary.reachableNodes` is the total regardless. Only `depends_on` counts as
  // impact.
  const fullDepth = Math.max(nodes.length, 1);
  const reach: TopologyOntologyDrawerReach = {
    // The change diff calls this same function, so the two counts cannot drift.
    dependents: computeOntologyDependents(node.id, nodes, edges),
    dependencies: buildOntologyReachability(node.id, nodes, edges, {
      direction: "outgoing",
      depth: fullDepth,
      limit: 1,
      types: IMPACT_RELATION_TYPES,
    }).summary.reachableNodes,
  };

  // The owner is found among incoming edges. Domain and project nodes report null:
  // incoming cross-relations would misattribute them to another domain.
  let ownerDomain: { id: string; title: string } | null = null;
  const canBelongToDomain = node.kind !== "domain" && node.kind !== "project";
  if (canBelongToDomain) {
    for (const e of incoming) {
      const src = nodeById.get(e.from);
      if (src && src.kind === "domain") {
        ownerDomain = { id: src.id, title: src.display ?? src.title };
        break;
      }
    }
  }

  const document = resolveNodeDocument(node);

  return {
    sourceSlug: node.evidenceIds[0] ?? null,
    ownDocumentSlug: document.ownSlug,
    mentionedInSlug: document.mentionedInSlug,
    ownerDomain,
    incomingCount: incoming.length,
    outgoingCount: outgoing.length,
    relationCounts: Array.from(relationTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    provenanceCounts: Array.from(provenanceCounts.entries())
      .map(([provenance, count]) => ({ provenance, count }))
      .sort(
        (a, b) =>
          provenanceRank(a.provenance) - provenanceRank(b.provenance) ||
          b.count - a.count,
      ),
    relationQuality,
    previewRelations,
    reach,
  };
}

export function classifyTopologyRelationProvenance(
  edge: Pick<KnowledgeGraphEdge, "evidenceIds" | "lastApprovedBy">,
): TopologyRelationProvenance {
  if (edge.evidenceIds.length > 0) return "source_backed";
  if (edge.lastApprovedBy.trim().length > 0) return "authored";
  return "needs_review";
}

function provenanceRank(provenance: TopologyRelationProvenance): number {
  if (provenance === "source_backed") return 0;
  if (provenance === "authored") return 1;
  return 2;
}
