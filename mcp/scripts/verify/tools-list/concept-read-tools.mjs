import { NODE_KIND_VALUES } from '../../../src/ontology-engine.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../../../src/validate.mjs';
import { NODE_UID_PATTERN } from '../../../src/schema.mjs';

import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';

function conceptNeighborsSchemaFailure(schema, label) {
  const required = ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'];
  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, required) ||
    schema.additionalProperties !== false
  ) {
    return `${label} outputSchema neighbors drift`;
  }
  for (const propertyName of ['domains', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes']) {
    const neighborSchema = schema.properties?.[propertyName];
    if (neighborSchema?.type !== 'array' || neighborSchema.items?.type !== 'string') {
      return `${label} outputSchema neighbors ${propertyName} drift`;
    }
  }
  if (!sameArray(schema.properties?.domain?.type, ['string', 'null'])) {
    return `${label} outputSchema neighbors domain drift`;
  }
  return null;
}

function outgoingEdgesSchemaFailure(schema, label) {
  const row = schema?.items;
  if (
    schema?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['to', 'via']) ||
    row.additionalProperties !== false ||
    row.properties?.to?.type !== 'string' ||
    row.properties?.via?.type !== 'string' ||
    // Optional stored `relation_notes` sentence; a string when present, never
    // required, so a vault without notes still validates.
    row.properties?.rationale?.type !== 'string'
  ) {
    return `${label} outputSchema outgoingEdges drift`;
  }
  return null;
}

function vaultWarningsSchemaFailure(schema, label) {
  const row = schema?.items;
  if (
    schema?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['code', 'severity', 'message']) ||
    row.additionalProperties !== false ||
    !sameArray(row.properties?.code?.enum, VAULT_ISSUE_CODE_VALUES) ||
    !sameArray(row.properties?.severity?.enum, ['error', 'warning']) ||
    row.properties?.message?.type !== 'string'
  ) {
    return `${label} outputSchema warnings drift`;
  }
  return null;
}

