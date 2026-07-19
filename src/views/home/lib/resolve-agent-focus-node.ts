import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { translateOntologyDeeplinkToTopologyParam } from "@/entities/knowledge-graph";
import { resolveTopologySelectedOntologyNode } from "./resolve-topology-selected-node";

/**
 * W6 agent visibility — resolves an agent heartbeat's `focus.ontologySlug`
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
 * caller (`HomePage`) then draws nothing extra on the map (fabrication 0,
 * per the W6 brief: a heartbeat whose focus can't be resolved is silently
 * ignored, never guessed at).
 */
export function resolveAgentFocusNodeId(
  ontologySlug: string | null,
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): string | null {
  if (!ontologySlug) return null;
  const normalized = translateOntologyDeeplinkToTopologyParam(ontologySlug);
  return resolveTopologySelectedOntologyNode(normalized, nodes)?.id ?? null;
}
