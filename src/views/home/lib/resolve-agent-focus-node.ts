import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { translateOntologyDeeplinkToTopologyParam } from "@/entities/knowledge-graph";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * Resolves an agent heartbeat's `focus.ontologySlug`
 * (a raw vault slug, e.g. `"capabilities/agent-live-activity-contract"`,
 * `"domains/onboarding-ux"`, or a bare/canonical slug) into the topology
 * graph node id (`"capability:agent-live-activity-contract"`) that
 * `TopologyMapV2`'s render engine keys nodes by.
 *
 * Reuses the SAME two-step resolution `/ontology` deep links already go
 * through (`OntologyRedirectPage` → `/topology?p=`): first normalize the
 * plural vault-folder prefix form to canonical `kind:slug`
 * (`translateOntologyDeeplinkToTopologyParam`), then resolve that against
 * the live node list (`resolveTopologySelectedOntologyNode`, which also
 * falls back to a bare-slug `endsWith(':'+tail)` match). No new resolution
 * logic — this is a thin composition so the CLI's heartbeat writer doesn't
 * need to know the graph's `kind:slug` id shape.
 *
 * Returns `null` when there's no slug, no node list, or no match — the
 * caller then draws nothing extra on the map: a heartbeat whose focus cannot be
 * resolved is silently ignored, never guessed at.
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

/**
 * ACP speaks in vault slugs while the canvas keys on graph node ids. A ghost
 * edge is drawn only when both endpoints exist on the current map — neither end
 * is ever guessed.
 */
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
