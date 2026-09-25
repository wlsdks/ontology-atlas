import {
  type KnowledgeGraphNode,
  resolveNodeAgentTarget,
  resolveOntologyBuilderNodeSlug,
} from "@/entities/knowledge-graph";

/**
 * The address a relation written **from the map** names a node by — the node's own document
 * slug, the spelling MCP writes and every agent-authored relation in the vault uses
 * (`domains/agent-access`, `capabilities/mcp-tool-server`).
 *
 * The meaning editor already resolved its targets this way; the "add under this domain"
 * composer used the graph id's bare tail instead (`agent-access`), so one relation reached
 * disk in two spellings (map-edit QA D10, 2026-09-26). One function, so the two writers
 * cannot drift apart again. `ontology/` is the bundled dogfood manifest's root segment, not
 * part of any address a vault holds.
 */
export function resolveNodeVaultRef(node: KnowledgeGraphNode): string {
  const target = resolveNodeAgentTarget(node);
  return (target.ref ?? resolveOntologyBuilderNodeSlug(node)).replace(/^ontology\//, "");
}

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
