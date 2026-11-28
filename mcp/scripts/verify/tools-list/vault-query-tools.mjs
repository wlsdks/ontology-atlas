import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  VAULT_ISSUE_CODE_VALUES,
} from '../server-vocabularies.mjs';

import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';


export function vaultQueryToolsSchemaFailure(tools) {
  const queryTool = tools.find((tool) => tool?.name === 'query_ontology');
  if (!queryTool) return 'tools/list response missing query_ontology tool';

  const listConceptsTool = tools.find((tool) => tool?.name === 'list_concepts');
  if (!listConceptsTool) return 'tools/list response missing list_concepts tool';
  if (!/carries `census`/i.test(listConceptsTool.description || '') || !/`limit: 1` sizes up a vault/i.test(listConceptsTool.description || '')) {
    return 'list_concepts description missing census guidance';
  }
  const censusSchema = outputPropertyAt(listConceptsTool, ['properties', 'census']);
  if (censusSchema?.type !== 'object') {
    return 'list_concepts outputSchema census drift';
  }
  if (!sameArray(censusSchema.required, ['total', 'byKind', 'referencedOnlyTotal']) || censusSchema.additionalProperties !== false) {
    return 'list_concepts outputSchema census required drift';
  }
  for (const field of ['total', 'referencedOnlyTotal']) {
    const schema = censusSchema.properties?.[field];
    if (schema?.type !== 'integer' || schema.minimum !== 0) return `list_concepts outputSchema census ${field} drift`;
  }
  const byKindSchema = censusSchema.properties?.byKind;
  if (byKindSchema?.type !== 'object' || byKindSchema.additionalProperties?.type !== 'integer' || byKindSchema.additionalProperties?.minimum !== 0) {
    return 'list_concepts outputSchema census byKind drift';
  }

  const validateTool = tools.find((tool) => tool?.name === 'validate_vault');
  if (!validateTool) return 'tools/list response missing validate_vault tool';
  if (
    !/validate every doc in the vault/i.test(validateTool.description || '') ||
    !/per-doc \+ per-code aggregate/i.test(validateTool.description || '') ||
    !/side effect 0/i.test(validateTool.description || '') ||
    !/first-contact before writes/i.test(validateTool.description || '') ||
    !/before \/ after a batch write/i.test(validateTool.description || '')
  ) {
    return 'validate_vault description missing first-contact health guidance';
  }
  if (validateTool.outputSchema?.type !== 'object') {
    return 'validate_vault outputSchema root drift';
  }
  if (!sameArray(validateTool.outputSchema?.required, ['scanned', 'problems', 'summary', 'summaryFreshness', 'pathDrift'])) {
    return 'validate_vault outputSchema required drift';
  }
  if (validateTool.outputSchema?.additionalProperties !== false) {
    return 'validate_vault outputSchema root openness drift';
  }
  const scannedSchema = outputPropertyAt(validateTool, ['properties', 'scanned']);
  if (scannedSchema?.type !== 'integer' || scannedSchema.minimum !== 0) {
    return 'validate_vault outputSchema scanned drift';
  }
  const problemsSchema = outputPropertyAt(validateTool, ['properties', 'problems']);
  if (problemsSchema?.type !== 'array' || problemsSchema.items?.type !== 'object' || !sameArray(problemsSchema.items?.required, ['slug', 'issues'])) {
    return 'validate_vault outputSchema problems drift';
  }
  if (problemsSchema.items?.additionalProperties !== false) {
    return 'validate_vault outputSchema problem openness drift';
  }
  const issueSchema = problemsSchema.items?.properties?.issues?.items;
  if (
    issueSchema?.type !== 'object' ||
    !sameArray(issueSchema.required, ['code', 'severity', 'message']) ||
    !sameArray(issueSchema.properties?.code?.enum, VAULT_ISSUE_CODE_VALUES) ||
    issueSchema.additionalProperties !== false
  ) {
    return 'validate_vault outputSchema issue code drift';
  }
  const summarySchema = outputPropertyAt(validateTool, ['properties', 'summary']);
  if (summarySchema?.type !== 'object' || !sameArray(summarySchema.required, ['problemFiles', 'errorFiles', 'warningFiles', 'byCode'])) {
    return 'validate_vault outputSchema summary drift';
  }
  if (summarySchema.additionalProperties !== false) {
    return 'validate_vault outputSchema summary openness drift';
  }
  for (const countName of ['problemFiles', 'errorFiles', 'warningFiles']) {
    const countSchema = summarySchema.properties?.[countName];
    if (countSchema?.type !== 'integer' || countSchema.minimum !== 0) {
      return `validate_vault outputSchema ${countName} drift`;
    }
  }
  const byCodeSchema = summarySchema.properties?.byCode;
  if (byCodeSchema?.type !== 'object' || byCodeSchema.additionalProperties?.type !== 'object') {
    return 'validate_vault outputSchema byCode drift';
  }
  if (!sameArray(byCodeSchema.propertyNames?.enum, VAULT_ISSUE_CODE_VALUES)) {
    return 'validate_vault outputSchema byCode key drift';
  }
  if (!sameArray(byCodeSchema.additionalProperties?.required, ['severity', 'count'])) {
    return 'validate_vault outputSchema byCode entry required drift';
  }
  if (byCodeSchema.additionalProperties?.additionalProperties !== false) {
    return 'validate_vault outputSchema byCode entry openness drift';
  }
  if (!sameArray(byCodeSchema.additionalProperties?.properties?.severity?.enum, ['error', 'warning'])) {
    return 'validate_vault outputSchema byCode severity drift';
  }
  if (byCodeSchema.additionalProperties?.properties?.count?.type !== 'integer' || byCodeSchema.additionalProperties?.properties?.count?.minimum !== 0) {
    return 'validate_vault outputSchema byCode count drift';
  }
  if (byCodeSchema.additionalProperties?.properties?.files?.type !== 'array' || byCodeSchema.additionalProperties?.properties?.files?.items?.type !== 'string') {
    return 'validate_vault outputSchema byCode files drift';
  }

  if (!sameArray(queryTool.inputSchema?.required, ['operation'])) {
    return 'query_ontology required schema drift';
  }

  if (!sameArray(queryTool.inputSchema?.properties?.operation?.enum, QUERY_ONTOLOGY_OPERATIONS)) {
    return 'query_ontology operation enum schema drift';
  }

  if (!sameArray(queryTool.inputSchema?.properties?.targetOperation?.enum, QUERY_PLAN_TARGET_OPERATIONS)) {
    return 'query_ontology targetOperation enum schema drift';
  }
  for (const propertyName of ['types', 'pattern']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'array' || option.items?.type !== 'string' || !sameArray(option.items?.enum, RELATION_TYPE_VALUES)) {
      return `query_ontology ${propertyName} relation enum schema drift`;
    }
  }
  for (const propertyName of ['type']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'string' || !sameArray(option.enum, RELATION_TYPE_VALUES)) {
      return `query_ontology ${propertyName} relation enum schema drift`;
    }
  }
  for (const propertyName of ['kind']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'string' || !sameArray(option.enum, NODE_KIND_VALUES)) {
      return `query_ontology ${propertyName} graph kind enum schema drift`;
    }
  }
  const kindDescription = propertyAt(queryTool, ['properties', 'kind'])?.description ?? '';
  if (!/recommend_relations takes capability or element/.test(kindDescription)) {
    return 'query_ontology kind description drift';
  }
  const queryDescription = queryTool.description || '';
  if (!/impact \(what depends on a node, declared `depends_on` only\)/.test(queryDescription)) {
    return 'query_ontology description missing the declared depends_on impact rule';
  }
  if (!/relation_check \(preflight before add_relations/.test(queryDescription)) {
    return 'query_ontology description missing the relation_check preflight';
  }
  if (!/connection_info\(\{guide:"query"\}\)/.test(queryDescription)) {
    return 'query_ontology description missing the pointer to the query guide';
  }
  if (!/nodes with no incoming relation are `match_nodes` with `hasIncoming: false`/.test(queryDescription)) {
    return 'query_ontology description missing the orphan question';
  }

  const phases = propertyAt(queryTool, ['properties', 'phases']);
  if (!sameArray(phases?.items?.enum, MAINTENANCE_PHASE_VALUES)) {
    return 'query_ontology phases enum schema drift';
  }
  const severities = propertyAt(queryTool, ['properties', 'severities']);
  if (!sameArray(severities?.items?.enum, MAINTENANCE_SEVERITY_VALUES)) {
    return 'query_ontology severities enum schema drift';
  }
  const kinds = propertyAt(queryTool, ['properties', 'kinds']);
  if (!sameArray(kinds?.items?.enum, MAINTENANCE_KIND_VALUES)) {
    return 'query_ontology maintenance kinds enum schema drift';
  }
  const afterActionId = propertyAt(queryTool, ['properties', 'afterActionId']);
  if (!/cursor\.nextAfterActionId while cursor\.hasMore/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing cursor pagination guidance';
  }
  return null;
}
