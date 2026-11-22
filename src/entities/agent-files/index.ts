/**
 * The repository's agent-file inventory, shared by the docs sidebar and the Harness tab. Exports only
 * what other slices consume (`pnpm knip`).
 */
export {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  AGENT_FILE_RULES,
  AGENT_TOOL_LABELS,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentFileEntry,
  type AgentFilesAnalysis,
  type AgentFilesUiModel,
  type AgentTool,
} from './model/agent-files';
export { type ScopeDeclaration } from './model/scope-declarations';
export {
  isPairDrift,
  scanHarness,
  type HarnessReport,
  type HarnessScanPort,
  type HarnessScanProgress,
} from './model/repo-scan';
export { hookEventStep, type HookConfigFacts, type HookEventStep } from './model/hook-wiring';
export { guideCitation } from './model/guide-citations';
