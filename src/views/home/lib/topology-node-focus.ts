import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  classifyTopologyRelationQuality,
  type TopologyRelationQuality,
  type TopologyRelationQualityBreakdown,
} from "./topology-analysis";
import type { TopologyOntologyDrawerModel } from "./topology-ontology-drawer";

/**
 * One connection row in the compact node popover — a single direct neighbour.
 */
export interface TopologyNodeFocusConnection {
  id: string;
  title: string;
  kind: string;
  direction: "incoming" | "outgoing";
  relationType: string;
  relationQuality: TopologyRelationQuality;
  evidenceCount: number;
  authored: boolean;
}

/**
 * View-model for the compact popover that opens beside a clicked topology node.
 *
 * It is a projection of `TopologyOntologyDrawerModel` with zero recompute, so
 * its counts and connections cannot drift from the drawer's. The popover shows
 * the node and what it connects to; everything else stays behind the
 * full-detail opt-in. Rationale: `docs/TOPOLOGY-FOCUS-AND-SCALE.md`.
 */
export interface TopologyNodeFocusModel {
  id: string;
  title: string;
  /**
   * Short display title, drawn by the compact popover header. The full `title`
   * survives as secondary text on the full-detail surface only.
   */
  displayTitle: string;
  kind: string;
  summary: string | null;
  sourceSlug: string | null;
  /** This node's own `.md` slug, or null — projected straight from the drawer model. */
  ownDocumentSlug: string | null;
  /** When the node has no document, the slug of the document that mentions it. */
  mentionedInSlug: string | null;
  /** Direct incoming — what uses this node. */
  usedByCount: number;
  /** Direct outgoing — what this node leans on. */
  dependsOnCount: number;
  /** Direct ego neighbours, up to the drawer's `previewLimit`. */
  connections: TopologyNodeFocusConnection[];
  /** Handoff quality of the direct relations — edge evidence and approval state, not a similarity score. */
  relationQuality: TopologyRelationQualityBreakdown;
  /** Direct connections that did not fit, shown as "+N". */
  hiddenConnectionCount: number;
}

export function buildTopologyNodeFocus(
  node: KnowledgeGraphNode,
  model: TopologyOntologyDrawerModel,
): TopologyNodeFocusModel {
  const totalDirect = model.incomingCount + model.outgoingCount;
  const connections: TopologyNodeFocusConnection[] = model.previewRelations.map(
    (relation) => {
      const relationQuality = classifyTopologyRelationQuality(relation.edge);
      return {
        id: relation.other?.id ?? relation.edge.id,
        title: relation.other?.display ?? relation.other?.title ?? relation.edge.id,
        kind: relation.other?.kind ?? "unknown",
        direction: relation.direction,
        relationType: relation.edge.type,
        relationQuality,
        evidenceCount: relation.edge.evidenceIds.length,
        authored: relation.edge.lastApprovedBy.trim().length > 0,
      };
    },
  );
  return {
    id: node.id,
    title: node.title,
    displayTitle: node.display ?? node.title,
    kind: node.kind,
    summary: node.summary ?? null,
    sourceSlug: model.sourceSlug,
    ownDocumentSlug: model.ownDocumentSlug,
    mentionedInSlug: model.mentionedInSlug,
    usedByCount: model.incomingCount,
    dependsOnCount: model.outgoingCount,
    connections,
    relationQuality: model.relationQuality,
    hiddenConnectionCount: Math.max(0, totalDirect - connections.length),
  };
}
