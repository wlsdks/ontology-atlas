import type { VaultOntologyDerivation } from '@/entities/docs-vault';
import {
  buildConnections,
  computeCanonicalCensus,
  computeDomainCensusRows,
  domainCensusById,
  groupConnectionsByRole,
  isContainmentRelation,
  isMapConcept,
  type KnowledgeGraphEdge,
  type KnowledgeGraphNode,
} from '@/entities/knowledge-graph';
import type { OntologyMapEdge, OntologyMapNode } from '@/widgets/ontology-map';

type CanonicalCensus = ReturnType<typeof computeCanonicalCensus>;
type RoleGroupedConnections = ReturnType<typeof groupConnectionsByRole>;

const MAP_KINDS = ['project', 'domain', 'capability', 'element'] as const;
type MapKind = (typeof MAP_KINDS)[number];

/** A sample has no history: every date is the epoch, and nothing is marked recent or stale. */
const NO_DATE = new Date(0);
const SAMPLE_AUTHOR = 'sample';

export interface SampleConceptFacts {
  id: string;
  name: string;
  kind: MapKind;
  /** The concept's own opening paragraph; null when its document has none. */
  summary: string | null;
  connections: RoleGroupedConnections;
}

export interface SampleMapGraph {
  nodes: OntologyMapNode[];
  edges: OntologyMapEdge[];
  census: CanonicalCensus;
  conceptById: ReadonlyMap<string, SampleConceptFacts>;
}

function toKnowledgeNodes(derivation: VaultOntologyDerivation, locale: string): KnowledgeGraphNode[] {
  return derivation.nodes.map((stub) => ({
    id: stub.id,
    title: stub.title,
    display: stub.displayLocales?.[locale] || stub.display,
    displayLocales: stub.displayLocales,
    kind: stub.kind,
    projectIds: [],
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    hasOwnDocument: stub.hasOwnDocument,
    createdBy: stub.createdBy,
    summary: stub.summary,
    lastApprovedAt: NO_DATE,
    lastApprovedBy: SAMPLE_AUTHOR,
  }));
}

function toKnowledgeEdges(derivation: VaultOntologyDerivation): KnowledgeGraphEdge[] {
  return derivation.edges.map((stub) => ({
    id: stub.id,
    from: stub.from,
    to: stub.to,
    type: stub.type,
    label: stub.label,
    projectIds: [],
    evidenceIds: stub.sourceSlug ? [stub.sourceSlug] : [],
    lastApprovedAt: NO_DATE,
    lastApprovedBy: SAMPLE_AUTHOR,
  }));
}

/**
 * What the map and its panel read, from one sample's derivation. Its counts are the shared census,
 * so the heading's number and the drawn marks cannot disagree. The map lays itself out from the
 * `contains` edges and ignores coordinates, so they are zero.
 */
export function buildSampleMapGraph(derivation: VaultOntologyDerivation, locale: string): SampleMapGraph {
  const knowledgeNodes = toKnowledgeNodes(derivation, locale);
  const knowledgeEdges = toKnowledgeEdges(derivation);
  const concepts = knowledgeNodes.filter(isMapConcept);
  const conceptIds = new Set(concepts.map((node) => node.id));
  // A self-edge would draw as a zero-length line.
  const edges = knowledgeEdges.filter((edge) => edge.from !== edge.to && conceptIds.has(edge.from) && conceptIds.has(edge.to));

  const fullDegree = new Map<string, number>();
  const incoming = new Map<string, number>();
  for (const edge of edges) {
    fullDegree.set(edge.from, (fullDegree.get(edge.from) ?? 0) + 1);
    fullDegree.set(edge.to, (fullDegree.get(edge.to) ?? 0) + 1);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  /** Capability size drives its scale too, so every drawn kind joins the census. */
  const census = domainCensusById(computeDomainCensusRows(knowledgeNodes, knowledgeEdges, MAP_KINDS));
  const descendantCountOf = (id: string) => census.get(id)?.total ?? 0;

  let hubId: string | null = null;
  let hubIncoming = 0;
  for (const node of concepts) {
    const count = incoming.get(node.id) ?? 0;
    // An unreferenced concept never becomes the hub, or an isolated sample would get a baseless ring.
    if (count === 0) continue;
    if (count > hubIncoming || (count === hubIncoming && hubId !== null && node.id < hubId)) {
      hubId = node.id;
      hubIncoming = count;
    }
  }

  const conceptById = new Map<string, SampleConceptFacts>(
    concepts.map((node) => [
      node.id,
      {
        id: node.id,
        name: node.display ?? node.title,
        kind: node.kind as MapKind,
        summary: node.summary?.trim() || null,
        connections: groupConnectionsByRole(
          buildConnections(node.id, concepts, edges).filter((connection) => conceptIds.has(connection.id)),
        ),
      },
    ]),
  );

  return {
    nodes: concepts.map((node) => ({
      id: node.id,
      label: node.display ?? node.title,
      kind: node.kind as MapKind,
      size: descendantCountOf(node.id),
      x: 0,
      y: 0,
      isHub: node.id === hubId,
      ownerKey: null,
      recentlyUpdated: false,
      stale: false,
      fullDegree: fullDegree.get(node.id) ?? 0,
      descendantCount: descendantCountOf(node.id),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      relationType: edge.type,
      relationQuality: null,
      evidenceCount: edge.evidenceIds.length,
      kind: isContainmentRelation(edge.type) ? ('contains' as const) : ('depends' as const),
      declaredBySlug: edge.evidenceIds[0] ?? null,
    })),
    census: computeCanonicalCensus(knowledgeNodes, knowledgeEdges),
    conceptById,
  };
}
