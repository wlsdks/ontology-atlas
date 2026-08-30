import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../../model";

/** Count per edge type, in input order so the UI can apply KNOWLEDGE_EDGE_TYPES ordering. */
export function computeEdgeTypeDistribution(
  edges: readonly KnowledgeGraphEdge[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of edges) {
    map.set(e.type, (map.get(e.type) ?? 0) + 1);
  }
  return map;
}

/**
 * Cross-project means the two nodes' `projectIds` are disjoint. An empty array on either
 * side returns false — with too little information, assume the same project rather than
 * claim a boundary that may not exist.
 */
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

/** How many edges cross a project boundary. Feeds the count on the insights card. */
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

/** Containment relation types — the domain hierarchy (project→domain→capability→element). */
const CONTAINMENT_RELATION_TYPES = new Set(["contains", "belongs_to"]);

/**
 * Is this edge type a containment edge (`contains` / `belongs_to`). Single source for every
 * place that must treat containment differently from dependency and soft relations —
 * coupling exclusion, projectIds BFS, topology edge kind, visual graph filters. The literal
 * `type === 'contains' || type === 'belongs_to'` used to be duplicated in four places, so a
 * new containment type would have been missed in some of them.
 */
export function isContainmentRelation(type: string): boolean {
  return CONTAINMENT_RELATION_TYPES.has(type);
}

/**
 * Symmetric relation types — both ends are peers, as in "related to".
 *
 * `derive-ontology-from-vault.ts` emits frontmatter `relates:` as `related_to`, while the
 * MCP and schema side keeps the key name `relates`. Both spellings are listed so either
 * ingress path gets the same verdict.
 */
const SYMMETRIC_RELATION_TYPES = new Set(["related_to", "relates"]);

/**
 * Does this relation **have a direction** — the single source for whether the map may draw
 * the directional taper (thick at the source, thin at the target).
 *
 * Why it is needed: the topology adapter classifies edges as
 * `isContainmentRelation ? "contains" : "depends"`, and the symmetric `related_to` fell into
 * that "depends" bucket, so the map **drew a direction that does not exist**. Measured on
 * the dogfood vault (2026-07-31): of 89 non-containment relations, **62 (70%) were
 * `related_to`** — most relation lines were asserting a false causality.
 *
 * The default is "directional": an unknown type keeps its previous rendering, so a newly
 * introduced relation type is never silently demoted to symmetric.
 */
export function isDirectionalRelation(type: string): boolean {
  return !SYMMETRIC_RELATION_TYPES.has(type);
}
