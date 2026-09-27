import type { KnowledgeGraphNode, OntologyHealthActionTarget, VaultHealthResult } from "@/entities/knowledge-graph";

/**
 * Adapts the CLI-parity `computeVaultHealth` verdict (islands, missing domain containment, the signals the
 * CLI `health` command flags) into the repair queue's shape. Vault slugs (`capabilities/invoice`) are matched to graph
 * node ids (`capability:invoice`) by their tail.
 */
export interface VaultHealthRepair {
  islandCount: number;
  missingContainmentCount: number;
  /** Highest-priority CLI-parity repair, or null when both are clear. */
  actionTarget: OntologyHealthActionTarget | null;
  /**
   * Every resolvable target by urgency: missing containment first, then one node per island. `actionTarget` stays
   * the first item for the topology and summary contract.
   */
  actionTargets: OntologyHealthActionTarget[];
}

// The shared tail of a vault slug or a graph node id: node ids separate kind with ':' and slugs use '/'.
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
  // Last wins: tails are unique per kind in practice, and the goal is an exact node id, not disambiguation.
  const nodesByTail = new Map<string, KnowledgeGraphNode>();
  for (const node of nodes) nodesByTail.set(tailOf(node.id), node);

  const islandCount = health.islands.length;
  const missingContainmentCount = health.missingContainment.length;

  // Keep the whole actionable set, so aggregate counts never strand the targets past the first row.
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
