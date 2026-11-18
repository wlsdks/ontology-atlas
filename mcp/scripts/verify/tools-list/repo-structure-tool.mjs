import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';

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
    analyzeRootPathSchema.minLength !== 1 ||
    !/Repository root to analyze/i.test(analyzeRootPathSchema.description || '') ||
    !/Defaults to the MCP server cwd/i.test(analyzeRootPathSchema.description || '')
  ) {
    return 'analyze_repo_structure rootPath schema guidance drift';
  }
  if (analyzeTool.outputSchema?.type !== 'object') {
    return 'analyze_repo_structure outputSchema root drift';
  }
  if (!sameArray(analyzeTool.outputSchema?.required, ['rootPath'])) {
    return 'analyze_repo_structure outputSchema required drift';
  }
  const analysisFields = ['framework', 'domains', 'capabilities', 'elements', 'meaningGate',
    'extractionContract', 'semanticEvidence', 'configurationEvidence',
    'proposalValidation', 'suggestedRelations', 'skipped'];
  const analysisBranches = analyzeTool.outputSchema.oneOf;
  if (!Array.isArray(analysisBranches) || analysisBranches.length !== 3) {
    return 'analyze_repo_structure outputSchema delivery branches drift';
  }
  const branchMatches = (branch, required, forbidden) =>
    sameArray(Object.keys(branch ?? {}).sort(), ['not', 'required'])
    && sameArray(branch.required, required)
    && Array.isArray(branch.not?.anyOf)
    && branch.not.anyOf.length === forbidden.length
    && branch.not.anyOf.every((rule, index) => sameArray(Object.keys(rule), ['required'])
      && sameArray(rule.required, [forbidden[index]]));
  if (!branchMatches(analysisBranches[0], ['contract', 'size', 'units', 'entryPoints', 'docs', 'next'],
    ['delivery', 'canWrite', 'sourceEvidence', 'project', ...analysisFields])) {
    return 'analyze_repo_structure outputSchema breadth map branch drift';
  }
  if (!branchMatches(analysisBranches[1], ['delivery', 'canWrite', 'sourceEvidence'],
    ['project', ...analysisFields])) {
    return 'analyze_repo_structure outputSchema source-only branch drift';
  }
  if (!branchMatches(analysisBranches[2], analysisFields, ['delivery', 'canWrite'])) {
    return 'analyze_repo_structure outputSchema full branch drift';
  }
  if (propertyAt(analyzeTool, ['properties', 'sourceOnly'])?.type !== 'boolean'
    || outputPropertyAt(analyzeTool, ['properties', 'delivery'])?.type !== 'string'
    || outputPropertyAt(analyzeTool, ['properties', 'delivery'])?.const !== 'source_only'
    || outputPropertyAt(analyzeTool, ['properties', 'canWrite'])?.type !== 'boolean'
    || outputPropertyAt(analyzeTool, ['properties', 'canWrite'])?.const !== false
    || outputPropertyAt(analyzeTool, ['properties', 'sourceEvidence'])?.type !== 'object') {
    return 'analyze_repo_structure outputSchema source-only discriminator drift';
  }
  if (analyzeTool.outputSchema?.additionalProperties !== false) {
    return 'analyze_repo_structure outputSchema root openness drift';
  }
  if (outputPropertyAt(analyzeTool, ['properties', 'rootPath'])?.type !== 'string') {
    return 'analyze_repo_structure outputSchema rootPath drift';
  }
  if (!sameArray(outputPropertyAt(analyzeTool, ['properties', 'framework'])?.enum, ['fsd', 'next', 'generic'])) {
    return 'analyze_repo_structure outputSchema framework drift';
  }
  const projectSchema = outputPropertyAt(analyzeTool, ['properties', 'project']);
  if (
    projectSchema?.type !== 'object' ||
    !sameArray(projectSchema.required, ['slug', 'title']) ||
    projectSchema.properties?.slug?.type !== 'string' ||
    projectSchema.properties?.title?.type !== 'string' ||
    projectSchema.additionalProperties !== false
  ) {
    return 'analyze_repo_structure outputSchema project drift';
  }
  for (const propertyName of ['domains', 'capabilities', 'elements']) {
    const rowsSchema = outputPropertyAt(analyzeTool, ['properties', propertyName]);
    const expectedRequired = propertyName === 'elements'
      ? ['slug', 'title', 'path', 'evidence']
      : ['slug', 'title', 'evidence'];
    if (
      rowsSchema?.type !== 'array' ||
      rowsSchema.items?.type !== 'object' ||
      !sameArray(rowsSchema.items?.required, expectedRequired)
    ) {
      return `analyze_repo_structure outputSchema ${propertyName} rows drift`;
    }
    if (rowsSchema.items?.additionalProperties !== false) {
      return `analyze_repo_structure outputSchema ${propertyName} row openness drift`;
    }
    for (const rowPropertyName of ['slug', 'title']) {
      if (rowsSchema.items?.properties?.[rowPropertyName]?.type !== 'string') {
        return `analyze_repo_structure outputSchema ${propertyName} ${rowPropertyName} drift`;
      }
    }
    if (
      propertyName === 'elements' &&
      rowsSchema.items?.properties?.path?.type !== 'string'
    ) {
      return 'analyze_repo_structure outputSchema elements path drift';
    }
    if (
      rowsSchema.items?.properties?.evidence?.type !== 'object' ||
      !sameArray(rowsSchema.items?.properties?.evidence?.required, ['source']) ||
      rowsSchema.items?.properties?.evidence?.additionalProperties !== false
    ) {
      return `analyze_repo_structure outputSchema ${propertyName} evidence drift`;
    }
  }
  const suggestedRelationsSchema = outputPropertyAt(analyzeTool, ['properties', 'suggestedRelations']);
  if (
    suggestedRelationsSchema?.type !== 'array' ||
    suggestedRelationsSchema.items?.type !== 'object' ||
    !sameArray(suggestedRelationsSchema.items?.required, ['from', 'to', 'type'])
  ) {
    return 'analyze_repo_structure outputSchema suggestedRelations drift';
  }
  if (suggestedRelationsSchema.items?.additionalProperties !== false) {
    return 'analyze_repo_structure outputSchema suggestedRelations row openness drift';
  }
  const skippedSchema = outputPropertyAt(analyzeTool, ['properties', 'skipped']);
  if (
    skippedSchema?.type !== 'array' ||
    skippedSchema.items?.type !== 'object' ||
    !sameArray(skippedSchema.items?.required, ['path', 'reason'])
  ) {
    return 'analyze_repo_structure outputSchema skipped drift';
  }
  if (skippedSchema.items?.additionalProperties !== false) {
    return 'analyze_repo_structure outputSchema skipped row openness drift';
  }
  const rustConfigurationSchema = outputPropertyAt(
    analyzeTool,
    ['properties', 'configurationEvidence'],
  );
  if (
    rustConfigurationSchema?.type !== 'object' ||
    !sameArray(rustConfigurationSchema.properties?.contract?.enum, [
      'rustFeatureConfigurationEvidence:v1',
    ]) ||
    !sameArray(rustConfigurationSchema.properties?.writePolicy?.required, [
      'automaticRelation',
      'writeAllowed',
      'humanApprovalRequired',
    ]) ||
    !sameArray(
      rustConfigurationSchema.properties?.writePolicy?.properties?.automaticRelation?.enum,
      [false],
    ) ||
    !sameArray(
      rustConfigurationSchema.properties?.writePolicy?.properties?.writeAllowed?.enum,
      [false],
    ) ||
    !sameArray(
      rustConfigurationSchema.properties?.writePolicy?.properties?.humanApprovalRequired?.enum,
      [true],
    )
  ) {
    return 'analyze_repo_structure Rust configuration outputSchema safety drift';
  }
  return null;
}
