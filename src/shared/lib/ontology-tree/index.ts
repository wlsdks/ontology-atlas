export type {
  OntologyTreeNode,
  OntologyTreeBuildResult,
  OntologyEgoNeighbor,
  OntologyEgoSubgraph,
} from "./types";
export { buildOntologyTree, countTreeNodes, flattenTree } from "./build-tree";
export { buildOntologyEgoSubgraph } from "./build-ego";
export {
  buildOntologyReachability,
  computeOntologyDependents,
  IMPACT_RELATION_TYPES,
} from "./reachability";
export type {
  BuildOntologyReachabilityOptions,
  OntologyReachability,
  OntologyReachabilityDirection,
  OntologyReachabilityLayer,
  OntologyReachabilitySummary,
} from "./reachability";
export { buildRadialEgoLayout } from "./ego-layout";
export {
  filterTreeByQuery,
  filterTreeByNodeIds,
  filterTreeExcludeKind,
  countMatchingTreeNodes,
  knowledgeNodeMatchesQuery,
} from "./filter-tree";
export {
  computeEdgeTypeDistribution,
  countCrossProjectEdges,
  isContainmentRelation,
} from "./relations";
export {
  computeDomainCouplingMatrix,
  computeKindDistribution,
  computeDegreeCentrality,
  rankAllByDegree,
  selectRecentNodes,
  buildContainmentParents,
  nearestDomainId,
} from "./insights";
export {
  buildConnections,
  groupConnectionsByDirection,
  groupConnectionsByRole,
} from "./connections";
export type {
  ConnectionSourceEdge,
  ConnectionSourceNode,
  DatasheetConnection,
  GroupedConnections,
  RoleGroupedConnections,
} from "./connections";
export type {
  AgentReadinessActionKey,
  AgentReadinessCliCommand,
  AgentReadinessStatus,
  AgentReadinessSummary,
  AgentReadinessToolCall,
} from "./agent-readiness";
export {
  buildAgentPostChangeSyncCliCommands,
  buildAgentReadinessCliCommands,
  buildAgentReadinessPrompt,
  buildAgentReadinessSummary,
  formatAgentPostChangeSyncPacket,
  formatAgentReadinessCliCommands,
  validateAgentReadinessToolCall,
} from "./agent-readiness";
export type {
  AgentInvestigationPlaybook,
  AgentInvestigationPlaybookId,
  AgentGraphDbQueryPackId,
  AgentGraphDbQueryPackItem,
  AgentBusinessQuestionFocus,
  AgentMcpQueryCall,
  AgentMcpToolCall,
  AgentPractitionerConcern,
  AgentPractitionerConcernId,
  AgentProjectEntrypoint,
  AgentQueryEntrypoint,
  AgentQueryRecipe,
  AgentQueryRecipeId,
  AgentTraversalStrategy,
  AgentTraversalStrategyId,
  AgentWriteGuardrail,
  AgentWriteGuardrailId,
} from "./agent-query-recipes";
export {
  AGENT_GRAPH_DB_CLI_SELF_CHECK_COMMAND,
  AGENT_PRACTITIONER_CONCERNS,
  AGENT_GRAPH_DB_RUNTIME_GATE_COMMAND,
  AGENT_GRAPH_DB_RUNTIME_GATE_CHECK_COUNT,
  buildAgentGraphDbQueryPack,
  buildAgentTraversalStrategies,
  buildAgentWriteGuardrails,
  buildAgentHandoffPrompt,
  buildAgentInvestigationPlaybooks,
  countAgentGraphDbCliPackCommands,
  formatAgentBusinessQuestionBrief,
  formatAgentBusinessQuestionHandoff,
  formatAgentGraphDbCliPack,
  formatAgentGraphDbQueryPack,
  formatAgentGraphDbQueryPackItemPrompt,
  formatAgentPractitionerConcernsChecklist,
  buildAgentQueryRecipes,
  formatAgentMcpQueryPayload,
  formatAgentMcpToolPayload,
  formatAgentGuardrailPrompt,
  formatAgentTraversalPacket,
  formatAgentPlaybookPrompt,
  formatAgentQueryCallCliCommand,
  formatAgentRecipeCliCommand,
  formatAgentRecipePayload,
  formatAgentRunOrderPrompt,
  formatAgentTraversalStrategyPrompt,
  selectAgentProjectEntrypoint,
  selectAgentQueryEntrypoints,
  validateAgentMcpQueryCall,
  validateAgentMcpToolCall,
} from "./agent-query-recipes";
export type { AgentBriefingPacket } from "./agent-briefing-packet";
export { buildAgentBriefingPacket } from "./agent-briefing-packet";
export type { OntologySnapshot, OntologyChangeset } from "./ontology-changeset";
export { snapshotOntology, computeOntologyChangeset, acknowledgeNodeChange } from "./ontology-changeset";
export {
  markChangeBaseline,
  clearChangeBaseline,
  restorePersistedBaseline,
  getChangeBaseline,
  setChangeBaselineScope,
  getChangeBaselineScope,
  useChangeBaseline,
  shouldAutoMarkBaseline,
} from "./change-baseline-store";
export type { MeaningfulOntologyKind, OntologyKindStats } from "./kind-stats";
export {
  MEANINGFUL_ONTOLOGY_KINDS,
  isMeaningfulOntologyKind,
  buildMeaningfulOntologyStats,
} from "./kind-stats";
export type { OntologyCountsForProject } from "./project-ontology-counts";
export {
  buildProjectOntologyCounts,
  pickDominantOntologyKind,
} from "./project-ontology-counts";
export type { AdaptiveRecentChangesResult, RecentChangeRow, RecentChangesResult } from "./recent-changes";
export {
  RECENT_CHANGES_ADAPTIVE_LADDER_DAYS,
  RECENT_CHANGES_DEFAULT_WINDOW_DAYS,
  computeAdaptiveRecentChanges,
  computeRecentChanges,
  daysAgoFromIso,
  isWithinRecentWindow,
  selectRecentVaultDocs,
} from "./recent-changes";
export type { DomainCensusRow } from "./domain-census";
export { computeDomainCensusRows, countConnectedDocuments, domainCensusById } from "./domain-census";
