import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../../model";

/** Counts per edge type in input order. */
export function computeEdgeTypeDistribution(
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of edges) {
    map.set(e.type, (map.get(e.type) ?? 0) + 1);
  }
  return map;
}

/** Disjoint `projectIds`; an empty side assumes the same project. */
function isCrossProjectEdgeProjects(
  fromProjects: ReadonlyArray<string> | undefined,
  toProjects: ReadonlyArray<string> | undefined,
): boolean {
  if (!fromProjects || !toProjects) return false;
  if (fromProjects.length === 0 || toProjects.length === 0) return false;
  const fromSet = new Set(fromProjects);
  for (const p of toProjects) {
    if (fromSet.has(p)) return false;
  }
  return true;
}

export function countCrossProjectEdges(
  edges: readonly KnowledgeGraphEdge[],
  nodes: readonly KnowledgeGraphNode[],
): number {
  const projectIdsById = new Map<string, ReadonlyArray<string>>();
  for (const n of nodes) projectIdsById.set(n.id, n.projectIds ?? []);
  let count = 0;
  for (const e of edges) {
    if (
      isCrossProjectEdgeProjects(
        projectIdsById.get(e.from),
        projectIdsById.get(e.to),
      )
    ) {
      count += 1;
    }
  }
  return count;
}

/** The domain hierarchy's edge types. */
const CONTAINMENT_RELATION_TYPES = new Set(["contains", "belongs_to"]);

/** The single containment test for coupling, projectIds BFS, edge kinds and filters. */
export function isContainmentRelation(type: string): boolean {
  return CONTAINMENT_RELATION_TYPES.has(type);
}

/** `related_to` from derivation and `relates` from MCP are both listed. */
const SYMMETRIC_RELATION_TYPES = new Set(["related_to", "relates"]);

/** Whether the map may draw a directional taper; unknown types stay directional. */
export function isDirectionalRelation(type: string): boolean {
  return !SYMMETRIC_RELATION_TYPES.has(type);
}
