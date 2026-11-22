export type {
  OntologyTreeNode,
  OntologyTreeBuildResult,
} from "./ontology-tree-node";
export { buildOntologyTree, flattenTree } from "./build-tree";
export {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
} from "./reachability";
export {
  filterTreeByQuery,
  countMatchingTreeNodes,
  filterTreeByNodeIds,
  filterTreeExcludeKind,
} from "./filter-tree";
export { isContainmentRelation } from "./relations";
export {
  computeDegreeCentrality,
  buildContainmentParents,
  nearestDomainId,
} from "./graph-structure";
export { formatAgentPostChangeSyncPacket } from "./agent-readiness";
export {
  DOGFOOD_MCP_WALK_COMMAND,
  DOGFOOD_MCP_WALK_CHECK_COUNT,
} from "./agent-readiness";
export type { OntologyChangeset } from "./changes/ontology-changeset";
export { computeOntologyChangeset, prepareGraphSignatures } from "./changes/ontology-changeset";
export {
  markChangeBaseline,
  restorePersistedBaseline,
  getChangeBaseline,
  setChangeBaselineScope,
  useChangeBaseline,
  shouldAutoMarkBaseline,
} from "./changes/change-baseline-store";
export type { MeaningfulOntologyKind } from "./census/kind-stats";
export {
  MEANINGFUL_ONTOLOGY_KINDS,
} from "./census/kind-stats";
export type { AdaptiveRecentChangesResult } from "./changes/recent-changes";
export {
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  isGraphDrawnKind,
  isWithinRecentWindow,
  selectRecentVaultDocs,
} from "./changes/recent-changes";
export type { DomainCensusRow } from "./census/domain-census";
export { computeDomainCensusRows, domainCensusById } from "./census/domain-census";
