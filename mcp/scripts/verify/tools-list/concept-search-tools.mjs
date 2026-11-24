import { isDeepStrictEqual } from 'node:util';
import { NODE_UID_PATTERN } from '../../../src/schema.mjs';

import { sameArray } from '../value-checks.mjs';
import { backlinkRowsSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

export function conceptSearchToolsSchemaFailure(tools) {
  const findEvidenceTool = tools.find((tool) => tool?.name === 'find_evidence');
  if (!findEvidenceTool) return 'tools/list response missing find_evidence tool';
  if (
    !/Find vault docs that mention a given concept by title/i.test(findEvidenceTool.description || '') ||
    !/Each match includes a prose `?excerpt`?/i.test(findEvidenceTool.description || '') ||
    !/without an extra get_concepts call/i.test(findEvidenceTool.description || '')
  ) {
    return 'find_evidence description missing excerpt guidance';
  }
  const findEvidenceTitleSchema = propertyAt(findEvidenceTool, ['properties', 'title']);
  if (
    findEvidenceTitleSchema?.type !== 'string' ||
    (findEvidenceTitleSchema.minLength ?? 1) !== 1 ||
    !/case-insensitive substring match/i.test(findEvidenceTitleSchema.description || '')
  ) {
    return 'find_evidence inputSchema title guidance drift';
  }
  if (findEvidenceTool.outputSchema?.type !== 'object') {
    return 'find_evidence outputSchema root drift';
  }
  if (!sameArray(findEvidenceTool.outputSchema?.required, ['query', 'matches'])) {
    return 'find_evidence outputSchema required drift';
  }
  if (findEvidenceTool.outputSchema?.additionalProperties !== false) {
    return 'find_evidence outputSchema root openness drift';
  }
  if (outputPropertyAt(findEvidenceTool, ['properties', 'query'])?.type !== 'string') {
    return 'find_evidence outputSchema query drift';
  }
  const evidenceMatchesSchema = outputPropertyAt(findEvidenceTool, ['properties', 'matches']);
  if (
    evidenceMatchesSchema?.type !== 'array' ||
    evidenceMatchesSchema.items?.type !== 'object' ||
    !sameArray(evidenceMatchesSchema.items?.required, ['slug', 'isNode', 'title', 'mtime', 'matchedIn', 'score', 'excerpt'])
  ) {
    return 'find_evidence outputSchema matches drift';
  }
  const evidenceIdentityBranches = [
    {
      properties: { isNode: { const: true } },
      required: ['uid', 'kind'],
    },
    {
      properties: { isNode: { const: false } },
      not: { anyOf: [{ required: ['uid'] }, { required: ['kind'] }] },
    },
  ];
  if (!isDeepStrictEqual(evidenceMatchesSchema.items?.oneOf, evidenceIdentityBranches)) {
    return 'find_evidence outputSchema match identity drift';
  }
  if (evidenceMatchesSchema.items?.additionalProperties !== false) {
    return 'find_evidence outputSchema match openness drift';
  }
  if (evidenceMatchesSchema.items?.properties?.uid?.type !== 'string' || evidenceMatchesSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'find_evidence outputSchema match uid drift';
  }
  if (evidenceMatchesSchema.items?.properties?.isNode?.type !== 'boolean') {
    return 'find_evidence outputSchema match isNode drift';
  }
  for (const propertyName of ['slug', 'kind', 'title', 'excerpt']) {
    if (evidenceMatchesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_evidence outputSchema match ${propertyName} drift`;
    }
  }
  if (evidenceMatchesSchema.items?.properties?.mtime?.type !== 'number' || evidenceMatchesSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'find_evidence outputSchema match mtime drift';
  }
  if (!sameArray(evidenceMatchesSchema.items?.properties?.matchedIn?.enum, ['frontmatter', 'body'])) {
    return 'find_evidence outputSchema match matchedIn drift';
  }
  if (evidenceMatchesSchema.items?.properties?.score?.type !== 'number' || evidenceMatchesSchema.items?.properties?.score?.minimum !== 0) {
    return 'find_evidence outputSchema match score drift';
  }

  const findBacklinksTool = tools.find((tool) => tool?.name === 'find_backlinks');
  if (!findBacklinksTool) return 'tools/list response missing find_backlinks tool';
  if (
    !/Return every node that points to the target slug/i.test(findBacklinksTool.description || '') ||
    !/Scans both frontmatter/i.test(findBacklinksTool.description || '') ||
    !/wikilinks \/ markdown links in the body/i.test(findBacklinksTool.description || '') ||
    !/walk the graph from a node to its dependents/i.test(findBacklinksTool.description || '')
  ) {
    return 'find_backlinks description missing dependent-walk guidance';
  }
  const findBacklinksSlugSchema = propertyAt(findBacklinksTool, ['properties', 'slug']);
  if (
    findBacklinksSlugSchema?.type !== 'string' ||
    (findBacklinksSlugSchema.minLength ?? 1) !== 1 ||
    !/Target vault-relative slug/i.test(findBacklinksSlugSchema.description || '') ||
    !/omit the \.md extension/i.test(findBacklinksSlugSchema.description || '')
  ) {
    return 'find_backlinks inputSchema slug guidance drift';
  }
  if (findBacklinksTool.outputSchema?.type !== 'object') {
    return 'find_backlinks outputSchema root drift';
  }
  if (!sameArray(findBacklinksTool.outputSchema?.required, ['target', 'total', 'matches'])) {
    return 'find_backlinks outputSchema required drift';
  }
  if (findBacklinksTool.outputSchema?.additionalProperties !== false) {
    return 'find_backlinks outputSchema root openness drift';
  }
  if (outputPropertyAt(findBacklinksTool, ['properties', 'target'])?.type !== 'string') {
    return 'find_backlinks outputSchema target drift';
  }
  const backlinksTotalSchema = outputPropertyAt(findBacklinksTool, ['properties', 'total']);
  if (backlinksTotalSchema?.type !== 'integer' || backlinksTotalSchema.minimum !== 0) {
    return 'find_backlinks outputSchema total drift';
  }
  const backlinksMatchesFailure = backlinkRowsSchemaFailure(
    outputPropertyAt(findBacklinksTool, ['properties', 'matches']),
    'find_backlinks outputSchema matches',
  );
  if (backlinksMatchesFailure) return backlinksMatchesFailure;

  const queryConceptsTool = tools.find((tool) => tool?.name === 'query_concepts');
  if (!queryConceptsTool) return 'tools/list response missing query_concepts tool';
  if (
    !/Typed filter DSL/i.test(queryConceptsTool.description || '') ||
    !/filter\s*:=\s*atom/i.test(queryConceptsTool.description || '') ||
    !/predicate\s*:=\s*key=value \| key!=value \| has\(key\)/i.test(queryConceptsTool.description || '') ||
    !/kind=capability AND domain=auth AND NOT has\(elements\)/i.test(queryConceptsTool.description || '')
  ) {
    return 'query_concepts description missing typed filter DSL guidance';
  }
  const queryFilterSchema = propertyAt(queryConceptsTool, ['properties', 'filter']);
  if (
    queryFilterSchema?.type !== 'string' ||
    !/Supports NOT \/ AND \/ OR/i.test(queryFilterSchema.description || '') ||
    !/Wrap values containing whitespace or special characters/i.test(queryFilterSchema.description || '')
  ) {
    return 'query_concepts inputSchema filter DSL guidance drift';
  }
  const queryLimitSchema = propertyAt(queryConceptsTool, ['properties', 'limit']);
  if (
    queryLimitSchema?.type !== 'integer' ||
    queryLimitSchema.minimum !== 1 ||
    queryLimitSchema.maximum !== 500 ||
    !/defaults? (to )?100/i.test(queryLimitSchema.description || '')
  ) {
    return 'query_concepts inputSchema limit default description drift';
  }
  if (queryConceptsTool.outputSchema?.type !== 'object') {
    return 'query_concepts outputSchema root drift';
  }
  if (!sameArray(queryConceptsTool.outputSchema?.required, ['filter', 'parsedAs', 'total', 'matches', 'limited'])) {
    return 'query_concepts outputSchema required drift';
  }
  if (queryConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'query_concepts outputSchema root openness drift';
  }
  const queryConceptsTotalSchema = outputPropertyAt(queryConceptsTool, ['properties', 'total']);
  if (queryConceptsTotalSchema?.type !== 'integer' || queryConceptsTotalSchema.minimum !== 0) {
    return 'query_concepts outputSchema total drift';
  }
  const queryConceptsLimitedSchema = outputPropertyAt(queryConceptsTool, ['properties', 'limited']);
  if (queryConceptsLimitedSchema?.type !== 'boolean') {
    return 'query_concepts outputSchema limited drift';
  }
  const queryConceptsRowsSchema = outputPropertyAt(queryConceptsTool, ['properties', 'matches']);
  if (
    queryConceptsRowsSchema?.type !== 'array' ||
    queryConceptsRowsSchema.items?.type !== 'object' ||
    !sameArray(queryConceptsRowsSchema.items?.required, ['uid', 'slug', 'kind', 'title', 'mtime'])
  ) {
    return 'query_concepts outputSchema rows drift';
  }
  if (queryConceptsRowsSchema.items?.additionalProperties !== false) {
    return 'query_concepts outputSchema row openness drift';
  }
  if (queryConceptsRowsSchema.items?.properties?.uid?.type !== 'string' || queryConceptsRowsSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'query_concepts outputSchema row uid drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (queryConceptsRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `query_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (queryConceptsRowsSchema.items?.properties?.mtime?.type !== 'number' || queryConceptsRowsSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'query_concepts outputSchema row mtime drift';
  }
  return null;
}
