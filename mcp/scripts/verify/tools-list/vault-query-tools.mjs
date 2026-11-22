import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../../../src/ontology-engine.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../../../src/validate.mjs';
import { NODE_UID_PATTERN } from '../../../src/schema.mjs';

import { sameArray } from '../value-checks.mjs';
import { outputPropertyAt, propertyAt } from './schema-primitives.mjs';


export function vaultQueryToolsSchemaFailure(tools) {
  const queryTool = tools.find((tool) => tool?.name === 'query_ontology');
  if (!queryTool) return 'tools/list response missing query_ontology tool';

  const listKindsTool = tools.find((tool) => tool?.name === 'list_kinds');
  if (!listKindsTool) return 'tools/list response missing list_kinds tool';
  if (
    !/Vault kind distribution/i.test(listKindsTool.description || '') ||
    !/quick census/i.test(listKindsTool.description || '') ||
    !/size up the vault without paging through list_concepts/i.test(listKindsTool.description || '')
  ) {
    return 'list_kinds description missing census guidance';
  }
  if (listKindsTool.outputSchema?.type !== 'object') {
    return 'list_kinds outputSchema root drift';
  }
  if (!sameArray(listKindsTool.outputSchema?.required, ['total', 'byKind', 'referencedOnlyTotal', 'conceptsIncludingReferenced'])) {
    return 'list_kinds outputSchema required drift';
  }
  if (listKindsTool.outputSchema?.additionalProperties !== false) {
    return 'list_kinds outputSchema root openness drift';
  }
  const totalSchema = outputPropertyAt(listKindsTool, ['properties', 'total']);
  if (totalSchema?.type !== 'integer' || totalSchema.minimum !== 0) {
    return 'list_kinds outputSchema total drift';
  }
  const byKindSchema = outputPropertyAt(listKindsTool, ['properties', 'byKind']);
  if (byKindSchema?.type !== 'object' || byKindSchema.additionalProperties?.type !== 'integer' || byKindSchema.additionalProperties?.minimum !== 0) {
    return 'list_kinds outputSchema byKind drift';
  }
  for (const field of ['referencedOnlyTotal', 'conceptsIncludingReferenced']) {
    const schema = outputPropertyAt(listKindsTool, ['properties', field]);
    if (schema?.type !== 'integer' || schema.minimum !== 0) return `list_kinds outputSchema ${field} drift`;
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
  if (!sameArray(byCodeSchema.additionalProperties?.required, ['severity', 'count', 'files'])) {
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
  for (const propertyName of ['type', 'relation']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'string' || !sameArray(option.enum, RELATION_TYPE_VALUES)) {
      return `query_ontology ${propertyName} relation enum schema drift`;
    }
  }
  for (const propertyName of ['kind', 'fromKind']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'string' || !sameArray(option.enum, NODE_KIND_VALUES)) {
      return `query_ontology ${propertyName} graph kind enum schema drift`;
    }
  }
  const kindDescription = propertyAt(queryTool, ['properties', 'kind'])?.description ?? '';
  if (!/recommend_relations takes capability or element/.test(kindDescription)) {
    return 'query_ontology kind description drift';
  }
  const fromKindDescription = propertyAt(queryTool, ['properties', 'fromKind'])?.description ?? '';
  if (!/always a real node/.test(fromKindDescription)) {
    return 'query_ontology fromKind description drift';
  }
  const toKind = propertyAt(queryTool, ['properties', 'toKind']);
  if (toKind?.type !== 'string' || !sameArray(toKind.enum, EDGE_TARGET_KIND_VALUES)) {
    return 'query_ontology toKind graph kind enum schema drift';
  }
  if (!/external and unresolved select refs that are not nodes/.test(toKind?.description ?? '')) {
    return 'query_ontology toKind description drift';
  }
  const queryDescription = queryTool.description || '';
  if (!/impact and blast_radius follow declared `depends_on` only/.test(queryDescription)) {
    return 'query_ontology description missing the declared depends_on impact rule';
  }
  if (!/`approvalGate` writes nothing until[\s\S]*the human explicitly approves/.test(queryDescription)) {
    return 'query_ontology description missing the relation_check approval gate';
  }
  if (!/agent_brief with detail:"compact" and `task` right after connection_info/.test(queryDescription)) {
    return 'query_ontology description missing the compact agent_brief order';
  }
  if (!/never searches the repository, never proves source behavior, never persists the task, never approves meaning and never writes/.test(queryDescription)) {
    return 'query_ontology description missing the task evidence limit';
  }
  if (!/Required: `slug` for neighbors[\s\S]*`from` and `to` for path/.test(queryDescription)) {
    return 'query_ontology description missing the per-operation required arguments';
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
  for (const propertyName of ['componentLimit', 'cycleLimit', 'recommendationLimit', 'orderLimit', 'nodeLimit']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'integer' || option.minimum !== 1 || option.maximum !== 500) {
      return `query_ontology ${propertyName} health tuning schema drift`;
    }
    if (!/health\/workspace_brief/.test(option.description || '')) {
      return `query_ontology ${propertyName} health tuning description drift`;
    }
  }
  for (const propertyName of ['dependencyTypes', 'componentTypes']) {
    const option = propertyAt(queryTool, ['properties', propertyName]);
    if (option?.type !== 'array' || option.items?.type !== 'string' || !sameArray(option.items?.enum, RELATION_TYPE_VALUES)) {
      return `query_ontology ${propertyName} health tuning schema drift`;
    }
    if (!/health\/workspace_brief/.test(option.description || '')) {
      return `query_ontology ${propertyName} health tuning description drift`;
    }
  }

  const findOrphansTool = tools.find((candidate) => candidate?.name === 'find_orphans');
  if (!findOrphansTool) return 'tools/list response missing find_orphans tool';
  if (
    !/List orphan nodes/i.test(findOrphansTool.description || '') ||
    !/docs that no other node references via any frontmatter array key/i.test(findOrphansTool.description || '') ||
    !/cleanup starting point/i.test(findOrphansTool.description || '') ||
    !/Root\/sentinel kinds like project and vault-readme are excluded by default/i.test(findOrphansTool.description || '')
  ) {
    return 'find_orphans description missing cleanup guidance';
  }
  const orphanKindSchema = propertyAt(findOrphansTool, ['properties', 'kind']);
  if (
    orphanKindSchema?.type !== 'string' ||
    (orphanKindSchema.minLength ?? 1) !== 1 ||
    !sameArray(orphanKindSchema.enum, NODE_KIND_VALUES) ||
    !/Restrict to one kind/i.test(orphanKindSchema.description || '') ||
    !/Omit for all kinds/i.test(orphanKindSchema.description || '')
  ) {
    return 'find_orphans.kind schema guidance drift';
  }
  if (findOrphansTool.outputSchema?.type !== 'object') {
    return 'find_orphans outputSchema root drift';
  }
  if (!sameArray(findOrphansTool.outputSchema?.required, ['total', 'orphans'])) {
    return 'find_orphans outputSchema required drift';
  }
  if (findOrphansTool.outputSchema?.additionalProperties !== false) {
    return 'find_orphans outputSchema root openness drift';
  }
  const orphansTotalSchema = outputPropertyAt(findOrphansTool, ['properties', 'total']);
  if (orphansTotalSchema?.type !== 'integer' || orphansTotalSchema.minimum !== 0) {
    return 'find_orphans outputSchema total drift';
  }
  const orphansRowsSchema = outputPropertyAt(findOrphansTool, ['properties', 'orphans']);
  if (
    orphansRowsSchema?.type !== 'array' ||
    orphansRowsSchema.items?.type !== 'object' ||
    !sameArray(orphansRowsSchema.items?.required, ['uid', 'slug', 'kind', 'title', 'mtime'])
  ) {
    return 'find_orphans outputSchema rows drift';
  }
  if (orphansRowsSchema.items?.additionalProperties !== false) {
    return 'find_orphans outputSchema row openness drift';
  }
  if (orphansRowsSchema.items?.properties?.uid?.type !== 'string' || orphansRowsSchema.items?.properties?.uid?.pattern !== NODE_UID_PATTERN) {
    return 'find_orphans outputSchema row uid drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (orphansRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_orphans outputSchema row ${propertyName} drift`;
    }
  }
  if (orphansRowsSchema.items?.properties?.mtime?.type !== 'number' || orphansRowsSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'find_orphans outputSchema row mtime drift';
  }
  const excludeKinds = propertyAt(findOrphansTool, ['properties', 'excludeKinds']);
  if (
    excludeKinds?.type !== 'array' ||
    excludeKinds?.items?.type !== 'string' ||
    !sameArray(excludeKinds?.items?.enum, NODE_KIND_VALUES)
  ) {
    return 'find_orphans.excludeKinds schema drift';
  }
  if (!/project/.test(excludeKinds.description || '') || !/vault-readme/.test(excludeKinds.description || '')) {
    return 'find_orphans.excludeKinds default description drift';
  }
  return null;
}
