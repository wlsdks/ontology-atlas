export type {
  KnowledgeEdgeType,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeProjectInsight,
  ManualNodeKind,
} from "./model";
export {
  KNOWLEDGE_EDGE_TYPES,
  useEdgeTypeLabel,
  useRelationVocabulary,
  buildEdgeTypeRows,
} from "./model";
export type { EdgeTypeRow, RelationRegister } from "./model";
export {
  buildInsightsReturnMarker,
  buildOntologyStudioNodeHrefFromGraphId,
  buildOntologyStudioEdgeHref,
  buildOntologyInsightsNodeHref,
  buildOntologyInsightsReturnHref,
  buildOntologyNodeHref,
  edgeAuthoredByFromNode,
  studioEditRelationForEdgeType,
  parseOntologyStudioEditParam,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_STUDIO_EDIT_KEY,
  parseInsightsReturnMarker,
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
} from "./lib/ontology-node-href";
export type { StudioEditRelation } from "./lib/ontology-node-href";
export {
  buildOntologyHealthActionTarget,
  buildOntologyHealthSignals,
  PROMOTION_MIN_FAN_IN,
  type OntologyHealthActionTarget,
  type OntologyHealthSignalCandidate,
  type OntologyHealthSignals,
} from "./lib/ontology-health-signals";
export {
  classifyRelationQuality,
  summarizeAgentReadiness,
  type RelationQuality,
  type RelationQualityBreakdown,
} from "./lib/relation-quality";
export { translateOntologyDeeplinkToTopologyParam } from "./lib/translate-ontology-deeplink";
export { deriveCodeLocations } from "./lib/code-locations";
export { isEvidenceOnlyConcept, resolveNodeDocument } from "./lib/node-document";
export {
  resolveNodeAgentTarget,
  stripVaultSlugPrefix,
  type NodeAgentTarget,
} from "./lib/node-agent-target";
