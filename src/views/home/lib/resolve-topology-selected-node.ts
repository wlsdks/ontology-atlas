import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { isOntologyNodeId } from "@/shared/lib/ontology-node-id";

export function resolveTopologySelectedOntologyNode(
  selectedSlug: string | null,
  nodes: readonly KnowledgeGraphNode[] | null | undefined,
): KnowledgeGraphNode | null {
  if (!selectedSlug || !nodes) return null;

  const normalizedSlug = selectedSlug.replace(/^ontology\//, "");
  const ontologyPrefixedSlug = `ontology/${normalizedSlug}`;

  return (
    nodes.find((node) => {
      if (node.id === selectedSlug) return true;
      if (node.id === normalizedSlug) return true;
      if (node.evidenceIds.includes(selectedSlug)) return true;
      if (node.evidenceIds.includes(normalizedSlug)) return true;
      if (node.evidenceIds.includes(ontologyPrefixedSlug)) return true;
      return false;
    }) ??
    (isOntologyNodeId(selectedSlug)
      ? null
      : nodes.find((node) => node.id.endsWith(`:${normalizedSlug}`)) ?? null)
  );
}
