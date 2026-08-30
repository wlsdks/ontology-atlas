import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * One concept's **immediate neighbours** (depth 1) and the typed facts it holds.
 *
 * Why the history screen draws this: the answer to "what did this step change"
 * has to be concepts rather than a commit title, and once you are looking at a
 * concept its properties and neighbours must be right there, so you never have
 * to leave for the map (owner instruction, 2026-08-02).
 *
 * ⚠️ **A missing field gets no slot.** A `status:` cell existed in the mockup
 * and was removed — **0** of the vault's 70 nodes used that key, and a cell
 * nobody fills is misinformation, not a specification. `created_by`/`path` are
 * left out for the same reason: `KnowledgeGraphNode` does not carry them, so
 * drawing them here would leave a permanently empty cell. Only facts the
 * derivation guarantees are carried.
 */
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

export interface ConceptEgo {
  id: string;
  label: string;
  kind: string;
  /** Display name of the owning domain — `null` on domain and project nodes. */
  domainLabel: string | null;
  /** This concept's evidence document (a slug inside the vault). The derivation always guarantees one. */
  docSlug: string | null;
  /** The human-written one-line summary — the **first fact a person reads** on this card. */
  summary: string | null;
  /**
   * The reference used to point an agent at this concept — MCP/CLI take it
   * verbatim. This product has two users, human and agent, so carrying only the
   * name a person reads shows half of it.
   */
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
 * Edge type → bearing. **Direction is half of the relation.**
 *
 * An incoming `contains` means **"what contains me"**, not "what I contain".
 * Filing both into one cell in the mockup wiring made a domain node's ↑17 and
 * ↓16 nearly the same set (measured).
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
 * Build one node's ego. `null` when `nodeId` is absent from the graph — markdown
 * never registered as a concept, such as the root `README.md`. The screen then
 * draws "not registered as a concept yet" instead of the drawing.
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
 * Map a commit-touched file's `slug` onto a graph node id.
 *
 * Rust ships the frontmatter `kind`/`slug` (#842) while the derivation builds
 * node ids as `<kind>:<slug tail>`. The two grammars differ, so **the strings
 * never match outright** — match on the tail plus the kind instead. No matching
 * node means `null`: that file is plain markdown, not a vault concept.
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