export function conceptReadToolsSchemaFailure(tools) {
  const listConceptsTool = tools.find((tool) => tool?.name === 'list_concepts');
  if (!listConceptsTool) return 'tools/list response missing list_concepts tool';
  const listKindSchema = propertyAt(listConceptsTool, ['properties', 'kind']);
  if (
    listKindSchema?.type !== 'string' ||
    (listKindSchema.minLength ?? 1) !== 1 ||
    !sameArray(listKindSchema.enum, NODE_KIND_VALUES) ||
    !/canonical ontology kind/i.test(listKindSchema?.description ?? '') ||
    !/Invalid kind typos fail closed/i.test(listKindSchema?.description ?? '')
  ) {
    return 'list_concepts.kind schema guidance drift';
  }
  const listSinceSchema = propertyAt(listConceptsTool, ['properties', 'since']);
  if (
    listSinceSchema?.type !== 'number' ||
    listSinceSchema.minimum !== 0 ||
    !/mtime > since/i.test(listSinceSchema?.description ?? '') ||
    !/incremental sync/i.test(listSinceSchema?.description ?? '') ||
    !/does not double-fetch/i.test(listSinceSchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema since incremental-sync guidance drift';
  }
  const listOffsetSchema = propertyAt(listConceptsTool, ['properties', 'offset']);
  if (
    listOffsetSchema?.type !== 'integer' ||
    listOffsetSchema.minimum !== 0 ||
    !/pagination\.nextOffset/i.test(listOffsetSchema?.description ?? '') ||
    !/deterministic/i.test(listOffsetSchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema offset pagination guidance drift';
  }
  const listSummarySchema = propertyAt(listConceptsTool, ['properties', 'summary']);
  if (
    listSummarySchema?.type !== 'boolean' ||
    !/summary.*max 200 chars/i.test(listSummarySchema?.description ?? '') ||
    !/without a follow-up `get_concepts` call/i.test(listSummarySchema?.description ?? '') ||
    !/Default false/i.test(listSummarySchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema summary preview guidance drift';
  }
  const listLimitSchema = propertyAt(listConceptsTool, ['properties', 'limit']);
  if (
    listLimitSchema?.type !== 'integer' ||
    listLimitSchema.minimum !== 1 ||
    listLimitSchema.maximum !== 500 ||
    !/defaults? (to )?100/i.test(listLimitSchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema limit default description drift';
  }
  if (listConceptsTool.outputSchema?.type !== 'object') {
    return 'list_concepts outputSchema root drift';
  }
  if (!sameArray(listConceptsTool.outputSchema?.required, ['total', 'vaultRoot', 'nodes', 'returned', 'limited', 'pagination'])) {
    return 'list_concepts outputSchema required drift';
  }
  if (listConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'list_concepts outputSchema root openness drift';
  }
  const listTotalSchema = outputPropertyAt(listConceptsTool, ['properties', 'total']);
  if (listTotalSchema?.type !== 'integer' || listTotalSchema.minimum !== 0) {
    return 'list_concepts outputSchema total drift';
  }
  for (const propertyName of ['returned']) {
    const schema = outputPropertyAt(listConceptsTool, ['properties', propertyName]);
    if (schema?.type !== 'integer' || schema.minimum !== 0) {
      return `list_concepts outputSchema ${propertyName} drift`;
    }
  }
  const listLimitedSchema = outputPropertyAt(listConceptsTool, ['properties', 'limited']);
  if (listLimitedSchema?.type !== 'boolean') {
    return 'list_concepts outputSchema limited drift';
  }
  const listPaginationSchema = outputPropertyAt(listConceptsTool, ['properties', 'pagination']);
  if (
    listPaginationSchema?.type !== 'object' ||
    !sameArray(listPaginationSchema.required, ['offset', 'limit', 'total', 'returned', 'hasMore', 'nextOffset']) ||
    listPaginationSchema.additionalProperties !== false ||
    listPaginationSchema.properties?.offset?.type !== 'integer' ||
    listPaginationSchema.properties?.limit?.type !== 'integer' ||
    listPaginationSchema.properties?.total?.type !== 'integer' ||
    listPaginationSchema.properties?.returned?.type !== 'integer' ||
    listPaginationSchema.properties?.hasMore?.type !== 'boolean' ||
    !Array.isArray(listPaginationSchema.properties?.nextOffset?.type) ||
    !listPaginationSchema.properties.nextOffset.type.includes('null')
  ) {
    return 'list_concepts outputSchema pagination drift';
  }
  const listVaultRootSchema = outputPropertyAt(listConceptsTool, ['properties', 'vaultRoot']);
  if (listVaultRootSchema?.type !== 'string' || listVaultRootSchema.minLength !== 1) {
    return 'list_concepts outputSchema vaultRoot drift';
  }
  const listNodesSchema = outputPropertyAt(listConceptsTool, ['properties', 'nodes']);
  if (listNodesSchema?.type !== 'array' || listNodesSchema.items?.type !== 'object' || !sameArray(listNodesSchema.items?.required, ['slug', 'title', 'mtime'])) {
    return 'list_concepts outputSchema nodes drift';
  }
  // A node row carries `uid` and `kind`; a plain Markdown page found by `mentions` carries `isNode: false` and neither.
  if (
    listNodesSchema.items?.oneOf?.length !== 2
    || !sameArray(listNodesSchema.items.oneOf[0]?.required, ['uid', 'kind'])
    || listNodesSchema.items.oneOf[1]?.properties?.isNode?.const !== false
  ) {
    return 'list_concepts outputSchema node or page row drift';
  }
  if (listNodesSchema.items?.additionalProperties !== false) {
    return 'list_concepts outputSchema node openness drift';
  }
  if (listNodesSchema.items?.properties?.uid?.type !== 'string' || listNodesSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'list_concepts outputSchema node uid drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (listNodesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `list_concepts outputSchema node ${propertyName} drift`;
    }
  }
  const nodeMtimeSchema = listNodesSchema.items?.properties?.mtime;
  if (nodeMtimeSchema?.type !== 'number' || nodeMtimeSchema.minimum !== 0) {
    return 'list_concepts outputSchema node mtime drift';
  }
  const vaultWarningsSchema = outputPropertyAt(listConceptsTool, ['properties', 'vaultWarnings']);
  if (vaultWarningsSchema?.type !== 'object' || !sameArray(vaultWarningsSchema.required, ['errorCount', 'warningCount'])) {
    return 'list_concepts outputSchema vaultWarnings drift';
  }
  if (vaultWarningsSchema.additionalProperties !== false) {
    return 'list_concepts outputSchema vaultWarnings openness drift';
  }
  for (const propertyName of ['errorCount', 'warningCount']) {
    const countSchema = vaultWarningsSchema.properties?.[propertyName];
    if (countSchema?.type !== 'integer' || countSchema.minimum !== 0) {
      return `list_concepts outputSchema vaultWarnings ${propertyName} drift`;
    }
  }

  const getConceptsTool = tools.find((tool) => tool?.name === 'get_concepts');
  if (!getConceptsTool) return 'tools/list response missing get_concepts tool';
  if (
    !/exactly one selector array/i.test(getConceptsTool.description || '') ||
    !/immutable `uids`/i.test(getConceptsTool.description || '') ||
    !/permanent `uid` plus current canonical `slug`/i.test(getConceptsTool.description || '') ||
    !/graph-operation inputs remain slug-based/i.test(getConceptsTool.description || '') ||
    !/later valid slugs still resolve/i.test(getConceptsTool.description || '')
  ) {
    return 'get_concepts description missing batch partial-result guidance';
  }
  if (getConceptsTool.inputSchema?.required !== undefined) {
    return 'get_concepts inputSchema identity selector drift';
  }
  const getConceptsSlugsSchema = propertyAt(getConceptsTool, ['properties', 'slugs']);
  if (
    getConceptsSlugsSchema?.type !== 'array' ||
    getConceptsSlugsSchema.maxItems !== 50 ||
    getConceptsSlugsSchema.items?.type !== 'string' ||
    !/unique tail slugs/i.test(getConceptsSlugsSchema.description || '') ||
    !/frontmatter `slug` aliases/i.test(getConceptsSlugsSchema.description || '') ||
    !/Max 50 per call/i.test(getConceptsSlugsSchema.description || '')
  ) {
    return 'get_concepts inputSchema slugs alias and cap guidance drift';
  }
  const getConceptsUidsSchema = propertyAt(getConceptsTool, ['properties', 'uids']);
  if (
    getConceptsUidsSchema?.type !== 'array' ||
    getConceptsUidsSchema.maxItems !== 50 ||
    getConceptsUidsSchema.items?.type !== 'string' ||
    getConceptsUidsSchema.items?.pattern !== NODE_UID_PATTERN ||
    !/permanent node UIDs/i.test(getConceptsUidsSchema.description || '') ||
    !/never together/i.test(getConceptsUidsSchema.description || '')
  ) {
    return 'get_concepts inputSchema uids drift';
  }
  if (getConceptsTool.outputSchema?.type !== 'object') {
    return 'get_concepts outputSchema root drift';
  }
  if (!sameArray(getConceptsTool.outputSchema?.required, ['concepts'])) {
    return 'get_concepts outputSchema required drift';
  }
  if (getConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'get_concepts outputSchema root openness drift';
  }
  const getConceptsItemsSchema = outputPropertyAt(getConceptsTool, ['properties', 'concepts', 'items']);
  if (outputPropertyAt(getConceptsTool, ['properties', 'concepts'])?.type !== 'array' || getConceptsItemsSchema?.type !== 'object') {
    return 'get_concepts outputSchema concepts drift';
  }
  if (!sameArray(getConceptsItemsSchema.required, ['ok'])) {
    return 'get_concepts outputSchema row required drift';
  }
  if (getConceptsItemsSchema.additionalProperties !== false) {
    return 'get_concepts outputSchema row openness drift';
  }
  if (getConceptsItemsSchema.properties?.ok?.type !== 'boolean') {
    return 'get_concepts outputSchema row ok drift';
  }
  if (getConceptsItemsSchema.properties?.isNode?.type !== 'boolean' || getConceptsItemsSchema.properties?.review?.type !== 'object') return 'get_concepts outputSchema row concept metadata drift';
  if (getConceptsItemsSchema.properties?.slug?.type !== 'string') {
    return 'get_concepts outputSchema row slug drift';
  }
  if (
    getConceptsItemsSchema.properties?.uid?.type !== 'string' ||
    getConceptsItemsSchema.properties?.uid?.pattern !== NODE_UID_PATTERN
  ) {
    return 'get_concepts outputSchema row uid drift';
  }
  if (getConceptsItemsSchema.properties?.mtime?.type !== 'number' || getConceptsItemsSchema.properties?.mtime?.minimum !== 0) {
    return 'get_concepts outputSchema row mtime drift';
  }
  if (getConceptsItemsSchema.properties?.frontmatter?.type !== 'object') {
    return 'get_concepts outputSchema row frontmatter drift';
  }
  if (getConceptsItemsSchema.properties?.excerpt?.type !== 'string') {
    return 'get_concepts outputSchema row excerpt drift';
  }
  const getConceptsNeighborsFailure = conceptNeighborsSchemaFailure(
    getConceptsItemsSchema.properties?.neighbors,
    'get_concepts row',
  );
  if (getConceptsNeighborsFailure) return getConceptsNeighborsFailure;
  const getConceptsEdgesFailure = outgoingEdgesSchemaFailure(
    getConceptsItemsSchema.properties?.outgoingEdges,
    'get_concepts row',
  );
  if (getConceptsEdgesFailure) return getConceptsEdgesFailure;
  const getConceptsWarningsFailure = vaultWarningsSchemaFailure(
    getConceptsItemsSchema.properties?.warnings,
    'get_concepts row',
  );
  if (getConceptsWarningsFailure) return getConceptsWarningsFailure;
  return null;
}
