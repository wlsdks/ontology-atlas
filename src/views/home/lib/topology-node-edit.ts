import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Pure model behind inline editing of a topology node: resolves the selected
 * node to its vault `.md` document, which the full-detail body editor consumes.
 * No UI or IO, so it unit-tests without a vault.
 */

export interface TopologyNodeEditTarget {
  /** Slug of the vault document to edit (the node's `sourceSlug`). */
  vaultSlug: string;
  /** Concurrent-edit guard, passed to `updateFrontmatter` as `expectedMtime`. */
  mtime: number | undefined;
  /** Current frontmatter — the baseline an edit is compared against. */
  frontmatter: Record<string, unknown>;
}

interface VaultDocLite {
  slug: string;
  mtime?: number;
  frontmatter?: Record<string, unknown>;
}

/**
 * Resolves the selected node to an editable vault document. `evidenceIds[0]` is
 * the node's `sourceSlug`, filled in by `derivationToInsight`. Null when no vault
 * document matches — a synthetic stub with no document of its own, the static
 * demo, or no vault selected are all uneditable.
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
