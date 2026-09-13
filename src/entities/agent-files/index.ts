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
 *
 * This barrel lists only what another slice consumes. The hook parser, the rule table and the
 * uncited-tool list are used inside this slice and by its own tests, which import them directly;
 * re-exporting them here would be a public surface with no reader (`pnpm knip`).
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
export { type CoverageColumn, type ScopeDeclaration } from './model/coverage-scopes';
export {
  declaredPairFor,
  isGuideRecord,
  isPairDrift,
  scanHarness,
  type HarnessReport,
  type HarnessScanPort,
} from './model/repo-scan';
export { citesPath, type DocumentReach } from './model/document-reach';
export { type HookConfigFacts } from './model/hook-wiring';
export { guideCitation, CITATIONS_REVIEWED } from './model/guide-citations';
