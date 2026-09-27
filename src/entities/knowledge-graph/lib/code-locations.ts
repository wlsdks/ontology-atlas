import { looksLikeCodePath } from "@/shared/lib/humanize-code-path-title";
import { buildConnections, groupConnectionsByRole } from "./ontology-tree/connections";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../model/types";

/**
 * Code paths for a node: its own raw title when path-like, plus path-titled `contains` children.
 * `evidenceIds` is only the source doc, and `display` humanizes paths, so neither is used.
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
