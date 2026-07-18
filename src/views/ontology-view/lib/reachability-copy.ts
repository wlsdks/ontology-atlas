import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Resolves a graph node to its canonical vault-frontmatter slug for the
 * `activeSlug` highlight in `GraphWorkbenchSummary`. `null` for stub/
 * synthetic nodes with no matching `.md` doc — those can't be highlighted.
 *
 * R+ full-detail A1: this module used to ALSO build the rejected
 * `NodeDetailPanel`'s "agent" tab MCP/CLI copy strings
 * (`buildReachabilityMcpCall`/`buildAgentContextBundle`/etc.) — all deleted
 * along with that surface (`full-detail-a1` widget's handoff row replaces
 * them with a single suggested call chain, see
 * `full-detail-a1/lib/full-detail-handoff.ts`). This resolver is the one
 * piece still consumed at the page level (`OntologyViewPage.tsx`'s
 * `GraphWorkbenchSummary` `activeSlug` prop).
 */
const KIND_TO_CANONICAL_FOLDER: Record<string, string> = {
  domain: "domains",
  capability: "capabilities",
  element: "elements",
};

export function resolveReachabilityQuerySlug(node: KnowledgeGraphNode): string | null {
  const tail = node.id.split(":").slice(1).join(":").trim();
  if (!tail) return null;
  if (node.kind === "project") return tail;

  const folder = KIND_TO_CANONICAL_FOLDER[node.kind];
  if (!folder) return null;

  const expectedSlug = `${folder}/${tail}`;
  const sourceSlug = node.evidenceIds[0]?.replace(/^ontology\//, "");
  if (sourceSlug === expectedSlug) return expectedSlug;
  return null;
}
