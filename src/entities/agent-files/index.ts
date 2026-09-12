/**
 * **Agent files — the repository's own guide inventory, read from disk.**
 *
 * Promoted out of `views/docs-vault/lib` on 2026-09-13 so the Harness tab can read the same model
 * the docs sidebar reads. FSD forbids a view importing another view, and the alternative was a
 * second inventory of the same files: the exact "two canonical stores for one concept" this
 * repository's `forbidden.md` rules out. The classifier itself is unchanged; only its address moved.
 *
 * `analyzeAgentFiles` stays the single web-side classifier, still held byte-for-byte against the
 * CLI twin (`cli/src/lib/agent-files.mjs`) by `tests/contract/agent-files.contract.test.ts`. What
 * this slice gained beside it is the part that classifier never carried: the document behind each
 * "tool X reads file Y" claim, the hook wiring a config declares, and a bridge-fed scan that can
 * reach the dot directories a browser cannot see.
 */
export {
  analyzeAgentFiles,
  buildAgentFilesUiModel,
  manifestIncludesRepoRoot,
  selectAgentFileDocs,
  AGENT_TOOL_LABELS,
  AGENT_FILE_RULES,
  WEB_SCAN_ANALYZE_OPTIONS,
  type AgentDriftFinding,
  type AgentFileEntry,
  type AgentFileRule,
  type AgentFilesAnalysis,
  type AgentFilesUiModel,
  type AgentTool,
  type AnalyzeAgentFilesInput,
} from './model/agent-files';
export {
  declaredPairFor,
  isGuideRecord,
  isPairDrift,
  scanHarness,
  type HarnessCheckCensus,
  type HarnessFileTime,
  type HarnessReport,
  type HarnessScanPort,
} from './model/repo-scan';
export {
  collectHookFacts,
  hookScriptPath,
  parseHookConfig,
  wiredHookCount,
  type HookConfigFacts,
  type HookFact,
  type HookScriptRef,
} from './model/hook-wiring';
export {
  guideCitation,
  CITATIONS_REVIEWED,
  UNCITED_TOOLS,
  type GuideCitation,
} from './model/guide-citations';
