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
  buildTopologyMeaningEditorNodeHref,
  buildTopologyMeaningEditorEdgeHref,
  buildTopologyMeaningCreateHref,
  buildOntologyInsightsNodeHref,
  buildOntologyInsightsReturnHref,
  buildOntologyNodeHref,
  edgeAuthoredByFromNode,
  meaningEditRelationForEdgeType,
  parseOntologyMeaningEditParam,
  ONTOLOGY_DEEPLINK_VIA_KEY,
  ONTOLOGY_DEEPLINK_REVIEW_KEY,
  ONTOLOGY_DEEPLINK_ASK_KEY,
  ONTOLOGY_MEANING_EDIT_KEY,
  parseInsightsReturnMarker,
  resolveOntologyBuilderNodeSlug,
  resolveOntologyBuilderNodeSlugFromGraphId,
} from "./lib/ontology-node-href";
export type { MeaningEditRelation } from "./lib/ontology-node-href";
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
  type OntologyChangeItem,
  type OntologyChangeOperation,
  type OntologyChangeSet,
  type OntologyRelationChange,
} from "./lib/ontology-change-set";
export {
  buildOntologyRelationEditPlan,
  buildOntologyRelationRemovalPlan,
  RELATION_EDGE_TYPE,
  RELATION_FRONTMATTER_KEY,
  type OntologyRelationEditPlan,
  type OntologyRelationFrontmatterUpdate,
} from "./lib/ontology-relation-edit";
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
