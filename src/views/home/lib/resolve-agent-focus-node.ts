import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { translateOntologyDeeplinkToTopologyParam } from "@/entities/knowledge-graph";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * Resolves a heartbeat's `focus.ontologySlug` (a vault slug) to the map node id the render engine
 * keys on, through the same two steps `/ontology` deep links use. No slug, list or match returns
 * null: never guessed.
 */
export function resolveAgentFocusNodeId(
  ontologySlug: string | null,
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): string | null {
  if (!ontologySlug) return null;
  const normalized = translateOntologyDeeplinkToTopologyParam(ontologySlug);
  return resolveTopologySelectedOntologyNode(normalized, nodes)?.id ?? null;
}

export interface OntologyRelationPreviewInput {
  sourceSlug: string;
  targetSlug: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

export interface ResolvedOntologyRelationPreview {
  sourceId: string;
  targetId: string;
  relationType: string;
  phase: 'draft' | 'committing';
}

/** A ghost edge is drawn only when both endpoints exist on the current map. */
export function resolveOntologyRelationPreview(
  preview: OntologyRelationPreviewInput | null,
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): ResolvedOntologyRelationPreview | null {
  if (!preview) return null;
  const sourceId = resolveAgentFocusNodeId(preview.sourceSlug, nodes);
  const targetId = resolveAgentFocusNodeId(preview.targetSlug, nodes);
  if (!sourceId || !targetId) return null;
  return {
    sourceId,
    targetId,
    relationType: preview.relationType,
    phase: preview.phase,
  };
}
