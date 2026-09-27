import {
  type KnowledgeGraphNode,
  resolveNodeAgentTarget,
  resolveOntologyBuilderNodeSlug,
} from "@/entities/knowledge-graph";

/**
 * A map-written relation names a node by its document slug, the spelling MCP writes
 * (`domains/agent-access`).
 * Both map writers call this, or one relation reaches disk in two spellings.
 * `ontology/` is the bundled manifest's root segment, not part of any vault address.
 */
export function resolveNodeVaultRef(node: KnowledgeGraphNode): string {
  const target = resolveNodeAgentTarget(node);
  return (target.ref ?? resolveOntologyBuilderNodeSlug(node)).replace(/^ontology\//, "");
}

/** Resolves the selected topology node to its vault `.md` document for the full-detail body editor. */

export interface TopologyNodeEditTarget {
  vaultSlug: string;
  /** Passed to `updateFrontmatter` as `expectedMtime`. */
  mtime: number | undefined;
  /** The baseline an edit is compared against. */
  frontmatter: Record<string, unknown>;
}

interface VaultDocLite {
  slug: string;
  mtime?: number;
  frontmatter?: Record<string, unknown>;
}

/**
 * `evidenceIds[0]` is the node's `sourceSlug` (from `derivationToInsight`).
 * Null for a synthetic stub, the static demo or no vault.
 */
export function resolveTopologyNodeEditTarget(
  node: Pick<KnowledgeGraphNode, "evidenceIds">,
  docs: readonly VaultDocLite[],
): TopologyNodeEditTarget | null {
  const slug = node.evidenceIds[0];
  if (!slug) return null;
  const doc = docs.find((d) => d.slug === slug);
  if (!doc) return null;
  return {
    vaultSlug: doc.slug,
    mtime: doc.mtime,
    frontmatter: doc.frontmatter ?? {},
  };
}
