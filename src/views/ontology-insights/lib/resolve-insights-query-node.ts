import {
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

export function resolveInsightsQueryNode(
  queryNodeId: string | null,
  nodes: KnowledgeGraphNode[],
): KnowledgeGraphNode | null {
  const normalized = queryNodeId?.trim().replace(/^\/+/, "");
  if (!normalized) return null;

  const withoutOntologyPrefix = normalized.replace(/^ontology\//, "");
  const builderSlug = resolveOntologyBuilderNodeSlugFromGraphId(withoutOntologyPrefix);

  return (
    nodes.find((node) => {
      const nodeBuilderSlug = resolveOntologyBuilderNodeSlug(node);
      return (
        node.id === normalized ||
        node.id === withoutOntologyPrefix ||
        nodeBuilderSlug === normalized ||
        nodeBuilderSlug === withoutOntologyPrefix ||
        nodeBuilderSlug === builderSlug
      );
    }) ?? null
  );
}
