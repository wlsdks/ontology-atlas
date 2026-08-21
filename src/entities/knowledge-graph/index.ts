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
  ONTOLOGY_DEEPLINK_ASK_KEY,
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
export {
  buildOntologyChangeSet,
  type OntologyChangeField,
  type OntologyChangeOperation,
  type OntologyChangeSet,
  type OntologyRelationChange,
} from "./lib/ontology-change-set";
export { deriveCodeLocations } from "./lib/code-locations";
export { buildChatNodeIndex } from "./lib/chat-node-index";
export { isEvidenceOnlyConcept, resolveNodeDocument } from "./lib/node-document";
export {
  resolveNodeAgentTarget,
  stripVaultSlugPrefix,
  type NodeAgentTarget,
} from "./lib/node-agent-target";
export {
  DOMAIN_REQUIRED_KINDS,
  detectMeaningGaps,
  type ConceptDocFacts,
  type MeaningGapKind,
} from "./lib/meaning-gaps";
