#!/usr/bin/env node
/**
 * MCP server verify CLI — UX-3.
 *
 * 사용자가 .mcp.json 등록 후 *서버가 정상* 인지 1 명령으로 확인.
 *
 * 사용법:
 *   node mcp/scripts/verify.mjs                    # vault = cwd
 *   node mcp/scripts/verify.mjs ./docs/ontology    # vault = positional arg
 *   node mcp/scripts/verify.mjs --vault ./docs/ontology
 *   node mcp/scripts/verify.mjs ./docs/ontology --timeout-ms 15000
 *   OMOT_VAULT=./docs/ontology node mcp/scripts/verify.mjs
 *   OMOT_VERIFY_TIMEOUT_MS=15000 npm run verify    # larger/slower vaults
 *
 * 검증 항목:
 *   1. parser smoke test (parser.test.mjs) 통과
 *   2. server boot — initialize JSON-RPC 응답
 *   3. tools/list — 23 도구 모두 노출 + graph-query enum schema contract + strict argument/enum runtime smoke
 *   4. tools/call list_concepts — vault 노드 수 출력
 *   5. tools/call list_concepts(kind=project) — project_scope gate probe
 *   6. tools/call get_concepts — batch reader success + partial-row contract
 *   7. tools/call find_orphans — row shape + root/sentinel default-exclusion contract
 *   8. tools/call list_kinds — kind census aggregate
 *   9. tools/call validate_vault — whole-vault frontmatter / graph-reference health
 *   10. tools/call query_ontology workspace_brief + tuned workspace_brief + health + tuned health — agent first-contact graph diagnosis
 *   11. tools/call compile_ontology(summary) — compiler graph summary contract
 *   12. tools/call query_ontology overview + query_plan(overview/project_map) — graph-query smoke contract
 *   13. tools/call query_ontology neighbors/node-to-project path/project_scope — core graph query smoke contract
 *
 * 모두 PASS → exit 0, 실패 → exit 1 + 진단 메시지.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import {
  hasAnyErrorResponse,
  hasAllResultResponses,
  missingResponseLabels,
  parseJsonRpcResponses,
} from './json-rpc-lines.mjs';
import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
} from '../src/ontology-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const PARSER_TEST = join(MCP_ROOT, 'src', 'parser.test.mjs');
const SERVER_ENTRY = join(MCP_ROOT, 'src', 'index.js');
const IS_MAIN = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
const VERIFY_ARGS = parseVerifyArgs({ isMain: IS_MAIN });
const VAULT = VERIFY_ARGS.vault;
const VERIFY_TIMEOUT_MS_RAW = VERIFY_ARGS.timeoutMsRaw;
const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);

export const EXPECTED_READ_TOOLS = [
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'find_orphans',
  'query_concepts',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'analyze_repo_structure',
  'infer_imports',
];

export const EXPECTED_WRITE_TOOLS = [
  'add_concept',
  'add_concepts',
  'add_relation',
  'add_relations',
  'patch_concept',
  'delete_concept',
  'rename_concept',
  'merge_concepts',
];

export const EXPECTED_TOOLS = [...EXPECTED_READ_TOOLS, ...EXPECTED_WRITE_TOOLS];
export const EXPECTED_DESTRUCTIVE_TOOLS = [
  'delete_concept',
  'merge_concepts',
  'rename_concept',
];
export const EXPECTED_IDEMPOTENT_TOOLS = [
  'add_relation',
  'add_relations',
];

export function expectedToolSplitLabel() {
  return `${EXPECTED_READ_TOOLS.length} read + ${EXPECTED_WRITE_TOOLS.length} write`;
}

export function expectedToolTitle(name) {
  return String(name || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function maintenanceBucketOutputSummary(parsed) {
  const summarize = (bucket) => {
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return 'n/a';
    const entries = Object.entries(bucket)
      .filter(([, count]) => Number.isInteger(count) && count > 0)
      .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey));
    return entries.length > 0 ? entries.map(([key, count]) => `${key}:${count}`).join(',') : 'none';
  };
  return `phase ${summarize(parsed?.byPhase)}; severity ${summarize(parsed?.bySeverity)}; kind ${summarize(parsed?.byKind)}`;
}

export function maintenanceNextActionOutputSummary(parsed) {
  const summarize = (action) => {
    if (action === null) return 'none';
    if (!action || typeof action !== 'object' || Array.isArray(action)) return 'n/a';
    const id = typeof action.id === 'string' && action.id.length > 0 ? action.id : 'unknown';
    const phase = typeof action.phase === 'string' && action.phase.length > 0 ? action.phase : 'unknown';
    const kind = typeof action.kind === 'string' && action.kind.length > 0 ? action.kind : 'unknown';
    const severity = typeof action.severity === 'string' && action.severity.length > 0 ? action.severity : 'unknown';
    const tool = typeof action.proposedAction?.tool === 'string' && action.proposedAction.tool.length > 0
      ? `->${action.proposedAction.tool}`
      : '';
    return `${id}:${phase}/${kind}:${severity}${tool}`;
  };
  return `executable ${summarize(parsed?.nextExecutableAction)}; review ${summarize(parsed?.nextReviewAction)}`;
}

function sameArray(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function propertyAt(tool, path) {
  return path.reduce((value, key) => value?.[key], tool?.inputSchema);
}

function outputPropertyAt(tool, path) {
  return path.reduce((value, key) => value?.[key], tool?.outputSchema);
}

export function toolsListSchemaFailure(tools) {
  if (!Array.isArray(tools)) return 'tools/list response missing tools array';
  const schemaDriftTool = tools.find((tool) => tool?.inputSchema?.additionalProperties !== false);
  if (schemaDriftTool) {
    return `tools/list schema missing additionalProperties:false: ${schemaDriftTool.name || '(unknown)'}`;
  }
  const titleDriftTool = tools.find((tool) => tool?.annotations?.title !== expectedToolTitle(tool?.name));
  if (titleDriftTool) {
    return `tools/list title annotation drift: ${titleDriftTool.name || '(unknown)'}`;
  }
  const expectedReadTools = new Set(EXPECTED_READ_TOOLS);
  const annotationDriftTool = tools.find((tool) => tool?.annotations?.readOnlyHint !== expectedReadTools.has(tool?.name));
  if (annotationDriftTool) {
    return `tools/list readOnlyHint annotation drift: ${annotationDriftTool.name || '(unknown)'}`;
  }
  const openWorldDriftTool = tools.find((tool) => tool?.annotations?.openWorldHint !== false);
  if (openWorldDriftTool) {
    return `tools/list openWorldHint annotation drift: ${openWorldDriftTool.name || '(unknown)'}`;
  }
  const expectedDestructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
  const destructiveDriftTool = tools.find((tool) => tool?.annotations?.destructiveHint !== expectedDestructiveTools.has(tool?.name));
  if (destructiveDriftTool) {
    return `tools/list destructiveHint annotation drift: ${destructiveDriftTool.name || '(unknown)'}`;
  }
  const expectedIdempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
  const idempotentDriftTool = tools.find((tool) => tool?.annotations?.idempotentHint !== expectedIdempotentTools.has(tool?.name));
  if (idempotentDriftTool) {
    return `tools/list idempotentHint annotation drift: ${idempotentDriftTool.name || '(unknown)'}`;
  }

  const listConceptsTool = tools.find((tool) => tool?.name === 'list_concepts');
  if (!listConceptsTool) return 'tools/list response missing list_concepts tool';
  if (listConceptsTool.outputSchema?.type !== 'object') {
    return 'list_concepts outputSchema root drift';
  }
  if (!sameArray(listConceptsTool.outputSchema?.required, ['total', 'vaultRoot', 'nodes'])) {
    return 'list_concepts outputSchema required drift';
  }
  const listTotalSchema = outputPropertyAt(listConceptsTool, ['properties', 'total']);
  if (listTotalSchema?.type !== 'integer' || listTotalSchema.minimum !== 0) {
    return 'list_concepts outputSchema total drift';
  }
  const listVaultRootSchema = outputPropertyAt(listConceptsTool, ['properties', 'vaultRoot']);
  if (listVaultRootSchema?.type !== 'string' || listVaultRootSchema.minLength !== 1) {
    return 'list_concepts outputSchema vaultRoot drift';
  }
  const listNodesSchema = outputPropertyAt(listConceptsTool, ['properties', 'nodes']);
  if (listNodesSchema?.type !== 'array' || listNodesSchema.items?.type !== 'object' || !sameArray(listNodesSchema.items?.required, ['slug', 'kind', 'title', 'mtime'])) {
    return 'list_concepts outputSchema nodes drift';
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
  for (const propertyName of ['errorCount', 'warningCount']) {
    const countSchema = vaultWarningsSchema.properties?.[propertyName];
    if (countSchema?.type !== 'integer' || countSchema.minimum !== 0) {
      return `list_concepts outputSchema vaultWarnings ${propertyName} drift`;
    }
  }

  const getConceptTool = tools.find((tool) => tool?.name === 'get_concept');
  if (!getConceptTool) return 'tools/list response missing get_concept tool';
  if (getConceptTool.outputSchema?.type !== 'object') {
    return 'get_concept outputSchema root drift';
  }
  if (!sameArray(getConceptTool.outputSchema?.required, ['slug', 'frontmatter', 'excerpt', 'neighbors', 'outgoingEdges', 'mtime'])) {
    return 'get_concept outputSchema required drift';
  }
  for (const propertyName of ['slug', 'excerpt']) {
    if (outputPropertyAt(getConceptTool, ['properties', propertyName])?.type !== 'string') {
      return `get_concept outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(getConceptTool, ['properties', 'frontmatter'])?.type !== 'object') {
    return 'get_concept outputSchema frontmatter drift';
  }
  const getConceptNeighborsSchema = outputPropertyAt(getConceptTool, ['properties', 'neighbors']);
  if (
    getConceptNeighborsSchema?.type !== 'object' ||
    !sameArray(getConceptNeighborsSchema.required, ['domains', 'domain', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes'])
  ) {
    return 'get_concept outputSchema neighbors drift';
  }
  for (const propertyName of ['domains', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes']) {
    const neighborSchema = getConceptNeighborsSchema.properties?.[propertyName];
    if (neighborSchema?.type !== 'array' || neighborSchema.items?.type !== 'string') {
      return `get_concept outputSchema neighbors ${propertyName} drift`;
    }
  }
  const getConceptEdgesSchema = outputPropertyAt(getConceptTool, ['properties', 'outgoingEdges']);
  if (getConceptEdgesSchema?.type !== 'array' || !sameArray(getConceptEdgesSchema.items?.required, ['to', 'via'])) {
    return 'get_concept outputSchema outgoingEdges drift';
  }
  const getConceptMtimeSchema = outputPropertyAt(getConceptTool, ['properties', 'mtime']);
  if (getConceptMtimeSchema?.type !== 'number' || getConceptMtimeSchema.minimum !== 0) {
    return 'get_concept outputSchema mtime drift';
  }

  const getConceptsTool = tools.find((tool) => tool?.name === 'get_concepts');
  if (!getConceptsTool) return 'tools/list response missing get_concepts tool';
  if (getConceptsTool.outputSchema?.type !== 'object') {
    return 'get_concepts outputSchema root drift';
  }
  if (!sameArray(getConceptsTool.outputSchema?.required, ['concepts'])) {
    return 'get_concepts outputSchema required drift';
  }
  const getConceptsItemsSchema = outputPropertyAt(getConceptsTool, ['properties', 'concepts', 'items']);
  if (outputPropertyAt(getConceptsTool, ['properties', 'concepts'])?.type !== 'array' || getConceptsItemsSchema?.type !== 'object') {
    return 'get_concepts outputSchema concepts drift';
  }
  if (!sameArray(getConceptsItemsSchema.required, ['ok', 'slug'])) {
    return 'get_concepts outputSchema row required drift';
  }
  if (getConceptsItemsSchema.properties?.ok?.type !== 'boolean') {
    return 'get_concepts outputSchema row ok drift';
  }
  if (getConceptsItemsSchema.properties?.slug?.type !== 'string') {
    return 'get_concepts outputSchema row slug drift';
  }
  if (getConceptsItemsSchema.properties?.mtime?.type !== 'number' || getConceptsItemsSchema.properties?.mtime?.minimum !== 0) {
    return 'get_concepts outputSchema row mtime drift';
  }
  if (getConceptsItemsSchema.properties?.frontmatter?.type !== 'object') {
    return 'get_concepts outputSchema row frontmatter drift';
  }
  if (getConceptsItemsSchema.properties?.outgoingEdges?.type !== 'array' || !sameArray(getConceptsItemsSchema.properties?.outgoingEdges?.items?.required, ['to', 'via'])) {
    return 'get_concepts outputSchema row outgoingEdges drift';
  }

  const queryTool = tools.find((tool) => tool?.name === 'query_ontology');
  if (!queryTool) return 'tools/list response missing query_ontology tool';

  const listKindsTool = tools.find((tool) => tool?.name === 'list_kinds');
  if (!listKindsTool) return 'tools/list response missing list_kinds tool';
  if (listKindsTool.outputSchema?.type !== 'object') {
    return 'list_kinds outputSchema root drift';
  }
  if (!sameArray(listKindsTool.outputSchema?.required, ['total', 'byKind'])) {
    return 'list_kinds outputSchema required drift';
  }
  const totalSchema = outputPropertyAt(listKindsTool, ['properties', 'total']);
  if (totalSchema?.type !== 'integer' || totalSchema.minimum !== 0) {
    return 'list_kinds outputSchema total drift';
  }
  const byKindSchema = outputPropertyAt(listKindsTool, ['properties', 'byKind']);
  if (byKindSchema?.type !== 'object' || byKindSchema.additionalProperties?.type !== 'integer' || byKindSchema.additionalProperties?.minimum !== 0) {
    return 'list_kinds outputSchema byKind drift';
  }

  const validateTool = tools.find((tool) => tool?.name === 'validate_vault');
  if (!validateTool) return 'tools/list response missing validate_vault tool';
  if (validateTool.outputSchema?.type !== 'object') {
    return 'validate_vault outputSchema root drift';
  }
  if (!sameArray(validateTool.outputSchema?.required, ['scanned', 'problems', 'summary'])) {
    return 'validate_vault outputSchema required drift';
  }
  const scannedSchema = outputPropertyAt(validateTool, ['properties', 'scanned']);
  if (scannedSchema?.type !== 'integer' || scannedSchema.minimum !== 0) {
    return 'validate_vault outputSchema scanned drift';
  }
  const problemsSchema = outputPropertyAt(validateTool, ['properties', 'problems']);
  if (problemsSchema?.type !== 'array' || problemsSchema.items?.type !== 'object' || !sameArray(problemsSchema.items?.required, ['slug', 'issues'])) {
    return 'validate_vault outputSchema problems drift';
  }
  const summarySchema = outputPropertyAt(validateTool, ['properties', 'summary']);
  if (summarySchema?.type !== 'object' || !sameArray(summarySchema.required, ['problemFiles', 'errorFiles', 'warningFiles', 'byCode'])) {
    return 'validate_vault outputSchema summary drift';
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
  if (!sameArray(byCodeSchema.additionalProperties?.required, ['severity', 'count', 'files'])) {
    return 'validate_vault outputSchema byCode entry required drift';
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
  if (!/current-page `nextExecutableAction` \/ `nextReviewAction` pointers/.test(queryTool.description || '')) {
    return 'query_ontology description missing current-page maintenance next pointers';
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
  if (!/nextExecutableAction\/nextReviewAction point only at the first executable\/review action in the returned page/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing current-page next pointers';
  }
  if (!/action id, executable flag, phase, kind, and severity/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing current-page next pointer detail fields';
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
    if (option?.type !== 'array' || option.items?.type !== 'string') {
      return `query_ontology ${propertyName} health tuning schema drift`;
    }
    if (!/health\/workspace_brief/.test(option.description || '')) {
      return `query_ontology ${propertyName} health tuning description drift`;
    }
  }

  const findOrphansTool = tools.find((candidate) => candidate?.name === 'find_orphans');
  if (!findOrphansTool) return 'tools/list response missing find_orphans tool';
  const excludeKinds = propertyAt(findOrphansTool, ['properties', 'excludeKinds']);
  if (excludeKinds?.type !== 'array' || excludeKinds?.items?.type !== 'string') {
    return 'find_orphans.excludeKinds schema drift';
  }
  if (!/project/.test(excludeKinds.description || '') || !/vault-readme/.test(excludeKinds.description || '')) {
    return 'find_orphans.excludeKinds default description drift';
  }

  for (const [toolName, propertyName] of [
    ['get_concepts', 'slugs'],
    ['add_concepts', 'concepts'],
    ['add_relations', 'relations'],
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    if (!sameArray(tool.inputSchema?.required, [propertyName])) {
      return `${toolName} required schema drift`;
    }
    const batchProperty = propertyAt(tool, ['properties', propertyName]);
    if (batchProperty?.type !== 'array' || batchProperty?.maxItems !== 50) {
      return `${toolName}.${propertyName} batch cap schema drift`;
    }
  }

  for (const toolName of [
    'add_relation',
    'patch_concept',
    'rename_concept',
    'merge_concepts',
    'delete_concept',
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    const expectedMtime = propertyAt(tool, ['properties', 'expected_mtime']);
    if (expectedMtime?.type !== 'number' || expectedMtime?.minimum !== 0) {
      return `${toolName}.expected_mtime conflict guard schema drift`;
    }
  }

  const addRelations = tools.find((candidate) => candidate?.name === 'add_relations');
  const rowExpectedMtime = propertyAt(addRelations, [
    'properties',
    'relations',
    'items',
    'properties',
    'expected_mtime',
  ]);
  if (rowExpectedMtime?.type !== 'number' || rowExpectedMtime?.minimum !== 0) {
    return 'add_relations row expected_mtime conflict guard schema drift';
  }

  for (const toolName of ['rename_concept', 'merge_concepts', 'delete_concept']) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    const confirm = propertyAt(tool, ['properties', 'confirm']);
    if (confirm?.type !== 'boolean') {
      return `${toolName}.confirm dry-run safety schema drift`;
    }
  }

  const deleteTool = tools.find((candidate) => candidate?.name === 'delete_concept');
  const force = propertyAt(deleteTool, ['properties', 'force']);
  if (force?.type !== 'boolean') {
    return 'delete_concept.force destructive safety schema drift';
  }

  const renameTool = tools.find((candidate) => candidate?.name === 'rename_concept');
  const overwrite = propertyAt(renameTool, ['properties', 'overwrite']);
  if (overwrite?.type !== 'boolean') {
    return 'rename_concept.overwrite destructive safety schema drift';
  }

  for (const toolName of [
    'add_concept',
    'add_concepts',
    'add_relation',
    'add_relations',
    'patch_concept',
    'rename_concept',
    'merge_concepts',
    'delete_concept',
  ]) {
    const tool = tools.find((candidate) => candidate?.name === toolName);
    if (!tool) return `tools/list response missing ${toolName} tool`;
    const description = tool.description || '';
    if (!/postWriteMaintenance/.test(description)) {
      return `${toolName} description missing postWriteMaintenance guidance`;
    }
    if (!/score/.test(description)) {
      return `${toolName} description missing maintenance action score guidance`;
    }
    if (!/proposedAction/.test(description)) {
      return `${toolName} description missing executable maintenance proposedAction guidance`;
    }
    if (!/next action pointers|nextExecutableAction/.test(description)) {
      return `${toolName} description missing maintenance next action pointer guidance`;
    }
  }

  return null;
}

export function strictArgsFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict arguments response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/Unknown argument "lmit" for list_concepts/i.test(text)) {
    return 'strict arguments response did not report the unknown list_concepts argument';
  }
  if (!/Did you mean "limit"\?/i.test(text)) {
    return 'strict arguments response did not suggest the closest list_concepts argument';
  }
  return null;
}

export function strictEnumFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict enum response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/operation must be one of/i.test(text) || !/overveiw/i.test(text)) {
    return 'strict enum response did not report the invalid query_ontology operation';
  }
  if (!/Did you mean "overview"\?/i.test(text)) {
    return 'strict enum response did not suggest the closest query_ontology operation';
  }
  return null;
}

export function strictMaintenanceFilterFailure(response, field = 'phases') {
  if (response?.result?.isError !== true) {
    return 'strict maintenance filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  const allowedPattern = field === 'severities'
    ? new RegExp(MAINTENANCE_SEVERITY_VALUES.join(', '), 'i')
    : field === 'kinds'
      ? new RegExp(MAINTENANCE_KIND_VALUES.join(', '), 'i')
      : new RegExp(MAINTENANCE_PHASE_VALUES.join(', '), 'i');
  if (!new RegExp(`${field} items must be one of`, 'i').test(text)) {
    return `strict maintenance filter response did not report the invalid maintenance_plan ${field} filter`;
  }
  if (!allowedPattern.test(text)) {
    return `strict maintenance filter response did not list allowed maintenance_plan ${field}`;
  }
  return null;
}

export function maintenanceMissingCursorFailure(parsed) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance missing-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance missing-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.found !== false) {
    return 'maintenance missing-cursor smoke did not report cursor.found=false';
  }
  if (parsed.cursor?.reason !== 'afterActionId not found in filtered maintenance actions') {
    return 'maintenance missing-cursor smoke did not report the cursor miss reason';
  }
  if (parsed.cursor?.startIndex !== null) {
    return 'maintenance missing-cursor smoke should not expose a startIndex';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance missing-cursor smoke response missing actions array';
  }
  if (parsed.actions.length !== 0) {
    return 'maintenance missing-cursor smoke returned actions';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance missing-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance missing-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.summary?.remainingActions !== 0) {
    return 'maintenance missing-cursor smoke should have zero remaining actions';
  }
  if (parsed.nextExecutableAction !== null || parsed.nextReviewAction !== null) {
    return 'maintenance missing-cursor smoke should not expose next actions';
  }
  return null;
}

export function maintenanceReadyCursorFailure(parsed) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance ready-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance ready-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.found !== true) {
    return 'maintenance ready-cursor smoke did not report cursor.found=true';
  }
  if (!Object.hasOwn(parsed.cursor || {}, 'reason') || parsed.cursor.reason !== null) {
    return 'maintenance ready-cursor smoke did not expose cursor.reason=null';
  }
  if (parsed.cursor?.afterActionId !== null) {
    return 'maintenance ready-cursor smoke should start without afterActionId';
  }
  if (parsed.cursor?.startIndex !== 0) {
    return 'maintenance ready-cursor smoke should start at index 0';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance ready-cursor smoke response missing actions array';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance ready-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance ready-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.actions.length > parsed.summary.remainingActions) {
    return 'maintenance ready-cursor smoke actions exceed remainingActions';
  }
  if (!Object.hasOwn(parsed, 'nextExecutableAction') || !Object.hasOwn(parsed, 'nextReviewAction')) {
    return 'maintenance ready-cursor smoke missing next action pointers';
  }
  const nextExecutableFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === true) ?? null,
    parsed.nextExecutableAction,
    'nextExecutableAction',
    true,
  );
  if (nextExecutableFailure) return nextExecutableFailure;
  const nextReviewFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === false) ?? null,
    parsed.nextReviewAction,
    'nextReviewAction',
    false,
  );
  if (nextReviewFailure) return nextReviewFailure;
  return null;
}

function maintenanceSummaryFailure(summary, label) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return `${label} missing summary`;
  }
  for (const key of [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
    'compileIssues',
    'dependencyCycles',
    'canonicalizationActions',
    'danglingReferences',
    'relationRecommendations',
    'externalElementRefs',
    'externalElementRefsIgnored',
    'unassignedNodes',
    'emptyDomains',
  ]) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      return `${label} summary missing non-negative integer ${key}`;
    }
  }
  if (summary.executableActions + summary.reviewActions !== summary.totalActions) {
    return `${label} summary executable/review counts do not add up`;
  }
  if (summary.filteredActions > summary.totalActions) {
    return `${label} summary filteredActions exceeds totalActions`;
  }
  if (summary.remainingActions > summary.filteredActions) {
    return `${label} summary remainingActions exceeds filteredActions`;
  }
  return null;
}

function maintenanceBucketSummaryFailure(parsed, label) {
  for (const key of ['byPhase', 'bySeverity', 'byKind']) {
    const bucket = parsed?.[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      return `${label} missing ${key}`;
    }
    let total = 0;
    for (const [bucketKey, count] of Object.entries(bucket)) {
      if (!Number.isInteger(count) || count < 0) {
        return `${label} ${key} missing non-negative integer count: ${bucketKey}`;
      }
      total += count;
    }
    if (total !== parsed.summary.remainingActions) {
      return `${label} ${key} total does not match remainingActions`;
    }
  }
  return null;
}

function maintenanceNextActionFailure(expectedAction, pointer, label, executable) {
  if (!expectedAction) {
    if (pointer !== null) {
      return `maintenance ready-cursor smoke unexpected ${label}`;
    }
    return null;
  }
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    return `maintenance ready-cursor smoke missing ${label}`;
  }
  if (pointer.id !== expectedAction.id) {
    return `maintenance ready-cursor smoke ${label} did not match first page action`;
  }
  if (pointer.executable !== executable) {
    return `maintenance ready-cursor smoke ${label} executable flag mismatch`;
  }
  for (const key of ['phase', 'kind', 'severity']) {
    if (
      typeof expectedAction[key] === 'string' &&
      expectedAction[key].length > 0 &&
      pointer[key] !== expectedAction[key]
    ) {
      return `maintenance ready-cursor smoke ${label} ${key} mismatch`;
    }
  }
  return null;
}

export function maintenanceFilterEnumSummary() {
  return [
    `phases=${MAINTENANCE_PHASE_VALUES.join('/')}`,
    `severities=${MAINTENANCE_SEVERITY_VALUES.join('/')}`,
    `kinds=${MAINTENANCE_KIND_VALUES.join('/')}`,
  ].join('; ');
}

export function initializeInstructionsFailure(response) {
  const instructions = response?.result?.instructions;
  if (typeof instructions !== 'string' || instructions.length < 200) {
    return 'initialize instructions missing or too short';
  }

  const required = [
    ['read-only first-contact diagnosis', /read-only first-contact diagnosis/i],
    ['overwrite safety', /overwrite: true/],
    ['existing newSlug safety', /existing `newSlug`|existing newSlug/i],
    ['force safety', /force: true/],
    ['dangling referrers safety', /dangling referrers/i],
    ['expected_mtime conflict guard', /expected_mtime/],
    ['strict arguments guidance', /unknown arguments are rejected/i],
    ['nearest argument hint guidance', /Did you mean "limit"\?/],
    ['nearest enum hint guidance', /Did you mean "overview"\?/],
    ['maintenance filter enum guidance', /phases.*severities.*kinds/],
    ['health tuning guidance', /componentLimit[\s\S]*cycleLimit[\s\S]*recommendationLimit[\s\S]*orderLimit[\s\S]*nodeLimit[\s\S]*dependencyTypes[\s\S]*componentTypes/],
    ['maintenance ready cursor guidance', /cursor\.found=true[\s\S]*cursor\.reason=null/],
    ['maintenance current-page pointer guidance', /nextExecutableAction[\s\S]*nextReviewAction[\s\S]*current returned page/],
    ['maintenance cursor miss guidance', /afterActionId[\s\S]*cursor\.found=false[\s\S]*cursor\.reason/],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(instructions)) {
      return `initialize instructions missing ${label}`;
    }
  }
  return null;
}

export const FIRST_CONTACT_RESPONSE_LABELS = new Map([
  [1, 'initialize'],
  [2, 'tools/list'],
  [3, 'list_concepts'],
  [4, 'list_kinds'],
  [5, 'validate_vault'],
  [6, 'workspace_brief'],
  [7, 'health'],
  [8, 'compile_ontology'],
  [9, 'overview'],
  [10, 'overview_query_plan'],
  [11, 'get_concepts'],
  [12, 'project_map_query_plan'],
  [13, 'neighbors'],
  [14, 'path'],
  [15, 'project_scope'],
  [16, 'strict_args'],
  [17, 'strict_enum'],
  [18, 'project_probe'],
  [19, 'find_orphans'],
  [20, 'health_tuned'],
  [21, 'workspace_brief_tuned'],
  [22, 'strict_maintenance_phase_filter'],
  [23, 'strict_maintenance_severity_filter'],
  [24, 'strict_maintenance_kind_filter'],
  [25, 'maintenance_missing_cursor'],
  [26, 'maintenance_ready_cursor'],
]);

function log(level, msg) {
  const tag =
    level === 'ok' ? '\x1b[32m✓\x1b[0m' :
    level === 'fail' ? '\x1b[31m✗\x1b[0m' :
    level === 'info' ? '·' : '?';
  console.log(`${tag} ${msg}`);
}

export function parseVerifyTimeoutMs(value, fallback = 8000) {
  if (value == null || value === '') return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

export function resolveVerifyVault({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  isMain = false,
} = {}) {
  return parseVerifyArgs({ env, argv, cwd, isMain }).vault;
}

export function parseVerifyArgs({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  isMain = false,
} = {}) {
  const args = isMain ? argv.slice(2) : [];
  let help = false;
  let error = null;
  let positionalVault = null;
  let timeoutMsRaw = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--timeout-ms') {
      const value = args[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
        error = '--timeout-ms requires a positive integer value';
        break;
      }
      timeoutMsRaw = value;
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      const value = arg.slice('--timeout-ms='.length);
      if (value.length === 0) {
        error = '--timeout-ms requires a positive integer value';
        break;
      }
      timeoutMsRaw = value;
    } else if (arg === '--vault') {
      const value = parseVerifyVaultArg(args[index + 1]);
      if (value === false) {
        error = '--vault requires a path value';
        break;
      }
      if (positionalVault) {
        error = `Unexpected extra vault argument: ${value}`;
        break;
      }
      positionalVault = value;
      index += 1;
    } else if (arg.startsWith('--vault=')) {
      const value = parseVerifyVaultArg(arg.slice('--vault='.length));
      if (value === false) {
        error = '--vault requires a path value';
        break;
      }
      if (positionalVault) {
        error = `Unexpected extra vault argument: ${value}`;
        break;
      }
      positionalVault = value;
    } else if (arg.startsWith('-')) {
      error = `Unknown option: ${arg}`;
      break;
    } else if (positionalVault) {
      error = `Unexpected extra vault argument: ${arg}`;
      break;
    } else {
      const value = parseVerifyVaultArg(arg);
      if (value === false) {
        error = 'vault argument requires a path value';
        break;
      }
      positionalVault = value;
    }
  }

  const envVault = help || positionalVault
    ? { error: null, vault: null }
    : parseOptionalVerifyVaultEnv(env.OMOT_VAULT);
  return {
    error: error ?? envVault.error,
    help,
    timeoutMsRaw: timeoutMsRaw ?? env.OMOT_VERIFY_TIMEOUT_MS,
    vault: positionalVault ?? envVault.vault ?? cwd,
  };
}

function parseOptionalVerifyVaultEnv(value) {
  if (typeof value !== 'string' || value.length === 0) return { error: null, vault: null };
  const vault = parseVerifyVaultArg(value);
  if (vault === false) return { error: 'OMOT_VAULT requires a path value', vault: null };
  return { error: null, vault };
}

function parseVerifyVaultArg(value) {
  const path = String(value ?? '').trim();
  if (!path || path.startsWith('-')) return false;
  return path;
}

export function verifyTimeoutFailure(timeoutMs) {
  return `server verify timed out after ${timeoutMs}ms. Increase --timeout-ms or OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.`;
}

export function verifyUsage() {
  return (
    '\nUsage:\n' +
    '  node mcp/scripts/verify.mjs [vault] [--timeout-ms N]\n' +
    '  node mcp/scripts/verify.mjs --vault path --timeout-ms 15000\n' +
    '  npm run verify -- [vault] [--timeout-ms N]\n' +
    '  npm run verify -- --vault path --timeout-ms 15000\n\n' +
    'Runs the MCP server first-contact verification against the resolved vault.\n' +
    'Explicit [vault] or --vault arguments take precedence over OMOT_VAULT.\n' +
    'Checks parser smoke, server boot, tool inventory, project probe, batch reads, node census,\n' +
    'vault validation, workspace health, compile/overview, query plans, and graph-query smoke.\n' +
    'Also checks strict unknown-argument / invalid-enum rejection, maintenance_plan filter enums,\n' +
    'and maintenance_plan cursor handling: ready page (cursor.found=true, cursor.reason=null)\n' +
    'plus missing afterActionId (cursor.found=false, reason, empty page).\n' +
    'Ready cursor smoke also verifies nextExecutableAction / nextReviewAction point only at the first executable/review action in the current returned page.\n' +
    'Successful cursor lines print bucket summaries plus current-page executable/review next-action summaries.\n'
  );
}

export function serverStartupFailure(stderr) {
  const detail = String(stderr || '').trim().slice(0, 300);
  return detail ? `server failed before initialize. stderr: ${detail}` : 'no initialize response';
}

function firstContactLabelsForIds(ids) {
  const expectedIds = ids || FIRST_CONTACT_RESPONSE_LABELS.keys();
  return new Map(
    [...expectedIds].map((id) => [id, FIRST_CONTACT_RESPONSE_LABELS.get(id)]).filter(([, label]) => label),
  );
}

export function hasAllFirstContactResponses(stdout, expectedIds) {
  return hasAllResultResponses(stdout, new Set(firstContactLabelsForIds(expectedIds).keys()));
}

export function hasFirstContactErrorResponse(stdout, expectedIds) {
  return hasAnyErrorResponse(stdout, new Set(firstContactLabelsForIds(expectedIds).keys()));
}

export function firstContactMissingResponseLabels(responses, expectedIds) {
  return missingResponseLabels(
    responses.filter((response) => response?.result),
    firstContactLabelsForIds(expectedIds),
  );
}

export function buildFirstContactRequests() {
  return [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'verify-cli', version: '0' },
      },
    },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'list_kinds', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'validate_vault', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 18,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { kind: 'project', limit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 19,
      method: 'tools/call',
      params: { name: 'find_orphans', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 3 } },
    },
    {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'health' } },
    },
    {
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'workspace_brief',
          limit: 3,
          componentLimit: 3,
          cycleLimit: 3,
          recommendationLimit: 3,
          orderLimit: 3,
          nodeLimit: 3,
          dependencyTypes: ['dependencies'],
          componentTypes: ['domain', 'capabilities'],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'health',
          componentLimit: 3,
          cycleLimit: 3,
          recommendationLimit: 3,
          orderLimit: 3,
          dependencyTypes: ['dependencies'],
          componentTypes: ['domain', 'capabilities'],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { summary: true } },
    },
    {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'overview', limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'overview' } },
    },
    {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'query_plan', targetOperation: 'project_map' } },
    },
    {
      jsonrpc: '2.0',
      id: 16,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { lmit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 17,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'overveiw' } },
    },
    {
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', phases: ['repiar'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 23,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', severities: ['fatal'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 24,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', kinds: ['add_mising_relation'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 25,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', afterActionId: 'maint_missing', limit: 5 },
      },
    },
    {
      jsonrpc: '2.0',
      id: 26,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'maintenance_plan', limit: 5 },
      },
    },
  ];
}

export function buildGraphQuerySmokeArgs(listPayload, projectPayload = null) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const projectNodes = Array.isArray(projectPayload?.nodes) ? projectPayload.nodes : [];
  const candidateNodes = [...nodes, ...projectNodes];
  const projectSlug = nodes.find((node) => node?.kind === 'project' && typeof node.slug === 'string' && node.slug.length > 0)?.slug;
  const probedProjectSlug = projectNodes.find((node) => node?.kind === 'project' && typeof node.slug === 'string' && node.slug.length > 0)?.slug;
  const nonRootSlug = candidateNodes.find(
    (node) => (
      !['project', 'vault-readme'].includes(node?.kind)
      && typeof node?.slug === 'string'
      && node.slug.length > 0
    ),
  )?.slug;
  const resolvedProjectSlug = projectSlug || probedProjectSlug;
  const fallbackSlug = candidateNodes.find((node) => typeof node?.slug === 'string' && node.slug.length > 0)?.slug || null;
  const smokeSlug = nonRootSlug || resolvedProjectSlug || fallbackSlug;
  const pathTarget = resolvedProjectSlug && resolvedProjectSlug !== smokeSlug ? resolvedProjectSlug : smokeSlug;
  return {
    slug: smokeSlug,
    pathTarget,
    project: resolvedProjectSlug || null,
    hasNode: Boolean(smokeSlug),
    hasProject: Boolean(resolvedProjectSlug),
  };
}

export function buildGraphQuerySmokeRequests(graphSmoke) {
  const requests = [];
  const expectedResponseIds = [];
  if (graphSmoke?.hasNode) {
    requests.push(
      {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'query_ontology', arguments: { operation: 'neighbors', slug: graphSmoke.slug, limit: 5 } },
      },
      {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: { name: 'query_ontology', arguments: { operation: 'path', from: graphSmoke.slug, to: graphSmoke.pathTarget || graphSmoke.slug } },
      },
    );
    expectedResponseIds.push(13, 14);
  }
  if (graphSmoke?.hasProject) {
    requests.push({
      jsonrpc: '2.0',
      id: 15,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'project_scope', project: graphSmoke.project, limit: 5 } },
    });
    expectedResponseIds.push(15);
  }
  return { requests, expectedResponseIds };
}

function allGraphQuerySmokeResponseIds() {
  return buildGraphQuerySmokeRequests({
    slug: 'verify-smoke-node',
    pathTarget: 'verify-smoke-project',
    project: 'verify-smoke-project',
    hasNode: true,
    hasProject: true,
  }).expectedResponseIds;
}

export function firstContactErrorFailure(response) {
  const label = FIRST_CONTACT_RESPONSE_LABELS.get(response?.id) || `id ${response?.id}`;
  const message = response?.error?.message || JSON.stringify(response?.error || {});
  return `${label} returned JSON-RPC error: ${message}`;
}

function verifyTimeoutMs() {
  return parseVerifyTimeoutMs(VERIFY_TIMEOUT_MS_RAW);
}

export function vaultWarningsFailure(parsed) {
  const warnings = parsed?.vaultWarnings;
  if (!warnings) return null;
  if (typeof warnings !== 'object' || Array.isArray(warnings)) {
    return 'list_concepts vaultWarnings malformed';
  }
  if (!Number.isInteger(warnings.errorCount) || warnings.errorCount < 0) {
    return 'list_concepts vaultWarnings missing errorCount';
  }
  if (!Number.isInteger(warnings.warningCount) || warnings.warningCount < 0) {
    return 'list_concepts vaultWarnings missing warningCount';
  }
  const errorCount = warnings.errorCount;
  const warningCount = warnings.warningCount;
  if (errorCount === 0 && warningCount === 0) return null;
  return `list_concepts vaultWarnings present — errors ${errorCount}, warnings ${warningCount}. Run validate_vault for file-level diagnostics before writing.`;
}

export function listKindsFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_kinds response missing total count';
  }
  if (!parsed.byKind || typeof parsed.byKind !== 'object' || Array.isArray(parsed.byKind)) {
    return 'list_kinds response missing byKind aggregate';
  }
  let sum = 0;
  for (const [kind, count] of Object.entries(parsed.byKind)) {
    if (typeof kind !== 'string' || kind.length === 0) {
      return 'list_kinds response has empty kind key';
    }
    if (!Number.isInteger(count) || count < 0) {
      return `list_kinds response missing count for kind: ${kind || 'unknown'}`;
    }
    sum += count;
  }
  if (sum !== parsed.total) {
    return `list_kinds response total mismatch — total ${parsed.total}, byKind ${sum}`;
  }
  return null;
}

export function listConceptsFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'list_concepts response missing total count';
  }
  if (typeof parsed.vaultRoot !== 'string' || parsed.vaultRoot.length === 0) {
    return 'list_concepts response missing vaultRoot';
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'list_concepts response missing nodes array';
  }
  if (parsed.nodes.length > parsed.total) {
    return `list_concepts response node count exceeds total — nodes ${parsed.nodes.length}, total ${parsed.total}`;
  }
  for (const [index, node] of parsed.nodes.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return `list_concepts response malformed node at index ${index}`;
    }
    if (typeof node.slug !== 'string' || node.slug.length === 0) {
      return `list_concepts response missing node slug at index ${index}`;
    }
    if (typeof node.kind !== 'string' || node.kind.length === 0) {
      return `list_concepts response missing node kind: ${node.slug}`;
    }
    if (typeof node.title !== 'string' || node.title.length === 0) {
      return `list_concepts response missing node title: ${node.slug}`;
    }
    if (!Number.isFinite(node.mtime) || node.mtime < 0) {
      return `list_concepts response missing node mtime: ${node.slug}`;
    }
  }
  return vaultWarningsFailure(parsed);
}

export function projectProbeFailure(parsed, kinds) {
  const shapeFailure = listConceptsFailure(parsed);
  if (shapeFailure) return `project probe ${shapeFailure}`;
  const kindProjectCount = Number.isInteger(kinds?.byKind?.project) ? kinds.byKind.project : 0;
  if (kindProjectCount === 0 && parsed.total === 0) {
    return null;
  }
  if (parsed.total < 1) {
    return 'project probe response missing project node';
  }
  const nonProject = parsed.nodes.find((node) => node?.kind !== 'project');
  if (nonProject) {
    return `project probe returned non-project node: ${nonProject.slug || '(unknown)'}`;
  }
  if (Number.isInteger(kindProjectCount) && parsed.total >= 1 && parsed.total !== kindProjectCount) {
    return `project probe count mismatch — list_kinds project ${kindProjectCount}, probe ${parsed.total}`;
  }
  return null;
}

export function getConceptsFailure(parsed) {
  if (!Array.isArray(parsed?.concepts)) {
    return 'get_concepts response missing concepts array';
  }
  if (parsed.concepts.length < 1) {
    return 'get_concepts response missing partial smoke row';
  }
  const successRows = parsed.concepts.slice(0, -1);
  const missing = parsed.concepts.at(-1);
  for (const [index, row] of successRows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return `get_concepts response malformed success row at index ${index}`;
    }
    if (row.ok !== true) {
      return `get_concepts response expected success row at index ${index}`;
    }
    if (typeof row.slug !== 'string' || row.slug.length === 0) {
      return `get_concepts response missing success slug at index ${index}`;
    }
    if (!row.frontmatter || typeof row.frontmatter !== 'object' || Array.isArray(row.frontmatter)) {
      return `get_concepts response missing frontmatter: ${row.slug}`;
    }
    if (!Number.isFinite(row.mtime) || row.mtime < 0) {
      return `get_concepts response missing mtime: ${row.slug}`;
    }
  }
  if (!missing || typeof missing !== 'object' || Array.isArray(missing)) {
    return 'get_concepts response malformed partial row';
  }
  if (missing.ok !== false) {
    return 'get_concepts response expected partial row to be ok:false';
  }
  if (missing.slug !== 'missing-verify-slug') {
    return `get_concepts response partial row slug mismatch — ${missing.slug}`;
  }
  if (typeof missing.error !== 'string' || !/not found/i.test(missing.error)) {
    return 'get_concepts response missing partial row error';
  }
  return null;
}

export function findOrphansFailure(parsed) {
  if (!Number.isInteger(parsed?.total) || parsed.total < 0) {
    return 'find_orphans response missing total count';
  }
  if (!Array.isArray(parsed.orphans)) {
    return 'find_orphans response missing orphans array';
  }
  if (parsed.orphans.length > parsed.total) {
    return `find_orphans response orphan count exceeds total — orphans ${parsed.orphans.length}, total ${parsed.total}`;
  }
  for (const [index, node] of parsed.orphans.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return `find_orphans response malformed orphan at index ${index}`;
    }
    if (typeof node.slug !== 'string' || node.slug.length === 0) {
      return `find_orphans response missing orphan slug at index ${index}`;
    }
    if (typeof node.kind !== 'string' || node.kind.length === 0) {
      return `find_orphans response missing orphan kind: ${node.slug}`;
    }
    if (node.kind === 'project' || node.kind === 'vault-readme') {
      return `find_orphans default exclusions returned root/sentinel kind: ${node.slug}`;
    }
    if (typeof node.title !== 'string' || node.title.length === 0) {
      return `find_orphans response missing orphan title: ${node.slug}`;
    }
    if (!Number.isFinite(node.mtime) || node.mtime < 0) {
      return `find_orphans response missing orphan mtime: ${node.slug}`;
    }
  }
  return null;
}

export function buildGetConceptsSmokeSlugs(listPayload) {
  const slugs = Array.isArray(listPayload?.nodes)
    ? listPayload.nodes
        .map((node) => node?.slug)
        .filter((slug) => typeof slug === 'string' && slug.length > 0)
        .slice(0, 2)
    : [];
  return [...slugs, 'missing-verify-slug'];
}

export function validateVaultFailure(parsed) {
  const summary = parsed?.summary;
  if (!summary) return 'validate_vault response missing summary';
  if (!Number.isInteger(parsed?.scanned) || parsed.scanned < 0) {
    return 'validate_vault response missing scanned count';
  }
  if (!Number.isInteger(summary.problemFiles) || summary.problemFiles < 0) {
    return 'validate_vault response missing problemFiles count';
  }
  if (!Number.isInteger(summary.errorFiles) || summary.errorFiles < 0) {
    return 'validate_vault response missing errorFiles count';
  }
  if (!Number.isInteger(summary.warningFiles) || summary.warningFiles < 0) {
    return 'validate_vault response missing warningFiles count';
  }
  if (!summary.byCode || typeof summary.byCode !== 'object' || Array.isArray(summary.byCode)) {
    return 'validate_vault response missing byCode aggregate';
  }
  const byCodeFailure = validateByCodeAggregate(summary.byCode);
  if (byCodeFailure) return byCodeFailure;
  const problemFiles = summary.problemFiles;
  if (problemFiles === 0) return null;
  if (Object.keys(summary.byCode).length === 0) {
    return 'validate_vault response missing byCode entries for problem files';
  }
  const codeSummary = validationCodeSummary(summary.byCode);
  const suffix = codeSummary ? ` — codes ${codeSummary}` : '';
  return `validate_vault found ${formatCount(problemFiles, 'problem file')} — errors ${summary.errorFiles}, warnings ${summary.warningFiles}${suffix}`;
}

export function compileSummaryFailure(parsed) {
  if (!Number.isInteger(parsed?.version) || parsed.version < 1) {
    return 'compile_ontology response missing version';
  }
  if (typeof parsed.graphHash !== 'string' || parsed.graphHash.length === 0) {
    return 'compile_ontology response missing graphHash';
  }
  if (!Number.isFinite(parsed.maxMtime) || parsed.maxMtime < 0) {
    return 'compile_ontology response missing maxMtime';
  }
  const countFailure = numericFieldsFailure('compile_ontology', parsed, [
    'nodeCount',
    'edgeCount',
    'resolvedEdgeCount',
    'externalEdgeCount',
    'unresolvedEdgeCount',
    'aliasCount',
    'ambiguousAliasCount',
    'issueCount',
    'canonicalizationActionCount',
  ]);
  if (countFailure) return countFailure;
  const byKindFailure = countMapFailure('compile_ontology', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  const byDomainFailure = countMapFailure('compile_ontology', 'byDomain', parsed.byDomain);
  if (byDomainFailure) return byDomainFailure;
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== parsed.nodeCount) {
    return `compile_ontology response byKind mismatch — nodeCount ${parsed.nodeCount}, byKind ${byKindTotal}`;
  }
  const edgeTotal =
    parsed.resolvedEdgeCount + parsed.externalEdgeCount + parsed.unresolvedEdgeCount;
  if (edgeTotal !== parsed.edgeCount) {
    return `compile_ontology response edge count mismatch — edgeCount ${parsed.edgeCount}, resolved+external+unresolved ${edgeTotal}`;
  }
  return null;
}

export function overviewFailure(parsed) {
  if (parsed?.operation !== 'overview') {
    return `overview returned unexpected operation: ${parsed?.operation}`;
  }
  const graph = parsed.graph;
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return 'overview response missing graph summary';
  }
  const graphFailure = numericFieldsFailure('overview.graph', graph, [
    'nodes',
    'edges',
    'resolvedEdges',
    'externalEdges',
    'unresolvedEdges',
    'aliases',
    'ambiguousAliases',
    'issues',
  ]);
  if (graphFailure) return graphFailure;
  if (typeof graph.graphHash !== 'string' || graph.graphHash.length === 0) {
    return 'overview response missing graphHash';
  }
  if (!Number.isFinite(graph.maxMtime) || graph.maxMtime < 0) {
    return 'overview response missing maxMtime';
  }
  const edgeTotal = graph.resolvedEdges + graph.externalEdges + graph.unresolvedEdges;
  if (edgeTotal !== graph.edges) {
    return `overview response edge count mismatch — edges ${graph.edges}, resolved+external+unresolved ${edgeTotal}`;
  }
  const byKindFailure = countMapFailure('overview', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== graph.nodes) {
    return `overview response byKind mismatch — nodes ${graph.nodes}, byKind ${byKindTotal}`;
  }
  if (!Array.isArray(parsed.hubs)) {
    return 'overview response missing hubs array';
  }
  return null;
}

export function aggregateQueryPlanFailure(parsed, targetOperation, label = `${targetOperation} query_plan`) {
  if (parsed?.operation !== 'query_plan') {
    return `${label} returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.targetOperation !== targetOperation) {
    return `${label} returned unexpected targetOperation: ${parsed.targetOperation}`;
  }
  if (parsed.sideEffect !== false) {
    return `${label} must be side-effect-free`;
  }
  if (!parsed.normalized || parsed.normalized.targetOperation !== targetOperation) {
    return `${label} missing normalized targetOperation`;
  }
  if (!parsed.estimate || parsed.estimate.strategy !== 'aggregate_scan') {
    return `${label} missing aggregate_scan estimate`;
  }
  if (!Number.isInteger(parsed.estimate.nodeScans) || parsed.estimate.nodeScans < 0) {
    return `${label} missing nodeScans`;
  }
  if (!Number.isInteger(parsed.estimate.edgeScans) || parsed.estimate.edgeScans < 0) {
    return `${label} missing edgeScans`;
  }
  if (!['low', 'medium', 'high'].includes(parsed.estimate.costClass)) {
    return `${label} missing costClass`;
  }
  if (!Array.isArray(parsed.indexesUsed) || !parsed.indexesUsed.includes('compiled_artifact')) {
    return `${label} missing compiled_artifact index hint`;
  }
  if (!Array.isArray(parsed.warnings)) {
    return `${label} missing warnings array`;
  }
  return null;
}

export function overviewQueryPlanFailure(parsed) {
  return aggregateQueryPlanFailure(parsed, 'overview', 'overview query_plan');
}

export function projectMapQueryPlanFailure(parsed) {
  return aggregateQueryPlanFailure(parsed, 'project_map', 'project_map query_plan');
}

export function neighborsFailure(parsed, expectedSlug) {
  if (parsed?.operation !== 'neighbors') {
    return `neighbors returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.center !== expectedSlug) {
    return `neighbors center mismatch — expected ${expectedSlug}, got ${parsed.center}`;
  }
  if (!parsed.node || parsed.node.slug !== parsed.center) {
    return 'neighbors response missing center node';
  }
  if (!Number.isInteger(parsed.total) || parsed.total < 0) {
    return 'neighbors response missing total';
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'neighbors response missing limited flag';
  }
  if (!Array.isArray(parsed.edges)) {
    return 'neighbors response missing edges array';
  }
  if (parsed.edges.length > parsed.total) {
    return `neighbors response edge count exceeds total — edges ${parsed.edges.length}, total ${parsed.total}`;
  }
  if (!parsed.limited && parsed.edges.length !== parsed.total) {
    return `neighbors response edge count mismatch — edges ${parsed.edges.length}, total ${parsed.total}`;
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'neighbors response missing nodes array';
  }
  for (const [index, edge] of parsed.edges.entries()) {
    const edgeFailure = graphEdgeFailure('neighbors edge', edge, index);
    if (edgeFailure) return edgeFailure;
    if (!['incoming', 'outgoing'].includes(edge.direction)) {
      return `neighbors edge missing direction at index ${index}`;
    }
  }
  return null;
}

export function pathQueryFailure(parsed, expectedFrom, expectedTo = expectedFrom) {
  if (parsed?.operation !== 'path') {
    return `path returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.from !== expectedFrom || parsed.to !== expectedTo) {
    return `path endpoint mismatch — expected ${expectedFrom}->${expectedTo}, got ${parsed.from}->${parsed.to}`;
  }
  if (parsed.found !== true) {
    return 'path response expected found:true';
  }
  if (!Number.isInteger(parsed.hopCount) || parsed.hopCount < 0) {
    return 'path response missing hopCount';
  }
  if (!Array.isArray(parsed.hops) || parsed.hops.length !== parsed.hopCount + 1) {
    return 'path response hop count mismatch';
  }
  if (parsed.hops[0] !== expectedFrom || parsed.hops.at(-1) !== expectedTo) {
    return 'path response endpoint hops mismatch';
  }
  if (!Array.isArray(parsed.edges) || parsed.edges.length !== parsed.hopCount) {
    return 'path response edge count mismatch';
  }
  for (const [index, edge] of parsed.edges.entries()) {
    const edgeFailure = graphEdgeFailure('path edge', edge, index);
    if (edgeFailure) return edgeFailure;
    const fromHop = parsed.hops[index];
    const toHop = parsed.hops[index + 1];
    if (typeof edge.traversedFrom === 'string' || typeof edge.traversedTo === 'string') {
      if (edge.traversedFrom !== fromHop || edge.traversedTo !== toHop) {
        return `path response traversal mismatch at edge ${index}`;
      }
    } else if (!((edge.from === fromHop && edge.to === toHop) || (edge.from === toHop && edge.to === fromHop))) {
      return `path response edge/hop mismatch at edge ${index}`;
    }
  }
  return null;
}

export function formatHopCount(hopCount) {
  return formatCount(hopCount, 'hop');
}

export function projectScopeFailure(parsed, expectedProject) {
  if (parsed?.operation !== 'project_scope') {
    return `project_scope returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.project !== expectedProject) {
    return `project_scope project mismatch — expected ${expectedProject}, got ${parsed.project}`;
  }
  if (!parsed.node || parsed.node.slug !== parsed.project) {
    return 'project_scope response missing project node';
  }
  const summaryFailure = numericFieldsFailure('project_scope.summary', parsed.summary, [
    'nodes',
    'internalEdges',
    'boundaryEdges',
    'externalEdges',
    'unresolvedEdges',
  ]);
  if (summaryFailure) return summaryFailure;
  const byKindFailure = countMapFailure('project_scope', 'byKind', parsed.byKind);
  if (byKindFailure) return byKindFailure;
  if (!parsed.nodes || typeof parsed.nodes !== 'object' || Array.isArray(parsed.nodes)) {
    return 'project_scope response missing nodes bucket';
  }
  if (!Number.isInteger(parsed.nodes.total) || parsed.nodes.total < 0) {
    return 'project_scope nodes missing total';
  }
  if (parsed.nodes.total !== parsed.summary.nodes) {
    return `project_scope node total mismatch — summary ${parsed.summary.nodes}, bucket ${parsed.nodes.total}`;
  }
  if (typeof parsed.nodes.limited !== 'boolean') {
    return 'project_scope nodes missing limited flag';
  }
  if (!Array.isArray(parsed.nodes.rows)) {
    return 'project_scope nodes missing rows';
  }
  if (parsed.nodes.rows.length > parsed.nodes.total) {
    return `project_scope nodes exceed total — rows ${parsed.nodes.rows.length}, total ${parsed.nodes.total}`;
  }
  if (!parsed.nodes.limited && parsed.nodes.rows.length !== parsed.nodes.total) {
    return `project_scope node count mismatch — rows ${parsed.nodes.rows.length}, total ${parsed.nodes.total}`;
  }
  const byKindTotal = Object.values(parsed.byKind).reduce((sum, count) => sum + count, 0);
  if (byKindTotal !== parsed.summary.nodes) {
    return `project_scope byKind mismatch — nodes ${parsed.summary.nodes}, byKind ${byKindTotal}`;
  }
  if (!parsed.edges || typeof parsed.edges !== 'object' || Array.isArray(parsed.edges)) {
    return 'project_scope response missing edges';
  }
  const expectedTotals = {
    internal: parsed.summary.internalEdges,
    boundary: parsed.summary.boundaryEdges,
    external: parsed.summary.externalEdges,
    unresolved: parsed.summary.unresolvedEdges,
  };
  for (const [key, expectedTotal] of Object.entries(expectedTotals)) {
    const bucket = parsed.edges[key];
    const bucketFailure = scopeEdgeBucketFailure(`project_scope ${key}`, bucket);
    if (bucketFailure) return bucketFailure;
    if (bucket.total !== expectedTotal) {
      return `project_scope ${key} edge total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
    }
  }
  return null;
}

function graphEdgeFailure(label, edge, index) {
  if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
    return `${label} malformed edge at index ${index}`;
  }
  for (const key of ['from', 'to', 'via']) {
    if (typeof edge[key] !== 'string' || edge[key].length === 0) {
      return `${label} missing ${key} at index ${index}`;
    }
  }
  return null;
}

function scopeEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
    return `${label} missing edge bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== 'boolean') {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges array`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.edges.length !== bucket.total) {
    return `${label} edge count mismatch — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

export function verifyCountConsistencyFailure({ kinds, list, validation, compiled, overview }) {
  if (
    (kinds && listKindsFailure(kinds)) ||
    (list && listConceptsFailure(list)) ||
    (validation && validateVaultFailure(validation)) ||
    (compiled && compileSummaryFailure(compiled)) ||
    (overview && overviewFailure(overview))
  ) {
    return null;
  }

  const counts = [
    ['list_kinds.total', kinds?.total],
    ['list_concepts.total', list?.total],
    ['compile_ontology.nodeCount', compiled?.nodeCount],
    ['overview.graph.nodes', overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));

  if (counts.length <= 1) return null;

  const [baseLabel, baseValue] = counts[0];
  for (const [label, value] of counts.slice(1)) {
    if (value !== baseValue) {
      return `verify count mismatch — ${baseLabel} ${baseValue}, ${label} ${value}`;
    }
  }
  if (kinds?.byKind && compiled?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(compiled.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const compiledCount = compiled.byKind[kind] ?? 0;
      if (kindsCount !== compiledCount) {
        return `verify byKind mismatch — ${kind}: list_kinds ${kindsCount}, compile_ontology ${compiledCount}`;
      }
    }
  }
  if (kinds?.byKind && overview?.byKind) {
    const kindKeys = new Set([...Object.keys(kinds.byKind), ...Object.keys(overview.byKind)]);
    for (const kind of [...kindKeys].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const overviewCount = overview.byKind[kind] ?? 0;
      if (kindsCount !== overviewCount) {
        return `verify byKind mismatch — ${kind}: list_kinds ${kindsCount}, overview ${overviewCount}`;
      }
    }
  }
  return null;
}

export function diagnosisBlockingFailure(label, parsed, expectedOperation) {
  if (parsed?.operation !== expectedOperation) {
    return `${label} returned unexpected operation: ${parsed?.operation}`;
  }
  if (!DIAGNOSIS_STATUSES.has(parsed?.status)) {
    return `${label} response malformed status`;
  }
  if (expectedOperation === 'workspace_brief' && !Array.isArray(parsed?.nextActions)) {
    return `${label} response missing nextActions array`;
  }
  if (expectedOperation === 'workspace_brief') {
    const malformedAction = parsed.nextActions.find(
      (action) => (
        !action
        || typeof action !== 'object'
        || Array.isArray(action)
        || !hasNonEmptyString(action.id, action.kind)
        || !NEXT_ACTION_SEVERITIES.has(action.severity)
        || !hasOptionalNonNegativeInteger(action.count)
      ),
    );
    if (malformedAction) {
      return `${label} response malformed nextAction`;
    }
    const growthFailure = workspaceBriefGrowthConsistencyFailure(label, parsed);
    if (growthFailure) return growthFailure;
  }
  const checks = diagnosisChecks(parsed, expectedOperation);
  if (!checks) {
    return `${label} response missing health checks`;
  }
  const malformedCheck = checks.find(
    (check) => (
      !check
      || typeof check !== 'object'
      || !hasNonEmptyString(check.id)
      || !HEALTH_CHECK_STATUSES.has(check.status)
      || !hasOptionalNonNegativeInteger(check.count)
    ),
  );
  if (malformedCheck) {
    return `${label} response malformed health check`;
  }
  const failedChecks = checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) {
    return `${label} has failing health checks: ${failedChecks.map((check) => check.id).join(', ')}. Inspect query_ontology({operation:"health"}) before writing.`;
  }
  const blockingActions = blockingNextActions(parsed?.nextActions);
  if (blockingActions.length > 0) {
    return `${label} has actionable nextActions: ${blockingActions.join(', ')}. Inspect workspace_brief.nextActions before writing.`;
  }
  return null;
}

function workspaceBriefGrowthConsistencyFailure(label, parsed) {
  if (parsed.growth == null) return null;
  if (!parsed.growth || typeof parsed.growth !== 'object' || Array.isArray(parsed.growth)) {
    return `${label} response malformed growth summary`;
  }
  const requiredGrowthCounts = [
    'relationRecommendations',
    'externalElementRefs',
    'danglingReferences',
    'totalActions',
  ];
  if (requiredGrowthCounts.some((key) => !hasOptionalNonNegativeInteger(parsed.growth[key]) || parsed.growth[key] == null)) {
    return `${label} response malformed growth summary`;
  }
  if (parsed.summary?.growthActions != null && parsed.summary.growthActions !== parsed.growth.totalActions) {
    return `${label} growthActions mismatch`;
  }
  for (const action of parsed.nextActions) {
    if (action.kind === 'add_missing_relations' && action.count !== parsed.growth.relationRecommendations) {
      return `${label} add_missing_relations count mismatch`;
    }
    if (action.kind === 'materialize_external_elements' && action.count !== parsed.growth.externalElementRefs) {
      return `${label} materialize_external_elements count mismatch`;
    }
    if (action.kind === 'resolve_dangling_references' && action.count !== parsed.growth.danglingReferences) {
      return `${label} resolve_dangling_references count mismatch`;
    }
  }
  return null;
}

function hasNonEmptyString(...values) {
  return values.some((value) => typeof value === 'string' && value.length > 0);
}

function hasOptionalNonNegativeInteger(value) {
  return value == null || (Number.isInteger(value) && value >= 0);
}

function diagnosisChecks(parsed, expectedOperation) {
  if (expectedOperation === 'workspace_brief') {
    return Array.isArray(parsed?.health?.checks) ? parsed.health.checks : null;
  }
  if (expectedOperation === 'health') {
    return Array.isArray(parsed?.checks) ? parsed.checks : null;
  }
  return Array.isArray(parsed?.checks) ? parsed.checks : [];
}

function validateByCodeAggregate(byCode) {
  for (const [code, entry] of Object.entries(byCode)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return `validate_vault response malformed byCode entry: ${code}`;
    }
    if (typeof entry.severity !== 'string' || entry.severity.length === 0) {
      return `validate_vault response missing byCode severity: ${code}`;
    }
    if (!Number.isInteger(entry.count) || entry.count < 0) {
      return `validate_vault response missing byCode count: ${code}`;
    }
    if (!Array.isArray(entry.files)) {
      return `validate_vault response missing byCode files: ${code}`;
    }
  }
  return null;
}

function numericFieldsFailure(label, value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} response missing numeric fields`;
  }
  for (const key of keys) {
    if (!Number.isInteger(value[key]) || value[key] < 0) {
      return `${label} response missing ${key}`;
    }
  }
  return null;
}

function countMapFailure(label, key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} response missing ${key} aggregate`;
  }
  for (const [entryKey, count] of Object.entries(value)) {
    if (entryKey.length === 0) {
      return `${label} response has empty ${key} key`;
    }
    if (!Number.isInteger(count) || count < 0) {
      return `${label} response missing ${key} count: ${entryKey || 'unknown'}`;
    }
  }
  return null;
}

export function validationCodeSummary(byCode, limit = 3) {
  const entries = Object.entries(byCode || {})
    .filter(([, entry]) => Number.isInteger(entry?.count))
    .sort(([aCode, a], [bCode, b]) => b.count - a.count || aCode.localeCompare(bCode));
  if (entries.length === 0) return null;
  const shown = entries.slice(0, limit).map(([code, entry]) => `${code}:${entry.severity || 'unknown'}:${entry.count}`);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === 'fail')
    .map((action) => action.id || action.kind || 'unknown');
}

export function diagnosisIssueCount(parsed) {
  return parsed?.summary?.issues ?? parsed?.summary?.compileIssues ?? 0;
}

export function healthChecksSummary(checks, limit = 5) {
  if (!Array.isArray(checks)) return null;
  const entries = checks
    .filter((check) => check && typeof check === 'object')
    .map((check) => {
      const count = Number.isInteger(check.count) ? `:${check.count}` : '';
      return `${check.id || 'unknown'}:${check.status || 'unknown'}${count}`;
    });
  if (entries.length === 0) return null;
  const shown = entries.slice(0, limit);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function advisoryNextActionsSummary(actions, limit = 3) {
  if (!Array.isArray(actions)) return null;
  const advisory = actions
    .filter((action) => action?.severity !== 'fail')
    .map((action) => {
      const label = action.id || action.kind || 'unknown';
      const severity = action.severity || 'unknown';
      const count = Number.isInteger(action.count) ? `:${action.count}` : '';
      const message = typeof action.message === 'string' && action.message.length > 0 ? ` - ${action.message}` : '';
      return `${label}:${severity}${count}${message}`;
    });
  if (advisory.length === 0) return null;
  const shown = advisory.slice(0, limit);
  const suffix = advisory.length > shown.length ? `, +${advisory.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function workspaceBriefSummary(parsed) {
  return `${formatCount(parsed?.summary?.nodes ?? 0, 'node')}, ${formatCount(
    (parsed?.nextActions || []).length,
    'next action',
  )}, ${formatCount((parsed?.health?.checks || []).length, 'health check')}`;
}

async function step1ParserSmoke() {
  log('info', 'step 1 — parser smoke test');
  return new Promise((res) => {
    const proc = spawn('node', [PARSER_TEST], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('close', (code) => {
      if (code === 0 && /passed/.test(stdout)) {
        log('ok', stdout.trim().split('\n').slice(-1)[0]);
        res(true);
      } else {
        log('fail', `parser test failed (exit ${code})`);
        if (stdout) console.error(stdout);
        if (stderr) console.error(stderr);
        res(false);
      }
    });
  });
}

async function step2BootAndCall() {
  const timeoutMs = verifyTimeoutMs();
  if (timeoutMs === false) {
    log('fail', 'verify timeout must be a positive integer');
    return false;
  }
  log('info', `step 2 — server boot + tools/list + list_concepts/project probe/get_concepts/find_orphans/list_kinds (vault=${VAULT}, timeout=${timeoutMs}ms)`);

  const lines = buildFirstContactRequests().map((request) => JSON.stringify(request));

  return new Promise((res) => {
    const proc = spawn('node', [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let completed = false;
    let sentGetConceptsSmoke = false;
    let sentGraphQuerySmoke = false;
    const expectedFirstContactIds = new Set(FIRST_CONTACT_RESPONSE_LABELS.keys());
    let timer = null;
    proc.stdout.on('data', (b) => {
      stdout += b.toString();
      if (!sentGetConceptsSmoke || !sentGraphQuerySmoke) {
        const listResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 3 && response?.result);
        const projectResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 18 && response?.result);
        if (listResponse) {
          let listPayload = null;
          let projectPayload = null;
          try {
            listPayload = JSON.parse(listResponse.result.content?.[0]?.text || '{}');
          } catch {
            listPayload = null;
          }
          if (projectResponse) {
            try {
              projectPayload = JSON.parse(projectResponse.result.content?.[0]?.text || '{}');
            } catch {
              projectPayload = null;
            }
          }
          if (!sentGetConceptsSmoke) {
            sentGetConceptsSmoke = true;
            proc.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 11,
              method: 'tools/call',
              params: {
                name: 'get_concepts',
                arguments: { slugs: buildGetConceptsSmokeSlugs(listPayload) },
              },
            }) + '\n');
          }
          if (!sentGraphQuerySmoke && projectResponse) {
            sentGraphQuerySmoke = true;
            const graphSmoke = buildGraphQuerySmokeArgs(listPayload, projectPayload);
            const graphSmokePlan = buildGraphQuerySmokeRequests(graphSmoke);
            for (const id of allGraphQuerySmokeResponseIds()) {
              if (!graphSmokePlan.expectedResponseIds.includes(id)) expectedFirstContactIds.delete(id);
            }
            if (graphSmokePlan.requests.length > 0) {
              proc.stdin.write(graphSmokePlan.requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
            }
          }
        }
      }
      if (!completed && (hasAllFirstContactResponses(stdout, expectedFirstContactIds) || hasFirstContactErrorResponse(stdout, expectedFirstContactIds))) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill('SIGTERM');
      }
    });
    proc.stderr.on('data', (b) => (stderr += b.toString()));

    proc.stdin.write(lines.join('\n') + '\n');
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
    }, timeoutMs);

    proc.on('close', () => {
      if (timer) clearTimeout(timer);
      const responses = parseJsonRpcResponses(stdout);

      const initRes = responses.find((r) => r.id === 1);
      const listRes = responses.find((r) => r.id === 2);
      const callRes = responses.find((r) => r.id === 3);
      const kindsRes = responses.find((r) => r.id === 4);
      const validateRes = responses.find((r) => r.id === 5);
      const briefRes = responses.find((r) => r.id === 6);
      const healthRes = responses.find((r) => r.id === 7);
      const tunedHealthRes = responses.find((r) => r.id === 20);
      const tunedBriefRes = responses.find((r) => r.id === 21);
      const compileRes = responses.find((r) => r.id === 8);
      const overviewRes = responses.find((r) => r.id === 9);
      const overviewPlanRes = responses.find((r) => r.id === 10);
      const getConceptsRes = responses.find((r) => r.id === 11);
      const projectMapPlanRes = responses.find((r) => r.id === 12);
      const neighborsRes = responses.find((r) => r.id === 13);
      const pathRes = responses.find((r) => r.id === 14);
      const projectScopeRes = responses.find((r) => r.id === 15);
      const strictArgsRes = responses.find((r) => r.id === 16);
      const strictEnumRes = responses.find((r) => r.id === 17);
      const orphansRes = responses.find((r) => r.id === 19);
      const strictMaintenancePhaseFilterRes = responses.find((r) => r.id === 22);
      const strictMaintenanceSeverityFilterRes = responses.find((r) => r.id === 23);
      const strictMaintenanceKindFilterRes = responses.find((r) => r.id === 24);
      const maintenanceMissingCursorRes = responses.find((r) => r.id === 25);
      const maintenanceReadyCursorRes = responses.find((r) => r.id === 26);
      let kindsPayload = null;
      let listPayload = null;
      let validationPayload = null;
      let compilePayload = null;
      let overviewPayload = null;
      let graphSmokeArgs = null;
      const missingLabels = firstContactMissingResponseLabels(responses, expectedFirstContactIds);
      const errorRes = responses.find((response) => (
        expectedFirstContactIds.has(response?.id) && response?.error
      ));

      if (errorRes) {
        log('fail', firstContactErrorFailure(errorRes));
        return res(false);
      }

      if (timedOut && missingLabels.length > 0) {
        log('fail', `${verifyTimeoutFailure(timeoutMs)} Missing responses: ${missingLabels.join(', ')}`);
        if (stderr) console.error(stderr.slice(0, 300));
        return res(false);
      }

      if (!initRes || !initRes.result) {
        log('fail', serverStartupFailure(stderr));
        return res(false);
      }
      log('ok', `initialize OK — server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);

      const instructionFailure = initializeInstructionsFailure(initRes);
      if (instructionFailure) {
        log('fail', instructionFailure);
        return res(false);
      }
      log('ok', 'initialize instructions — first-contact safety guidance present');

      if (!listRes || !listRes.result?.tools) {
        log('fail', 'no tools/list response');
        return res(false);
      }
      const toolNames = listRes.result.tools.map((t) => t.name).sort();
      const expectedSorted = [...EXPECTED_TOOLS].sort();
      const missing = expectedSorted.filter((n) => !toolNames.includes(n));
      const extra = toolNames.filter((n) => !expectedSorted.includes(n));
      if (missing.length > 0 || extra.length > 0) {
        log('fail', `tools mismatch — missing: ${missing.join(',') || '(none)'}, extra: ${extra.join(',') || '(none)'}`);
        return res(false);
      }
      log('ok', `tools/list ${toolNames.length}/${EXPECTED_TOOLS.length} (${expectedToolSplitLabel()}) — ${toolNames.join(' · ')}`);
      const schemaFailure = toolsListSchemaFailure(listRes.result.tools);
      if (schemaFailure) {
        log('fail', schemaFailure);
        return res(false);
      }
      log('ok', 'tools/list schema contract — strict arguments + read/write hints + graph-query enums + health tuning + post-write guidance');
      const strictFailure = strictArgsFailure(strictArgsRes);
      if (strictFailure) {
        log('fail', strictFailure);
        return res(false);
      }
      log('ok', 'strict arguments — unknown tool argument rejected at runtime');
      const strictEnum = strictEnumFailure(strictEnumRes);
      if (strictEnum) {
        log('fail', strictEnum);
        return res(false);
      }
      log('ok', 'strict enums — invalid query operation rejected with closest-value hint');
      const strictMaintenancePhaseFilter = strictMaintenanceFilterFailure(strictMaintenancePhaseFilterRes, 'phases');
      if (strictMaintenancePhaseFilter) {
        log('fail', strictMaintenancePhaseFilter);
        return res(false);
      }
      const strictMaintenanceSeverityFilter = strictMaintenanceFilterFailure(strictMaintenanceSeverityFilterRes, 'severities');
      if (strictMaintenanceSeverityFilter) {
        log('fail', strictMaintenanceSeverityFilter);
        return res(false);
      }
      const strictMaintenanceKindFilter = strictMaintenanceFilterFailure(strictMaintenanceKindFilterRes, 'kinds');
      if (strictMaintenanceKindFilter) {
        log('fail', strictMaintenanceKindFilter);
        return res(false);
      }
      log('ok', `strict maintenance filters — invalid phase/severity/kind rejected at runtime (${maintenanceFilterEnumSummary()})`);

      if (!maintenanceMissingCursorRes || !maintenanceMissingCursorRes.result) {
        log('fail', 'no query_ontology maintenance missing-cursor response');
        return res(false);
      }
      try {
        const text = maintenanceMissingCursorRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = maintenanceMissingCursorFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `maintenance cursor — missing afterActionId reported (${parsed.cursor.reason}; ${maintenanceBucketOutputSummary(parsed)}; ${maintenanceNextActionOutputSummary(parsed)})`);
      } catch (err) {
        log('fail', `failed to parse maintenance missing-cursor response: ${err.message}`);
        return res(false);
      }

      if (!maintenanceReadyCursorRes || !maintenanceReadyCursorRes.result) {
        log('fail', 'no query_ontology maintenance ready-cursor response');
        return res(false);
      }
      try {
        const text = maintenanceReadyCursorRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = maintenanceReadyCursorFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `maintenance cursor — ready page stable (${formatCount(parsed.summary.remainingActions, 'remaining action')}; ${maintenanceBucketOutputSummary(parsed)}; ${maintenanceNextActionOutputSummary(parsed)})`);
      } catch (err) {
        log('fail', `failed to parse maintenance ready-cursor response: ${err.message}`);
        return res(false);
      }

      if (!callRes || !callRes.result) {
        log('fail', 'no list_concepts response');
        return res(false);
      }
      try {
        const text = callRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = listConceptsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        if (JSON.stringify(callRes.result.structuredContent) !== JSON.stringify(parsed)) {
          log('fail', 'list_concepts structuredContent mismatch');
          return res(false);
        }
        listPayload = parsed;
        graphSmokeArgs = buildGraphQuerySmokeArgs(parsed);
        log('ok', `list_concepts — vault total ${parsed.total} nodes (vaultRoot ${parsed.vaultRoot})`);
        if (parsed.total === 0) {
          log('info', 'Warning: vault is empty. Make sure OMOT_VAULT points to the right folder (e.g. ./docs/ontology)');
        }
      } catch (err) {
        log('fail', `failed to parse list_concepts response: ${err.message}`);
        return res(false);
      }

      if (!getConceptsRes || !getConceptsRes.result) {
        log('fail', 'no get_concepts response');
        return res(false);
      }
      try {
        const text = getConceptsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = getConceptsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        if (JSON.stringify(getConceptsRes.result.structuredContent) !== JSON.stringify(parsed)) {
          log('fail', 'get_concepts structuredContent mismatch');
          return res(false);
        }
        const okRows = parsed.concepts.filter((row) => row?.ok === true).length;
        const partialRows = parsed.concepts.filter((row) => row?.ok === false).length;
        log('ok', `get_concepts — ${formatCount(okRows, 'ok row')}, ${formatCount(partialRows, 'partial row')}`);
      } catch (err) {
        log('fail', `failed to parse get_concepts response: ${err.message}`);
        return res(false);
      }

      if (!orphansRes || !orphansRes.result) {
        log('fail', 'no find_orphans response');
        return res(false);
      }
      try {
        const text = orphansRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = findOrphansFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `find_orphans — ${formatCount(parsed.total, 'orphan')} (root/sentinel defaults excluded)`);
      } catch (err) {
        log('fail', `failed to parse find_orphans response: ${err.message}`);
        return res(false);
      }

      if (!kindsRes || !kindsRes.result) {
        log('fail', 'no list_kinds response');
        return res(false);
      }
      try {
        const text = kindsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = listKindsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        if (JSON.stringify(kindsRes.result.structuredContent) !== JSON.stringify(parsed)) {
          log('fail', 'list_kinds structuredContent mismatch');
          return res(false);
        }
        kindsPayload = parsed;
        const kindSummary = Object.entries(parsed.byKind)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([kind, count]) => `${kind}:${count}`)
          .join(', ');
        log('ok', `list_kinds — ${parsed.total} nodes (${kindSummary})`);
      } catch (err) {
        log('fail', `failed to parse list_kinds response: ${err.message}`);
        return res(false);
      }

      if (!validateRes || !validateRes.result) {
        log('fail', 'no validate_vault response');
        return res(false);
      }
      try {
        const text = validateRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = validateVaultFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        if (JSON.stringify(validateRes.result.structuredContent) !== JSON.stringify(parsed)) {
          log('fail', 'validate_vault structuredContent mismatch');
          return res(false);
        }
        validationPayload = parsed;
        log(
          'ok',
          `validate_vault — ${formatCount(parsed.scanned ?? 0, 'file')}, ${formatCount(
            parsed.summary?.problemFiles ?? 0,
            'problem file',
          )}`,
        );
      } catch (err) {
        log('fail', `failed to parse validate_vault response: ${err.message}`);
        return res(false);
      }

      const projectProbeRes = responses.find((r) => r.id === 18);
      if (!projectProbeRes || !projectProbeRes.result) {
        log('fail', 'no project probe response');
        return res(false);
      }
      try {
        const text = projectProbeRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = projectProbeFailure(parsed, kindsPayload);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `project probe — ${formatCount(parsed.total, 'project node')}`);
      } catch (err) {
        log('fail', `failed to parse project probe response: ${err.message}`);
        return res(false);
      }

      if (!briefRes || !briefRes.result) {
        log('fail', 'no query_ontology workspace_brief response');
        return res(false);
      }
      try {
        const text = briefRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('workspace_brief', parsed, 'workspace_brief');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log(
          'ok',
          `workspace_brief — ${parsed.status} (${workspaceBriefSummary(parsed)})`,
        );
        const advisory = advisoryNextActionsSummary(parsed.nextActions);
        if (advisory) log('info', `workspace_brief advisory nextActions — ${advisory}`);
      } catch (err) {
        log('fail', `failed to parse workspace_brief response: ${err.message}`);
        return res(false);
      }

      if (!tunedBriefRes || !tunedBriefRes.result) {
        log('fail', 'no query_ontology tuned workspace_brief response');
        return res(false);
      }
      try {
        const text = tunedBriefRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('workspace_brief_tuned', parsed, 'workspace_brief');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log(
          'ok',
          `workspace_brief_tuned — ${parsed.status} (${workspaceBriefSummary(parsed)})`,
        );
        const advisory = advisoryNextActionsSummary(parsed.nextActions);
        if (advisory) log('info', `workspace_brief_tuned advisory nextActions — ${advisory}`);
      } catch (err) {
        log('fail', `failed to parse tuned workspace_brief response: ${err.message}`);
        return res(false);
      }

      if (!healthRes || !healthRes.result) {
        log('fail', 'no query_ontology health response');
        return res(false);
      }
      try {
        const text = healthRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('health', parsed, 'health');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const checksSummary = healthChecksSummary(parsed.checks);
        log(
          'ok',
          `health — ${parsed.status} (${(parsed.checks || []).length} checks${
            checksSummary ? `: ${checksSummary}` : ''
          }, issues ${diagnosisIssueCount(parsed)})`,
        );
      } catch (err) {
        log('fail', `failed to parse health response: ${err.message}`);
        return res(false);
      }

      if (!tunedHealthRes || !tunedHealthRes.result) {
        log('fail', 'no query_ontology tuned health response');
        return res(false);
      }
      try {
        const text = tunedHealthRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = diagnosisBlockingFailure('health_tuned', parsed, 'health');
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const checksSummary = healthChecksSummary(parsed.checks);
        log(
          'ok',
          `health_tuned — ${parsed.status} (${(parsed.checks || []).length} checks${
            checksSummary ? `: ${checksSummary}` : ''
          }, issues ${diagnosisIssueCount(parsed)})`,
        );
      } catch (err) {
        log('fail', `failed to parse tuned health response: ${err.message}`);
        return res(false);
      }

      if (!compileRes || !compileRes.result) {
        log('fail', 'no compile_ontology response');
        return res(false);
      }
      try {
        const text = compileRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = compileSummaryFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        compilePayload = parsed;
        log('ok', `compile_ontology — graph ${parsed.graphHash.slice(0, 12)} (${parsed.nodeCount} nodes, ${parsed.edgeCount} edges, issues ${parsed.issueCount})`);
      } catch (err) {
        log('fail', `failed to parse compile_ontology response: ${err.message}`);
        return res(false);
      }

      if (!overviewRes || !overviewRes.result) {
        log('fail', 'no query_ontology overview response');
        return res(false);
      }
      try {
        const text = overviewRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = overviewFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        overviewPayload = parsed;
        log('ok', `overview — graph ${parsed.graph.graphHash.slice(0, 12)} (${parsed.graph.nodes} nodes, ${parsed.graph.edges} edges, hubs ${(parsed.hubs || []).length})`);
      } catch (err) {
        log('fail', `failed to parse overview response: ${err.message}`);
        return res(false);
      }

      if (!overviewPlanRes || !overviewPlanRes.result) {
        log('fail', 'no query_ontology overview query_plan response');
        return res(false);
      }
      try {
        const text = overviewPlanRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = overviewQueryPlanFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `overview query_plan — ${parsed.estimate.strategy} (${parsed.estimate.costClass}, nodes ${parsed.estimate.nodeScans}, edges ${parsed.estimate.edgeScans})`);
      } catch (err) {
        log('fail', `failed to parse overview query_plan response: ${err.message}`);
        return res(false);
      }

      if (!projectMapPlanRes || !projectMapPlanRes.result) {
        log('fail', 'no query_ontology project_map query_plan response');
        return res(false);
      }
      try {
        const text = projectMapPlanRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = projectMapQueryPlanFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        log('ok', `project_map query_plan — ${parsed.estimate.strategy} (${parsed.estimate.costClass}, nodes ${parsed.estimate.nodeScans}, edges ${parsed.estimate.edgeScans})`);
      } catch (err) {
        log('fail', `failed to parse project_map query_plan response: ${err.message}`);
        return res(false);
      }

      if (graphSmokeArgs?.hasNode) {
        if (!neighborsRes || !neighborsRes.result) {
          log('fail', 'no query_ontology neighbors response');
          return res(false);
        }
        try {
          const text = neighborsRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const expectedSlug = graphSmokeArgs.slug;
          const failure = neighborsFailure(parsed, expectedSlug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          log('ok', `neighbors — ${parsed.center} (${parsed.edges.length}/${parsed.total} edges, limited ${parsed.limited})`);
        } catch (err) {
          log('fail', `failed to parse neighbors response: ${err.message}`);
          return res(false);
        }

        if (!pathRes || !pathRes.result) {
          log('fail', 'no query_ontology path response');
          return res(false);
        }
        try {
          const text = pathRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const expectedSlug = graphSmokeArgs.slug;
          const failure = pathQueryFailure(parsed, expectedSlug, graphSmokeArgs.pathTarget || expectedSlug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          log('ok', `path — ${parsed.from} → ${parsed.to} (${formatHopCount(parsed.hopCount)}, ${formatCount(parsed.edges.length, 'edge')})`);
        } catch (err) {
          log('fail', `failed to parse path response: ${err.message}`);
          return res(false);
        }
      } else {
        log('info', 'neighbors/path — skipped (vault has no nodes)');
      }

      if (graphSmokeArgs?.hasProject) {
        if (!projectScopeRes || !projectScopeRes.result) {
          log('fail', 'no query_ontology project_scope response');
          return res(false);
        }
        try {
          const text = projectScopeRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const expectedProject = graphSmokeArgs.project;
          const failure = projectScopeFailure(parsed, expectedProject);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          log('ok', `project_scope — ${parsed.project} (${parsed.summary.nodes} nodes, internalEdges ${parsed.summary.internalEdges})`);
        } catch (err) {
          log('fail', `failed to parse project_scope response: ${err.message}`);
          return res(false);
        }
      } else {
        log('info', 'project_scope — skipped (no project node in vault)');
      }

      const countFailure = verifyCountConsistencyFailure({
        kinds: kindsPayload,
        list: listPayload,
        validation: validationPayload,
        compiled: compilePayload,
        overview: overviewPayload,
      });
      if (countFailure) {
        log('fail', countFailure);
        return res(false);
      }
      res(true);
    });

    proc.on('error', (err) => {
      log('fail', `server spawn failed: ${err.message}`);
      res(false);
    });
  });
}

async function main() {
  if (VERIFY_ARGS.help) {
    process.stdout.write(verifyUsage());
    process.exit(0);
  }
  console.log('\n[oh-my-ontology-mcp verify]\n');
  if (VERIFY_ARGS.error) {
    log('fail', VERIFY_ARGS.error);
    process.stderr.write(verifyUsage());
    process.exit(1);
  }
  if (verifyTimeoutMs() === false) {
    log('fail', 'verify timeout must be a positive integer');
    process.exit(1);
  }
  const ok1 = await step1ParserSmoke();
  if (!ok1) process.exit(1);
  const ok2 = await step2BootAndCall();
  if (!ok2) process.exit(1);
  console.log(`\n\x1b[32mAll passed\x1b[0m — register .mcp.json with Claude Code and restart to use the ${EXPECTED_TOOLS.length} tools.\n`);
  process.exit(0);
}

if (IS_MAIN) {
  main();
}
