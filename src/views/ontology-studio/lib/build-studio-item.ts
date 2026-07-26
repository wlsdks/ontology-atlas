/**
 * Turn real ontology graph data (the SAME `KnowledgeGraphNode` / edge shapes
 * `useOntologyInsight` produces) into the Studio "나침 무대(compass stage)" view
 * model: one focal node at center, its typed neighbors grouped onto FOUR fixed
 * compass bearings, and which bearing to guide the user toward next.
 *
 * Pure + deterministic so it can be unit-tested with a fixed node/edge fixture
 * and never disagrees with what the compass renders.
 *
 * Bearing → relation → frontmatter key:
 *   UP    상위개념   is_a        → `broader`      (SKOS skos:broader)
 *   RIGHT 기대는 곳  depends_on  → `dependencies`
 *   DOWN  담는 것    contains    → `contains`
 *   LEFT  비슷한 것  related_to  → `relates`
 *
 * The relation TYPE names are invisible metadata — the socket asks a
 * plain-language question instead (see `messages/*.json` `ontologyStudio`).
 */

import {
  buildConnections,
  groupConnectionsByRole,
  type ConnectionSourceEdge,
  type ConnectionSourceNode,
} from "@/shared/lib/ontology-tree";
import { candidateFromNode } from "./build-create-node";
import { resolveStudioWriteTarget, type StudioWriteTarget } from "./resolve-write-target";

/** Structural node shape — a subset of `KnowledgeGraphNode`. */
export interface StudioSourceNode extends ConnectionSourceNode {
  summary?: string;
  /** 첫 근거 slug. 자기 문서일 수도, 자기를 인용한 남의 문서일 수도 있다. */
  evidenceIds?: string[];
  /**
   * 자기 `.md` 를 가졌는지. `evidenceIds[0]` 만으로는 자기 문서와 남의 문서를
   * 구분할 수 없어서, 쓰기 대상 판정은 반드시 이 필드를 함께 본다
   * (`resolveStudioWriteTarget`).
   */
  hasOwnDocument?: boolean;
}
export type StudioSourceEdge = ConnectionSourceEdge;

export type StudioBearing = "up" | "right" | "down" | "left";
/** Render order: up first (the hero is-a gap), then right, down, left. */
export const STUDIO_BEARINGS: readonly StudioBearing[] = ["up", "right", "down", "left"] as const;

/** A relation category — one per bearing. */
export type StudioRelation = "isA" | "dependsOn" | "contains" | "relates";

export const BEARING_RELATION: Record<StudioBearing, StudioRelation> = {
  up: "isA",
  right: "dependsOn",
  down: "contains",
  left: "relates",
};

/** Relation → the frontmatter array key the runtime derivation reads. */
export const BEARING_FRONTMATTER_KEY: Record<StudioRelation, string> = {
  isA: "broader",
  dependsOn: "dependencies",
  contains: "contains",
  relates: "relates",
};

export interface StudioSatellite {
  id: string;
  title: string;
  kind: string;
  /** Folder-prefixed ref the derivation resolves, e.g. `capabilities/mcp-server`. */
  ref: string;
}

export interface StudioBearingGroup {
  bearing: StudioBearing;
  relation: StudioRelation;
  frontmatterKey: string;
  neighbors: StudioSatellite[];
  filled: boolean;
  /** The single guided empty socket ("여기부터 채워요"). At most one bearing true. */
  recommended: boolean;
  /** DOWN when empty — expected-but-missing (amber). */
  expected: boolean;
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
    /** One-line definition / summary (frontmatter description → body excerpt). */
    definition: string;
    /**
     * 이 노드의 관계를 어디에 쓸 것인가. 자기 문서가 있으면 그 slug, 없으면
     * "아직 문서가 없다" 는 사실 그대로 — 남의 문서로 대체하지 않는다.
     */
    writeTarget: StudioWriteTarget;
  };
  bearings: Record<StudioBearing, StudioBearingGroup>;
  /** Ordered [up, right, down, left] for iteration. */
  order: StudioBearingGroup[];
  /** How many of the 4 bearings are filled. */
  filledBearings: number;
  totalBearings: 4;
}

const RELATES_TYPES = new Set(["related_to", "uses", "implements"]);

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

function toSatellite(conn: { id: string; title: string; kind: string }): StudioSatellite {
  const ref = candidateFromNode({ id: conn.id, kind: conn.kind, title: conn.title }).ref;
  return { id: conn.id, title: conn.title, kind: conn.kind, ref };
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

/**
 * Assemble the Studio compass item for `nodeId`. Returns `null` when the node
 * is not in the graph (deleted deeplink, empty vault).
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

  const isA = connections.filter(
    (c) => c.relationType === "is_a" && c.direction === "outgoing",
  );
  const dependsOn = connections.filter(
    (c) => c.relationType === "depends_on" && c.direction === "outgoing",
  );
  const relates = dedupeById(connections.filter((c) => RELATES_TYPES.has(c.relationType)));
  const contains = roles.contains;

  const domainParent = roles.belongsTo.find((c) => c.kind === "domain") ?? null;

  const bearingNeighbors: Record<StudioBearing, StudioSatellite[]> = {
    up: dedupeById(isA.map(toSatellite)),
    right: dedupeById(dependsOn.map(toSatellite)),
    down: dedupeById(contains.map(toSatellite)),
    left: dedupeById(relates.map(toSatellite)),
  };

  // The single guided empty socket: first empty bearing in [up, down, right, left]
  // priority — the is-a gap is the hero, then contains (expected), then the rest.
  const guidePriority: StudioBearing[] = ["up", "down", "right", "left"];
  const recommendedBearing =
    guidePriority.find((b) => bearingNeighbors[b].length === 0) ?? null;

  const makeGroup = (bearing: StudioBearing): StudioBearingGroup => {
    const relation = BEARING_RELATION[bearing];
    const neighbors = bearingNeighbors[bearing];
    const filled = neighbors.length > 0;
    return {
      bearing,
      relation,
      frontmatterKey: BEARING_FRONTMATTER_KEY[relation],
      neighbors,
      filled,
      recommended: !filled && bearing === recommendedBearing,
      expected: !filled && bearing === "down",
    };
  };

  const bearings: Record<StudioBearing, StudioBearingGroup> = {
    up: makeGroup("up"),
    right: makeGroup("right"),
    down: makeGroup("down"),
    left: makeGroup("left"),
  };
  const order = STUDIO_BEARINGS.map((b) => bearings[b]);
  const filledBearings = order.filter((g) => g.filled).length;

  return {
    node: {
      id: node.id,
      title: node.title,
      label: node.display ?? node.title,
      kind: node.kind,
      domainLabel: domainParent ? domainParent.title : null,
      definition: (node.summary ?? "").trim(),
      writeTarget: resolveStudioWriteTarget(node, {
        // 부모 도메인 id 는 `domain:<tail>` — 새 문서의 `domain:` 은 그 tail 이다.
        domainValue: domainParent ? domainParent.id.split(":").at(-1) ?? null : null,
      }),
    },
    bearings,
    order,
    filledBearings,
    totalBearings: 4,
  };
}
