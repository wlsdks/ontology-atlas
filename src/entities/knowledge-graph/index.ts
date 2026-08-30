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
export { capabilitiesWithoutImplementationEvidence, computeVaultHealth } from "./lib/vault-health";
export type { VaultHealthResult } from "./lib/vault-health";
export {
  isContainmentRelation,
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  getChangeBaseline,
  markChangeBaseline,
  restorePersistedBaseline,
  setChangeBaselineScope,
  shouldAutoMarkBaseline,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  selectRecentVaultDocs,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  computeDomainCensusRows,
  domainCensusById,
  buildContainmentParents,
  nearestDomainId,
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
  isWithinRecentWindow,
  buildOntologyTree,
  computeOntologyChangeset,
  filterTreeExcludeKind,
  useChangeBaseline,
  computeKindDistribution,
  rankAllByDegree,
  computeDomainCouplingMatrix,
  buildReachabilityIndex,
  computeEdgeTypeDistribution,
  computeDegreeCentrality,
  countConnectedDocuments,
  buildMeaningfulOntologyStats,
  formatAgentPostChangeSyncPacket,
  MEANINGFUL_ONTOLOGY_KINDS,
  flattenTree,
  filterTreeByNodeIds,
  filterTreeByQuery,
} from "./lib/ontology-tree";
export type {
  OntologyTreeNode,
  AdaptiveRecentChangesResult,
  OntologyChangeset,
  MeaningfulOntologyKind,
  DomainCensusRow,
  OntologyTreeBuildResult,
} from "./lib/ontology-tree";
export { computeCanonicalCensus } from "./lib/ontology-tree/canonical-census";
export type { CanonicalCensus } from "./lib/ontology-tree/canonical-census";
export { buildConnections, groupConnectionsByRole, groupConnectionsByDirection } from "./lib/ontology-tree/connections";
export type { ConnectionSourceEdge, ConnectionSourceNode, DatasheetConnection } from "./lib/ontology-tree/connections";
export { isDirectionalRelation } from "./lib/ontology-tree/relations";
