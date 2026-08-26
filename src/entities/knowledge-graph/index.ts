export type {
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
  KnowledgeProjectInsight,
} from "./model";
export {
  useEdgeTypeLabel,
  useRelationVocabulary,
  buildEdgeTypeRows,
} from "./model";
export {
  buildInsightsReturnMarker,
  buildTopologyMeaningEditorNodeHref,
  buildTopologyMeaningEditorEdgeHref,
  buildTopologyMeaningCreateHref,
  buildOntologyInsightsReturnHref,
  BUSINESS_FLOW_ASK_VALUE,
  buildBusinessFlowHref,
  buildOntologyNodeHref,
  edgeAuthoredByFromNode,
  meaningEditRelationForEdgeType,
  parseOntologyMeaningEditParam,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_ASK_KEY,
  parseInsightsReturnMarker,
  resolveOntologyBuilderNodeSlug,
} from "./lib/ontology-node-href";
export type { MeaningEditRelation } from "./lib/ontology-node-href";
export {
  buildOntologyHealthActionTarget,
  buildOntologyHealthSignals,
  PROMOTION_MIN_FAN_IN,
  type OntologyHealthActionTarget,
} from "./lib/ontology-health-signals";
export {
  classifyRelationQuality,
  summarizeAgentReadiness,
} from "./lib/relation-quality";
export { translateOntologyDeeplinkToTopologyParam } from "./lib/translate-ontology-deeplink";
export {
  buildOntologyChangeSet,
  type OntologyChangeItem,
  type OntologyChangeSet,
} from "./lib/ontology-change-set";
export {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
  RELATION_EDGE_TYPE,
  type OntologyRelationEditPlan,
} from "./lib/ontology-relation-edit";
export { deriveCodeLocations } from "./lib/code-locations";
export { buildChatNodeIndex } from "./lib/chat-node-index";
export { isEvidenceOnlyConcept, resolveNodeDocument } from "./lib/node-document";
export {
  resolveNodeAgentTarget,
  stripVaultSlugPrefix,
} from "./lib/node-agent-target";
export {
  detectMeaningGaps,
  type ConceptDocFacts,
  type MeaningGapKind,
} from "./lib/meaning-gaps";
