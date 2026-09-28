import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeDomainCensusRows,
  domainCensusById,
  isContainmentRelation,
} from "@/entities/knowledge-graph";
import type { OntologyMapEdge, OntologyMapNode } from "@/widgets/ontology-map";
import { computeSubtreeWeights } from "./subtree-weights";
import { classifyTopologyRelationQuality } from "./topology-analysis";

const RENDERABLE_KINDS = new Set(["project", "domain", "capability", "element"]);

type RenderableKind = "project" | "domain" | "capability" | "element";

function isRenderableKind(kind: string): kind is RenderableKind {
  return RENDERABLE_KINDS.has(kind);
}

export interface BuildOntologyMapGraphOptions {
  changedSlugs?: ReadonlySet<string>;
  /** Result of `deriveDustySlugs`; those nodes sink through the engine's stale channel. */
  dustySlugs?: ReadonlySet<string>;
}

export interface OntologyMapGraph {
  nodes: OntologyMapNode[];
  edges: OntologyMapEdge[];
}

/**
 * Adapts `ontologyInsight` nodes and edges into the `OntologyMap` contract. `x`/`y` are passed as 0
 * and ignored: `topology-world.ts` recomputes the layout from `contains` edges. `isHub` marks
 * exactly one node, the highest fan-in (slug ascending breaks ties), per the single amber ring
 * in `docs/prototypes/topology-b2plus.html`. `ownerKey` is always null (no ownership overlay),
 * and `size` reuses `subtreeWeightBySlug`.
 */
export function buildOntologyMapGraph(
  nodes: readonly KnowledgeGraphNode[],
  edges: readonly KnowledgeGraphEdge[],
  options: BuildOntologyMapGraphOptions = {},
): OntologyMapGraph {
  const includedNodes = nodes.filter((node) => isRenderableKind(node.kind));
  const includedIds = new Set(includedNodes.map((node) => node.id));
  if (includedNodes.length === 0) return { nodes: [], edges: [] };

  const includedEdges = edges.filter(
    (edge) => includedIds.has(edge.from) && includedIds.has(edge.to) && edge.from !== edge.to,
  );

  const subtreeWeightBySlug = computeSubtreeWeights(nodes, edges);
  // One numeral source for project/domain nodes: the capability+element census INDEX and /projects
  // show.
  const censusById = domainCensusById(computeDomainCensusRows(nodes, edges));

  const fullDegreeById = new Map<string, number>();
  const incomingById = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const edge of includedEdges) {
    bump(fullDegreeById, edge.from);
    bump(fullDegreeById, edge.to);
    bump(incomingById, edge.to);
  }

  let hubId: string | null = null;
  let hubIncoming = 0;
  for (const node of includedNodes) {
    const incoming = incomingById.get(node.id) ?? 0;
    if (incoming === 0) continue;
    if (
      hubId === null ||
      incoming > hubIncoming ||
      (incoming === hubIncoming && node.id < hubId)
    ) {
      hubId = node.id;
      hubIncoming = incoming;
    }
  }

  const v2Nodes: OntologyMapNode[] = includedNodes.map((node) => ({
    id: node.id,
    // The full title with its parenthetical aside draws messy and truncates.
    label: node.display ?? node.title,
    kind: node.kind as RenderableKind,
    size: subtreeWeightBySlug.get(node.id) ?? 0,
    x: 0,
    y: 0,
    isHub: node.id === hubId,
    ownerKey: null,
    recentlyUpdated: options.changedSlugs?.has(node.id) ?? false,
    // Verbatim frontmatter: defaulting authorship here would be a retroactive inference.
    createdBy: node.createdBy,
    stale: options.dustySlugs?.has(node.id) ?? false,
    fullDegree: fullDegreeById.get(node.id) ?? 0,
    // Engraved numeral (project/domain only); `size` keeps the element weight.
    descendantCount: censusById.get(node.id)?.total ?? subtreeWeightBySlug.get(node.id) ?? 0,
  }));

  const v2Edges: OntologyMapEdge[] = includedEdges.map((edge) => {
    const quality = classifyTopologyRelationQuality(edge);
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: quality === "strong" ? "strong" : quality === "weak" ? "weak" : null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? "contains" : "depends",
      // Derivation puts the declaring document's slug in `evidenceIds[0]`.
      declaredBySlug: edge.evidenceIds[0] ?? null,
    };
  });

  return { nodes: v2Nodes, edges: v2Edges };
}
