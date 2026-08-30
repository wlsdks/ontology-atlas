import {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
} from "@/shared/lib/ontology-tree";
import {
  classifyTopologyRelationQuality,
  type TopologyRelationQualityBreakdown,
} from "./topology-analysis";
import {
  resolveNodeDocument,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

/**
 * The shared "node facts" model behind the compact canvas popover
 * (`topology-node-focus.ts`) and the plain-language significance line
 * (`topology-node-significance.ts`) — direct relations, transitive reach,
 * owning domain. `buildTopologyNodeFocus`/`buildNodeSignificance` are
 * PROJECTIONS of this model (zero recompute, so counts can't drift).
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
  /**
   * Transitive incoming closure — nodes that depend on this one directly or
   * indirectly, i.e. the blast radius of changing it. Same direction semantics
   * as CLI `blast-radius --direction incoming`.
   */
  dependents: number;
  /** Transitive outgoing closure — nodes this one depends on, directly or indirectly. */
  dependencies: number;
}

export interface TopologyOntologyDrawerModel {
  sourceSlug: string | null;
  /**
   * Set only when `sourceSlug` is this node's own `.md`. Derived nodes that are
   * merely named by a relation stay null: their `sourceSlug` is someone else's
   * document, so opening it as "this node's document" would be a lie.
   */
  ownDocumentSlug: string | null;
  /** The other document that mentions a node with no document of its own; null when it has one. */
  mentionedInSlug: string | null;
  /** The owning domain node, if any — the first incoming edge whose source is `kind: domain`. */
  ownerDomain: { id: string; title: string } | null;
  incomingCount: number;
  outgoingCount: number;
  relationCounts: Array<{ type: string; count: number }>;
  provenanceCounts: Array<{ provenance: TopologyRelationProvenance; count: number }>;
  relationQuality: TopologyRelationQualityBreakdown;
  previewRelations: TopologyOntologyDrawerRelation[];
  /**
   * The transitive impact that 1-hop degree (`incomingCount`/`outgoingCount`)
   * understates. A person reads "changing this affects N" at a glance and an
   * agent gets the same number in its brief.
   */
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

  // Reuses the existing reachability engine rather than adding a BFS here.
  // depth = node count guarantees the full closure through cycles and long
  // chains (the discovered set blocks repeats). limit:1 because
  // `summary.reachableNodes` is the total regardless of limit, so shrinking the
  // returned layer to one keeps allocation minimal.
  // Only `depends_on` is causal impact — containment/domain/element are used for
  // structural traversal and must not enter the Affected/Dependencies numbers.
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

  // A domain usually contains its children, so the owner is found among the
  // incoming edges.
  //
  // domain and project nodes belong to no domain: a domain's parent is a
  // project, not another domain. Taking incoming cross-relations (`relates` and
  // friends) at face value produced misattributions like "domain · <another
  // domain>", polluting both the datasheet header and the handoff packet's
  // `domain:` field. They report null instead and the UI omits the line.
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
