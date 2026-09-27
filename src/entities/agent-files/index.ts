/**
 * The repository's agent-file inventory, shared by the docs sidebar and the Harness tab. Exports only
 * what other slices consume (`pnpm knip`); the classifier mirrors `cli/src/lib/agent-files.mjs`.
 */
export {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  AGENT_TOOL_LABELS,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentDriftFinding,
  type AgentFileEntry,
  type AgentFilesAnalysis,
  type AgentFilesUiModel,
  type AgentTool,
} from './model/agent-files';
export {
  buildCoverageMatrix,
  type CoverageAreaInput,
  type CoverageAreaRow,
  type CoverageCapability,
} from './model/coverage-matrix';
export { scopeReaches, type CoverageColumn, type ScopeDeclaration } from './model/coverage-scopes';
export {
  declaredPairFor,
  isGuideRecord,
  isPairDrift,
  scanHarness,
  type HarnessReport,
  type HarnessScanPort,
  type HarnessScanProgress,
} from './model/repo-scan';
export { citesPath, type DocumentReach } from './model/document-reach';
export { type HookConfigFacts } from './model/hook-wiring';
export { guideCitation, CITATIONS_REVIEWED } from './model/guide-citations';
