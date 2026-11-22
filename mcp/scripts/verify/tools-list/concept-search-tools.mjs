import { isDeepStrictEqual } from 'node:util';
import { RELATION_TYPE_VALUES } from '../../../src/ontology-engine.mjs';
import { NODE_UID_PATTERN } from '../../../src/schema.mjs';

import { sameArray } from '../value-checks.mjs';
import { backlinkRowsSchemaFailure, outputPropertyAt, propertyAt } from './schema-primitives.mjs';

export function conceptSearchToolsSchemaFailure(tools) {
  const findEvidenceTool = tools.find((tool) => tool?.name === 'find_evidence');
  if (!findEvidenceTool) return 'tools/list response missing find_evidence tool';
  if (
    !/Find vault docs that mention a given concept by title/i.test(findEvidenceTool.description || '') ||
    !/Each match includes a prose `?excerpt`?/i.test(findEvidenceTool.description || '') ||
    !/without an extra get_concept call/i.test(findEvidenceTool.description || '')
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

  const findNeighborsTool = tools.find((tool) => tool?.name === 'find_neighbors');
  if (!findNeighborsTool) return 'tools/list response missing find_neighbors tool';
  const neighborsDirectionSchema = propertyAt(findNeighborsTool, ['properties', 'direction']);
  if (!sameArray(neighborsDirectionSchema?.enum, ['outgoing', 'incoming', 'both']) || !/Defaults to both/i.test(neighborsDirectionSchema?.description ?? '')) {
    return 'find_neighbors inputSchema direction default description drift';
  }
  const neighborsTypesInputSchema = propertyAt(findNeighborsTool, ['properties', 'types']);
  if (
    neighborsTypesInputSchema?.type !== 'array' ||
    neighborsTypesInputSchema.items?.type !== 'string' ||
    !sameArray(neighborsTypesInputSchema.items?.enum, RELATION_TYPE_VALUES) ||
    !/Public add_relation types are normalized to stored graph keys/i.test(neighborsTypesInputSchema?.description ?? '')
  ) {
    return 'find_neighbors inputSchema types alias guidance drift';
  }
  const neighborsIncludeNodesSchema = propertyAt(findNeighborsTool, ['properties', 'includeNodes']);
  if (
    neighborsIncludeNodesSchema?.type !== 'boolean' ||
    !/true \(default\)|default.*true/i.test(neighborsIncludeNodesSchema?.description ?? '')
  ) {
    return 'find_neighbors inputSchema includeNodes default description drift';
  }
  const neighborsLimitInputSchema = propertyAt(findNeighborsTool, ['properties', 'limit']);
  if (
    neighborsLimitInputSchema?.type !== 'integer' ||
    neighborsLimitInputSchema.minimum !== 1 ||
    neighborsLimitInputSchema.maximum !== 500 ||
    !/defaults? (to )?100/i.test(neighborsLimitInputSchema?.description ?? '')
  ) {
    return 'find_neighbors inputSchema limit default description drift';
  }
  if (findNeighborsTool.outputSchema?.type !== 'object') {
    return 'find_neighbors outputSchema root drift';
  }
  if (!sameArray(findNeighborsTool.outputSchema?.required, ['center', 'requested', 'direction', 'totalEdges', 'limited', 'edges'])) {
    return 'find_neighbors outputSchema required drift';
  }
  if (findNeighborsTool.outputSchema?.additionalProperties !== false) {
    return 'find_neighbors outputSchema root openness drift';
  }
  for (const propertyName of ['center', 'requested']) {
    if (outputPropertyAt(findNeighborsTool, ['properties', propertyName])?.type !== 'string') {
      return `find_neighbors outputSchema ${propertyName} drift`;
    }
  }
  if (!sameArray(outputPropertyAt(findNeighborsTool, ['properties', 'direction'])?.enum, ['outgoing', 'incoming', 'both'])) {
    return 'find_neighbors outputSchema direction drift';
  }
  if (outputPropertyAt(findNeighborsTool, ['properties', 'types'])?.type !== 'array' || outputPropertyAt(findNeighborsTool, ['properties', 'types'])?.items?.type !== 'string') {
    return 'find_neighbors outputSchema types drift';
  }
  const neighborsTotalEdgesSchema = outputPropertyAt(findNeighborsTool, ['properties', 'totalEdges']);
  if (neighborsTotalEdgesSchema?.type !== 'integer' || neighborsTotalEdgesSchema.minimum !== 0) {
    return 'find_neighbors outputSchema totalEdges drift';
  }
  if (outputPropertyAt(findNeighborsTool, ['properties', 'limited'])?.type !== 'boolean') {
    return 'find_neighbors outputSchema limited drift';
  }
  const neighborsEdgesSchema = outputPropertyAt(findNeighborsTool, ['properties', 'edges']);
  if (
    neighborsEdgesSchema?.type !== 'array' ||
    neighborsEdgesSchema.items?.type !== 'object' ||
    !sameArray(neighborsEdgesSchema.items?.required, ['direction', 'from', 'to', 'via', 'ref', 'resolved'])
  ) {
    return 'find_neighbors outputSchema edges drift';
  }
  if (neighborsEdgesSchema.items?.additionalProperties !== false) {
    return 'find_neighbors outputSchema edge openness drift';
  }
  if (!sameArray(neighborsEdgesSchema.items?.properties?.direction?.enum, ['outgoing', 'incoming'])) {
    return 'find_neighbors outputSchema edge direction drift';
  }
  for (const propertyName of ['from', 'to', 'via', 'ref']) {
    if (neighborsEdgesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_neighbors outputSchema edge ${propertyName} drift`;
    }
  }
  if (neighborsEdgesSchema.items?.properties?.resolved?.type !== 'boolean') {
    return 'find_neighbors outputSchema edge resolved drift';
  }
  const neighborsNodesSchema = outputPropertyAt(findNeighborsTool, ['properties', 'nodes']);
  if (
    neighborsNodesSchema?.type !== 'array' ||
    neighborsNodesSchema.items?.type !== 'object' ||
    !sameArray(neighborsNodesSchema.items?.required, ['uid', 'slug', 'kind', 'title', 'mtime'])
  ) {
    return 'find_neighbors outputSchema nodes drift';
  }
  if (neighborsNodesSchema.items?.additionalProperties !== false) {
    return 'find_neighbors outputSchema node openness drift';
  }
  if (neighborsNodesSchema.items?.properties?.uid?.type !== 'string' || neighborsNodesSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'find_neighbors outputSchema node uid drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (neighborsNodesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_neighbors outputSchema node ${propertyName} drift`;
    }
  }
  if (neighborsNodesSchema.items?.properties?.mtime?.type !== 'number' || neighborsNodesSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'find_neighbors outputSchema node mtime drift';
  }

  const findPathTool = tools.find((tool) => tool?.name === 'find_path');
  if (!findPathTool) return 'tools/list response missing find_path tool';
  const findPathMaxHopsSchema = propertyAt(findPathTool, ['properties', 'maxHops']);
  if (
    findPathMaxHopsSchema?.type !== 'integer' ||
    findPathMaxHopsSchema.minimum !== 0 ||
    findPathMaxHopsSchema.maximum !== 20 ||
    !/default 5/i.test(findPathMaxHopsSchema?.description ?? '')
  ) {
    return 'find_path inputSchema maxHops default description drift';
  }
  if (findPathTool.outputSchema?.type !== 'object') {
    return 'find_path outputSchema root drift';
  }
  if (!sameArray(findPathTool.outputSchema?.required, ['from', 'to', 'found'])) {
    return 'find_path outputSchema required drift';
  }
  if (findPathTool.outputSchema?.additionalProperties !== false) {
    return 'find_path outputSchema root openness drift';
  }
  for (const propertyName of ['from', 'to']) {
    if (outputPropertyAt(findPathTool, ['properties', propertyName])?.type !== 'string') {
      return `find_path outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(findPathTool, ['properties', 'found'])?.type !== 'boolean') {
    return 'find_path outputSchema found drift';
  }
  const findPathHopCountSchema = outputPropertyAt(findPathTool, ['properties', 'hopCount']);
  if (findPathHopCountSchema?.type !== 'integer' || findPathHopCountSchema.minimum !== 0) {
    return 'find_path outputSchema hopCount drift';
  }
  if (outputPropertyAt(findPathTool, ['properties', 'hops'])?.type !== 'array' || outputPropertyAt(findPathTool, ['properties', 'hops'])?.items?.type !== 'string') {
    return 'find_path outputSchema hops drift';
  }
  const findPathEdgesSchema = outputPropertyAt(findPathTool, ['properties', 'edges']);
  if (
    findPathEdgesSchema?.type !== 'array' ||
    findPathEdgesSchema.items?.type !== 'object' ||
    !sameArray(findPathEdgesSchema.items?.required, ['from', 'to', 'via'])
  ) {
    return 'find_path outputSchema edges drift';
  }
  if (findPathEdgesSchema.items?.additionalProperties !== false) {
    return 'find_path outputSchema edge openness drift';
  }
  for (const propertyName of ['from', 'to', 'via', 'rationale']) {
    if (findPathEdgesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_path outputSchema edge ${propertyName} drift`;
    }
  }
  const findPathNodesSchema = outputPropertyAt(findPathTool, ['properties', 'nodes']);
  if (
    findPathNodesSchema?.type !== 'array' ||
    findPathNodesSchema.items?.type !== 'object' ||
    !sameArray(findPathNodesSchema.items?.required, ['uid', 'slug', 'kind', 'title'])
  ) {
    return 'find_path outputSchema nodes drift';
  }
  if (findPathNodesSchema.items?.additionalProperties !== false) {
    return 'find_path outputSchema node openness drift';
  }
  if (findPathNodesSchema.items?.properties?.uid?.type !== 'string' || findPathNodesSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'find_path outputSchema node uid drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (findPathNodesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_path outputSchema node ${propertyName} drift`;
    }
  }
  if (findPathNodesSchema.items?.properties?.domain?.type !== 'string') {
    return 'find_path outputSchema node domain drift';
  }

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
