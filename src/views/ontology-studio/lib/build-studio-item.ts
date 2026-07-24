/**
 * Turn real ontology graph data (the SAME `KnowledgeGraphNode` / edge shapes
 * `useOntologyInsight` produces) into the Studio "item" view model — the
 * hexagon subject, its equipped relation gems, the enhancement sockets, and
 * the completeness score. Pure + deterministic so it can be unit-tested with a
 * fixed node/edge fixture and never disagrees with what the surface renders.
 *
 * Slice 1 is READ-ONLY: every count and neighbor label comes straight from the
 * derived graph. The `is_a` socket is always empty (the schema has no is_a axis
 * yet) — that is the surface's headline call to action, wired in Slice 2.
 */

import {
  buildConnections,
  groupConnectionsByRole,
  type ConnectionSourceEdge,
  type ConnectionSourceNode,
} from "@/shared/lib/ontology-tree";
import {
  deriveCodeLocations,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import {
  projectWithIsA,
  scoreEnhancement,
  type EnhancementInputs,
  type EnhancementScore,
} from "./enhancement-score";

/** Structural node shape — a subset of `KnowledgeGraphNode`. */
export interface StudioSourceNode extends ConnectionSourceNode {
  summary?: string;
}
export type StudioSourceEdge = ConnectionSourceEdge;

/** A relation category rendered as a socket row + orbiting gem(s). */
export type StudioGemKind = "isA" | "dependsOn" | "contains" | "relates";

export interface StudioGem {
  kind: StudioGemKind;
  /** Whether the socket is filled (has ≥1 relation) or an empty enhancement slot. */
  filled: boolean;
  /** Relation instances feeding this socket (neighbor display titles). */
  neighbors: string[];
  count: number;
}

export interface StudioStats {
  hasDefinition: boolean;
  evidenceCount: number;
  containsCount: number;
  dependsOnCount: number;
  usedByCount: number;
  relatesCount: number;
  hasIsA: boolean;
}

export interface StudioItem {
  node: {
    id: string;
    title: string;
    /** Short display title (`display ?? title`). */
    label: string;
    kind: string;
    /** Parent domain's display title, when the node belongs to one. */
    domainLabel: string | null;
  };
  stats: StudioStats;
  score: EnhancementScore;
  /** Projected score if the empty gold is_a socket were filled. */
  projectedScore: EnhancementScore;
  /** Ordered sockets: is_a first (the new axis), then filled relation sockets. */
  gems: StudioGem[];
  /** Orbiting gems around the hexagon — one per relation instance + one empty gold is_a orb. */
  orbits: Array<{ kind: StudioGemKind; filled: boolean }>;
}

const RELATES_TYPES = new Set(["related_to", "uses", "implements"]);
/** Cap orbiting gems so the ring around the hexagon stays legible. */
const MAX_ORBIT_GEMS = 8;

function hasText(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Pick a sensible default node to enhance when no `?node=` deeplink is given:
 * the most-connected `capability` (the kind the surface is designed around),
 * falling back to the most-connected non-container node, then the first node.
 * Deterministic — ties break on `id`.
 */
export function selectDefaultStudioNodeId(
  nodes: readonly StudioSourceNode[],
  edges: readonly StudioSourceEdge[],
): string | null {
  if (nodes.length === 0) return null;

  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }

  const rank = (candidates: readonly StudioSourceNode[]): string | null => {
    let best: StudioSourceNode | null = null;
    let bestDegree = -1;
    for (const node of candidates) {
      const d = degree.get(node.id) ?? 0;
      if (d > bestDegree || (d === bestDegree && best && node.id < best.id)) {
        best = node;
        bestDegree = d;
      }
    }
    return best?.id ?? null;
  };

  const capabilities = nodes.filter((n) => n.kind === "capability");
  const nonContainers = nodes.filter((n) => n.kind !== "project" && n.kind !== "domain");
  return rank(capabilities) ?? rank(nonContainers) ?? rank(nodes);
}

/**
 * Assemble the Studio item for `nodeId`. Returns `null` when the node is not in
 * the graph (deleted deeplink, empty vault).
 */
export function buildStudioItem(
  nodeId: string,
  nodes: readonly StudioSourceNode[],
  edges: readonly StudioSourceEdge[],
): StudioItem | null {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const connections = buildConnections(nodeId, nodes, edges);
  const roles = groupConnectionsByRole(connections);

  // Precise per-type buckets (the socket labels are typed facts, so we split by
  // relationType rather than the role grouping's direction-only dependsOn).
  const dependsOn = connections.filter(
    (c) => c.relationType === "depends_on" && c.direction === "outgoing",
  );
  const usedBy = connections.filter(
    (c) => c.relationType === "depends_on" && c.direction === "incoming",
  );
  const relates = dedupeById(connections.filter((c) => RELATES_TYPES.has(c.relationType)));
  const contains = roles.contains;

  const domainParent = roles.belongsTo.find((c) => c.kind === "domain") ?? null;

  const stats: StudioStats = {
    hasDefinition: hasText(node.summary),
    // deriveCodeLocations only reads id/title/kind (+ edges), so the structural
    // StudioSourceNode subset is safe — the missing KnowledgeGraphNode fields
    // (projectIds/evidenceIds/timestamps) are never touched. Cast keeps this
    // lib testable with minimal fixtures while reusing the rank-1 accessor.
    evidenceCount: deriveCodeLocations(
      nodeId,
      nodes as unknown as readonly KnowledgeGraphNode[],
      edges as unknown as readonly KnowledgeGraphEdge[],
    ).length,
    containsCount: contains.length,
    dependsOnCount: dependsOn.length,
    usedByCount: usedBy.length,
    relatesCount: relates.length,
    hasIsA: false, // Slice 1 — no is_a axis in schema yet.
  };

  const scoreInputs: EnhancementInputs = {
    hasDefinition: stats.hasDefinition,
    hasEvidence: stats.evidenceCount > 0,
    containsCount: stats.containsCount,
    dependsOnCount: stats.dependsOnCount,
    relatesCount: stats.relatesCount,
    hasIsA: stats.hasIsA,
  };

  const gems: StudioGem[] = [
    { kind: "isA", filled: false, neighbors: [], count: 0 },
    {
      kind: "dependsOn",
      filled: dependsOn.length > 0,
      neighbors: dependsOn.map((c) => c.title),
      count: dependsOn.length,
    },
    {
      kind: "contains",
      filled: contains.length > 0,
      neighbors: contains.map((c) => c.title),
      count: contains.length,
    },
    {
      kind: "relates",
      filled: relates.length > 0,
      neighbors: relates.map((c) => c.title),
      count: relates.length,
    },
  ];

  const orbits: StudioItem["orbits"] = [
    ...dependsOn.map(() => ({ kind: "dependsOn" as const, filled: true })),
    ...contains.map(() => ({ kind: "contains" as const, filled: true })),
    ...relates.map(() => ({ kind: "relates" as const, filled: true })),
  ];
  const capped = orbits.slice(0, MAX_ORBIT_GEMS - 1);
  // The empty gold is_a orb always rides the ring — the missing axis made visible.
  capped.push({ kind: "isA", filled: false });

  return {
    node: {
      id: node.id,
      title: node.title,
      label: node.display ?? node.title,
      kind: node.kind,
      domainLabel: domainParent ? domainParent.title : null,
    },
    stats,
    score: scoreEnhancement(scoreInputs),
    projectedScore: projectWithIsA(scoreInputs),
    gems,
    orbits: capped,
  };
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}
