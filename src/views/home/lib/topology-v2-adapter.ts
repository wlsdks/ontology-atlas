import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeDomainCensusRows,
  domainCensusById,
  isContainmentRelation,
} from "@/shared/lib/ontology-tree";
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
  /** Result of `deriveDustySlugs`; those nodes sink through the engine's existing stale channel. */
  dustySlugs?: ReadonlySet<string>;
}

export interface TopologyV2Graph {
  nodes: TopologyV2Node[];
  edges: TopologyV2Edge[];
}

/**
 * Adapts `ontologyInsight` (`KnowledgeGraphNode`/`Edge`) into the single
 * current `TopologyMapV2` contract. The historical Phase 0 document explains
 * why this boundary exists; current maintenance follows this source.
 *
 * `x`/`y` on the output nodes are unused by the engine — `topology-world.ts`
 * always recomputes a deterministic concentric layout from `contains` edges
 * (`computeConcentricLayout`), so `0` is passed and ignored on purpose.
 *
 * Current semantic boundaries:
 * - `isHub` marks exactly ONE node — the single highest fan-in (incoming
 *   count) node in the whole graph, ties broken by slug ascending for
 *   determinism. This is the v2 charter (`docs/prototypes/topology-
 *   b2plus.html`'s own fixture data marks exactly one node `hub: true`; the
 *   amber hub ring is a single-node highlight, not a "sufficiently
 *   connected" threshold band) — an earlier version of this adapter used
 *   `incoming >= PROMOTION_MIN_FAN_IN`, which marked every well-connected
 *   node as a hub and was fixed after an owner live-test flagged "amber on
 *   multiple nodes".
 * - `ownerKey` is always `null` — the current canvas has no typed ownership
 *   overlay. `topology-world.ts` does not carry this field, so owner color is
 *   neither guessed nor rendered.
 * - `size` reuses `buildOntologySkeleton`'s `subtreeWeightBySlug` (transitive
 *   contained-element count) as its visual magnitude signal rather than
 *   inventing another metric.
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
  // Single source for the engraved numeral on project/domain nodes.
  // `subtreeWeight` counts elements only, which made its number disagree with
  // the capability+element total INDEX and /projects show.
  const censusById = domainCensusById(computeDomainCensusRows(nodes, edges));

  const fullDegreeById = new Map<string, number>();
  const incomingById = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const edge of includedEdges) {
    bump(fullDegreeById, edge.from);
    bump(fullDegreeById, edge.to);
    bump(incomingById, edge.to);
  }

  // Single-hub charter: rank by fan-in desc, slug asc as the deterministic
  // tie-break, and mark only the top node — never a threshold band.
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

  const v2Nodes: TopologyV2Node[] = includedNodes.map((node) => ({
    id: node.id,
    // Canvas labels use the short display title: the full one, parenthetical
    // aside included, draws messy and gets truncated.
    label: node.display ?? node.title,
    kind: node.kind as RenderableKind,
    size: subtreeWeightBySlug.get(node.id) ?? 0,
    x: 0,
    y: 0,
    isHub: node.id === hubId,
    ownerKey: null,
    recentlyUpdated: options.changedSlugs?.has(node.id) ?? false,
    // Authorship carries the frontmatter value verbatim. Defaulting it here
    // would be the retroactive inference the 2026-07-31 ledger forbids.
    createdBy: node.createdBy,
    stale: options.dustySlugs?.has(node.id) ?? false,
    fullDegree: fullDegreeById.get(node.id) ?? 0,
    // Engraved-numeral source (project/domain only, drawn in circuit range) —
    // Capability + element total, from the same BFS census INDEX and /projects
    // use. `size` (visual magnitude) keeps the element weight.
    descendantCount: censusById.get(node.id)?.total ?? subtreeWeightBySlug.get(node.id) ?? 0,
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
      // Declaring document: derivation puts its slug in `evidenceIds[0]`.
      declaredBySlug: edge.evidenceIds[0] ?? null,
    };
  });

  return { nodes: v2Nodes, edges: v2Edges };
}
