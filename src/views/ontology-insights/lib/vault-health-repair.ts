import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph/lib/ontology-health-signals";
import type { VaultHealthResult } from "@/entities/knowledge-graph/lib/vault-health";

/**
 * Adapts the CLI-parity `computeVaultHealth` verdict into the insights repair
 * queue's shape (C1). The vault-health lib speaks in full vault slugs
 * (`capabilities/invoice`); the queue links use graph node ids
 * (`capability:invoice`), so we match a target slug to a node by its tail.
 *
 * These two signals (disconnected islands · missing domain containment) are the
 * ones `ontology-atlas health` flips to `needs_attention` on — surfacing them
 * is what stops the app from falsely claiming "수리할 것 없음".
 */
export interface VaultHealthRepair {
  islandCount: number;
  missingContainmentCount: number;
  /** Highest-priority CLI-parity repair, or null when both are clear. */
  actionTarget: OntologyHealthActionTarget | null;
}

// Reduce both a vault slug (`capabilities/invoice`) and a graph node id
// (`capability:invoice`) to their shared tail (`invoice`). Node ids separate
// kind with ':', vault slugs use folder '/', so split on both.
function tailOf(slug: string): string {
  const parts = slug.split(/[/:]/);
  return parts[parts.length - 1] || slug;
}

function nodeForSlug(
  slug: string,
  nodesByTail: Map<string, KnowledgeGraphNode>,
): KnowledgeGraphNode | null {
  return nodesByTail.get(tailOf(slug)) ?? null;
}

export function buildVaultHealthRepair(
  health: Pick<VaultHealthResult, "missingContainment" | "islands">,
  nodes: readonly KnowledgeGraphNode[],
): VaultHealthRepair {
  // Last-wins is fine — tails are unique per kind in practice, and an exact
  // graph node id is the goal, not disambiguation.
  const nodesByTail = new Map<string, KnowledgeGraphNode>();
  for (const node of nodes) nodesByTail.set(tailOf(node.id), node);

  const islandCount = health.islands.length;
  const missingContainmentCount = health.missingContainment.length;

  // Prefer a missing-containment target (a concrete node to link back), then an
  // island member; both link to a real node the user can act on.
  let actionTarget: OntologyHealthActionTarget | null = null;
  for (const target of health.missingContainment) {
    const node = nodeForSlug(target.slug, nodesByTail);
    if (node) {
      actionTarget = { slug: node.id, title: node.display ?? node.title, kind: "containment" };
      break;
    }
  }
  if (!actionTarget) {
    for (const island of health.islands) {
      const memberSlug = island[0];
      const node = memberSlug ? nodeForSlug(memberSlug, nodesByTail) : null;
      if (node) {
        actionTarget = { slug: node.id, title: node.display ?? node.title, kind: "island" };
        break;
      }
    }
  }

  return { islandCount, missingContainmentCount, actionTarget };
}
