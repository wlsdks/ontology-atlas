import {
  PROMOTION_MIN_FAN_IN,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import type { TopologyV2Edge, TopologyV2Node } from "@/widgets/topology-map-v2";
import { buildOntologySkeleton } from "./topology-ontology-skeleton";
import { classifyTopologyRelationQuality } from "./topology-analysis";

const RENDERABLE_KINDS = new Set(["project", "domain", "capability", "element"]);

type RenderableKind = "project" | "domain" | "capability" | "element";

function isRenderableKind(kind: string): kind is RenderableKind {
  return RENDERABLE_KINDS.has(kind);
}

export interface BuildTopologyV2GraphOptions {
  /** Slugs touched since the review baseline — feeds the `recentPulse` overlay. */
  changedSlugs?: ReadonlySet<string>;
}

export interface TopologyV2Graph {
  nodes: TopologyV2Node[];
  edges: TopologyV2Edge[];
}

/**
 * Adapts `ontologyInsight` (`KnowledgeGraphNode`/`Edge`, the same data the
 * map-canvas/Sigma engines already draw) into `TopologyMapV2`'s adapter
 * contract (`docs/TOPOLOGY-V2-PHASE0.md` §4.2). Written to close the P2→P3
 * mount gap: the scaffold commit (`87edec961`) wired `<TopologyMapV2
 * nodes={[]} edges={[]} />` as a deliberate placeholder, so the v2 canvas
 * mounted but never had anything to draw — this is the missing derivation.
 *
 * `x`/`y` on the output nodes are unused by the engine — `topology-world.ts`
 * always recomputes a deterministic concentric layout from `contains` edges
 * (`computeConcentricLayout`), so `0` is passed and ignored on purpose.
 *
 * Known simplifications (documented rather than silently guessed, matching
 * this codebase's own "알려진 단순화" convention):
 * - `isHub` reuses the same fan-in threshold (`PROMOTION_MIN_FAN_IN`) as the
 *   existing "core" significance level (`topology-node-significance.ts`) —
 *   there is no separate hub flag for domain/capability/element nodes today.
 * - `ownerKey` is always `null` — ontology nodes have no `owner:` frontmatter
 *   field (unlike `project.owner`, which feeds the old Sigma engine's
 *   owner-tint). `topology-world.ts`'s `WorldNode` doesn't even carry the
 *   field yet, so this is inert until a follow-up wires owner-tint for v2.
 * - `size` reuses `buildOntologySkeleton`'s `subtreeWeightBySlug` (transitive
 *   contained-element count) — the same magnitude signal the map-canvas
 *   engine already uses to size skeleton cards, kept consistent across
 *   engines rather than inventing a new metric.
 */
export function buildTopologyV2Graph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: BuildTopologyV2GraphOptions = {},
): TopologyV2Graph {
  const includedNodes = nodes.filter((node) => isRenderableKind(node.kind));
  const includedIds = new Set(includedNodes.map((node) => node.id));
  if (includedNodes.length === 0) return { nodes: [], edges: [] };

  const includedEdges = edges.filter(
    (edge) => includedIds.has(edge.from) && includedIds.has(edge.to) && edge.from !== edge.to,
  );

  const { subtreeWeightBySlug } = buildOntologySkeleton(nodes, edges);

  const fullDegreeById = new Map<string, number>();
  const incomingById = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const edge of includedEdges) {
    bump(fullDegreeById, edge.from);
    bump(fullDegreeById, edge.to);
    bump(incomingById, edge.to);
  }

  const v2Nodes: TopologyV2Node[] = includedNodes.map((node) => ({
    id: node.id,
    label: node.title,
    kind: node.kind as RenderableKind,
    size: subtreeWeightBySlug.get(node.id) ?? 0,
    x: 0,
    y: 0,
    isHub: (incomingById.get(node.id) ?? 0) >= PROMOTION_MIN_FAN_IN,
    ownerKey: null,
    recentlyUpdated: options.changedSlugs?.has(node.id) ?? false,
    fullDegree: fullDegreeById.get(node.id) ?? 0,
  }));

  const v2Edges: TopologyV2Edge[] = includedEdges.map((edge) => {
    const quality = classifyTopologyRelationQuality(edge);
    return {
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: quality === "strong" ? "strong" : quality === "weak" ? "weak" : null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? "contains" : "depends",
    };
  });

  return { nodes: v2Nodes, edges: v2Edges };
}
