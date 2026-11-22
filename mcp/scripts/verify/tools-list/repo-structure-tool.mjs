import { propertyAt } from './schema-primitives.mjs';

export function repoStructureToolSchemaFailure(tools) {
  const analyzeTool = tools.find((tool) => tool?.name === 'analyze_repo_structure');
  if (!analyzeTool) return 'tools/list response missing analyze_repo_structure tool';
  if (
    !/Read-only; nothing is written/i.test(analyzeTool.description || '') ||
    !/breadth map/i.test(analyzeTool.description || '') ||
    !/names no node/i.test(analyzeTool.description || '') ||
    !/never an instruction or approval/i.test(analyzeTool.description || '') ||
    !/constructionQualification:v1/i.test(analyzeTool.description || '')
  ) {
    return 'analyze_repo_structure description missing bootstrap safety guidance';
  }
  const analyzeRootPathSchema = propertyAt(analyzeTool, ['properties', 'rootPath']);
  if (
    analyzeRootPathSchema?.type !== 'string' ||
    (analyzeRootPathSchema.minLength ?? 1) !== 1 ||
    !/Repository root to analyze/i.test(analyzeRootPathSchema.description || '') ||
    !/Defaults to the MCP server cwd/i.test(analyzeRootPathSchema.description || '')
  ) {
    return 'analyze_repo_structure rootPath schema guidance drift';
  }
  // The breadth map and source reads travel as text rows alone, so no output
  // schema describes them (`mcp/src/server/rpc.mjs`).
  if (analyzeTool.outputSchema !== undefined) {
    return 'analyze_repo_structure declares an outputSchema; its breadth map and source reads are text alone';
  }
  if (propertyAt(analyzeTool, ['properties', 'sourceOnly'])?.type !== 'boolean') {
    return 'analyze_repo_structure sourceOnly input drift';
  }
  return null;
}
