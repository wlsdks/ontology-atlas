/**
 * The four folder-scanning tools — `analyze_repo_structure`,
 * `inspect_architecture`, `infer_imports`, `index_project` — plus the scan-root
 * guard that keeps them inside the vault's own repository.
 */

export { analyzeRepoStructureTool } from './repo-analysis/analyze-structure.mjs';
export { indexProjectTool } from './repo-analysis/index-project.mjs';
export { inferImportsTool } from './repo-analysis/infer-imports.mjs';
export { inspectArchitectureTool } from './repo-analysis/inspect-architecture.mjs';
