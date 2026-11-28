import { GRAPH_ARRAY_KEYS, NODE_UID_PATTERN } from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';

export function compileToolSchemaFailure(tools) {
  const compileTool = tools.find((tool) => tool?.name === 'compile_ontology');
  if (!compileTool) return 'tools/list response missing compile_ontology tool';
  if (
    !/deterministic graph artifact/i.test(compileTool.description || '') ||
    !/stable semantic graphHash and maxMtime/i.test(compileTool.description || '') ||
    !/Large vaults \(100\+ nodes\) can exceed the MCP token cap/i.test(compileTool.description || '') ||
    !/summary: true/i.test(compileTool.description || '') ||
    !/nodesLimit\/nodesOffset/i.test(compileTool.description || '') ||
    !/edgesLimit\/edgesOffset/i.test(compileTool.description || '')
  ) {
    return 'compile_ontology description missing large-vault guidance';
  }
  const compileSummarySchema = propertyAt(compileTool, ['properties', 'summary']);
  if (
    compileSummarySchema?.type !== 'boolean' ||
    !/counts/i.test(compileSummarySchema.description || '') ||
    !/Cheap polling for cache invalidation/i.test(compileSummarySchema.description || '')
  ) {
    return 'compile_ontology summary schema guidance drift';
  }
  const compileNodesLimitSchema = propertyAt(compileTool, ['properties', 'nodesLimit']);
  if (
    compileNodesLimitSchema?.type !== 'integer' ||
    compileNodesLimitSchema.minimum !== 1 ||
    compileNodesLimitSchema.maximum !== 500 ||
    !/`nodesOffset`/i.test(compileNodesLimitSchema.description || '')
  ) {
    return 'compile_ontology nodesLimit pagination guidance drift';
  }
  const compileRequired = [
    'version',
    'graphHash',
    'maxMtime',
    'nodeCount',
    'edgeCount',
    'resolvedEdgeCount',
    'externalEdgeCount',
    'unresolvedEdgeCount',
    'referencedOnlyCount',
    'aliasCount',
    'ambiguousAliasCount',
    'issueCount',
    'canonicalizationActionCount',
    'byKind',
    'byDomain',
  ];
  if (compileTool.outputSchema?.type !== 'object') {
    return 'compile_ontology outputSchema root drift';
  }
  if (!sameArray(compileTool.outputSchema?.required, compileRequired)) {
    return 'compile_ontology outputSchema required drift';
  }
  if (compileTool.outputSchema?.additionalProperties !== false) {
    return 'compile_ontology outputSchema root openness drift';
  }
  if (outputPropertyAt(compileTool, ['properties', 'version'])?.type !== 'integer' || outputPropertyAt(compileTool, ['properties', 'version'])?.minimum !== 1) {
    return 'compile_ontology outputSchema version drift';
  }
  if (outputPropertyAt(compileTool, ['properties', 'graphHash'])?.type !== 'string') {
    return 'compile_ontology outputSchema graphHash drift';
  }
  for (const propertyName of compileRequired.filter((name) => name.endsWith('Count'))) {
    const propertySchema = outputPropertyAt(compileTool, ['properties', propertyName]);
    if (propertySchema?.type !== 'integer' || propertySchema.minimum !== 0) {
      return `compile_ontology outputSchema ${propertyName} drift`;
    }
  }
  const maxMtimeSchema = outputPropertyAt(compileTool, ['properties', 'maxMtime']);
  if (maxMtimeSchema?.type !== 'number' || maxMtimeSchema.minimum !== 0) {
    return 'compile_ontology outputSchema maxMtime drift';
  }
  for (const propertyName of ['byKind', 'byDomain']) {
    const countMapSchema = outputPropertyAt(compileTool, ['properties', propertyName]);
    if (countMapSchema?.type !== 'object' || countMapSchema.additionalProperties?.type !== 'integer' || countMapSchema.additionalProperties?.minimum !== 0) {
      return `compile_ontology outputSchema ${propertyName} drift`;
    }
  }
  const compileNodeSchema = outputPropertyAt(compileTool, ['properties', 'nodes', 'items']);
  if (
    compileNodeSchema?.type !== 'object' ||
    !sameArray(compileNodeSchema.required, ['uid', 'slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree']) ||
    compileNodeSchema.properties?.uid?.pattern !== NODE_UID_PATTERN ||
    compileNodeSchema.properties?.merged_uids?.type !== 'array' ||
    compileNodeSchema.properties?.merged_uids?.items?.pattern !== NODE_UID_PATTERN ||
    compileNodeSchema.properties?.slug?.type !== 'string' ||
    compileNodeSchema.properties?.path?.type !== 'string' ||
    compileNodeSchema.properties?.outDegree?.type !== 'integer' ||
    compileNodeSchema.properties?.inDegree?.minimum !== 0 ||
    compileNodeSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema nodes drift';
  }
  const compileEdgeSchema = outputPropertyAt(compileTool, ['properties', 'edges', 'items']);
  if (
    compileEdgeSchema?.type !== 'object' ||
    !sameArray(compileEdgeSchema.required, ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external']) ||
    compileEdgeSchema.properties?.via?.type !== 'string' ||
    compileEdgeSchema.properties?.resolved?.type !== 'boolean' ||
    compileEdgeSchema.properties?.external?.type !== 'boolean' ||
    compileEdgeSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema edges drift';
  }
  for (const propertyName of ['nodesPagination', 'edgesPagination']) {
    const paginationSchema = outputPropertyAt(compileTool, ['properties', propertyName]);
    if (
      paginationSchema?.type !== 'object' ||
      !sameArray(paginationSchema.required, ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset']) ||
      paginationSchema.properties?.returned?.type !== 'integer' ||
      paginationSchema.properties?.hasMore?.type !== 'boolean' ||
      paginationSchema.additionalProperties !== false
    ) {
      return `compile_ontology outputSchema ${propertyName} drift`;
    }
  }
  const aliasSchema = outputPropertyAt(compileTool, ['properties', 'aliases', 'items']);
  if (
    aliasSchema?.type !== 'object' ||
    !sameArray(aliasSchema.required, ['alias', 'slug']) ||
    aliasSchema.properties?.alias?.type !== 'string' ||
    aliasSchema.properties?.slug?.type !== 'string' ||
    aliasSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema aliases drift';
  }
  const ambiguousAliasSchema = outputPropertyAt(compileTool, ['properties', 'ambiguousAliases', 'items']);
  if (
    ambiguousAliasSchema?.type !== 'object' ||
    !sameArray(ambiguousAliasSchema.required, ['alias', 'slugs']) ||
    ambiguousAliasSchema.properties?.alias?.type !== 'string' ||
    ambiguousAliasSchema.properties?.slugs?.items?.type !== 'string' ||
    ambiguousAliasSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema ambiguousAliases drift';
  }
  const compileIssueSchema = outputPropertyAt(compileTool, ['properties', 'issues', 'items']);
  if (
    compileIssueSchema?.type !== 'object' ||
    !sameArray(compileIssueSchema.required, ['code', 'severity', 'message']) ||
    !sameArray(compileIssueSchema.properties?.code?.enum, ['ambiguous-alias', 'dangling-graph-reference']) ||
    !sameArray(compileIssueSchema.properties?.severity?.enum, ['warning']) ||
    compileIssueSchema.properties?.message?.type !== 'string' ||
    compileIssueSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema issues drift';
  }
  const canonicalizationActionSchema = outputPropertyAt(compileTool, ['properties', 'canonicalizationActions', 'items']);
  const frontmatterProperties = canonicalizationActionSchema?.properties?.frontmatter?.properties ?? {};
  if (
    canonicalizationActionSchema?.type !== 'object' ||
    !sameArray(canonicalizationActionSchema.required, ['slug', 'keys', 'frontmatter', 'expected_mtime']) ||
    canonicalizationActionSchema.properties?.keys?.items?.type !== 'string' ||
    !sameArray(canonicalizationActionSchema.properties?.keys?.items?.enum, GRAPH_ARRAY_KEYS) ||
    canonicalizationActionSchema.properties?.frontmatter?.type !== 'object' ||
    canonicalizationActionSchema.properties?.frontmatter?.additionalProperties !== false ||
    !sameArray(Object.keys(frontmatterProperties).sort(), [...GRAPH_ARRAY_KEYS].sort()) ||
    GRAPH_ARRAY_KEYS.some((key) => frontmatterProperties[key]?.type !== 'array' || frontmatterProperties[key]?.items?.minLength !== 1) ||
    canonicalizationActionSchema.properties?.expected_mtime?.minimum !== 0 ||
    canonicalizationActionSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema canonicalizationActions drift';
  }
  const indexesSchema = outputPropertyAt(compileTool, ['properties', 'indexes']);
  if (indexesSchema?.type !== 'object' || indexesSchema.additionalProperties !== false) {
    return 'compile_ontology outputSchema indexes drift';
  }
  for (const propertyName of ['out', 'in', 'byKind', 'byDomain']) {
    const indexSchema = indexesSchema.properties?.[propertyName];
    if (
      indexSchema?.type !== 'object' ||
      indexSchema.additionalProperties?.type !== 'array' ||
      indexSchema.additionalProperties?.items?.type !== 'string'
    ) {
      return `compile_ontology outputSchema indexes.${propertyName} drift`;
    }
  }
  const edgeByIdSchema = indexesSchema.properties?.edgeById?.additionalProperties;
  if (
    indexesSchema.properties?.edgeById?.type !== 'object' ||
    edgeByIdSchema?.type !== 'object' ||
    !sameArray(edgeByIdSchema.required, ['id', 'from', 'to', 'via', 'ref', 'resolved', 'external']) ||
    edgeByIdSchema.properties?.resolved?.type !== 'boolean' ||
    edgeByIdSchema.properties?.external?.type !== 'boolean' ||
    edgeByIdSchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema indexes.edgeById drift';
  }
  const aliasToSlugSchema = indexesSchema.properties?.aliasToSlug;
  if (
    aliasToSlugSchema?.type !== 'object' ||
    aliasToSlugSchema.additionalProperties?.type !== 'string'
  ) {
    return 'compile_ontology outputSchema indexes.aliasToSlug drift';
  }
  for (const propertyName of ['uidToSlug', 'mergedUidToSlug']) {
    const identityIndexSchema = indexesSchema.properties?.[propertyName];
    if (
      identityIndexSchema?.type !== 'object' ||
      identityIndexSchema.additionalProperties?.type !== 'string'
    ) {
      return `compile_ontology outputSchema indexes.${propertyName} drift`;
    }
  }
  const slugToUidSchema = indexesSchema.properties?.slugToUid;
  if (
    slugToUidSchema?.type !== 'object' ||
    slugToUidSchema.additionalProperties?.type !== 'string' ||
    slugToUidSchema.additionalProperties?.pattern !== NODE_UID_PATTERN
  ) {
    return 'compile_ontology outputSchema indexes.slugToUid drift';
  }
  const compileOutputSummarySchema = outputPropertyAt(compileTool, ['properties', 'summary']);
  if (
    compileOutputSummarySchema?.type !== 'object' ||
    !sameArray(compileOutputSummarySchema.required, ['nodes', 'edges', 'graphHash', 'maxMtime', 'resolvedEdges', 'externalEdges', 'unresolvedEdges', 'aliases', 'ambiguousAliases', 'issues']) ||
    compileOutputSummarySchema.properties?.nodes?.type !== 'integer' ||
    compileOutputSummarySchema.properties?.graphHash?.type !== 'string' ||
    compileOutputSummarySchema.properties?.issues?.minimum !== 0 ||
    compileOutputSummarySchema.additionalProperties !== false
  ) {
    return 'compile_ontology outputSchema summary drift';
  }
  return null;
}
