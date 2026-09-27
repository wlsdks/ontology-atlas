import type { KnowledgeGraphNode } from "../model/types";

/**
 * The one name to hand an agent for a node. `evidenceIds[0]` may carry a bundle-root prefix or,
 * for a derived node, another document's slug.
 */
export interface NodeAgentTarget {
  /** The name MCP and the CLI accept, or null. */
  ref: string | null;
  /** When false, `add_concept` must create the document first. */
  documented: boolean;
}

type AgentTargetInput = {
  evidenceIds?: readonly string[];
} & Pick<KnowledgeGraphNode, "hasOwnDocument" | "agentSlug" | "ref">;

export function resolveNodeAgentTarget(
  node: AgentTargetInput | null | undefined,
): NodeAgentTarget {
  if (!node) return { ref: null, documented: false };
  // Fixtures without `hasOwnDocument` read as document nodes.
  const documented = node.hasOwnDocument !== false;
  if (!documented) {
    const derivedRef = node.ref?.trim();
    return { ref: derivedRef || null, documented: false };
  }
  const explicit = node.agentSlug?.trim();
  if (explicit) return { ref: explicit, documented: true };
  const fallback = node.evidenceIds?.[0]?.trim();
  return { ref: fallback || null, documented: true };
}

/** Strips the dogfood bundle's `docs/`-rooted prefix; local vaults pass none. */
export function stripVaultSlugPrefix(slug: string, prefix: string | undefined): string {
  if (!prefix) return slug;
  return slug.startsWith(prefix) ? slug.slice(prefix.length) : slug;
}
