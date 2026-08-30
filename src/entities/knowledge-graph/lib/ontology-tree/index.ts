export type {
  OntologyTreeNode,
  OntologyTreeBuildResult,
} from "./types";
export { buildOntologyTree, flattenTree } from "./build-tree";
export {
  buildOntologyReachability,
  buildReachabilityIndex,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
} from "./reachability";
export {
  filterTreeByQuery,
  filterTreeByNodeIds,
  filterTreeExcludeKind,
} from "./filter-tree";
export {
  computeEdgeTypeDistribution,
  isContainmentRelation,
} from "./relations";
export {
  computeDomainCouplingMatrix,
  computeKindDistribution,
  computeDegreeCentrality,
  rankAllByDegree,
  buildContainmentParents,
  nearestDomainId,
} from "./insights";
export { formatAgentPostChangeSyncPacket } from "./agent-readiness";
export {
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
} from "./agent-query-recipes";
export type { OntologyChangeset } from "./ontology-changeset";
export { computeOntologyChangeset } from "./ontology-changeset";
export {
  markChangeBaseline,
  restorePersistedBaseline,
  getChangeBaseline,
  setChangeBaselineScope,
  useChangeBaseline,
  shouldAutoMarkBaseline,
} from "./change-baseline-store";
export type { MeaningfulOntologyKind } from "./kind-stats";
export {
  MEANINGFUL_ONTOLOGY_KINDS,
  buildMeaningfulOntologyStats,
} from "./kind-stats";
export type { AdaptiveRecentChangesResult } from "./recent-changes";
export {
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  isWithinRecentWindow,
  selectRecentVaultDocs,
} from "./recent-changes";
export type { DomainCensusRow } from "./domain-census";
export { computeDomainCensusRows, countConnectedDocuments, domainCensusById } from "./domain-census";
