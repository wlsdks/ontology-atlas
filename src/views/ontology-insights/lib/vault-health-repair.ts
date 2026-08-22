import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologyHealthActionTarget } from "@/entities/knowledge-graph/lib/ontology-health-signals";
import type { VaultHealthResult } from "@/entities/knowledge-graph/lib/vault-health";

/**
 * Adapts the CLI-parity `computeVaultHealth` verdict into the shape of the insights repair queue.
 * The vault-health lib speaks in full vault slugs (`capabilities/invoice`) while the queue links use
 * graph node ids (`capability:invoice`), so a target slug is matched to a node by its tail.
 *
 * These two signals (disconnected islands · missing domain containment) are the ones
 * `node $ATLAS/cli/src/index.mjs health` flips to `needs_attention` on — surfacing them is what
 * stops the app from falsely claiming there is nothing to repair.
 */
export interface VaultHealthRepair {
  islandCount: number;
  missingContainmentCount: number;
  /** Highest-priority CLI-parity repair, or null when both are clear. */
  actionTarget: OntologyHealthActionTarget | null;
  /**
   * Every resolvable CLI-parity repair target, ordered by urgency:
   * missing-containment nodes first, then one representative per island.
   * `actionTarget` remains the first item for the topology/summary contract.
   */
  actionTargets: OntologyHealthActionTarget[];
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

  // Preserve the whole actionable set. The repair queue may keep the first row
  // compact, but its aggregate counts must not strand the remaining targets.
  const actionTargets: OntologyHealthActionTarget[] = [];
  for (const target of health.missingContainment) {
    const node = nodeForSlug(target.slug, nodesByTail);
    if (node) {
      actionTargets.push({
        slug: node.id,
        title: node.display ?? node.title,
        kind: "containment",
      });
    }
  }
  for (const island of health.islands) {
    const node = island
      .map((memberSlug) => nodeForSlug(memberSlug, nodesByTail))
      .find((candidate): candidate is KnowledgeGraphNode => candidate !== null);
    if (node) {
      actionTargets.push({
        slug: node.id,
        title: node.display ?? node.title,
        kind: "island",
      });
    }
  }

  return {
    islandCount,
    missingContainmentCount,
    actionTarget: actionTargets[0] ?? null,
    actionTargets,
  };
}
