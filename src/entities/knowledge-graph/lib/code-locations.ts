import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";
import { buildConnections, groupConnectionsByRole } from "./ontology-tree/connections";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../model/types";

/**
 * The product's core promise is "business core → implementation evidence",
 * but `KnowledgeGraphNode.evidenceIds` is NOT that evidence — it's
 * `[sourceSlug]`, the vault doc the node itself came from (see
 * `derivationToInsight`'s doc comment in
 * `src/features/vault-ontology/model/use-ontology-insight.ts`), a
 * self-reference that's always 0 or 1 entries.
 *
 * The REAL code evidence lives in vault frontmatter `elements: [...]` — raw
 * file paths (`src/foo/bar.ts`, `mcp/src/index.js`) that `deriveOntologyFromVault`
 * turns into element-kind nodes, wired to their declaring doc via `contains`
 * edges. A node's true "code location" is therefore:
 *
 * 1. its OWN title, when the node itself is a path-titled element
 *    (`looksLikeCodePath(node.title)`), and
 * 2. the titles of its direct `contains` children that are also path-titled
 *    elements (a capability/domain reaches its code evidence one hop away).
 *
 * Deliberately reads the RAW `title` (not `display`) — `display` already
 * humanizes code paths into a readable name ("Topology World"), which is the
 * wrong string to show in a code-location row (the point of this row is the
 * literal path). Pure/deterministic — no DOM, no fetch; safe to call from
 * any read surface (topology datasheet, full-detail, docs frontmatter).
 */
export function deriveCodeLocations(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): string[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const paths: string[] = [];
  const seen = new Set<string>();

  const addIfCodePath = (title: string | undefined) => {
    if (!title) return;
    if (!looksLikeCodePath(title)) return;
    if (seen.has(title)) return;
    seen.add(title);
    paths.push(title);
  };

  addIfCodePath(nodeById.get(nodeId)?.title);

  const connections = buildConnections(nodeId, nodes, edges);
  const { contains } = groupConnectionsByRole(connections);
  for (const row of contains) {
    addIfCodePath(nodeById.get(row.id)?.title);
  }

  return paths;
}
