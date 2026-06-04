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
      const projectSlugAlias =
        node.kind === "project" && node.id.startsWith("project:")
          ? node.id.slice("project:".length)
          : null;
      return (
        node.id === normalized ||
        node.id === withoutOntologyPrefix ||
        projectSlugAlias === normalized ||
        projectSlugAlias === withoutOntologyPrefix ||
        nodeBuilderSlug === normalized ||
        nodeBuilderSlug === withoutOntologyPrefix ||
        nodeBuilderSlug === builderSlug
      );
    }) ?? null
  );
}
