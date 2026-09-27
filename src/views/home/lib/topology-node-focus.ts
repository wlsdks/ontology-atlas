import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  classifyTopologyRelationQuality,
  type TopologyRelationQuality,
  type TopologyRelationQualityBreakdown,
} from "./topology-analysis";
import type { TopologyOntologyDrawerModel } from "./topology-ontology-drawer";

interface TopologyNodeFocusConnection {
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
 * A zero-recompute projection of `TopologyOntologyDrawerModel`, so counts cannot drift from the
 * drawer. Rationale: `docs/design/topology-focus-and-scale.md`.
 */
export interface TopologyNodeFocusModel {
  id: string;
  title: string;
  /** The full `title` shows only on the full-detail surface. */
  displayTitle: string;
  kind: string;
  summary: string | null;
  sourceSlug: string | null;
  ownDocumentSlug: string | null;
  /** Without its own document, the document that mentions it. */
  mentionedInSlug: string | null;
  usedByCount: number;
  dependsOnCount: number;
  /** Up to the drawer's `previewLimit`. */
  connections: TopologyNodeFocusConnection[];
  /** Edge evidence and approval state, not a similarity score. */
  relationQuality: TopologyRelationQualityBreakdown;
  /** Shown as "+N". */
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
