import {
  resolveOntologyBuilderNodeSlug,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

export function resolveOntologyDeeplinkNode(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
): KnowledgeGraphNode | null {
  const normalized = nodeId.trim();
  if (!normalized) return null;

  return (
    nodes.find((node) => {
      if (node.id === normalized) return true;
      if (resolveOntologyBuilderNodeSlug(node) === normalized) return true;
      return node.evidenceIds.some(
        (evidenceId) => evidenceId.replace(/^ontology\//, "") === normalized,
      );
    }) ?? null
  );
}
