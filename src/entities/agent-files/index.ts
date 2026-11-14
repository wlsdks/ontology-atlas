/**
 * The repository's agent-file inventory, shared by the docs sidebar and the Harness tab. Exports only
 * what other slices consume (`pnpm knip`); the classifier mirrors `cli/src/lib/agent-setup/agent-files.mjs`.
 */
export {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  AGENT_TOOL_LABELS,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentFileEntry,
  type AgentFilesAnalysis,
  type AgentFilesUiModel,
  type AgentTool,
} from './model/agent-files';
export {
  buildCoverageMatrix,
  type CoverageAreaInput,
  type CoverageCapability,
} from './model/coverage-matrix';
export { type ScopeDeclaration } from './model/coverage-scopes';
export {
  isPairDrift,
  scanHarness,
  type HarnessReport,
  type HarnessScanPort,
  type HarnessScanProgress,
} from './model/repo-scan';
export { citesPath } from './model/document-reach';
export { hookEventStep, type HookConfigFacts, type HookEventStep } from './model/hook-wiring';
export { guideCitation } from './model/guide-citations';
