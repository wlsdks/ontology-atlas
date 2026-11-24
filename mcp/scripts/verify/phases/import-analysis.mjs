import {
  analyzeRepoStructureFailure,
  importModuleEdgeKindOutputSummary,
  inferImportsFailure,
} from '../checks/import-analysis.mjs';
import { structuredContentFailure } from '../checks/structured-content.mjs';
import { formatCount, log } from '../output.mjs';

export function verifyImportAnalysis(responses) {
  const analyzeRepoStructureRes = responses.find((r) => r.id === 38);
  const inferImportsRes = responses.find((r) => r.id === 39);
  const inferImportsFocusRes = responses.find((r) => r.id === 70);
  if (!analyzeRepoStructureRes || !analyzeRepoStructureRes.result) {
    log('fail', 'no analyze_repo_structure response');
    return false;
  }
  try {
    // The breadth map travels as its text rows alone: one block, no structuredContent.
    const { content = [], structuredContent } = analyzeRepoStructureRes.result;
    if (structuredContent !== undefined || content.length !== 1) {
      log('fail', 'analyze_repo_structure breadth map must be one text block with no structuredContent');
      return false;
    }
    const failure = analyzeRepoStructureFailure(content[0]?.text);
    if (failure) {
      log('fail', failure);
      return false;
    }
    log('ok', `analyze_repo_structure: ${/: (\d+ product units, .*? files)/.exec(content[0].text)[1]}`);
  } catch (err) {
    log('fail', `failed to parse analyze_repo_structure response: ${err.message}`);
    return false;
  }

  if (!inferImportsRes || !inferImportsRes.result) {
    log('fail', 'no infer_imports response');
    return false;
  }
  try {
    const text = inferImportsRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const failure = inferImportsFailure(parsed);
    if (failure) {
      log('fail', failure);
      return false;
    }
    const structuredFailure = structuredContentFailure(inferImportsRes, parsed, 'infer_imports');
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log('ok', `infer_imports: ${formatCount(parsed.filesScanned, 'file')} scanned, ${formatCount(parsed.moduleEdges.length, 'module edge')} (${importModuleEdgeKindOutputSummary(parsed.moduleEdges)})`);
  } catch (err) {
    log('fail', `failed to parse infer_imports response: ${err.message}`);
    return false;
  }

  if (!inferImportsFocusRes || !inferImportsFocusRes.result) {
    log('fail', 'no infer_imports focus response');
    return false;
  }
  try {
    const text = inferImportsFocusRes.result.content?.[0]?.text || '';
    const parsed = JSON.parse(text);
    const focus = parsed.focusReview;
    if (
      parsed.contract !== 'inferImportsFocus:v1' ||
      focus?.contract !== 'importImpactFocus:v1' ||
      focus?.focusPath !== 'src/entities/knowledge-graph/model/knowledge-graph.ts' ||
      focus?.writeAllowed !== false ||
      !Array.isArray(focus?.edges) ||
      focus.edges.length > 25 ||
      focus?.summary?.selected !== focus?.cursor?.total ||
      focus?.summary?.returned !== focus.edges.length ||
      focus.edges.some((edge) => (
        edge.from !== focus.focusPath && edge.to !== focus.focusPath
      ))
    ) {
      log('fail', 'infer_imports focus response contract drift');
      return false;
    }
    const structuredFailure = structuredContentFailure(
      inferImportsFocusRes,
      parsed,
      'infer_imports focus',
    );
    if (structuredFailure) {
      log('fail', structuredFailure);
      return false;
    }
    log(
      'ok',
      `infer_imports focus: ${focus.focusPath} (${focus.summary.incoming} incoming, ${focus.summary.outgoing} outgoing, ${focus.summary.returned}/${focus.summary.selected} returned)`,
    );
  } catch (err) {
    log('fail', `failed to parse infer_imports focus response: ${err.message}`);
    return false;
  }
  return true;
}
