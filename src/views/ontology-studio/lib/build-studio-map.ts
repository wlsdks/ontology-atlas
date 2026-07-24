/**
 * Scope the real ontology graph down to ONE node's ego world and adapt it into
 * the `TopologyMapV2` contract, so the Studio ENHANCE arena embeds the app's
 * OWN map renderer (amber hexagon hub, comet-dot dashed edges, clean tiles)
 * instead of a hand-drawn hexagon skin. The map IS the central visual now.
 *
 * FSD note: `views/home/lib/topology-v2-adapter.ts` already does this for the
 * whole graph, but ESLint boundaries forbid `views → views` VALUE imports, so
 * this is a small studio-local sibling that reuses only allowed lower layers
 * (`entities/knowledge-graph`, `shared/lib/ontology-tree`, and the widget's
 * types). It stays deliberately compact — an ego subgraph is tiny, so the full
 * adapter's skeleton/census sizing is overkill here; node magnitude comes from
 * real full-graph degree instead.
 */

import {
  classifyRelationQuality,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { isContainmentRelation } from "@/shared/lib/ontology-tree";
import type { TopologyV2Edge, TopologyV2Node } from "@/widgets/topology-map-v2";

/** The `nodes`/`edges` pair `TopologyMapV2` consumes (widget exports the row
 *  types but not this container, so the studio holds its own alias). */
export interface StudioMapGraph {
  nodes: TopologyV2Node[];
  edges: TopologyV2Edge[];
}

const RENDERABLE_KINDS = new Set(["project", "domain", "capability", "element"]);

type RenderableKind = "project" | "domain" | "capability" | "element";

function isRenderableKind(kind: string): kind is RenderableKind {
  return RENDERABLE_KINDS.has(kind);
}

/**
 * Build the ego subgraph for `focalId` — the focal node + its DIRECT neighbors
 * + every edge among that set — as a `TopologyV2Graph`. Returns empty graph
 * when the focal node isn't renderable / present.
 *
 * The focal node is forced to be the single amber hub (`isHub`) regardless of
 * fan-in, so the app's hub ring lands on the node the user is enhancing — the
 * quality bar the owner pointed at. `size`/`descendantCount` come from the
 * FULL graph so a real hub still reads big inside its ego world.
 */
export function buildStudioMap(
  focalId: string,
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
): StudioMapGraph {
  const focal = nodes.find((n) => n.id === focalId);
  if (!focal || !isRenderableKind(focal.kind)) return { nodes: [], edges: [] };

  const nodeById = new Map(nodes.map((n) => [n.id, n] as const));

  // Full-graph degree + direct-contains counts (real magnitude signals).
  const fullDegree = new Map<string, number>();
  const containsChildren = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const edge of edges) {
    bump(fullDegree, edge.from);
    bump(fullDegree, edge.to);
    if (isContainmentRelation(edge.type)) bump(containsChildren, edge.from);
  }

  // Ego membership — focal + any node sharing an edge with it, renderable only.
  const included = new Set<string>([focalId]);
  for (const edge of edges) {
    if (edge.from === focalId && isRenderableKind(nodeById.get(edge.to)?.kind ?? "")) {
      included.add(edge.to);
    } else if (edge.to === focalId && isRenderableKind(nodeById.get(edge.from)?.kind ?? "")) {
      included.add(edge.from);
    }
  }

  const v2Nodes: TopologyV2Node[] = [];
  for (const id of included) {
    const node = nodeById.get(id);
    if (!node || !isRenderableKind(node.kind)) continue;
    v2Nodes.push({
      id: node.id,
      label: node.display ?? node.title,
      kind: node.kind,
      size: fullDegree.get(node.id) ?? 0,
      x: 0,
      y: 0,
      isHub: node.id === focalId,
      ownerKey: null,
      recentlyUpdated: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: containsChildren.get(node.id) ?? 0,
    });
  }

  const v2Edges: TopologyV2Edge[] = [];
  for (const edge of edges) {
    if (!included.has(edge.from) || !included.has(edge.to) || edge.from === edge.to) continue;
    const quality = classifyRelationQuality(edge);
    v2Edges.push({
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: quality === "strong" ? "strong" : quality === "weak" ? "weak" : null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? "contains" : "depends",
      declaredBySlug: edge.evidenceIds[0] ?? null,
    });
  }

  return { nodes: v2Nodes, edges: v2Edges };
}
