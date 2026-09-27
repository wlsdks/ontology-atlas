import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

export type EgoBearing = "belongsTo" | "contains" | "dependsOn" | "usedBy";

/** Fixed order of the four bearings, so positions never shift between concepts. */
export const EGO_BEARINGS: readonly EgoBearing[] = [
  "belongsTo",
  "contains",
  "dependsOn",
  "usedBy",
] as const;

interface EgoNeighbor {
  id: string;
  label: string;
  kind: string;
}

/**
 * One concept's immediate neighbours (depth 1) and the typed facts it holds.
 * Only facts the derivation guarantees are carried; a field it lacks would be a
 * permanently empty cell.
 */
export interface ConceptEgo {
  id: string;
  label: string;
  kind: string;
  /** Display name of the owning domain — `null` on domain and project nodes. */
  domainLabel: string | null;
  /** This concept's evidence document (a slug inside the vault). The derivation always guarantees one. */
  docSlug: string | null;
  /** The human-written one-line summary, the first fact read on the card. */
  summary: string | null;
  /** The reference MCP and CLI take verbatim to point an agent at this concept. */
  agentSlug: string | null;
  /** Names of the projects it belongs to — where a multi-project vault splits. */
  projectLabels: readonly string[];
  neighbors: Readonly<Record<EgoBearing, readonly EgoNeighbor[]>>;
  /** Neighbours across all four bearings. At 0 the drawing is skipped. */
  total: number;
}

function emptyNeighbors(): Record<EgoBearing, EgoNeighbor[]> {
  return { belongsTo: [], contains: [], dependsOn: [], usedBy: [] };
}

/**
 * Edge type → bearing. Direction is half of the relation: an incoming `contains`
 * means "what contains me", not "what I contain".
 */
function outgoingBearing(type: KnowledgeGraphEdge["type"]): EgoBearing {
  if (type === "is_a") return "belongsTo";
  if (type === "contains") return "contains";
  return "dependsOn";
}

function incomingBearing(type: KnowledgeGraphEdge["type"]): EgoBearing {
  if (type === "contains" || type === "is_a") return "belongsTo";
  return "usedBy";
}

/**
 * One node's ego in O(nodes + edges) with a Map by id and a Set of seen neighbours; null
 * when `nodeId` is not a concept, such as the root `README.md`.
 */
export function buildConceptEgo(
  nodeId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): ConceptEgo | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = byId.get(nodeId);
  if (!self) return null;

  const seen = new Set<string>();
  const neighbors = emptyNeighbors();
  const push = (bearing: EgoBearing, otherId: string) => {
    if (otherId === nodeId) return;
    const key = `${bearing}:${otherId}`;
    if (seen.has(key)) return;
    const other = byId.get(otherId);
    if (!other) return;
    seen.add(key);
    neighbors[bearing].push({
      id: other.id,
      label: other.display || other.title,
      kind: other.kind,
    });
  };

  for (const edge of edges) {
    if (edge.from === nodeId) push(outgoingBearing(edge.type), edge.to);
    else if (edge.to === nodeId) push(incomingBearing(edge.type), edge.from);
  }

  const total = EGO_BEARINGS.reduce((sum, b) => sum + neighbors[b].length, 0);

  return {
    id: self.id,
    label: self.display || self.title,
    kind: self.kind,
    domainLabel: neighbors.belongsTo.find((n) => n.kind === "domain")?.label ?? null,
    docSlug: self.evidenceIds[0] ?? null,
    summary: self.summary?.trim() || null,
    agentSlug: self.agentSlug ?? self.evidenceIds[0] ?? null,
    projectLabels: self.projectIds
      .map((id) => byId.get(id))
      .map((n) => (n ? n.display || n.title : null))
      .filter((v): v is string => Boolean(v)),
    neighbors,
    total,
  };
}

/**
 * Map a commit-touched file's frontmatter `slug` onto a graph node id, a linear scan.
 * Node ids are `<kind>:<slug tail>`, so the slug never matches outright; the tail plus
 * the kind does. `null` means plain markdown, not a vault concept.
 */
export function matchNodeId(
  file: { slug: string; kind: string | null },
  nodes: readonly KnowledgeGraphNode[],
): string | null {
  const tail = file.slug.split("/").pop() ?? file.slug;
  const exact = nodes.find(
    (n) => n.kind === file.kind && (n.evidenceIds[0] === file.slug || n.id.endsWith(`:${tail}`)),
  );
  if (exact) return exact.id;
  const byEvidence = nodes.find((n) => n.evidenceIds[0] === file.slug);
  return byEvidence?.id ?? null;
}
