import { sameArray } from '../value-checks.mjs';
import { backlinkRowsSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

export function conceptSearchToolsSchemaFailure(tools) {
  const listConceptsTool = tools.find((tool) => tool?.name === 'list_concepts');
  if (!listConceptsTool) return 'tools/list response missing list_concepts tool';
  if (
    !/by text with `mentions`/i.test(listConceptsTool.description || '') ||
    !/by a predicate with `filter`/i.test(listConceptsTool.description || '') ||
    !/adds `matchedIn`, `score` and an `excerpt`/i.test(listConceptsTool.description || '')
  ) {
    return 'list_concepts description missing mentions and filter guidance';
  }
  const mentionsSchema = propertyAt(listConceptsTool, ['properties', 'mentions']);
  if (
    mentionsSchema?.type !== 'string' ||
    (mentionsSchema.minLength ?? 1) !== 1 ||
    !/case-insensitive/i.test(mentionsSchema.description || '')
  ) {
    return 'list_concepts inputSchema mentions guidance drift';
  }
  const filterSchema = propertyAt(listConceptsTool, ['properties', 'filter']);
  if (
    filterSchema?.type !== 'string' ||
    (filterSchema.minLength ?? 1) !== 1 ||
    !/has\(key\)/i.test(filterSchema.description || '')
  ) {
    return 'list_concepts inputSchema filter DSL guidance drift';
  }
  if (listConceptsTool.outputSchema?.type !== 'object') {
    return 'list_concepts outputSchema root drift';
  }
  if (listConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'list_concepts outputSchema root openness drift';
  }
  for (const propertyName of ['filter', 'parsedAs', 'query']) {
    if (outputPropertyAt(listConceptsTool, ['properties', propertyName])?.type !== 'string') {
      return `list_concepts outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(listConceptsTool, ['properties', 'growthHint'])?.type !== 'object') {
    return 'list_concepts outputSchema growthHint drift';
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

  return null;
}
