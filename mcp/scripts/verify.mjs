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
 *   3. tools/list — 23 도구 모두 노출 + graph-query/write-relation enum schema contract + strict tool-name/argument/enum runtime smoke
 *   4. tools/call list_concepts — vault 노드 수 출력
 *   5. tools/call list_concepts(kind=project) — project_scope gate probe
 *   6. tools/call get_concept — single-node detail + structuredContent contract
 *   7. tools/call get_concepts — batch reader success + partial-row contract
 *   8. tools/call find_evidence/find_backlinks/query_concepts/limited query_concepts — search, backlink, typed-filter, and limit-semantics read smoke
 *   9. tools/call find_neighbors/find_path — daily graph-read smoke
 *   10. tools/call analyze_repo_structure/infer_imports — bootstrap/import analysis read smoke
 *   11. tools/call add_concepts/add_relations — invalid batch rows remain row-level, not top-level errors
 *   12. tools/call find_orphans — row shape + root/sentinel default-exclusion contract
 *   13. tools/call list_kinds — kind census aggregate
 *   14. tools/call validate_vault — whole-vault frontmatter / graph-reference health
 *   15. tools/call query_ontology agent_brief + workspace_brief + tuned workspace_brief + health + tuned health — agent first-contact graph diagnosis
 *   16. tools/call compile_ontology(summary + paginated full artifact) — compiler graph contract
 *   17. tools/call query_ontology overview + query_plan(overview/project_map) — graph-query smoke contract
 *   18. tools/call query_ontology neighbors/node-to-project path/all_paths/project_scope — core graph query smoke contract
 *   19. tools/call query_ontology relation_check + graph kind typo rejection — write/query preflight fail-closed smoke
 *
 * 모두 PASS → exit 0, 실패 → exit 1 + 진단 메시지.
 */

import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import {
  hasAnyErrorResponse,
  hasAllResultResponses,
  missingResponseLabels,
  parseJsonRpcResponses,
} from './json-rpc-lines.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from '../src/ontology-engine.mjs';
import {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
} from '../src/infer-imports.mjs';
import { VAULT_ISSUE_CODE_VALUES } from '../src/validate.mjs';
import { GRAPH_ARRAY_KEYS } from '../src/vault.mjs';
export {
  IMPORT_EDGE_KIND_VALUES,
  IMPORT_UNRESOLVED_REASON_VALUES,
} from '../src/infer-imports.mjs';
export { VAULT_ISSUE_CODE_VALUES } from '../src/validate.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(MCP_ROOT, '..');
const PARSER_TEST = join(MCP_ROOT, 'src', 'parser.test.mjs');
const SERVER_ENTRY = join(MCP_ROOT, 'src', 'index.js');
const IS_MAIN = fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '');
const VERIFY_ALLOWED_FLAGS = ['--vault', '--timeout-ms', '--help'];
const DEFAULT_VERIFY_RETRY_EXAMPLE = 'npm run verify -- --timeout-ms 15000';
const DEFAULT_VERIFY_KILL_GRACE_MS = 1_000;
const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);
const VERIFY_ARGS = parseVerifyArgs({ isMain: IS_MAIN });
const VAULT = VERIFY_ARGS.vault;
const VERIFY_TIMEOUT_MS_RAW = VERIFY_ARGS.timeoutMsRaw;
const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);
export const TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY = 'strict arguments + annotations + graph-query enums + graph kind enums/descriptions + write relation enums + health tuning + post-write maintenance schema';
const ADD_CONCEPT_KIND_VALUES = Object.freeze(['project', 'domain', 'capability', 'element', 'document']);
const NODE_KIND_DESCRIPTION = NODE_KIND_VALUES.join(', ');
const EDGE_TARGET_KIND_DESCRIPTION = EDGE_TARGET_KIND_VALUES.join(', ');
export const VERIFY_TUNED_HEALTH_ARGS = {
  componentLimit: 3,
  cycleLimit: 3,
  recommendationLimit: 3,
  orderLimit: 3,
  dependencyTypes: ['dependencies'],
  componentTypes: ['domains', 'domain', 'capabilities', 'dependencies'],
};
export const VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT = 3;

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

export function toolsListAnnotationSummary(tools) {
  if (!Array.isArray(tools)) return 'missing tools/list';
  const titleCount = tools.filter((tool) => tool?.annotations?.title === expectedToolTitle(tool?.name)).length;
  const readCount = tools.filter((tool) => tool?.annotations?.readOnlyHint === true).length;
  const writeCount = tools.filter((tool) => tool?.annotations?.readOnlyHint === false).length;
  const destructiveCount = tools.filter((tool) => tool?.annotations?.destructiveHint === true).length;
  const idempotentCount = tools.filter((tool) => tool?.annotations?.idempotentHint === true).length;
  const localOnlyCount = tools.filter((tool) => tool?.annotations?.openWorldHint === false).length;
  return [
    `${titleCount}/${EXPECTED_TOOLS.length} titled`,
    `${readCount}/${EXPECTED_READ_TOOLS.length} read`,
    `${writeCount}/${EXPECTED_WRITE_TOOLS.length} write`,
    `${destructiveCount}/${EXPECTED_DESTRUCTIVE_TOOLS.length} destructive`,
    `${idempotentCount}/${EXPECTED_IDEMPOTENT_TOOLS.length} idempotent`,
    `${localOnlyCount}/${EXPECTED_TOOLS.length} local-only`,
  ].join('; ');
}

export function expectedToolsListAnnotationSummary() {
  const readTools = new Set(EXPECTED_READ_TOOLS);
  const destructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
  const idempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
  return toolsListAnnotationSummary(EXPECTED_TOOLS.map((name) => ({
    name,
    annotations: {
      title: expectedToolTitle(name),
      readOnlyHint: readTools.has(name),
      destructiveHint: destructiveTools.has(name),
      idempotentHint: idempotentTools.has(name),
      openWorldHint: false,
    },
  })));
}

export function toolsListInventoryFailure(tools) {
  if (!Array.isArray(tools)) return 'no tools/list response';
  const invalidNameCount = tools.filter((tool) => typeof tool?.name !== 'string' || tool.name.length === 0).length;
  const toolNames = tools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length > 0)
    .sort();
  const expectedSorted = [...EXPECTED_TOOLS].sort();
  const missing = expectedSorted.filter((name) => !toolNames.includes(name));
  const extra = toolNames.filter((name) => !expectedSorted.includes(name));
  const duplicates = [...new Set(toolNames.filter((name, index, names) => (
    typeof name === 'string' && names.indexOf(name) !== index
  )))];
  if (missing.length === 0 && extra.length === 0 && duplicates.length === 0 && invalidNameCount === 0) return null;
  return `tools mismatch — missing: ${missing.join(',') || '(none)'}, extra: ${extra.join(',') || '(none)'}, duplicates: ${duplicates.join(',') || '(none)'}, invalidNames: ${invalidNameCount}`;
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

export function importModuleEdgeKindOutputSummary(moduleEdges, limit = 2) {
  if (!Array.isArray(moduleEdges) || moduleEdges.length === 0) return 'none';
  const shown = moduleEdges.slice(0, limit).map((edge) => {
    const from = typeof edge?.from === 'string' && edge.from.length > 0 ? edge.from : 'unknown';
    const to = typeof edge?.to === 'string' && edge.to.length > 0 ? edge.to : 'unknown';
    const count = Number.isInteger(edge?.count) ? edge.count : 'n/a';
    const kindSummary = importKindCountOutputSummary(edge?.kindCounts);
    const kindSuffix = kindSummary === 'none' ? '' : ` (${kindSummary})`;
    return `${from}->${to} x${count}${kindSuffix}`;
  });
  const suffix = moduleEdges.length > shown.length ? `, +${moduleEdges.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

function importKindCountOutputSummary(kindCounts) {
  if (!kindCounts || typeof kindCounts !== 'object' || Array.isArray(kindCounts)) return 'none';
  const ordered = IMPORT_EDGE_KIND_VALUES;
  const known = ordered
    .filter((kind) => Number.isInteger(kindCounts[kind]) && kindCounts[kind] > 0)
    .map((kind) => `${kind}:${kindCounts[kind]}`);
  const extra = Object.entries(kindCounts)
    .filter(([kind, count]) => !ordered.includes(kind) && Number.isInteger(count) && count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`);
  const entries = [...known, ...extra];
  return entries.length > 0 ? entries.join('/') : 'none';
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

function unknownFieldsItemSchemaFailure(schema, toolName) {
  const items = schema?.items;
  if (
    items?.type !== 'object' ||
    items?.additionalProperties !== false ||
    !sameArray(items?.required, ['name']) ||
    items?.properties?.name?.type !== 'string' ||
    items?.properties?.suggestion?.type !== 'string'
  ) {
    return `${toolName} outputSchema row unknownFields item drift`;
  }
  return null;
}

function stringArraySchemaFailure(schema) {
  return !(schema?.type === 'array' && schema.items?.type === 'string');
}

const NON_BLANK_STRING_PATTERN = '^(?!\\s)(?!.*\\s$)(?!.*\\u0000).+$';

function nonBlankStringSchemaFailure(schema) {
  return !(
    schema?.type === 'string' &&
    schema.minLength === 1 &&
    schema.pattern === NON_BLANK_STRING_PATTERN
  );
}

function nonBlankStringOrArraySchemaFailure(schema) {
  return !(
    sameArray(schema?.type, ['array', 'string']) &&
    schema.minLength === 1 &&
    schema.pattern === NON_BLANK_STRING_PATTERN &&
    !nonBlankStringSchemaFailure(schema.items)
  );
}

function inputArrayMaxItemsFailure(tools) {
  for (const tool of tools) {
    const stack = [{ schema: tool?.inputSchema, path: `${tool?.name || '(unknown)'}.inputSchema` }];
    while (stack.length > 0) {
      const { schema, path } = stack.pop();
      if (!schema || typeof schema !== 'object') continue;
      if (schema.type === 'array' && schema.maxItems === undefined) {
        return `${path} array maxItems drift`;
      }
      for (const [key, value] of Object.entries(schema.properties || {})) {
        stack.push({ schema: value, path: `${path}.properties.${key}` });
      }
      if (schema.items) {
        stack.push({ schema: schema.items, path: `${path}.items` });
      }
      for (const key of ['oneOf', 'anyOf', 'allOf']) {
        if (!Array.isArray(schema[key])) continue;
        schema[key].forEach((value, index) => {
          stack.push({ schema: value, path: `${path}.${key}.${index}` });
        });
      }
    }
  }
  return null;
}

function backlinkRewritePlanSchemaFailure(schema, label) {
  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, ['updates', 'totalUpdated']) ||
    schema.additionalProperties !== false ||
    schema.properties?.totalUpdated?.type !== 'integer' ||
    schema.properties?.totalUpdated?.minimum !== 0
  ) {
    return `${label} outputSchema backlinkUpdates drift`;
  }
  const updates = schema.properties?.updates;
  const row = updates?.items;
  if (
    updates?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['slug', 'title', 'beforeKeys', 'afterKeys', 'bodyChanged']) ||
    row.additionalProperties !== false ||
    nonBlankStringSchemaFailure(row.properties?.slug) ||
    nonBlankStringSchemaFailure(row.properties?.title) ||
    row.properties?.bodyChanged?.type !== 'boolean'
  ) {
    return `${label} outputSchema backlinkUpdates updates drift`;
  }
  for (const propertyName of ['beforeKeys', 'afterKeys']) {
    const keyRows = row.properties?.[propertyName];
    if (
      keyRows?.type !== 'array' ||
      keyRows.items?.type !== 'object' ||
      !sameArray(keyRows.items?.required, ['key']) ||
      keyRows.items?.additionalProperties !== false ||
      nonBlankStringSchemaFailure(keyRows.items?.properties?.key) ||
      nonBlankStringOrArraySchemaFailure(keyRows.items?.properties?.before) ||
      nonBlankStringOrArraySchemaFailure(keyRows.items?.properties?.after)
    ) {
      return `${label} outputSchema backlinkUpdates ${propertyName} drift`;
    }
  }
  return null;
}

function capturedDocSchemaFailure(schema, label) {
  if (
    schema?.type !== 'object' ||
    !sameArray(schema.required, ['frontmatter']) ||
    schema.additionalProperties !== false ||
    schema.properties?.frontmatter?.type !== 'object' ||
    schema.properties?.body?.type !== 'string' ||
    schema.properties?.bodyExcerpt?.type !== 'string'
  ) {
    return `${label} outputSchema captured doc drift`;
  }
  return null;
}

function backlinkRowsSchemaFailure(schema, label) {
  const row = schema?.items;
  if (
    schema?.type !== 'array' ||
    row?.type !== 'object' ||
    !sameArray(row.required, ['slug', 'kind', 'title', 'mtime']) ||
    row.additionalProperties !== false ||
    nonBlankStringSchemaFailure(row.properties?.slug) ||
    nonBlankStringSchemaFailure(row.properties?.kind) ||
    nonBlankStringSchemaFailure(row.properties?.title) ||
    nonBlankStringSchemaFailure(row.properties?.domain) ||
    row.properties?.mtime?.type !== 'number' ||
    row.properties?.mtime?.minimum !== 0 ||
    row.properties?.matchedKeys?.type !== 'array' ||
    nonBlankStringSchemaFailure(row.properties?.matchedKeys?.items) ||
    row.properties?.matchedInBody?.type !== 'boolean'
  ) {
    return `${label} drift`;
  }
  return null;
}

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
    row.properties?.via?.type !== 'string'
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

function postWriteMaintenanceSchemaFailure(schema, toolName) {
  if (schema?.type !== 'object') {
    return `${toolName} outputSchema postWriteMaintenance drift`;
  }
  const compactActionRequired = ['id', 'phase', 'kind', 'severity', 'score', 'executable', 'reason', 'proposedAction'];
  const compactProposedActionTools = ['add_concept', 'add_relation', 'patch_concept'];
  const proposedArgsSchemas = schema.properties?.actions?.items?.properties?.proposedAction?.properties?.args?.oneOf;
  const postWriteRequired = [
    'operation',
    'sideEffect',
    'graphHash',
    'summary',
    'filters',
    'cursor',
    'byPhase',
    'bySeverity',
    'byKind',
    'limited',
    'nextExecutableAction',
    'nextReviewAction',
    'actions',
  ];
  if (!sameArray(schema.required, postWriteRequired) || schema.additionalProperties !== false) {
    return `${toolName} outputSchema postWriteMaintenance required drift`;
  }
  const summarySchema = schema.properties?.summary;
  const summaryRequired = [
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
  ];
  if (
    summarySchema?.type !== 'object' ||
    !sameArray(summarySchema.required, summaryRequired) ||
    summarySchema.additionalProperties !== false ||
    summaryRequired.some((key) => (
      summarySchema.properties?.[key]?.type !== 'integer' ||
      summarySchema.properties?.[key]?.minimum !== 0
    ))
  ) {
    return `${toolName} outputSchema postWriteMaintenance summary drift`;
  }
  const filtersSchema = schema.properties?.filters;
  if (
    filtersSchema?.type !== 'object' ||
    !sameArray(filtersSchema.required, ['executableOnly', 'phases', 'severities', 'kinds']) ||
    filtersSchema.additionalProperties !== false ||
    filtersSchema.properties?.executableOnly?.type !== 'boolean' ||
    !sameArray(filtersSchema.properties?.phases?.items?.enum, MAINTENANCE_PHASE_VALUES) ||
    !sameArray(filtersSchema.properties?.severities?.items?.enum, MAINTENANCE_SEVERITY_VALUES) ||
    !sameArray(filtersSchema.properties?.kinds?.items?.enum, MAINTENANCE_KIND_VALUES)
  ) {
    return `${toolName} outputSchema postWriteMaintenance filters drift`;
  }
  const cursorSchema = schema.properties?.cursor;
  if (
    cursorSchema?.type !== 'object' ||
    !sameArray(cursorSchema.required, ['afterActionId', 'found', 'reason', 'startIndex', 'nextAfterActionId', 'hasMore']) ||
    cursorSchema.additionalProperties !== false ||
    cursorSchema.properties?.found?.type !== 'boolean' ||
    cursorSchema.properties?.hasMore?.type !== 'boolean'
  ) {
    return `${toolName} outputSchema postWriteMaintenance cursor drift`;
  }
  for (const key of ['byPhase', 'bySeverity', 'byKind']) {
    const bucketSchema = schema.properties?.[key];
    if (
      bucketSchema?.type !== 'object' ||
      bucketSchema.additionalProperties?.type !== 'integer' ||
      bucketSchema.additionalProperties?.minimum !== 0
    ) {
      return `${toolName} outputSchema postWriteMaintenance ${key} bucket drift`;
    }
  }
  if (
    schema.properties?.actions?.type !== 'array' ||
    schema.properties.actions.items?.type !== 'object' ||
    !sameArray(schema.properties.actions.items?.required, compactActionRequired) ||
    schema.properties.actions.items?.properties?.score?.minimum !== 0 ||
    schema.properties.actions.items?.properties?.executable?.type !== 'boolean' ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.type, ['object', 'null']) ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.required, ['tool', 'args']) ||
    schema.properties.actions.items?.properties?.proposedAction?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.proposedAction?.properties?.tool?.type !== 'string' ||
    !sameArray(schema.properties.actions.items?.properties?.proposedAction?.properties?.tool?.enum, compactProposedActionTools) ||
    !Array.isArray(proposedArgsSchemas) ||
    proposedArgsSchemas.length !== 3 ||
    !sameArray(proposedArgsSchemas[0]?.required, ['slug', 'kind', 'title']) ||
    !sameArray(proposedArgsSchemas[1]?.required, ['from', 'to', 'type']) ||
    !sameArray(proposedArgsSchemas[1]?.properties?.type?.enum, WRITE_RELATION_TYPE_VALUES) ||
    !sameArray(proposedArgsSchemas[2]?.required, ['slug', 'frontmatter', 'expected_mtime']) ||
    proposedArgsSchemas[2]?.properties?.frontmatter?.additionalProperties !== false ||
    schema.properties.actions.items?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.node?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.node?.properties?.slug?.type !== 'string' ||
    !sameArray(schema.properties.actions.items?.properties?.nodes?.type, ['array', 'object']) ||
    schema.properties.actions.items?.properties?.nodes?.items?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.nodes?.items?.properties?.slug?.type !== 'string' ||
    schema.properties.actions.items?.properties?.nodes?.additionalProperties?.additionalProperties !== false ||
    schema.properties.actions.items?.properties?.nodes?.additionalProperties?.properties?.slug?.type !== 'string'
  ) {
    return `${toolName} outputSchema postWriteMaintenance actions drift`;
  }
  for (const key of ['nextExecutableAction', 'nextReviewAction']) {
    const actionSchema = schema.properties?.[key];
    if (
      !sameArray(actionSchema?.type, ['object', 'null']) ||
      !sameArray(actionSchema?.required, compactActionRequired) ||
      actionSchema.properties?.score?.minimum !== 0 ||
      actionSchema.properties?.executable?.type !== 'boolean' ||
      !sameArray(actionSchema.properties?.proposedAction?.type, ['object', 'null']) ||
      !sameArray(actionSchema.properties?.proposedAction?.required, ['tool', 'args']) ||
      actionSchema.additionalProperties !== false ||
      actionSchema.properties?.proposedAction?.additionalProperties !== false ||
      !sameArray(actionSchema.properties?.proposedAction?.properties?.tool?.enum, compactProposedActionTools) ||
      actionSchema.properties?.proposedAction?.properties?.args?.oneOf?.length !== 3
    ) {
      return `${toolName} outputSchema postWriteMaintenance ${key} drift`;
    }
  }
  return null;
}

export function toolsListSchemaFailure(tools) {
  if (!Array.isArray(tools)) return 'tools/list response missing tools array';
  const schemaDriftTool = tools.find((tool) => tool?.inputSchema?.additionalProperties !== false);
  if (schemaDriftTool) {
    return `tools/list schema missing additionalProperties:false: ${schemaDriftTool.name || '(unknown)'}`;
  }
  const arrayMaxItemsFailure = inputArrayMaxItemsFailure(tools);
  if (arrayMaxItemsFailure) return arrayMaxItemsFailure;
  const titleDriftTool = tools.find((tool) => tool?.annotations?.title !== expectedToolTitle(tool?.name));
  if (titleDriftTool) {
    return `tools/list title annotation drift: ${titleDriftTool.name || '(unknown)'} (expected ${JSON.stringify(expectedToolTitle(titleDriftTool?.name))}, got ${JSON.stringify(titleDriftTool?.annotations?.title)})`;
  }
  const expectedReadTools = new Set(EXPECTED_READ_TOOLS);
  const annotationDriftTool = tools.find((tool) => tool?.annotations?.readOnlyHint !== expectedReadTools.has(tool?.name));
  if (annotationDriftTool) {
    return `tools/list readOnlyHint annotation drift: ${annotationDriftTool.name || '(unknown)'} (expected ${expectedReadTools.has(annotationDriftTool?.name)}, got ${JSON.stringify(annotationDriftTool?.annotations?.readOnlyHint)})`;
  }
  const openWorldDriftTool = tools.find((tool) => tool?.annotations?.openWorldHint !== false);
  if (openWorldDriftTool) {
    return `tools/list openWorldHint annotation drift: ${openWorldDriftTool.name || '(unknown)'} (expected false, got ${JSON.stringify(openWorldDriftTool?.annotations?.openWorldHint)})`;
  }
  const expectedDestructiveTools = new Set(EXPECTED_DESTRUCTIVE_TOOLS);
  const destructiveDriftTool = tools.find((tool) => tool?.annotations?.destructiveHint !== expectedDestructiveTools.has(tool?.name));
  if (destructiveDriftTool) {
    return `tools/list destructiveHint annotation drift: ${destructiveDriftTool.name || '(unknown)'} (expected ${expectedDestructiveTools.has(destructiveDriftTool?.name)}, got ${JSON.stringify(destructiveDriftTool?.annotations?.destructiveHint)})`;
  }
  const expectedIdempotentTools = new Set(EXPECTED_IDEMPOTENT_TOOLS);
  const idempotentDriftTool = tools.find((tool) => tool?.annotations?.idempotentHint !== expectedIdempotentTools.has(tool?.name));
  if (idempotentDriftTool) {
    return `tools/list idempotentHint annotation drift: ${idempotentDriftTool.name || '(unknown)'} (expected ${expectedIdempotentTools.has(idempotentDriftTool?.name)}, got ${JSON.stringify(idempotentDriftTool?.annotations?.idempotentHint)})`;
  }

  const listConceptsTool = tools.find((tool) => tool?.name === 'list_concepts');
  if (!listConceptsTool) return 'tools/list response missing list_concepts tool';
  const listKindSchema = propertyAt(listConceptsTool, ['properties', 'kind']);
  if (
    listKindSchema?.type !== 'string' ||
    listKindSchema.minLength !== 1 ||
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
  const listSummarySchema = propertyAt(listConceptsTool, ['properties', 'summary']);
  if (
    listSummarySchema?.type !== 'boolean' ||
    !/summary.*max 200 chars/i.test(listSummarySchema?.description ?? '') ||
    !/without N follow-up `get_concept` calls/i.test(listSummarySchema?.description ?? '') ||
    !/Default false/i.test(listSummarySchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema summary preview guidance drift';
  }
  const listLimitSchema = propertyAt(listConceptsTool, ['properties', 'limit']);
  if (
    listLimitSchema?.type !== 'integer' ||
    listLimitSchema.minimum !== 1 ||
    listLimitSchema.maximum !== 500 ||
    !/Defaults to 100/i.test(listLimitSchema?.description ?? '') ||
    !/max 500/i.test(listLimitSchema?.description ?? '')
  ) {
    return 'list_concepts inputSchema limit default description drift';
  }
  if (listConceptsTool.outputSchema?.type !== 'object') {
    return 'list_concepts outputSchema root drift';
  }
  if (!sameArray(listConceptsTool.outputSchema?.required, ['total', 'vaultRoot', 'nodes'])) {
    return 'list_concepts outputSchema required drift';
  }
  if (listConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'list_concepts outputSchema root openness drift';
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
  if (listNodesSchema.items?.additionalProperties !== false) {
    return 'list_concepts outputSchema node openness drift';
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

  const getConceptTool = tools.find((tool) => tool?.name === 'get_concept');
  if (!getConceptTool) return 'tools/list response missing get_concept tool';
  if (getConceptTool.outputSchema?.type !== 'object') {
    return 'get_concept outputSchema root drift';
  }
  if (!sameArray(getConceptTool.outputSchema?.required, ['slug', 'frontmatter', 'excerpt', 'neighbors', 'outgoingEdges', 'mtime'])) {
    return 'get_concept outputSchema required drift';
  }
  if (getConceptTool.outputSchema?.additionalProperties !== false) {
    return 'get_concept outputSchema root openness drift';
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
  const getConceptNeighborsFailure = conceptNeighborsSchemaFailure(getConceptNeighborsSchema, 'get_concept');
  if (getConceptNeighborsFailure) return getConceptNeighborsFailure;
  const getConceptEdgesSchema = outputPropertyAt(getConceptTool, ['properties', 'outgoingEdges']);
  const getConceptEdgesFailure = outgoingEdgesSchemaFailure(getConceptEdgesSchema, 'get_concept');
  if (getConceptEdgesFailure) return getConceptEdgesFailure;
  const getConceptMtimeSchema = outputPropertyAt(getConceptTool, ['properties', 'mtime']);
  if (getConceptMtimeSchema?.type !== 'number' || getConceptMtimeSchema.minimum !== 0) {
    return 'get_concept outputSchema mtime drift';
  }
  const getConceptWarningsFailure = vaultWarningsSchemaFailure(
    outputPropertyAt(getConceptTool, ['properties', 'warnings']),
    'get_concept',
  );
  if (getConceptWarningsFailure) return getConceptWarningsFailure;

  const getConceptsTool = tools.find((tool) => tool?.name === 'get_concepts');
  if (!getConceptsTool) return 'tools/list response missing get_concepts tool';
  if (
    !/saves K-1 round-trips/i.test(getConceptsTool.description || '') ||
    !/Order of `concepts\[\]` matches input `slugs\[\]`/i.test(getConceptsTool.description || '') ||
    !/Missing or invalid slug rows return/i.test(getConceptsTool.description || '') ||
    !/later valid slugs still resolve/i.test(getConceptsTool.description || '')
  ) {
    return 'get_concepts description missing batch partial-result guidance';
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
  if (!sameArray(getConceptsItemsSchema.required, ['ok', 'slug'])) {
    return 'get_concepts outputSchema row required drift';
  }
  if (getConceptsItemsSchema.additionalProperties !== false) {
    return 'get_concepts outputSchema row openness drift';
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
    findEvidenceTitleSchema.minLength !== 1 ||
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
    !sameArray(evidenceMatchesSchema.items?.required, ['slug', 'kind', 'title', 'mtime', 'matchedIn', 'excerpt'])
  ) {
    return 'find_evidence outputSchema matches drift';
  }
  if (evidenceMatchesSchema.items?.additionalProperties !== false) {
    return 'find_evidence outputSchema match openness drift';
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
    findBacklinksSlugSchema.minLength !== 1 ||
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
  const backlinksMatchesSchema = outputPropertyAt(findBacklinksTool, ['properties', 'matches']);
  if (
    backlinksMatchesSchema?.type !== 'array' ||
    backlinksMatchesSchema.items?.type !== 'object' ||
    !sameArray(backlinksMatchesSchema.items?.required, ['slug', 'kind', 'title', 'mtime'])
  ) {
    return 'find_backlinks outputSchema matches drift';
  }
  if (backlinksMatchesSchema.items?.additionalProperties !== false) {
    return 'find_backlinks outputSchema match openness drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (backlinksMatchesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_backlinks outputSchema match ${propertyName} drift`;
    }
  }
  if (backlinksMatchesSchema.items?.properties?.mtime?.type !== 'number' || backlinksMatchesSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'find_backlinks outputSchema match mtime drift';
  }
  if (backlinksMatchesSchema.items?.properties?.matchedKeys?.type !== 'array' || backlinksMatchesSchema.items?.properties?.matchedKeys?.items?.type !== 'string') {
    return 'find_backlinks outputSchema match matchedKeys drift';
  }
  if (backlinksMatchesSchema.items?.properties?.matchedInBody?.type !== 'boolean') {
    return 'find_backlinks outputSchema match matchedInBody drift';
  }

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
    !/Defaults to 100/i.test(neighborsLimitInputSchema?.description ?? '') ||
    !/max 500/i.test(neighborsLimitInputSchema?.description ?? '')
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
    !sameArray(neighborsNodesSchema.items?.required, ['slug', 'kind', 'title', 'mtime'])
  ) {
    return 'find_neighbors outputSchema nodes drift';
  }
  if (neighborsNodesSchema.items?.additionalProperties !== false) {
    return 'find_neighbors outputSchema node openness drift';
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
    !/default 5/i.test(findPathMaxHopsSchema?.description ?? '') ||
    !/max 20/i.test(findPathMaxHopsSchema?.description ?? '')
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
  for (const propertyName of ['from', 'to', 'via']) {
    if (findPathEdgesSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `find_path outputSchema edge ${propertyName} drift`;
    }
  }
  const findPathNodesSchema = outputPropertyAt(findPathTool, ['properties', 'nodes']);
  if (
    findPathNodesSchema?.type !== 'array' ||
    findPathNodesSchema.items?.type !== 'object' ||
    !sameArray(findPathNodesSchema.items?.required, ['slug', 'kind', 'title'])
  ) {
    return 'find_path outputSchema nodes drift';
  }
  if (findPathNodesSchema.items?.additionalProperties !== false) {
    return 'find_path outputSchema node openness drift';
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
    !/Defaults to 100/i.test(queryLimitSchema.description || '') ||
    !/max 500/i.test(queryLimitSchema.description || '')
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
    !sameArray(queryConceptsRowsSchema.items?.required, ['slug', 'kind', 'title', 'mtime'])
  ) {
    return 'query_concepts outputSchema rows drift';
  }
  if (queryConceptsRowsSchema.items?.additionalProperties !== false) {
    return 'query_concepts outputSchema row openness drift';
  }
  for (const propertyName of ['slug', 'kind', 'title']) {
    if (queryConceptsRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `query_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (queryConceptsRowsSchema.items?.properties?.mtime?.type !== 'number' || queryConceptsRowsSchema.items?.properties?.mtime?.minimum !== 0) {
    return 'query_concepts outputSchema row mtime drift';
  }

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
    !/omit `nodes` \/ `edges` \/ `aliases`/i.test(compileSummarySchema.description || '') ||
    !/Cheap polling for cache invalidation/i.test(compileSummarySchema.description || '')
  ) {
    return 'compile_ontology summary schema guidance drift';
  }
  const compileNodesLimitSchema = propertyAt(compileTool, ['properties', 'nodesLimit']);
  if (
    compileNodesLimitSchema?.type !== 'integer' ||
    compileNodesLimitSchema.minimum !== 1 ||
    compileNodesLimitSchema.maximum !== 500 ||
    !/Pair with `nodesOffset` to paginate/i.test(compileNodesLimitSchema.description || '') ||
    !/max 500/i.test(compileNodesLimitSchema.description || '')
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
    !sameArray(compileNodeSchema.required, ['slug', 'kind', 'title', 'mtime', 'outDegree', 'inDegree']) ||
    compileNodeSchema.properties?.slug?.type !== 'string' ||
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

  const analyzeTool = tools.find((tool) => tool?.name === 'analyze_repo_structure');
  if (!analyzeTool) return 'tools/list response missing analyze_repo_structure tool';
  if (
    !/analyze a code repository and propose ontology node candidates/i.test(analyzeTool.description || '') ||
    !/side effect 0 \(vault frontmatter NOT modified\)/i.test(analyzeTool.description || '') ||
    !/Returns deterministic candidates/i.test(analyzeTool.description || '') ||
    !/should review and selectively pass to add_concept/i.test(analyzeTool.description || '') ||
    !/bootstrap the ontology/i.test(analyzeTool.description || '') ||
    !/Single source of truth preserved/i.test(analyzeTool.description || '')
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
  if (!sameArray(analyzeTool.outputSchema?.required, ['rootPath', 'framework', 'domains', 'capabilities', 'elements', 'suggestedRelations', 'skipped'])) {
    return 'analyze_repo_structure outputSchema required drift';
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
    if (
      rowsSchema?.type !== 'array' ||
      rowsSchema.items?.type !== 'object' ||
      !sameArray(rowsSchema.items?.required, ['slug', 'title', 'evidence'])
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

  const inferImportsTool = tools.find((tool) => tool?.name === 'infer_imports');
  if (!inferImportsTool) return 'tools/list response missing infer_imports tool';
  if (
    !/walk TS\/JS files in a code repo and infer file-level \+ module-level import edges/i.test(inferImportsTool.description || '') ||
    !/side effect 0 \(vault frontmatter NOT modified\)/i.test(inferImportsTool.description || '') ||
    !/reviews moduleEdges/i.test(inferImportsTool.description || '') ||
    !/kindCounts/i.test(inferImportsTool.description || '') ||
    !/selectively passes accepted edges to add_relation as `depends_on`/i.test(inferImportsTool.description || '') ||
    !/Use after analyze_repo_structure/i.test(inferImportsTool.description || '') ||
    !/not just suggestedRelations heuristics/i.test(inferImportsTool.description || '') ||
    !/Single source of truth preserved/i.test(inferImportsTool.description || '')
  ) {
    return 'infer_imports description missing dependency-ingest safety guidance';
  }
  const inferMaxFilesSchema = propertyAt(inferImportsTool, ['properties', 'maxFiles']);
  if (
    inferMaxFilesSchema?.type !== 'integer' ||
    inferMaxFilesSchema.minimum !== 1 ||
    inferMaxFilesSchema.maximum !== 50000 ||
    !/default 5000/i.test(inferMaxFilesSchema.description || '') ||
    !/max 50000/i.test(inferMaxFilesSchema.description || '') ||
    !/avoid pathological monorepos/i.test(inferMaxFilesSchema.description || '')
  ) {
    return 'infer_imports maxFiles hard-stop guidance drift';
  }
  if (inferImportsTool.outputSchema?.type !== 'object') {
    return 'infer_imports outputSchema root drift';
  }
  if (!sameArray(inferImportsTool.outputSchema?.required, ['rootPath', 'filesScanned', 'edges', 'externalImports', 'unresolved', 'moduleEdges'])) {
    return 'infer_imports outputSchema required drift';
  }
  if (inferImportsTool.outputSchema?.additionalProperties !== false) {
    return 'infer_imports outputSchema root openness drift';
  }
  if (outputPropertyAt(inferImportsTool, ['properties', 'rootPath'])?.type !== 'string') {
    return 'infer_imports outputSchema rootPath drift';
  }
  const filesScannedSchema = outputPropertyAt(inferImportsTool, ['properties', 'filesScanned']);
  if (filesScannedSchema?.type !== 'integer' || filesScannedSchema.minimum !== 0) {
    return 'infer_imports outputSchema filesScanned drift';
  }
  const importEdgeSchema = outputPropertyAt(inferImportsTool, ['properties', 'edges']);
  if (
    importEdgeSchema?.type !== 'array' ||
    importEdgeSchema.items?.type !== 'object' ||
    !sameArray(importEdgeSchema.items?.required, ['from', 'to', 'kind'])
  ) {
    return 'infer_imports outputSchema edges drift';
  }
  if (importEdgeSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema edge openness drift';
  }
  if (!sameArray(importEdgeSchema.items?.properties?.kind?.enum, IMPORT_EDGE_KIND_VALUES)) {
    return 'infer_imports outputSchema edge kind drift';
  }
  const externalImportsSchema = outputPropertyAt(inferImportsTool, ['properties', 'externalImports']);
  if (
    externalImportsSchema?.type !== 'array' ||
    externalImportsSchema.items?.type !== 'object' ||
    !sameArray(externalImportsSchema.items?.required, ['from', 'spec'])
  ) {
    return 'infer_imports outputSchema externalImports drift';
  }
  if (externalImportsSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema externalImports openness drift';
  }
  const unresolvedSchema = outputPropertyAt(inferImportsTool, ['properties', 'unresolved']);
  if (
    unresolvedSchema?.type !== 'array' ||
    unresolvedSchema.items?.type !== 'object' ||
    !sameArray(unresolvedSchema.items?.required, ['from', 'spec', 'reason'])
  ) {
    return 'infer_imports outputSchema unresolved drift';
  }
  if (unresolvedSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema unresolved openness drift';
  }
  if (!sameArray(unresolvedSchema.items?.properties?.reason?.enum, IMPORT_UNRESOLVED_REASON_VALUES)) {
    return 'infer_imports outputSchema unresolved reason drift';
  }
  const moduleEdgesSchema = outputPropertyAt(inferImportsTool, ['properties', 'moduleEdges']);
  if (
    moduleEdgesSchema?.type !== 'array' ||
    moduleEdgesSchema.items?.type !== 'object' ||
    !sameArray(moduleEdgesSchema.items?.required, ['from', 'to', 'count', 'kindCounts'])
  ) {
    return 'infer_imports outputSchema moduleEdges drift';
  }
  if (moduleEdgesSchema.items?.additionalProperties !== false) {
    return 'infer_imports outputSchema moduleEdges openness drift';
  }
  if (moduleEdgesSchema.items?.properties?.count?.type !== 'integer' || moduleEdgesSchema.items?.properties?.count?.minimum !== 1) {
    return 'infer_imports outputSchema moduleEdges count drift';
  }
  const moduleKindCountsSchema = moduleEdgesSchema.items?.properties?.kindCounts;
  const moduleKindCountKeys = IMPORT_EDGE_KIND_VALUES;
  if (
    moduleKindCountsSchema?.type !== 'object' ||
    moduleKindCountsSchema.additionalProperties !== false ||
    moduleKindCountsSchema.minProperties !== 1 ||
    !moduleKindCountsSchema.properties ||
    moduleKindCountKeys.some((kind) => (
      moduleKindCountsSchema.properties?.[kind]?.type !== 'integer' ||
      moduleKindCountsSchema.properties?.[kind]?.minimum !== 1
    ))
  ) {
    return 'infer_imports outputSchema moduleEdges kindCounts drift';
  }

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
  if (!sameArray(listKindsTool.outputSchema?.required, ['total', 'byKind'])) {
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
  if (!sameArray(validateTool.outputSchema?.required, ['scanned', 'problems', 'summary'])) {
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
  if (!kindDescription.includes(`(${NODE_KIND_DESCRIPTION})`) || !/recommend_relations currently supports capability or element/.test(kindDescription)) {
    return 'query_ontology kind graph kind description drift';
  }
  const fromKindDescription = propertyAt(queryTool, ['properties', 'fromKind'])?.description ?? '';
  if (!fromKindDescription.includes(`(${NODE_KIND_DESCRIPTION})`) || !/Source must be a real ontology node, not external\/unresolved/.test(fromKindDescription)) {
    return 'query_ontology fromKind graph kind description drift';
  }
  const toKind = propertyAt(queryTool, ['properties', 'toKind']);
  if (toKind?.type !== 'string' || !sameArray(toKind.enum, EDGE_TARGET_KIND_VALUES)) {
    return 'query_ontology toKind graph kind enum schema drift';
  }
  const toKindDescription = toKind?.description ?? '';
  if (!toKindDescription.includes(`(${EDGE_TARGET_KIND_DESCRIPTION})`) || !/Use external or unresolved for non-node refs/.test(toKindDescription)) {
    return 'query_ontology toKind graph kind description drift';
  }
  if (!/current-page `nextExecutableAction` \/ `nextReviewAction` pointers/.test(queryTool.description || '')) {
    return 'query_ontology description missing current-page maintenance next pointers';
  }
  if (!/cursor `nextAfterActionId`\/`hasMore` pagination metadata/.test(queryTool.description || '')) {
    return 'query_ontology description missing maintenance cursor pagination metadata';
  }
  if (
    !/agent_brief[\s\S]*resultContracts[\s\S]*all_paths completeness/.test(queryTool.description || '') ||
    !/all_paths[\s\S]*limit\/searchBudget\/exhaustive\/truncatedByBudget\/totalPathsExact metadata and evidence guidance/.test(queryTool.description || '')
  ) {
    return 'query_ontology description missing agent result contract guidance';
  }

  if (!/agent_brief[\s\S]*graphDbQueryPack[\s\S]*facets[\s\S]*schema[\s\S]*match_nodes[\s\S]*match_edges[\s\S]*domain_matrix[\s\S]*centrality[\s\S]*all_paths[\s\S]*explain_relation/.test(queryTool.description || '')) {
    return 'query_ontology description missing agent graph DB query pack guidance';
  }

  if (!/agent_brief[\s\S]*traversalStrategy[\s\S]*plan_before_enumeration[\s\S]*bounded_path_evidence[\s\S]*containment_cross_check/.test(queryTool.description || '')) {
    return 'query_ontology description missing agent traversal strategy guidance';
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
  if (!/nextExecutableAction\/nextReviewAction point only at the first executable\/review action in the current returned page/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing current-page next pointers';
  }
  if (!/action id, executable flag, phase, kind, and severity/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing current-page next pointer detail fields';
  }
  if (!/cursor\.nextAfterActionId matches the last returned action id/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing nextAfterActionId pagination guidance';
  }
  if (!/cursor\.hasMore matches whether more remaining actions exist after this page/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing hasMore pagination guidance';
  }
  if (!/cursor\.nextAfterActionId=null, cursor\.hasMore=false/.test(afterActionId?.description || '')) {
    return 'query_ontology afterActionId description missing unknown-cursor pagination guidance';
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
    orphanKindSchema.minLength !== 1 ||
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
    !sameArray(orphansRowsSchema.items?.required, ['slug', 'kind', 'title', 'mtime'])
  ) {
    return 'find_orphans outputSchema rows drift';
  }
  if (orphansRowsSchema.items?.additionalProperties !== false) {
    return 'find_orphans outputSchema row openness drift';
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

  const addConceptsTool = tools.find((candidate) => candidate?.name === 'add_concepts');
  if (!/non-object row shape/.test(addConceptsTool?.description || '') || !/unknown row field/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing row isolation guidance';
  }
  if (!/concepts\[n\]/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing row label guidance';
  }
  if (!/single unknown-field rows include `receivedField` plus one-row `unknownFields`/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing single-field repair guidance';
  }
  if (!/multi unknown-field rows report every unknown field/.test(addConceptsTool?.description || '') || !/Received fields/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing multi-field received fields guidance';
  }
  if (!/duplicate input slugs/.test(addConceptsTool?.description || '') || !/first-seen `concepts\[m\]`/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing duplicate row guidance';
  }
  if (!/structured `rowName` \/ `firstSeenAt`/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing duplicate structured row repair guidance';
  }
  if (!/Invalid-only batches return no row-level write metadata and no top-level `postWriteMaintenance`/.test(addConceptsTool?.description || '')) {
    return 'add_concepts description missing invalid-only no-write metadata guidance';
  }
  if (addConceptsTool.outputSchema?.type !== 'object') {
    return 'add_concepts outputSchema root drift';
  }
  if (!sameArray(addConceptsTool.outputSchema?.required, ['concepts'])) {
    return 'add_concepts outputSchema required drift';
  }
  if (addConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'add_concepts outputSchema root openness drift';
  }
  const addConceptRowsSchema = outputPropertyAt(addConceptsTool, ['properties', 'concepts']);
  if (
    addConceptRowsSchema?.type !== 'array' ||
    addConceptRowsSchema.items?.type !== 'object' ||
    !sameArray(addConceptRowsSchema.items?.required, ['slug', 'ok'])
  ) {
    return 'add_concepts outputSchema rows drift';
  }
  if (addConceptRowsSchema.items?.additionalProperties !== false) {
    return 'add_concepts outputSchema row openness drift';
  }
  if (addConceptRowsSchema.items?.properties?.slug?.type !== 'string') {
    return 'add_concepts outputSchema row slug drift';
  }
  if (addConceptRowsSchema.items?.properties?.ok?.type !== 'boolean') {
    return 'add_concepts outputSchema row ok drift';
  }
  if (addConceptRowsSchema.items?.properties?.filePath?.type !== 'string') {
    return 'add_concepts outputSchema row filePath drift';
  }
  if (addConceptRowsSchema.items?.properties?.changed?.type !== 'boolean') {
    return 'add_concepts outputSchema row changed drift';
  }
  if (addConceptRowsSchema.items?.properties?.warnings?.type !== 'array' || addConceptRowsSchema.items?.properties?.warnings?.items?.type !== 'string') {
    return 'add_concepts outputSchema row warnings drift';
  }
  if (addConceptRowsSchema.items?.properties?.error?.type !== 'string') {
    return 'add_concepts outputSchema row error drift';
  }
  for (const propertyName of ['errorCode', 'valueName', 'suggestion', 'rowName', 'receivedField', 'conflictSubject', 'conflictSlug', 'firstSeenAt']) {
    if (addConceptRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (addConceptRowsSchema.items?.properties?.receivedValue?.type !== 'string') {
    return 'add_concepts outputSchema row receivedValue drift';
  }
  if (addConceptRowsSchema.items?.properties?.unknownFields?.type !== 'array') {
    return 'add_concepts outputSchema row unknownFields drift';
  }
  const addConceptsUnknownFieldsFailure = unknownFieldsItemSchemaFailure(
    addConceptRowsSchema.items?.properties?.unknownFields,
    'add_concepts',
  );
  if (addConceptsUnknownFieldsFailure) return addConceptsUnknownFieldsFailure;
  for (const propertyName of ['allowedValues', 'allowedFields', 'receivedFields', 'recoveryTools', 'avoidTools']) {
    if (stringArraySchemaFailure(addConceptRowsSchema.items?.properties?.[propertyName])) {
      return `add_concepts outputSchema row ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(addConceptsTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'add_concepts outputSchema postWriteMaintenance drift';
  }

  const addConceptTool = tools.find((candidate) => candidate?.name === 'add_concept');
  if (!addConceptTool) return 'tools/list response missing add_concept tool';
  if (addConceptTool.outputSchema?.type !== 'object') {
    return 'add_concept outputSchema root drift';
  }
  if (!sameArray(addConceptTool.outputSchema?.required, ['ok', 'slug', 'filePath', 'changed'])) {
    return 'add_concept outputSchema required drift';
  }
  if (addConceptTool.outputSchema?.additionalProperties !== false) {
    return 'add_concept outputSchema root openness drift';
  }
  for (const propertyName of ['slug', 'filePath']) {
    if (outputPropertyAt(addConceptTool, ['properties', propertyName])?.type !== 'string') {
      return `add_concept outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(addConceptTool, ['properties', 'ok'])?.type !== 'boolean') {
    return 'add_concept outputSchema ok drift';
  }
  if (outputPropertyAt(addConceptTool, ['properties', 'changed'])?.type !== 'boolean') {
    return 'add_concept outputSchema changed drift';
  }
  const addConceptWarningsSchema = outputPropertyAt(addConceptTool, ['properties', 'warnings']);
  if (addConceptWarningsSchema?.type !== 'array' || addConceptWarningsSchema.items?.type !== 'string') {
    return 'add_concept outputSchema warnings drift';
  }
  if (outputPropertyAt(addConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'add_concept outputSchema postWriteMaintenance drift';
  }

  const addRelationsTool = tools.find((candidate) => candidate?.name === 'add_relations');
  const addRelationInputType = propertyAt(addRelationsTool, ['properties', 'relations', 'items', 'properties', 'type']);
  if (!sameArray(addRelationInputType?.enum, WRITE_RELATION_TYPE_VALUES)) {
    return 'add_relations inputSchema type enum drift';
  }
  if (!/non-object row shape/.test(addRelationsTool?.description || '') || !/unknown row field/.test(addRelationsTool?.description || '') || !/unknown type/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing row isolation guidance';
  }
  if (!/relations\[n\]/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing row label guidance';
  }
  if (!/structured `rowName`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing structured rowName guidance';
  }
  if (!/single unknown-field rows include `receivedField` plus one-row `unknownFields`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing single-field repair guidance';
  }
  if (!/multi unknown-field rows report every unknown field/.test(addRelationsTool?.description || '') || !/Received fields/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing multi-field received fields guidance';
  }
  if (!/`allowedFields`, `receivedFields`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing structured field-list guidance';
  }
  if (!/closest-value hint/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing closest-value type guidance';
  }
  if (!/structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing structured value repair guidance';
  }
  if (!/Invalid-only batches return no row-level `changed` \/ `alreadyExists` write metadata and no top-level `postWriteMaintenance`/.test(addRelationsTool?.description || '')) {
    return 'add_relations description missing invalid-only no-write metadata guidance';
  }
  if (addRelationsTool.outputSchema?.type !== 'object') {
    return 'add_relations outputSchema root drift';
  }
  if (!sameArray(addRelationsTool.outputSchema?.required, ['relations'])) {
    return 'add_relations outputSchema required drift';
  }
  if (addRelationsTool.outputSchema?.additionalProperties !== false) {
    return 'add_relations outputSchema root openness drift';
  }
  const addRelationRowsSchema = outputPropertyAt(addRelationsTool, ['properties', 'relations']);
  if (
    addRelationRowsSchema?.type !== 'array' ||
    addRelationRowsSchema.items?.type !== 'object' ||
    !sameArray(addRelationRowsSchema.items?.required, ['ok', 'from', 'to', 'type'])
  ) {
    return 'add_relations outputSchema rows drift';
  }
  if (addRelationRowsSchema.items?.additionalProperties !== false) {
    return 'add_relations outputSchema row openness drift';
  }
  for (const propertyName of ['from', 'to', 'type']) {
    if (addRelationRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }
  if (addRelationRowsSchema.items?.properties?.ok?.type !== 'boolean') {
    return 'add_relations outputSchema row ok drift';
  }
  if (addRelationRowsSchema.items?.properties?.alreadyExists?.type !== 'boolean') {
    return 'add_relations outputSchema row alreadyExists drift';
  }
  if (addRelationRowsSchema.items?.properties?.key?.type !== 'string') {
    return 'add_relations outputSchema row key drift';
  }
  if (addRelationRowsSchema.items?.properties?.changed?.type !== 'boolean') {
    return 'add_relations outputSchema row changed drift';
  }
  if (addRelationRowsSchema.items?.properties?.error?.type !== 'string') {
    return 'add_relations outputSchema row error drift';
  }
  for (const propertyName of ['errorCode', 'valueName', 'suggestion', 'rowName', 'receivedField', 'missingSubject', 'missingSlug', 'createTool']) {
    if (addRelationRowsSchema.items?.properties?.[propertyName]?.type !== 'string') {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }
  if (addRelationRowsSchema.items?.properties?.receivedValue?.type !== 'string') {
    return 'add_relations outputSchema row receivedValue drift';
  }
  if (addRelationRowsSchema.items?.properties?.unknownFields?.type !== 'array') {
    return 'add_relations outputSchema row unknownFields drift';
  }
  const addRelationsUnknownFieldsFailure = unknownFieldsItemSchemaFailure(
    addRelationRowsSchema.items?.properties?.unknownFields,
    'add_relations',
  );
  if (addRelationsUnknownFieldsFailure) return addRelationsUnknownFieldsFailure;
  for (const propertyName of ['allowedValues', 'allowedFields', 'receivedFields', 'similarSlugs', 'recoveryTools']) {
    if (stringArraySchemaFailure(addRelationRowsSchema.items?.properties?.[propertyName])) {
      return `add_relations outputSchema row ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(addRelationsTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'add_relations outputSchema postWriteMaintenance drift';
  }

  const addRelationTool = tools.find((candidate) => candidate?.name === 'add_relation');
  if (!addRelationTool) return 'tools/list response missing add_relation tool';
  const singleAddRelationInputType = propertyAt(addRelationTool, ['properties', 'type']);
  if (!sameArray(singleAddRelationInputType?.enum, WRITE_RELATION_TYPE_VALUES)) {
    return 'add_relation inputSchema type enum drift';
  }
  if (!/rejected before endpoint slug resolution/.test(addRelationTool?.description || '')) {
    return 'add_relation description missing type-preflight guidance';
  }
  if (!/closest-value hint/.test(addRelationTool?.description || '')) {
    return 'add_relation description missing closest-value type guidance';
  }
  if (!/structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/.test(addRelationTool?.description || '')) {
    return 'add_relation description missing structured value repair guidance';
  }
  if (!/no `changed`, `alreadyExists`, or `postWriteMaintenance` write metadata/.test(addRelationTool?.description || '')) {
    return 'add_relation description missing non-write preflight metadata guidance';
  }
  if (addRelationTool.outputSchema?.type !== 'object') {
    return 'add_relation outputSchema root drift';
  }
  if (!sameArray(addRelationTool.outputSchema?.required, ['ok', 'from', 'to', 'type'])) {
    return 'add_relation outputSchema required drift';
  }
  if (addRelationTool.outputSchema?.additionalProperties !== false) {
    return 'add_relation outputSchema root openness drift';
  }
  for (const propertyName of ['from', 'to', 'type', 'key']) {
    if (outputPropertyAt(addRelationTool, ['properties', propertyName])?.type !== 'string') {
      return `add_relation outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'changed', 'alreadyExists']) {
    if (outputPropertyAt(addRelationTool, ['properties', propertyName])?.type !== 'boolean') {
      return `add_relation outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(addRelationTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'add_relation outputSchema postWriteMaintenance drift';
  }

  const patchConceptTool = tools.find((candidate) => candidate?.name === 'patch_concept');
  if (!patchConceptTool) return 'tools/list response missing patch_concept tool';
  if (patchConceptTool.outputSchema?.type !== 'object') {
    return 'patch_concept outputSchema root drift';
  }
  if (!sameArray(patchConceptTool.outputSchema?.required, ['ok', 'slug', 'filePath', 'changed', 'postWriteMaintenance'])) {
    return 'patch_concept outputSchema required drift';
  }
  if (patchConceptTool.outputSchema?.additionalProperties !== false) {
    return 'patch_concept outputSchema root openness drift';
  }
  for (const propertyName of ['slug', 'filePath']) {
    if (outputPropertyAt(patchConceptTool, ['properties', propertyName])?.type !== 'string') {
      return `patch_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'changed']) {
    if (outputPropertyAt(patchConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `patch_concept outputSchema ${propertyName} drift`;
    }
  }
  if (outputPropertyAt(patchConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'patch_concept outputSchema postWriteMaintenance drift';
  }

  const renameConceptTool = tools.find((candidate) => candidate?.name === 'rename_concept');
  if (!renameConceptTool) return 'tools/list response missing rename_concept tool';
  if (renameConceptTool.outputSchema?.type !== 'object') {
    return 'rename_concept outputSchema root drift';
  }
  if (!sameArray(renameConceptTool.outputSchema?.required, ['ok', 'oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'moved', 'backlinkUpdates'])) {
    return 'rename_concept outputSchema required drift';
  }
  if (renameConceptTool.outputSchema?.additionalProperties !== false) {
    return 'rename_concept outputSchema root openness drift';
  }
  for (const propertyName of ['oldSlug', 'newSlug', 'sourcePath', 'targetPath', 'message']) {
    if (outputPropertyAt(renameConceptTool, ['properties', propertyName])?.type !== 'string') {
      return `rename_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'moved', 'changed']) {
    if (outputPropertyAt(renameConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `rename_concept outputSchema ${propertyName} drift`;
    }
  }
  const renameBacklinkFailure = backlinkRewritePlanSchemaFailure(
    outputPropertyAt(renameConceptTool, ['properties', 'backlinkUpdates']),
    'rename_concept',
  );
  if (renameBacklinkFailure) return renameBacklinkFailure;
  if (outputPropertyAt(renameConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'rename_concept outputSchema postWriteMaintenance drift';
  }

  const mergeConceptsTool = tools.find((candidate) => candidate?.name === 'merge_concepts');
  if (!mergeConceptsTool) return 'tools/list response missing merge_concepts tool';
  if (mergeConceptsTool.outputSchema?.type !== 'object') {
    return 'merge_concepts outputSchema root drift';
  }
  if (!sameArray(mergeConceptsTool.outputSchema?.required, ['ok', 'fromSlug', 'intoSlug', 'fromPath', 'deleted', 'backlinkUpdates', 'capturedFrom'])) {
    return 'merge_concepts outputSchema required drift';
  }
  if (mergeConceptsTool.outputSchema?.additionalProperties !== false) {
    return 'merge_concepts outputSchema root openness drift';
  }
  for (const propertyName of ['fromSlug', 'intoSlug', 'fromPath', 'message']) {
    if (outputPropertyAt(mergeConceptsTool, ['properties', propertyName])?.type !== 'string') {
      return `merge_concepts outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'deleted', 'changed']) {
    if (outputPropertyAt(mergeConceptsTool, ['properties', propertyName])?.type !== 'boolean') {
      return `merge_concepts outputSchema ${propertyName} drift`;
    }
  }
  const mergeBacklinkFailure = backlinkRewritePlanSchemaFailure(
    outputPropertyAt(mergeConceptsTool, ['properties', 'backlinkUpdates']),
    'merge_concepts',
  );
  if (mergeBacklinkFailure) return mergeBacklinkFailure;
  const mergeCapturedFailure = capturedDocSchemaFailure(
    outputPropertyAt(mergeConceptsTool, ['properties', 'capturedFrom']),
    'merge_concepts',
  );
  if (mergeCapturedFailure) return mergeCapturedFailure;
  if (outputPropertyAt(mergeConceptsTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'merge_concepts outputSchema postWriteMaintenance drift';
  }

  const deleteConceptTool = tools.find((candidate) => candidate?.name === 'delete_concept');
  if (!deleteConceptTool) return 'tools/list response missing delete_concept tool';
  if (deleteConceptTool.outputSchema?.type !== 'object') {
    return 'delete_concept outputSchema root drift';
  }
  if (!sameArray(deleteConceptTool.outputSchema?.required, ['ok', 'slug', 'filePath'])) {
    return 'delete_concept outputSchema required drift';
  }
  if (deleteConceptTool.outputSchema?.additionalProperties !== false) {
    return 'delete_concept outputSchema root openness drift';
  }
  for (const propertyName of ['slug', 'filePath', 'message']) {
    if (nonBlankStringSchemaFailure(outputPropertyAt(deleteConceptTool, ['properties', propertyName]))) {
      return `delete_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['ok', 'dryRun', 'forced', 'changed']) {
    if (outputPropertyAt(deleteConceptTool, ['properties', propertyName])?.type !== 'boolean') {
      return `delete_concept outputSchema ${propertyName} drift`;
    }
  }
  for (const propertyName of ['backlinks', 'backlinksAtDelete']) {
    const schema = outputPropertyAt(deleteConceptTool, ['properties', propertyName]);
    const backlinkRowsFailure = backlinkRowsSchemaFailure(schema, `delete_concept outputSchema ${propertyName}`);
    if (backlinkRowsFailure) return backlinkRowsFailure;
  }
  const deleteCapturedFailure = capturedDocSchemaFailure(
    outputPropertyAt(deleteConceptTool, ['properties', 'captured']),
    'delete_concept',
  );
  if (deleteCapturedFailure) return deleteCapturedFailure;
  if (outputPropertyAt(deleteConceptTool, ['properties', 'postWriteMaintenance'])?.type !== 'object') {
    return 'delete_concept outputSchema postWriteMaintenance drift';
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
    if (!/nextExecutableAction/.test(description) || !/nextReviewAction/.test(description)) {
      return `${toolName} description missing maintenance next action pointer guidance`;
    }
    if (!/byPhase/.test(description) || !/bySeverity/.test(description) || !/byKind/.test(description)) {
      return `${toolName} description missing maintenance bucket guidance`;
    }
    const schemaFailure = postWriteMaintenanceSchemaFailure(
      outputPropertyAt(tool, ['properties', 'postWriteMaintenance']),
      toolName,
    );
    if (schemaFailure) return schemaFailure;
  }

  return null;
}

export function strictArgsFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict arguments response was not rejected';
  }
  const structuredFailure = structuredErrorFailure(response, 'strict arguments', { errorCode: 'unknown_argument' });
  if (structuredFailure) return structuredFailure;
  const structured = response.result.structuredContent;
  const text = response.result.content?.[0]?.text || '';
  if (!/Unknown argument "lmit" for list_concepts/i.test(text)) {
    return 'strict arguments response did not report the unknown list_concepts argument';
  }
  if (!/Did you mean "limit"\?/i.test(text)) {
    return 'strict arguments response did not suggest the closest list_concepts argument';
  }
  if (!/Received arguments: lmit/i.test(text)) {
    return 'strict arguments response did not report the received list_concepts arguments';
  }
  if (structured?.receivedArgument !== 'lmit' || structured?.suggestion !== 'limit') {
    return 'strict arguments structured error missing repair hint';
  }
  if (!Array.isArray(structured?.unknownArguments) || structured.unknownArguments.length !== 1) {
    return 'strict arguments structured error missing unknown argument hint';
  }
  if (structured.unknownArguments[0]?.name !== 'lmit' || structured.unknownArguments[0]?.suggestion !== 'limit') {
    return 'strict arguments structured error missing canonical unknown argument hint';
  }
  if (!sameArray(structured?.allowedArguments, ['domain', 'kind', 'limit', 'since', 'summary'])) {
    return 'strict arguments structured error missing allowed arguments';
  }
  return null;
}

export function strictMultiArgsFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict multi-argument response was not rejected';
  }
  const structuredFailure = structuredErrorFailure(response, 'strict multi-argument', { errorCode: 'unknown_argument' });
  if (structuredFailure) return structuredFailure;
  const structured = response.result.structuredContent;
  const text = response.result.content?.[0]?.text || '';
  if (!/Unknown arguments for list_concepts/i.test(text)) {
    return 'strict multi-argument response did not report all unknown list_concepts arguments';
  }
  if (!/"lmit" \(did you mean "limit"\?\)/i.test(text)) {
    return 'strict multi-argument response did not suggest the closest limit argument';
  }
  if (!/"summry" \(did you mean "summary"\?\)/i.test(text)) {
    return 'strict multi-argument response did not suggest the closest summary argument';
  }
  if (!/Received arguments: lmit, summry/i.test(text)) {
    return 'strict multi-argument response did not report all received list_concepts arguments';
  }
  if (!sameArray(structured?.receivedArguments, ['lmit', 'summry'])) {
    return 'strict multi-argument structured error missing received arguments';
  }
  if (!sameArray(structured?.allowedArguments, ['domain', 'kind', 'limit', 'since', 'summary'])) {
    return 'strict multi-argument structured error missing allowed arguments';
  }
  if (!Array.isArray(structured?.unknownArguments) || structured.unknownArguments.length !== 2) {
    return 'strict multi-argument structured error missing unknown argument hints';
  }
  if (structured.unknownArguments[0]?.name !== 'lmit' || structured.unknownArguments[0]?.suggestion !== 'limit') {
    return 'strict multi-argument structured error missing limit hint';
  }
  if (structured.unknownArguments[1]?.name !== 'summry' || structured.unknownArguments[1]?.suggestion !== 'summary') {
    return 'strict multi-argument structured error missing summary hint';
  }
  return null;
}

export function strictUnknownToolFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict unknown-tool response was not rejected';
  }
  const structuredFailure = structuredErrorFailure(response, 'strict unknown-tool', { errorCode: 'unknown_tool' });
  if (structuredFailure) return structuredFailure;
  const structured = response.result.structuredContent;
  const text = response.result.content?.[0]?.text || '';
  if (!/Unknown tool: list_concept/i.test(text)) {
    return 'strict unknown-tool response did not report the unknown tool name';
  }
  if (!/Did you mean "list_concepts"\?/i.test(text)) {
    return 'strict unknown-tool response did not suggest the closest tool name';
  }
  if (!/Allowed tools: /i.test(text) || !/list_concepts/i.test(text)) {
    return 'strict unknown-tool response did not report the allowed tool list';
  }
  if (structured?.receivedTool !== 'list_concept' || structured?.suggestion !== 'list_concepts') {
    return 'strict unknown-tool structured error missing repair hint';
  }
  if (!sameArray(structured?.allowedTools, [...EXPECTED_TOOLS].sort())) {
    return 'strict unknown-tool structured error missing allowed tools';
  }
  return null;
}

export function structuredErrorFailure(response, label, { errorCode } = {}) {
  const structured = response?.result?.structuredContent;
  if (structured?.ok !== false || typeof structured.error !== 'string' || structured.error.trim() === '') {
    return `${label} structured error missing`;
  }
  const text = response?.result?.content?.[0]?.text || '';
  if (text && !text.includes(structured.error)) {
    return `${label} structured error mismatch`;
  }
  if (typeof structured.errorCode !== 'string' || structured.errorCode.trim() === '') {
    return `${label} structured error code missing`;
  }
  if (errorCode && structured.errorCode !== errorCode) {
    return `${label} structured error code mismatch — expected ${errorCode}, got ${structured.errorCode}`;
  }
  return null;
}

function structuredValueRepairFailure(
  response,
  label,
  { valueName, received, suggestion, allowedValues = [], requireSuggestion = true } = {},
) {
  const structuredFailure = structuredErrorFailure(response, label, { errorCode: 'invalid_arguments' });
  if (structuredFailure) return structuredFailure;
  const structured = response.result.structuredContent;
  if (structured?.valueName !== valueName || structured?.receivedValue !== received) {
    return `${label} structured error missing repair hint`;
  }
  if (requireSuggestion && structured?.suggestion !== suggestion) {
    return `${label} structured error missing repair hint`;
  }
  if (!sameArray(structured?.allowedValues, allowedValues)) {
    return `${label} structured error missing allowed values`;
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
  return structuredValueRepairFailure(response, 'strict enum', {
    valueName: 'operation',
    received: 'overveiw',
    suggestion: 'overview',
    allowedValues: QUERY_ONTOLOGY_OPERATIONS,
  });
}

export function strictMaintenanceFilterFailure(response, field = 'phases') {
  if (response?.result?.isError !== true) {
    return 'strict maintenance filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  const expected = field === 'severities'
    ? { allowed: MAINTENANCE_SEVERITY_VALUES, received: 'fatal', suggestion: 'fail' }
    : field === 'kinds'
      ? { allowed: MAINTENANCE_KIND_VALUES, received: 'add_mising_relation', suggestion: 'add_missing_relation' }
      : { allowed: MAINTENANCE_PHASE_VALUES, received: 'repiar', suggestion: 'repair' };
  const allowedPattern = new RegExp(expected.allowed.join(', '), 'i');
  if (!new RegExp(`${field} items must be one of`, 'i').test(text)) {
    return `strict maintenance filter response did not report the invalid maintenance_plan ${field} filter`;
  }
  if (!allowedPattern.test(text)) {
    return `strict maintenance filter response did not list allowed maintenance_plan ${field}`;
  }
  if (!new RegExp(`Received: "${expected.received}"`, 'i').test(text)) {
    return `strict maintenance filter response did not report the invalid maintenance_plan ${field} value`;
  }
  if (!new RegExp(`Did you mean "${expected.suggestion}"\\?`, 'i').test(text)) {
    return `strict maintenance filter response did not suggest the closest maintenance_plan ${field} value`;
  }
  return structuredValueRepairFailure(response, 'strict maintenance filter', {
    valueName: `${field} items`,
    received: expected.received,
    suggestion: expected.suggestion,
    allowedValues: expected.allowed,
  });
}

export function strictRelationFilterFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict relation filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/dependencyTypes items must be one of/i.test(text)) {
    return 'strict relation filter response did not report the invalid dependencyTypes filter';
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return 'strict relation filter response did not report the invalid dependencyTypes value';
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return 'strict relation filter response did not suggest the closest dependencyTypes value';
  }
  return structuredValueRepairFailure(response, 'strict relation filter', {
    valueName: 'dependencyTypes items',
    received: 'depend_on',
    suggestion: 'depends_on',
    allowedValues: RELATION_TYPE_VALUES,
  });
}

export function strictFindNeighborsTypeFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict find_neighbors types response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/types items must be one of/i.test(text)) {
    return 'strict find_neighbors types response did not report the invalid types filter';
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return 'strict find_neighbors types response did not report the invalid types value';
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return 'strict find_neighbors types response did not suggest the closest types value';
  }
  return structuredValueRepairFailure(response, 'strict find_neighbors types', {
    valueName: 'types items',
    received: 'depend_on',
    suggestion: 'depends_on',
    allowedValues: RELATION_TYPE_VALUES,
  });
}

export function strictFindOrphansKindFailure(
  response,
  { field = 'kind', received = 'capabilty', suggestion = 'capability' } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict find_orphans kind response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`${escapeRegExp(field)} must be one of`, 'i').test(text)) {
    return `strict find_orphans kind response did not report the invalid ${field} filter`;
  }
  if (!new RegExp(`Received: "${escapeRegExp(received)}"`, 'i').test(text)) {
    return `strict find_orphans kind response did not report the invalid ${field} value`;
  }
  if (!new RegExp(`Did you mean "${escapeRegExp(suggestion)}"\\?`, 'i').test(text)) {
    return `strict find_orphans kind response did not suggest the closest ${field} value`;
  }
  return structuredValueRepairFailure(response, 'strict find_orphans kind', {
    valueName: field,
    received,
    suggestion,
    allowedValues: NODE_KIND_VALUES,
  });
}

export function strictQueryConceptsFilterFailure(
  response,
  { field = 'kind', received = 'capabilty', suggestion = 'capability' } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict query_concepts filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`${escapeRegExp(field)} must be one of`, 'i').test(text)) {
    return `strict query_concepts filter response did not report the invalid ${field}`;
  }
  if (!new RegExp(`Received: "${escapeRegExp(received)}"`, 'i').test(text)) {
    return `strict query_concepts filter response did not report the invalid ${field} value`;
  }
  if (!new RegExp(`Did you mean "${escapeRegExp(suggestion)}"\\?`, 'i').test(text)) {
    return `strict query_concepts filter response did not suggest the closest ${field} value`;
  }
  return structuredValueRepairFailure(response, 'strict query_concepts filter', {
    valueName: field,
    received,
    suggestion,
    allowedValues: field === 'has key' ? GRAPH_ARRAY_KEYS : NODE_KIND_VALUES,
  });
}

export function strictListConceptsKindFailure(
  response,
  { received = 'capabilty', suggestion = 'capability' } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict list_concepts kind response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/kind must be one of/i.test(text)) {
    return 'strict list_concepts kind response did not report the invalid kind filter';
  }
  if (!new RegExp(`Received: "${escapeRegExp(received)}"`, 'i').test(text)) {
    return 'strict list_concepts kind response did not report the invalid kind value';
  }
  if (!new RegExp(`Did you mean "${escapeRegExp(suggestion)}"\\?`, 'i').test(text)) {
    return 'strict list_concepts kind response did not suggest the closest kind value';
  }
  return structuredValueRepairFailure(response, 'strict list_concepts kind', {
    valueName: 'kind',
    received,
    suggestion,
    allowedValues: NODE_KIND_VALUES,
  });
}

export function strictGraphKindFilterFailure(
  response,
  { field = 'kind', received = 'capabilty', suggestion = 'capability' } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict graph kind filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`${field} must be one of`, 'i').test(text)) {
    return `strict graph kind filter response did not report the invalid ${field} filter`;
  }
  if (!new RegExp(`Received: "${received}"`, 'i').test(text)) {
    return `strict graph kind filter response did not report the invalid ${field} value`;
  }
  if (!new RegExp(`Did you mean "${suggestion}"\\?`, 'i').test(text)) {
    return `strict graph kind filter response did not suggest the closest ${field} value`;
  }
  return structuredValueRepairFailure(response, 'strict graph kind filter', {
    valueName: field,
    received,
    suggestion,
    allowedValues: field === 'toKind' ? EDGE_TARGET_KIND_VALUES : NODE_KIND_VALUES,
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function strictRecommendRelationsKindFilterFailure(
  response,
  { received = 'capabilty', suggestion = 'capability', requireSuggestion = true } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict recommend_relations kind filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/kind must be one of/i.test(text)) {
    return 'strict recommend_relations kind filter response did not report the invalid kind filter';
  }
  if (!/capability, element/i.test(text)) {
    return 'strict recommend_relations kind filter response did not list the narrowed kind set';
  }
  if (!new RegExp(`Received: "${escapeRegExp(received)}"`, 'i').test(text)) {
    return 'strict recommend_relations kind filter response did not report the invalid kind value';
  }
  if (requireSuggestion && !new RegExp(`Did you mean "${escapeRegExp(suggestion)}"\\?`, 'i').test(text)) {
    return 'strict recommend_relations kind filter response did not suggest the closest kind value';
  }
  return structuredValueRepairFailure(response, 'strict recommend_relations kind filter', {
    valueName: 'kind',
    received,
    suggestion,
    requireSuggestion,
    allowedValues: ['capability', 'element'],
  });
}

export function strictMatchNodesSortFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict match_nodes sort response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/sort must be one of/i.test(text)) {
    return 'strict match_nodes sort response did not report the invalid sort filter';
  }
  if (!/degree, inDegree, outDegree, slug/i.test(text)) {
    return 'strict match_nodes sort response did not list allowed sort values';
  }
  if (!/Received: "outDegre"/i.test(text)) {
    return 'strict match_nodes sort response did not report the invalid sort value';
  }
  if (!/Did you mean "outDegree"\?/i.test(text)) {
    return 'strict match_nodes sort response did not suggest the closest sort value';
  }
  return structuredValueRepairFailure(response, 'strict match_nodes sort', {
    valueName: 'sort',
    received: 'outDegre',
    suggestion: 'outDegree',
    allowedValues: ['degree', 'inDegree', 'outDegree', 'slug'],
  });
}

export function strictRelationCheckFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict relation_check response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/type must be one of/i.test(text)) {
    return 'strict relation_check response did not report the invalid type filter';
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return 'strict relation_check response did not report the invalid type value';
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return 'strict relation_check response did not suggest the closest type value';
  }
  return structuredValueRepairFailure(response, 'strict relation_check', {
    valueName: 'type',
    received: 'depend_on',
    suggestion: 'depends_on',
    allowedValues: RELATION_TYPE_VALUES,
  });
}

export function strictMatchEdgesTypeFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict match_edges type response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/type must be one of/i.test(text)) {
    return 'strict match_edges type response did not report the invalid type filter';
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return 'strict match_edges type response did not report the invalid type value';
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return 'strict match_edges type response did not suggest the closest type value';
  }
  return structuredValueRepairFailure(response, 'strict match_edges type', {
    valueName: 'type',
    received: 'depend_on',
    suggestion: 'depends_on',
    allowedValues: RELATION_TYPE_VALUES,
  });
}

export function strictAddRelationFailure(response) {
  if (response?.result?.isError !== true) {
    return 'strict add_relation response was not rejected';
  }
  if (
    'changed' in (response.result || {}) ||
    'alreadyExists' in (response.result || {}) ||
    'postWriteMaintenance' in (response.result || {})
  ) {
    return 'strict add_relation response included write metadata';
  }
  if (
    'changed' in (response.result?.structuredContent || {}) ||
    'alreadyExists' in (response.result?.structuredContent || {}) ||
    'postWriteMaintenance' in (response.result?.structuredContent || {})
  ) {
    return 'strict add_relation structuredContent included write metadata';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!/type must be one of/i.test(text)) {
    return 'strict add_relation response did not report the invalid type filter';
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return 'strict add_relation response did not report the invalid type value';
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return 'strict add_relation response did not suggest the closest type value';
  }
  return structuredValueRepairFailure(response, 'strict add_relation', {
    valueName: 'type',
    received: 'depend_on',
    suggestion: 'depends_on',
    allowedValues: WRITE_RELATION_TYPE_VALUES,
  });
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
  if (!Object.hasOwn(parsed.cursor || {}, 'nextAfterActionId') || parsed.cursor.nextAfterActionId !== null) {
    return 'maintenance missing-cursor smoke should expose cursor.nextAfterActionId=null';
  }
  if (parsed.cursor?.hasMore !== false) {
    return 'maintenance missing-cursor smoke should expose cursor.hasMore=false';
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
  if (typeof parsed.cursor?.hasMore !== 'boolean') {
    return 'maintenance ready-cursor smoke should expose cursor.hasMore';
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
  const expectedNextAfterActionId = parsed.actions.length > 0
    ? parsed.actions[parsed.actions.length - 1]?.id
    : null;
  if (parsed.cursor?.nextAfterActionId !== expectedNextAfterActionId) {
    return 'maintenance ready-cursor smoke cursor.nextAfterActionId did not match last page action';
  }
  if (parsed.cursor?.hasMore !== (parsed.summary.remainingActions > parsed.actions.length)) {
    return 'maintenance ready-cursor smoke cursor.hasMore did not match remaining page state';
  }
  if (!Object.hasOwn(parsed, 'nextExecutableAction') || !Object.hasOwn(parsed, 'nextReviewAction')) {
    return 'maintenance ready-cursor smoke missing next action pointers';
  }
  const nextExecutableFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === true) ?? null,
    parsed.nextExecutableAction,
    'nextExecutableAction',
    true,
    'maintenance ready-cursor smoke',
  );
  if (nextExecutableFailure) return nextExecutableFailure;
  const nextReviewFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === false) ?? null,
    parsed.nextReviewAction,
    'nextReviewAction',
    false,
    'maintenance ready-cursor smoke',
  );
  if (nextReviewFailure) return nextReviewFailure;
  return null;
}

export function maintenanceResumeCursorFailure(previousPage, parsed, afterActionId) {
  if (parsed?.operation !== 'maintenance_plan') {
    return `maintenance resume-cursor smoke returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.sideEffect !== false) {
    return 'maintenance resume-cursor smoke must be side-effect-free';
  }
  if (parsed.cursor?.afterActionId !== afterActionId) {
    return 'maintenance resume-cursor smoke did not preserve afterActionId';
  }
  if (parsed.cursor?.found !== true) {
    return 'maintenance resume-cursor smoke did not report cursor.found=true';
  }
  if (!Object.hasOwn(parsed.cursor || {}, 'reason') || parsed.cursor.reason !== null) {
    return 'maintenance resume-cursor smoke did not expose cursor.reason=null';
  }
  if (parsed.cursor?.startIndex !== 1) {
    return 'maintenance resume-cursor smoke should start after the resumed action';
  }
  if (!Array.isArray(parsed.actions)) {
    return 'maintenance resume-cursor smoke response missing actions array';
  }
  const summaryFailure = maintenanceSummaryFailure(parsed.summary, 'maintenance resume-cursor smoke');
  if (summaryFailure) return summaryFailure;
  const expectedRemaining = Math.max(0, (previousPage?.summary?.remainingActions ?? 0) - 1);
  if (parsed.summary.remainingActions !== expectedRemaining) {
    return 'maintenance resume-cursor smoke remainingActions did not advance past afterActionId';
  }
  const bucketFailure = maintenanceBucketSummaryFailure(parsed, 'maintenance resume-cursor smoke');
  if (bucketFailure) return bucketFailure;
  if (parsed.actions.some((action) => action?.id === afterActionId)) {
    return 'maintenance resume-cursor smoke repeated the afterActionId action';
  }
  if (parsed.actions.length > parsed.summary.remainingActions) {
    return 'maintenance resume-cursor smoke actions exceed remainingActions';
  }
  const expectedNextAfterActionId = parsed.actions.length > 0
    ? parsed.actions[parsed.actions.length - 1]?.id
    : null;
  if (parsed.cursor?.nextAfterActionId !== expectedNextAfterActionId) {
    return 'maintenance resume-cursor smoke cursor.nextAfterActionId did not match last page action';
  }
  if (parsed.cursor?.hasMore !== (parsed.summary.remainingActions > parsed.actions.length)) {
    return 'maintenance resume-cursor smoke cursor.hasMore did not match remaining page state';
  }
  const nextExecutableFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === true) ?? null,
    parsed.nextExecutableAction,
    'nextExecutableAction',
    true,
    'maintenance resume-cursor smoke',
  );
  if (nextExecutableFailure) return nextExecutableFailure;
  const nextReviewFailure = maintenanceNextActionFailure(
    parsed.actions.find((action) => action?.executable === false) ?? null,
    parsed.nextReviewAction,
    'nextReviewAction',
    false,
    'maintenance resume-cursor smoke',
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

function maintenanceNextActionFailure(expectedAction, pointer, label, executable, context = 'maintenance ready-cursor smoke') {
  if (!expectedAction) {
    if (pointer !== null) {
      return `${context} unexpected ${label}`;
    }
    return null;
  }
  if (!pointer || typeof pointer !== 'object' || Array.isArray(pointer)) {
    return `${context} missing ${label}`;
  }
  if (pointer.id !== expectedAction.id) {
    return `${context} ${label} did not match first page action`;
  }
  if (pointer.executable !== executable) {
    return `${context} ${label} executable flag mismatch`;
  }
  for (const key of ['phase', 'kind', 'severity']) {
    if (
      typeof expectedAction[key] === 'string' &&
      expectedAction[key].length > 0 &&
      pointer[key] !== expectedAction[key]
    ) {
      return `${context} ${label} ${key} mismatch`;
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

  const missingTool = EXPECTED_TOOLS.find((toolName) => !new RegExp(`\\b${toolName}\\b`).test(instructions));
  if (missingTool) {
    return `initialize instructions missing tool inventory entry: ${missingTool}`;
  }

  const required = [
    ['read-only first-contact diagnosis', /read-only first-contact diagnosis/i],
    ['overwrite safety', /overwrite: true/],
    ['existing newSlug safety', /existing `newSlug`|existing newSlug/i],
    ['force safety', /force: true/],
    ['dangling referrers safety', /dangling referrers/i],
    ['expected_mtime conflict guard', /expected_mtime/],
    ['strict arguments guidance', /unknown arguments are rejected/i],
    ['unknown tool guidance', /unknown tool names are rejected[\s\S]*Unknown tool: list_concept[\s\S]*Did you mean "list_concepts"\?/i],
    ['structured errorCode guidance', /structuredContent[\s\S]*errorCode[\s\S]*unknown_tool[\s\S]*unknown_argument[\s\S]*invalid_arguments/i],
    ['structured repair fields guidance', /structuredContent[\s\S]*receivedTool[\s\S]*receivedArgument[\s\S]*unknownArguments[\s\S]*receivedValue[\s\S]*suggestion[\s\S]*allowedTools[\s\S]*allowedArguments[\s\S]*allowedValues/i],
    ['structured row field repair guidance', /structuredContent[\s\S]*rowName[\s\S]*receivedField[\s\S]*unknownFields[\s\S]*allowedFields[\s\S]*receivedFields[\s\S]*firstSeenAt/i],
    ['structured missing slug guidance', /missingSlug[\s\S]*similarSlugs[\s\S]*recoveryTools[\s\S]*createTool/i],
    ['structured conflict guidance', /conflictSlug[\s\S]*recoveryTools[\s\S]*overwriteOption/i],
    ['nearest argument hint guidance', /Did you mean "limit"\?/],
    ['multiple unknown arguments guidance', /Unknown arguments for list_concepts[\s\S]*"summry"[\s\S]*did you mean "summary"\?/i],
    ['batch row isolation guidance', /non-object row[\s\S]*unknown row fields[\s\S]*ok:\s*false/i],
    ['batch no-write metadata guidance', /Invalid-only batches return no row-level write metadata[\s\S]*no top-level `postWriteMaintenance`[\s\S]*dry validation evidence/i],
    ['batch relation no-write metadata guidance', /Invalid-only batches return no row-level `changed`[\s\S]*`alreadyExists`[\s\S]*no top-level `postWriteMaintenance`[\s\S]*dry validation evidence/i],
    ['batch relation type hint guidance', /unknown type[\s\S]*closest-value hint[\s\S]*Did you mean "depends_on"\?/i],
    ['batch duplicate slug guidance', /duplicate[\s\S]*slugs[\s\S]*concepts\[n\] duplicate slug in input batch; first seen at concepts\[m\]/i],
    ['nearest enum hint guidance', /Did you mean "overview"\?/],
    ['maintenance filter enum guidance', /phases.*severities.*kinds/],
    ['health tuning guidance', /componentLimit[\s\S]*cycleLimit[\s\S]*recommendationLimit[\s\S]*orderLimit[\s\S]*nodeLimit[\s\S]*dependencyTypes[\s\S]*componentTypes/],
    ['health relation filter enum guidance', /dependencyTypes[\s\S]*componentTypes[\s\S]*depends_on[\s\S]*contains[\s\S]*describes/],
    ['maintenance ready cursor guidance', /cursor\.found=true[\s\S]*cursor\.reason=null/],
    ['maintenance ready cursor pagination guidance', /cursor\.nextAfterActionId[\s\S]*last returned action id[\s\S]*cursor\.hasMore/],
    ['maintenance current-page pointer guidance', /nextExecutableAction[\s\S]*nextReviewAction[\s\S]*current returned page/],
    ['maintenance cursor miss guidance', /afterActionId[\s\S]*cursor\.found=false[\s\S]*cursor\.reason/],
    ['maintenance cursor miss pagination guidance', /cursor\.nextAfterActionId=null[\s\S]*cursor\.hasMore=false/],
    ['agent brief relation decision guide', /agent_brief[\s\S]*relationDecisionGuide[\s\S]*skip_existing[\s\S]*review_inverse[\s\S]*safe_to_add[\s\S]*review_new_schema/],
    ['agent brief graph DB query pack guidance', /agent_brief[\s\S]*graphDbQueryPack[\s\S]*facets[\s\S]*schema[\s\S]*match_nodes[\s\S]*match_edges[\s\S]*domain_matrix[\s\S]*centrality[\s\S]*all_paths[\s\S]*explain_relation/],
    ['agent brief traversal strategy guidance', /agent_brief[\s\S]*traversalStrategy[\s\S]*plan_before_enumeration[\s\S]*bounded_path_evidence[\s\S]*containment_cross_check/],
    ['agent brief result contracts guidance', /agent_brief[\s\S]*resultContracts[\s\S]*all_paths[\s\S]*limit[\s\S]*searchBudget[\s\S]*expandedStates[\s\S]*exhaustive[\s\S]*truncatedByBudget[\s\S]*totalPathsExact[\s\S]*evidence\.status[\s\S]*evidence\.reason[\s\S]*evidence\.pathsComplete/],
  ];
  for (const [label, pattern] of required) {
    if (!pattern.test(instructions)) {
      return `initialize instructions missing ${label}`;
    }
  }
  return null;
}

export function structuredContentFailure(response, parsed, label) {
  const structured = response?.result?.structuredContent;
  const status = structuredContentParityStatus(parsed, structured);
  if (status === 'missing') {
    return `${label} structuredContent missing`;
  }
  if (status === 'mismatch') {
    return `${label} structuredContent mismatch — ${structuredContentMismatchSummary(parsed, structured)}`;
  }
  return null;
}

export function structuredContentParityStatus(parsed, structured) {
  if (structured == null) return 'missing';
  return isDeepStrictEqual(structured, parsed) ? 'pass' : 'mismatch';
}

export function structuredContentMismatchSummary(parsed, structured) {
  const mismatch = firstMismatch(parsed, structured);
  if (!mismatch) return 'values differ';
  return `${mismatch.path}: parsed ${previewValue(mismatch.expected)}, structuredContent ${previewValue(mismatch.actual)}`;
}

function firstMismatch(expected, actual, path = '$') {
  if (isDeepStrictEqual(expected, actual)) return null;
  if (!expected || !actual || typeof expected !== 'object' || typeof actual !== 'object') {
    return { path, expected, actual };
  }
  const expectedIsArray = Array.isArray(expected);
  const actualIsArray = Array.isArray(actual);
  if (expectedIsArray !== actualIsArray) {
    return { path, expected, actual };
  }
  if (expectedIsArray) {
    const maxLength = Math.max(expected.length, actual.length);
    for (let index = 0; index < maxLength; index += 1) {
      if (!(index in expected) || !(index in actual)) {
        return { path: `${path}[${index}]`, expected: expected[index], actual: actual[index] };
      }
      const childMismatch = firstMismatch(expected[index], actual[index], `${path}[${index}]`);
      if (childMismatch) return childMismatch;
    }
    return { path, expected, actual };
  }
  const expectedKeys = Object.keys(expected);
  const actualExtraKeys = Object.keys(actual).filter((key) => !(key in expected));
  const keys = [...expectedKeys, ...actualExtraKeys];
  for (const key of keys) {
    if (!(key in expected) || !(key in actual)) {
      return { path: `${path}.${key}`, expected: expected[key], actual: actual[key] };
    }
    const childMismatch = firstMismatch(expected[key], actual[key], `${path}.${key}`);
    if (childMismatch) return childMismatch;
  }
  return { path, expected, actual };
}

function previewValue(value) {
  if (value === undefined) return 'undefined';
  const preview = JSON.stringify(value);
  if (preview == null) return String(value);
  return preview.length > 96 ? `${preview.slice(0, 93)}...` : preview;
}

export function structuredContentVerifySummary({
  hasNode = false,
  hasProject = false,
  hasGetConcept = false,
  hasFindBacklinks = false,
  hasDirectGraphReads = false,
  hasLimitedQueryConcepts = false,
  hasCompileIndexes = false,
  hasAllPaths = false,
  hasMaintenanceResume = false,
  hasMaintenanceResumeSkipped = false,
  destructiveDryRunCount = 0,
} = {}) {
  const direct = 11
    + (hasGetConcept ? 1 : 0)
    + (hasFindBacklinks ? 1 : 0)
    + (hasDirectGraphReads ? 2 : 0)
    + (hasLimitedQueryConcepts ? 1 : 0);
  const write = 2 + destructiveDryRunCount;
  const maintenance = 2 + (hasMaintenanceResume ? 1 : 0);
  const maintenanceSuffix = hasMaintenanceResumeSkipped ? ' (resume skipped: no actions)' : '';
  const graph = 8 + (hasNode ? 2 : 0) + (hasProject ? 1 : 0) + (hasCompileIndexes ? 1 : 0) + (hasAllPaths ? 1 : 0);
  return `direct ${direct}/${direct}, write ${write}/${write} (batch row-isolation 2/2, batch no-write metadata 2/2, destructive dry-run ${destructiveDryRunCount}/${destructiveDryRunCount}), maintenance ${maintenance}/${maintenance}${maintenanceSuffix}, graph ${graph}/${graph}`;
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
  [27, 'strict_multi_args'],
  [28, 'add_concepts_row_isolation'],
  [29, 'add_relations_row_isolation'],
  [30, 'maintenance_resume_cursor'],
  [31, 'get_concept'],
  [32, 'find_evidence'],
  [33, 'find_backlinks'],
  [34, 'query_concepts'],
  [35, 'find_neighbors'],
  [36, 'find_path'],
  [37, 'query_concepts_limited'],
  [38, 'analyze_repo_structure'],
  [39, 'infer_imports'],
  [40, 'strict_relation_filter'],
  [41, 'compile_ontology_page'],
  [42, 'compile_ontology_indexes'],
  [43, 'rename_concept_dry_run'],
  [44, 'merge_concepts_dry_run'],
  [45, 'delete_concept_dry_run'],
  [46, 'strict_relation_check'],
  [47, 'strict_graph_kind_filter'],
  [48, 'strict_graph_from_kind_filter'],
  [49, 'strict_graph_to_kind_filter'],
  [50, 'strict_add_relation'],
  [51, 'strict_recommend_relations_kind_filter'],
  [52, 'strict_recommend_relations_unsupported_kind_filter'],
  [53, 'strict_match_nodes_sort_filter'],
  [54, 'strict_match_edges_type_filter'],
  [55, 'strict_find_neighbors_type_filter'],
  [56, 'strict_find_orphans_kind_filter'],
  [57, 'strict_find_orphans_exclude_kind_filter'],
  [58, 'strict_query_concepts_kind_filter'],
  [59, 'strict_query_concepts_has_key_filter'],
  [60, 'strict_list_concepts_kind_filter'],
  [61, 'patch_concept_conflict_guard'],
  [62, 'add_concepts_batch_cap'],
  [63, 'add_relations_batch_cap'],
  [64, 'get_concepts_batch_cap'],
  [65, 'strict_unknown_tool'],
  [66, 'agent_brief'],
  [67, 'all_paths'],
]);

export const OPTIONAL_FIRST_CONTACT_RESPONSE_IDS = [
  30, // maintenance_resume_cursor — sent only when maintenance has an action to resume after.
  31, // get_concept — sent only when list_concepts returns a real node.
  33, // find_backlinks — sent only when list_concepts returns a real node.
  35, // find_neighbors — sent only when a direct graph-read target exists.
  36, // find_path — sent only when a direct graph-read target exists.
  37, // query_concepts_limited — sent only when the vault has a non-trivial excluded slug.
  43, // rename_concept_dry_run — sent only when a real writable node exists.
  44, // merge_concepts_dry_run — sent only when two real writable nodes exist.
  45, // delete_concept_dry_run — sent only when a real writable node exists.
  61, // patch_concept_conflict_guard — sent only when a real writable node exists.
];

export const DYNAMIC_FIRST_CONTACT_RESPONSE_IDS = [
  11, // get_concepts — sent after list_concepts returns the current sample slugs.
  13, // neighbors — sent after graph smoke target selection.
  14, // path — sent after graph smoke target selection.
  15, // project_scope — sent after project probe/listing discovers a project node.
  67, // all_paths — sent after graph smoke target selection.
  ...OPTIONAL_FIRST_CONTACT_RESPONSE_IDS,
];

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

export function parseVerifyKillGraceMs(env = process.env) {
  return parseVerifyTimeoutMs(env.OMOT_VERIFY_KILL_GRACE_MS, DEFAULT_VERIFY_KILL_GRACE_MS);
}

export function verifyKillGraceValueErrorMessage(env = process.env) {
  const value = env.OMOT_VERIFY_KILL_GRACE_MS;
  const received = value == null ? 'undefined' : JSON.stringify(String(value));
  return [
    'verify kill grace must be a positive integer wait window in milliseconds.',
    `Received: ${received}.`,
    'Set OMOT_VERIFY_KILL_GRACE_MS=N.',
  ].join(' ');
}

export function resolveVerifyVault({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  isMain = false,
} = {}) {
  return parseVerifyArgs({ env, argv, cwd, isMain }).vault;
}

export function verifyVaultPathError(vault, cwd = process.cwd()) {
  const resolved = resolve(cwd, vault);
  try {
    if (!statSync(resolved).isDirectory()) {
      return `vault path is not a directory: ${vault} (resolved ${resolved})`;
    }
    return null;
  } catch {
    return (
      `vault path does not exist: ${vault} (resolved ${resolved}). ` +
      'If you are running from the repo root with `pnpm --filter ./mcp verify -- ...`, use `../docs/ontology` for the dogfood vault.'
    );
  }
}

export function emptyVerifyVaultFailure(parsed) {
  if (!parsed || typeof parsed !== 'object' || parsed.total !== 0) return null;
  const root = typeof parsed.vaultRoot === 'string' && parsed.vaultRoot.length > 0
    ? ` (vaultRoot ${parsed.vaultRoot})`
    : '';
  return (
    `verify vault has 0 ontology nodes${root}. ` +
    'Point verify at a populated ontology vault; from the repo root with `pnpm --filter ./mcp verify -- ...`, use `../docs/ontology` for the dogfood vault.'
  );
}

export function parseVerifyArgs({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  isMain = false,
} = {}) {
  const args = normalizeVerifyArgs(isMain ? argv.slice(2) : []);
  let help = false;
  let error = null;
  let positionalVault = null;
  let timeoutMsRaw = null;
  const retryEnv = () => verifyRetryEnvForVault(positionalVault ?? findVerifyRetryVaultArg(args));

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      help = true;
    } else if (arg === '--timeout-ms') {
      const value = args[index + 1];
      if (typeof value !== 'string' || value.length === 0 || value.startsWith('-')) {
        error = verifyTimeoutValueErrorMessage(value, retryEnv());
        break;
      }
      timeoutMsRaw = value;
      index += 1;
    } else if (arg.startsWith('--timeout-ms=')) {
      const value = arg.slice('--timeout-ms='.length);
      if (value.length === 0) {
        error = verifyTimeoutValueErrorMessage(value, retryEnv());
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
      error = formatUnknownVerifyOption(arg);
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

export function normalizeVerifyArgs(args = []) {
  return args[0] === '--' ? args.slice(1) : args;
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

function findVerifyRetryVaultArg(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--vault') {
      const value = parseVerifyVaultArg(args[index + 1]);
      if (value !== false) return value;
      index += 1;
    } else if (arg.startsWith('--vault=')) {
      const value = parseVerifyVaultArg(arg.slice('--vault='.length));
      if (value !== false) return value;
    } else if (!arg.startsWith('-')) {
      const value = parseVerifyVaultArg(arg);
      if (value !== false) return value;
    }
  }
  return null;
}

function formatUnknownVerifyOption(arg) {
  const suggestion = closestVerifyFlag(arg);
  const suggestionText = suggestion ? ` Did you mean ${suggestion}?` : '';
  return `Unknown option: ${arg}.${suggestionText}`;
}

function closestVerifyFlag(arg) {
  if (!arg) return null;
  const comparableArg = String(arg).split('=')[0];
  let best = null;
  for (const flag of VERIFY_ALLOWED_FLAGS) {
    const distance = levenshteinDistance(comparableArg, flag);
    if (!best || distance < best.distance) {
      best = { flag, distance };
    }
  }
  if (!best) return null;
  const threshold = Math.max(2, Math.ceil(best.flag.replace(/^--/, '').length / 2));
  return best.distance <= threshold ? best.flag : null;
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }
  return previous[b.length];
}

export function verifyTimeoutFailure(timeoutMs, env = process.env) {
  return [
    `server verify timed out after ${timeoutMs}ms.`,
    'Increase --timeout-ms or OMOT_VERIFY_TIMEOUT_MS for large or slow vaults.',
    'After timeout verify sends SIGTERM and then SIGKILL; set OMOT_VERIFY_KILL_GRACE_MS=N only to tune that cleanup window.',
    `Example: ${verifyRetryExample(env)}`,
  ].join(' ');
}

export function verifyRetryExample(env = process.env) {
  const value = typeof env.OMOT_VERIFY_RETRY_EXAMPLE === 'string' ? env.OMOT_VERIFY_RETRY_EXAMPLE.trim() : '';
  return value || DEFAULT_VERIFY_RETRY_EXAMPLE;
}

export function verifyRetryEnvForVault(vaultArg, env = process.env, cwd = process.cwd()) {
  const existing = typeof env.OMOT_VERIFY_RETRY_EXAMPLE === 'string' ? env.OMOT_VERIFY_RETRY_EXAMPLE.trim() : '';
  if (existing) return { ...env, OMOT_VERIFY_RETRY_EXAMPLE: existing };
  const vault = typeof vaultArg === 'string' ? vaultArg.trim() : '';
  if (!vault || vault === '.' || vault === cwd) return env;
  return {
    ...env,
    OMOT_VERIFY_RETRY_EXAMPLE: `npm run verify -- --vault ${shellArg(vault)} --timeout-ms 15000`,
  };
}

function shellArg(value) {
  const raw = String(value);
  if (/^[A-Za-z0-9_./:-]+$/.test(raw)) return raw;
  return `'${raw.replaceAll("'", "'\\''")}'`;
}

export function verifyTimeoutValueErrorMessage(value, env = process.env) {
  const received = value == null ? 'undefined' : JSON.stringify(String(value));
  return [
    'verify timeout must be a positive integer wait window in milliseconds.',
    `Received: ${received}.`,
    'Set --timeout-ms N or OMOT_VERIFY_TIMEOUT_MS=N.',
    `Example: ${verifyRetryExample(env)}`,
  ].join('\n');
}

export function verifySuccessMessage(toolCount = EXPECTED_TOOLS.length) {
  return `All passed — register .mcp.json with your MCP client and restart to use the ${toolCount} tools.`;
}

export function verifyUsage() {
  return (
    '\nUsage:\n' +
    '  node mcp/scripts/verify.mjs [vault] [--timeout-ms N]\n' +
    '  node mcp/scripts/verify.mjs --vault path --timeout-ms 15000\n' +
    '  npm run verify -- [vault] [--timeout-ms N]\n' +
    '  npm run verify -- --vault path --timeout-ms 15000\n' +
    '  pnpm --filter ./mcp verify -- [vault] [--timeout-ms N]\n' +
    '  pnpm --filter ./mcp verify -- --help\n\n' +
    'Runs the MCP server first-contact verification against the resolved vault.\n' +
    'Run npm run verify from the mcp/ package directory; from the repo root, use node mcp/scripts/verify.mjs or pnpm --filter ./mcp verify -- ...\n' +
    'Explicit [vault] or --vault arguments take precedence over OMOT_VAULT.\n' +
    'Timeout cleanup sends SIGTERM and then SIGKILL; set OMOT_VERIFY_KILL_GRACE_MS=N only when the post-timeout cleanup window needs explicit tuning.\n' +
    'Checks parser smoke, server boot, tool inventory (missing/extra/duplicate/invalid names), and direct read smokes,\n' +
    'including list/project probe/get_concept/get_concepts/find_evidence/find_backlinks/query_concepts/limited query_concepts/analyze_repo_structure/infer_imports/find_neighbors/find_path/find_orphans.\n' +
    'It also checks node census, vault validation, workspace health, compile_ontology summary + paginated full-artifact + indexed full-artifact smoke, overview, query plans, and graph-query smoke.\n' +
    'Successful output prints read census consistency after cross-checking list_kinds/list_concepts/compile_ontology/overview.\n' +
    'Also checks strict unknown-tool / unknown-argument / invalid-enum rejection, list_concepts.kind, query_concepts.kind/has-key, find_neighbors.types, find_orphans.kind/excludeKinds, match_nodes.kind/sort, recommend_relations.kind, and match_edges.type/fromKind/toKind typo and unsupported-kind rejection, maintenance_plan filter enums,\n' +
    'tools/list inventory names, initialize-instruction tool inventory, schema strictness, and annotation coverage (title/read/write/destructive/idempotent/local-only),\n' +
    'batch reader/writer row isolation for non-object rows and unknown row fields with concepts[n]/relations[n] error labels, invalid add_relations type closest-value hints, and 50-row batch cap rejection,\n' +
    'destructive writer dry-runs for rename_concept/merge_concepts/delete_concept with every planned response present and no changed/postWriteMaintenance,\n' +
    'structuredContent coverage summary splits direct reads, batch row-isolation writes with no write metadata, destructive dry-runs, maintenance cursor checks, and graph queries,\n' +
    'and maintenance_plan cursor handling: ready page (cursor.found=true, cursor.reason=null)\n' +
    'plus missing afterActionId (cursor.found=false, reason, empty page, nextAfterActionId=null, hasMore=false).\n' +
    'When the ready cursor has actions, verify resumes from the first returned action id and confirms the resumed page does not repeat it.\n' +
    'Ready cursor smoke also verifies nextExecutableAction / nextReviewAction point only at the first executable/review action in the current returned page.\n' +
    'Ready cursor metadata verifies nextAfterActionId matches the last returned action and hasMore matches the remaining page state.\n' +
    'Successful cursor lines print bucket summaries plus current-page executable/review next-action summaries.\n\n' +
    'Focused checks:\n' +
    '  pnpm test:mcp:verify            MCP verify helper contract without the full integration suite.\n' +
    '  pnpm test:mcp:verify:first-contact\n' +
    '                                  Narrow first-contact initialize-tool-inventory/initialize-safety-recovery/unknown-tool/write-safety/health-summary/advisory/read/sample-shape helper gates.\n' +
    '  pnpm test:mcp:maintenance       Narrow maintenance_plan filter/cursor/resume/work-queue formatter gates.\n' +
    '  pnpm test:mcp:verify:timeout    Narrow MCP verify timeout/startup/help/empty-vault diagnostics.\n' +
    '  pnpm test:dogfood:args          Narrow dogfood shortcut argument helper contract.\n' +
    '  pnpm test:dogfood:script-refs   Narrow help/package-script reference + focused filter parser/wrapper summary contract.\n' +
    '  pnpm test:mcp:registration      Narrow source-checkout .mcp.json/.mcp.json.example/.codex/config.toml registration template contract.\n' +
    '  pnpm dogfood:compile            Cheap root checkout compile_ontology summary snapshot.\n' +
    '  pnpm dogfood:compile-fix        Cheap root checkout compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with [dogfood:compile-fix] docs/ontology unchanged.\n' +
    '  pnpm test:dogfood:compile-fix   Narrow dogfood compile --fix idempotence runner contract.\n' +
    '  pnpm dogfood:health             Cheap root checkout health gate.\n' +
    '  pnpm dogfood:brief              Cheap root checkout workspace_brief snapshot.\n' +
    '  pnpm dogfood:growth             Cheap root checkout growth_plan snapshot.\n' +
    '  pnpm dogfood:maintenance        Cheap root checkout maintenance_plan snapshot.\n' +
    '  pnpm dogfood:graph-db           Root checkout dogfood vault graph DB pack runtime gate.\n' +
    '  pnpm dogfood:status             Cheap root checkout health + workspace-brief + agent-brief + maintenance preflight with focused hints before full verify.\n' +
    '  pnpm test:dogfood:status        Narrow dogfood status shortcut runner contract.\n' +
    '  pnpm test:dogfood:graph-db      Narrow dogfood graph DB pack runner contract.\n' +
    '  pnpm dogfood:verify             Root checkout dogfood vault installed-style verify gate.\n'
  );
}

export function serverStartupFailure(stderr, env = process.env) {
  const detail = String(stderr || '').trim().slice(0, 300);
  const retry = `Example: ${verifyRetryExample(env)}`;
  return detail ? `server failed before initialize. stderr: ${detail} ${retry}` : `no initialize response. ${retry}`;
}

export function serverSignalFailure(signal, stderr, env = process.env) {
  const signalText = signal || 'unknown signal';
  const detail = String(stderr || '').trim().slice(0, 300);
  const retry = `Example: ${verifyRetryExample(env)}`;
  return detail
    ? `server terminated by ${signalText} before first-contact completed. stderr: ${detail} ${retry}`
    : `server terminated by ${signalText} before first-contact completed. ${retry}`;
}

export function parserSmokeFailure(code, signal) {
  if (signal) return `parser test terminated by ${signal}`;
  return `parser test failed (exit ${code})`;
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

export function initialExpectedFirstContactIds() {
  const ids = new Set(FIRST_CONTACT_RESPONSE_LABELS.keys());
  for (const optionalId of OPTIONAL_FIRST_CONTACT_RESPONSE_IDS) {
    ids.delete(optionalId);
  }
  return ids;
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
      id: 32,
      method: 'tools/call',
      params: { name: 'find_evidence', arguments: { title: 'project' } },
    },
    {
      jsonrpc: '2.0',
      id: 34,
      method: 'tools/call',
      params: { name: 'query_concepts', arguments: { filter: 'kind=project', limit: 5 } },
    },
    {
      jsonrpc: '2.0',
      id: 38,
      method: 'tools/call',
      params: { name: 'analyze_repo_structure', arguments: { rootPath: REPO_ROOT, maxDepth: 2 } },
    },
    {
      jsonrpc: '2.0',
      id: 39,
      method: 'tools/call',
      params: { name: 'infer_imports', arguments: { rootPath: REPO_ROOT, maxFiles: 5000 } },
    },
    {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'workspace_brief', limit: 3 } },
    },
    {
      jsonrpc: '2.0',
      id: 66,
      method: 'tools/call',
      params: { name: 'query_ontology', arguments: { operation: 'agent_brief', limit: 3 } },
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
          ...VERIFY_TUNED_HEALTH_ARGS,
          nodeLimit: VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
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
          ...VERIFY_TUNED_HEALTH_ARGS,
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
      id: 41,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { nodesLimit: 1, edgesLimit: 1 } },
    },
    {
      jsonrpc: '2.0',
      id: 42,
      method: 'tools/call',
      params: { name: 'compile_ontology', arguments: { nodesLimit: 1, edgesLimit: 1, includeIndexes: true } },
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
      id: 27,
      method: 'tools/call',
      params: { name: 'list_concepts', arguments: { lmit: 1, summry: true } },
    },
    {
      jsonrpc: '2.0',
      id: 65,
      method: 'tools/call',
      params: { name: 'list_concept', arguments: {} },
    },
    {
      jsonrpc: '2.0',
      id: 28,
      method: 'tools/call',
      params: {
        name: 'add_concepts',
        arguments: {
          concepts: [
            null,
            { slug: 'verify-row-isolation', kind: 'capability', title: 'Verify', titel: 'Typo', domian: 'Typo' },
            { slug: 'verify-duplicate-slug', kind: 'capabilty', title: 'Verify Duplicate' },
            { slug: 'verify-duplicate-slug', kind: 'capability', title: 'Verify Duplicate' },
            { slug: 'verify-single-field', kind: 'capability', title: 'Verify Single', titel: 'Typo' },
          ],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 29,
      method: 'tools/call',
      params: {
        name: 'add_relations',
        arguments: {
          relations: [
            null,
            { from: 'verify-row-isolation', to: 'verify-target', type: 'relates', relation: 'relates', frm: 'verify-row-isolation' },
            { from: 'verify-row-isolation', to: 'verify-target', type: 'depend_on' },
            { from: 'verify-row-isolation', to: 'verify-target', type: 'relates', relation: 'relates' },
          ],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 62,
      method: 'tools/call',
      params: {
        name: 'add_concepts',
        arguments: {
          concepts: Array.from({ length: 51 }, (_, index) => ({
            slug: `verify-cap-${index}`,
            kind: 'capability',
            title: `Verify Cap ${index}`,
            domain: 'verify',
          })),
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 63,
      method: 'tools/call',
      params: {
        name: 'add_relations',
        arguments: {
          relations: Array.from({ length: 51 }, () => ({
            from: 'verify-row-isolation',
            to: 'verify-target',
            type: 'relates',
          })),
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 64,
      method: 'tools/call',
      params: {
        name: 'get_concepts',
        arguments: {
          slugs: Array.from({ length: 51 }, (_, index) => `verify-slug-${index}`),
        },
      },
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
      id: 40,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: { operation: 'health', dependencyTypes: ['depend_on'] },
      },
    },
    {
      jsonrpc: '2.0',
      id: 46,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'relation_check',
          from: 'missing-relation-check-source',
          to: 'missing-relation-check-target',
          type: 'depend_on',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'add_relation',
        arguments: {
          from: 'missing-add-relation-source',
          to: 'missing-add-relation-target',
          type: 'depend_on',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 47,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_nodes',
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 51,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'recommend_relations',
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 52,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'recommend_relations',
          kind: 'domain',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 53,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_nodes',
          sort: 'outDegre',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 54,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          type: 'depend_on',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 55,
      method: 'tools/call',
      params: {
        name: 'find_neighbors',
        arguments: {
          slug: 'missing-find-neighbors-type-source',
          types: ['depend_on'],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 56,
      method: 'tools/call',
      params: {
        name: 'find_orphans',
        arguments: {
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 57,
      method: 'tools/call',
      params: {
        name: 'find_orphans',
        arguments: {
          excludeKinds: ['capabilty'],
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 58,
      method: 'tools/call',
      params: {
        name: 'query_concepts',
        arguments: {
          filter: 'kind=capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 59,
      method: 'tools/call',
      params: {
        name: 'query_concepts',
        arguments: {
          filter: 'has(capabilties)',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 60,
      method: 'tools/call',
      params: {
        name: 'list_concepts',
        arguments: {
          kind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 48,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          fromKind: 'capabilty',
        },
      },
    },
    {
      jsonrpc: '2.0',
      id: 49,
      method: 'tools/call',
      params: {
        name: 'query_ontology',
        arguments: {
          operation: 'match_edges',
          toKind: 'externl',
        },
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
      {
        jsonrpc: '2.0',
        id: 67,
        method: 'tools/call',
        params: {
          name: 'query_ontology',
          arguments: {
            operation: 'all_paths',
            from: graphSmoke.slug,
            to: graphSmoke.pathTarget || graphSmoke.slug,
            maxHops: 5,
            searchBudget: 1000,
            limit: 5,
          },
        },
      },
    );
    expectedResponseIds.push(13, 14, 67);
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

export function buildDirectGraphReadSmokeRequests(graphSmoke) {
  const requests = [];
  const expectedResponseIds = [];
  if (graphSmoke?.hasNode) {
    requests.push(
      {
        jsonrpc: '2.0',
        id: 35,
        method: 'tools/call',
        params: { name: 'find_neighbors', arguments: { slug: graphSmoke.slug, limit: 5 } },
      },
      {
        jsonrpc: '2.0',
        id: 36,
        method: 'tools/call',
        params: { name: 'find_path', arguments: { from: graphSmoke.slug, to: graphSmoke.pathTarget || graphSmoke.slug } },
      },
    );
    expectedResponseIds.push(35, 36);
  }
  return { requests, expectedResponseIds };
}

export function buildLimitedQueryConceptsSmokeRequest(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slug = nodes.find((node) => typeof node?.slug === 'string' && node.slug.length > 0)?.slug;
  const total = Number.isInteger(listPayload?.total) ? listPayload.total : nodes.length;
  if (!slug || total <= 2) return null;
  return {
    request: {
      jsonrpc: '2.0',
      id: 37,
      method: 'tools/call',
      params: { name: 'query_concepts', arguments: { filter: `slug!=${slug}`, limit: 1 } },
    },
    excludedSlug: slug,
    expectedTotal: total - 1,
  };
}

export function buildDestructiveDryRunSmokeRequests(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slugs = nodes
    .map((node) => node?.slug)
    .filter((slug) => typeof slug === 'string' && slug.length > 0);
  const sourceSlug = slugs.find((slug) => slug !== 'README') ?? slugs[0];
  if (!sourceSlug) return { requests: [], expectedResponseIds: [] };

  const uniqueTargetSlug = `__omot_verify_dry_run_target_${process.pid}_${Date.now()}`;
  const requests = [
    {
      jsonrpc: '2.0',
      id: 43,
      method: 'tools/call',
      params: {
        name: 'rename_concept',
        arguments: { oldSlug: sourceSlug, newSlug: uniqueTargetSlug },
      },
    },
    {
      jsonrpc: '2.0',
      id: 45,
      method: 'tools/call',
      params: { name: 'delete_concept', arguments: { slug: sourceSlug } },
    },
  ];
  const expectedResponseIds = [43, 45];
  const mergeTargetSlug = slugs.find((slug) => slug !== sourceSlug);
  if (mergeTargetSlug) {
    requests.splice(1, 0, {
      jsonrpc: '2.0',
      id: 44,
      method: 'tools/call',
      params: {
        name: 'merge_concepts',
        arguments: { fromSlug: sourceSlug, intoSlug: mergeTargetSlug },
      },
    });
    expectedResponseIds.splice(1, 0, 44);
  }
  return { requests, expectedResponseIds };
}

export function buildPatchConflictGuardSmokeRequest(listPayload) {
  const nodes = Array.isArray(listPayload?.nodes) ? listPayload.nodes : [];
  const slug = nodes
    .filter((node) => node?.kind !== 'vault-readme' && node?.slug !== 'README')
    .map((node) => node?.slug)
    .find((candidate) => typeof candidate === 'string' && candidate.length > 0);
  if (!slug) return null;
  return {
    jsonrpc: '2.0',
    id: 61,
    method: 'tools/call',
    params: {
      name: 'patch_concept',
      arguments: {
        slug,
        frontmatter: { title: '__omot_verify_conflict_probe__' },
        expected_mtime: 1,
      },
    },
  };
}

export function patchConflictGuardFailure(response) {
  const structuredFailure = structuredErrorFailure(response, 'patch_concept conflict guard', { errorCode: 'vault_conflict' });
  if (structuredFailure) return structuredFailure;
  const text = response?.result?.content?.[0]?.text || '';
  if (!/expected_mtime|mtime|conflict|modified externally/i.test(text)) {
    return 'patch_concept conflict guard response did not explain the stale expected_mtime conflict';
  }
  return null;
}

export function destructiveDryRunFailure(response, toolName) {
  if (!response || !response.result) {
    return `no ${toolName} dry-run response`;
  }
  if (response.result.isError === true) {
    return `${toolName} dry-run returned top-level tool error`;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
  } catch (err) {
    return `failed to parse ${toolName} dry-run response: ${err.message}`;
  }
  const structuredFailure = structuredContentFailure(response, parsed, `${toolName} dry-run`);
  if (structuredFailure) return structuredFailure;
  if (parsed.ok !== false || parsed.dryRun !== true) {
    return `${toolName} dry-run response must be ok:false with dryRun:true`;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'changed')) {
    return `${toolName} dry-run response unexpectedly included changed`;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'postWriteMaintenance')) {
    return `${toolName} dry-run response unexpectedly included postWriteMaintenance`;
  }
  if (typeof parsed.message !== 'string' || !/confirm:true|force:true/.test(parsed.message)) {
    return `${toolName} dry-run response missing follow-up safety hint`;
  }
  if (toolName === 'rename_concept') {
    if (parsed.moved !== false || typeof parsed.oldSlug !== 'string' || typeof parsed.newSlug !== 'string') {
      return 'rename_concept dry-run response missing rename preview fields';
    }
    const backlinkFailure = destructiveBacklinkUpdatesFailure(parsed.backlinkUpdates, toolName);
    if (backlinkFailure) return backlinkFailure;
  }
  if (toolName === 'merge_concepts') {
    if (parsed.deleted !== false || typeof parsed.fromSlug !== 'string' || typeof parsed.intoSlug !== 'string') {
      return 'merge_concepts dry-run response missing merge preview fields';
    }
    const backlinkFailure = destructiveBacklinkUpdatesFailure(parsed.backlinkUpdates, toolName);
    if (backlinkFailure) return backlinkFailure;
  }
  if (toolName === 'delete_concept') {
    if (!isCleanNonBlankString(parsed.slug) || !Array.isArray(parsed.backlinks)) {
      return 'delete_concept dry-run response missing delete preview fields';
    }
    const backlinkRowsFailure = destructiveBacklinkRowsFailure(parsed.backlinks, toolName, 'backlinks');
    if (backlinkRowsFailure) return backlinkRowsFailure;
  }
  return null;
}

function destructiveBacklinkRowsFailure(rows, toolName, propertyName) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (
      !row ||
      !isCleanNonBlankString(row.slug) ||
      !isCleanNonBlankString(row.kind) ||
      !isCleanNonBlankString(row.title) ||
      !Number.isFinite(row.mtime) ||
      row.mtime < 0
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] shape drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'domain') &&
      !isCleanNonBlankString(row.domain)
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] domain drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'matchedKeys') &&
      (!Array.isArray(row.matchedKeys) || !row.matchedKeys.every((key) => isCleanNonBlankString(key)))
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] matchedKeys drift`;
    }
    if (
      Object.prototype.hasOwnProperty.call(row, 'matchedInBody') &&
      typeof row.matchedInBody !== 'boolean'
    ) {
      return `${toolName} dry-run response ${propertyName}[${index}] matchedInBody drift`;
    }
  }
  return null;
}

function destructiveBacklinkUpdatesFailure(backlinkUpdates, toolName) {
  if (
    !backlinkUpdates ||
    !Number.isInteger(backlinkUpdates.totalUpdated) ||
    backlinkUpdates.totalUpdated < 0 ||
    !Array.isArray(backlinkUpdates.updates)
  ) {
    return `${toolName} dry-run response missing backlinkUpdates plan`;
  }
  if (backlinkUpdates.totalUpdated !== backlinkUpdates.updates.length) {
    return `${toolName} dry-run response backlinkUpdates total mismatch`;
  }
  for (let index = 0; index < backlinkUpdates.updates.length; index += 1) {
    const row = backlinkUpdates.updates[index];
    if (
      !row ||
      !isCleanNonBlankString(row.slug) ||
      !isCleanNonBlankString(row.title) ||
      !Array.isArray(row.beforeKeys) ||
      !Array.isArray(row.afterKeys) ||
      typeof row.bodyChanged !== 'boolean'
    ) {
      return `${toolName} dry-run response backlinkUpdates.updates[${index}] shape drift`;
    }
    for (const propertyName of ['beforeKeys', 'afterKeys']) {
      for (let keyIndex = 0; keyIndex < row[propertyName].length; keyIndex += 1) {
        const keyRow = row[propertyName][keyIndex];
        const keyRowFailure = backlinkKeyChangeFailure(keyRow);
        if (keyRowFailure) {
          return `${toolName} dry-run response backlinkUpdates.updates[${index}].${propertyName}[${keyIndex}] ${keyRowFailure}`;
        }
      }
    }
  }
  return null;
}

function backlinkKeyChangeFailure(row) {
  if (!row || !isCleanNonBlankString(row.key)) {
    return 'shape drift';
  }
  if (
    row.before !== undefined &&
    !isStringOrStringArray(row.before)
  ) {
    return 'before drift';
  }
  if (
    row.after !== undefined &&
    !isStringOrStringArray(row.after)
  ) {
    return 'after drift';
  }
  return null;
}

function isStringOrStringArray(value) {
  return (
    isCleanNonBlankString(value) ||
    (Array.isArray(value) && value.every((item) => isCleanNonBlankString(item)))
  );
}

function isCleanNonBlankString(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value && !value.includes('\u0000');
}

export function destructiveDryRunSmokeFailure(expectedResponses) {
  const entries = Array.isArray(expectedResponses) ? expectedResponses : [];
  for (const [toolName, response] of entries) {
    const failure = destructiveDryRunFailure(response, toolName);
    if (failure) return failure;
  }
  return null;
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
    if (!hasNonEmptyString(row.slug)) {
      return `get_concepts response missing success slug at index ${index}`;
    }
    if (!row.frontmatter || typeof row.frontmatter !== 'object' || Array.isArray(row.frontmatter)) {
      return `get_concepts response missing frontmatter: ${row.slug}`;
    }
    if (typeof row.excerpt !== 'string') {
      return `get_concepts response missing excerpt: ${row.slug}`;
    }
    if (!row.neighbors || typeof row.neighbors !== 'object' || Array.isArray(row.neighbors)) {
      return `get_concepts response missing neighbors: ${row.slug}`;
    }
    if (!Number.isFinite(row.mtime) || row.mtime < 0) {
      return `get_concepts response missing mtime: ${row.slug}`;
    }
  }
  if (!missing || typeof missing !== 'object' || Array.isArray(missing)) {
    return `get_concepts response malformed partial row at index ${parsed.concepts.length - 1}`;
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

export function getConceptFailure(parsed, expectedSlug) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return 'get_concept response malformed';
  }
  if (parsed.slug !== expectedSlug) {
    return `get_concept response slug mismatch — expected ${expectedSlug}, got ${parsed.slug}`;
  }
  if (!parsed.frontmatter || typeof parsed.frontmatter !== 'object' || Array.isArray(parsed.frontmatter)) {
    return `get_concept response missing frontmatter: ${expectedSlug}`;
  }
  if (typeof parsed.excerpt !== 'string') {
    return `get_concept response missing excerpt: ${expectedSlug}`;
  }
  if (!parsed.neighbors || typeof parsed.neighbors !== 'object' || Array.isArray(parsed.neighbors)) {
    return `get_concept response missing neighbors: ${expectedSlug}`;
  }
  for (const key of ['domains', 'capabilities', 'elements', 'dependencies', 'relates', 'contains', 'describes']) {
    if (!Array.isArray(parsed.neighbors[key])) {
      return `get_concept response missing neighbors.${key}: ${expectedSlug}`;
    }
  }
  if (!(parsed.neighbors.domain == null || typeof parsed.neighbors.domain === 'string')) {
    return `get_concept response malformed neighbors.domain: ${expectedSlug}`;
  }
  if (!Array.isArray(parsed.outgoingEdges)) {
    return `get_concept response missing outgoingEdges: ${expectedSlug}`;
  }
  for (const [index, edge] of parsed.outgoingEdges.entries()) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      return `get_concept response malformed outgoing edge at index ${index}`;
    }
    if (typeof edge.to !== 'string' || edge.to.length === 0) {
      return `get_concept response missing outgoing edge target at index ${index}`;
    }
    if (typeof edge.via !== 'string' || edge.via.length === 0) {
      return `get_concept response missing outgoing edge relation at index ${index}`;
    }
  }
  if (!Number.isFinite(parsed.mtime) || parsed.mtime < 0) {
    return `get_concept response missing mtime: ${expectedSlug}`;
  }
  if (parsed.warnings != null && !Array.isArray(parsed.warnings)) {
    return `get_concept response malformed warnings: ${expectedSlug}`;
  }
  return null;
}

function readMatchRowFailure(label, row, index, { evidence = false, backlinks = false } = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `${label} response malformed match at index ${index}`;
  }
  if (typeof row.slug !== 'string' || row.slug.length === 0) {
    return `${label} response missing match slug at index ${index}`;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `${label} response missing match kind: ${row.slug}`;
  }
  if (typeof row.title !== 'string' || row.title.length === 0) {
    return `${label} response missing match title: ${row.slug}`;
  }
  if (!Number.isFinite(row.mtime) || row.mtime < 0) {
    return `${label} response missing match mtime: ${row.slug}`;
  }
  if (evidence) {
    if (!['frontmatter', 'body'].includes(row.matchedIn)) {
      return `${label} response missing matchedIn: ${row.slug}`;
    }
    if (typeof row.excerpt !== 'string') {
      return `${label} response missing excerpt: ${row.slug}`;
    }
  }
  if (backlinks) {
    if (row.matchedKeys != null && !Array.isArray(row.matchedKeys)) {
      return `${label} response malformed matchedKeys: ${row.slug}`;
    }
    if (row.matchedInBody != null && typeof row.matchedInBody !== 'boolean') {
      return `${label} response malformed matchedInBody: ${row.slug}`;
    }
    if ((row.matchedKeys == null || row.matchedKeys.length === 0) && row.matchedInBody !== true) {
      return `${label} response match has no backlink evidence: ${row.slug}`;
    }
  }
  return null;
}

export function findEvidenceFailure(parsed) {
  if (typeof parsed?.query !== 'string' || parsed.query.length === 0) {
    return 'find_evidence response missing query';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'find_evidence response missing matches array';
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('find_evidence', row, index, { evidence: true });
    if (failure) return failure;
  }
  return null;
}

export function findBacklinksFailure(parsed, expectedTarget) {
  if (parsed?.target !== expectedTarget) {
    return `find_backlinks response target mismatch — expected ${expectedTarget}, got ${parsed?.target}`;
  }
  if (!Number.isInteger(parsed.total) || parsed.total < 0) {
    return 'find_backlinks response missing total count';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'find_backlinks response missing matches array';
  }
  if (parsed.matches.length > parsed.total) {
    return `find_backlinks response match count exceeds total — matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('find_backlinks', row, index, { backlinks: true });
    if (failure) return failure;
  }
  return null;
}

export function queryConceptsFailure(parsed) {
  if (typeof parsed?.filter !== 'string' || parsed.filter.length === 0) {
    return 'query_concepts response missing filter';
  }
  if (typeof parsed.parsedAs !== 'string' || parsed.parsedAs.length === 0) {
    return 'query_concepts response missing parsedAs';
  }
  if (!Number.isInteger(parsed.total) || parsed.total < 0) {
    return 'query_concepts response missing total count';
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'query_concepts response missing limited flag';
  }
  if (!Array.isArray(parsed.matches)) {
    return 'query_concepts response missing matches array';
  }
  if (parsed.matches.length > parsed.total) {
    return `query_concepts response match count exceeds total — matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  if (!parsed.limited && parsed.matches.length !== parsed.total) {
    return `query_concepts response match count mismatch — matches ${parsed.matches.length}, total ${parsed.total}`;
  }
  for (const [index, row] of parsed.matches.entries()) {
    const failure = readMatchRowFailure('query_concepts', row, index);
    if (failure) return failure;
  }
  return null;
}

export function limitedQueryConceptsFailure(parsed, excludedSlug, expectedTotal) {
  const baseFailure = queryConceptsFailure(parsed);
  if (baseFailure) return baseFailure;
  if (parsed.filter !== `slug!=${excludedSlug}`) {
    return `query_concepts limited filter mismatch — expected slug!=${excludedSlug}, got ${parsed.filter}`;
  }
  if (parsed.total !== expectedTotal) {
    return `query_concepts limited total mismatch — expected ${expectedTotal}, got ${parsed.total}`;
  }
  if (parsed.matches.length !== 1) {
    return `query_concepts limited match count mismatch — expected 1, got ${parsed.matches.length}`;
  }
  if (parsed.limited !== true) {
    return 'query_concepts limited response did not set limited=true';
  }
  if (parsed.matches.some((row) => row?.slug === excludedSlug)) {
    return `query_concepts limited response included excluded slug: ${excludedSlug}`;
  }
  return null;
}

export function analyzeRepoStructureFailure(parsed) {
  if (typeof parsed?.rootPath !== 'string' || parsed.rootPath.length === 0) {
    return 'analyze_repo_structure response missing rootPath';
  }
  if (!['fsd', 'next', 'generic'].includes(parsed.framework)) {
    return `analyze_repo_structure response unknown framework: ${parsed?.framework}`;
  }
  for (const propertyName of ['domains', 'capabilities', 'elements', 'suggestedRelations', 'skipped']) {
    if (!Array.isArray(parsed[propertyName])) {
      return `analyze_repo_structure response missing ${propertyName} array`;
    }
  }
  for (const propertyName of ['domains', 'capabilities', 'elements']) {
    for (const [index, candidate] of parsed[propertyName].entries()) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return `analyze_repo_structure response malformed ${propertyName} row at index ${index}`;
      }
      if (typeof candidate.slug !== 'string' || candidate.slug.length === 0) {
        return `analyze_repo_structure response missing ${propertyName} slug at index ${index}`;
      }
      if (typeof candidate.title !== 'string' || candidate.title.length === 0) {
        return `analyze_repo_structure response missing ${propertyName} title: ${candidate.slug}`;
      }
      if (!candidate.evidence || typeof candidate.evidence.source !== 'string' || candidate.evidence.source.length === 0) {
        return `analyze_repo_structure response missing ${propertyName} evidence source: ${candidate.slug}`;
      }
    }
  }
  for (const [index, relation] of parsed.suggestedRelations.entries()) {
    if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
      return `analyze_repo_structure response malformed suggestedRelations row at index ${index}`;
    }
    for (const propertyName of ['from', 'to', 'type']) {
      if (typeof relation[propertyName] !== 'string' || relation[propertyName].length === 0) {
        return `analyze_repo_structure response missing suggestedRelations ${propertyName} at index ${index}`;
      }
    }
  }
  for (const [index, skipped] of parsed.skipped.entries()) {
    if (!skipped || typeof skipped !== 'object' || Array.isArray(skipped)) {
      return `analyze_repo_structure response malformed skipped row at index ${index}`;
    }
    if (typeof skipped.path !== 'string' || skipped.path.length === 0) {
      return `analyze_repo_structure response missing skipped path at index ${index}`;
    }
    if (typeof skipped.reason !== 'string' || skipped.reason.length === 0) {
      return `analyze_repo_structure response missing skipped reason: ${skipped.path}`;
    }
  }
  return null;
}

export function inferImportsFailure(parsed) {
  if (typeof parsed?.rootPath !== 'string' || parsed.rootPath.length === 0) {
    return 'infer_imports response missing rootPath';
  }
  if (!Number.isInteger(parsed.filesScanned) || parsed.filesScanned < 0) {
    return 'infer_imports response missing filesScanned count';
  }
  for (const propertyName of ['edges', 'externalImports', 'unresolved', 'moduleEdges']) {
    if (!Array.isArray(parsed[propertyName])) {
      return `infer_imports response missing ${propertyName} array`;
    }
  }
  const edgeKinds = new Set(IMPORT_EDGE_KIND_VALUES);
  const unresolvedReasons = new Set(IMPORT_UNRESOLVED_REASON_VALUES);
  for (const [index, edge] of parsed.edges.entries()) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      return `infer_imports response malformed edge at index ${index}`;
    }
    for (const propertyName of ['from', 'to']) {
      if (typeof edge[propertyName] !== 'string' || edge[propertyName].length === 0) {
        return `infer_imports response missing edge ${propertyName} at index ${index}`;
      }
    }
    if (!edgeKinds.has(edge.kind)) {
      return `infer_imports response unknown edge kind: ${edge.kind}`;
    }
  }
  for (const [index, externalImport] of parsed.externalImports.entries()) {
    if (!externalImport || typeof externalImport !== 'object' || Array.isArray(externalImport)) {
      return `infer_imports response malformed external import at index ${index}`;
    }
    for (const propertyName of ['from', 'spec']) {
      if (typeof externalImport[propertyName] !== 'string' || externalImport[propertyName].length === 0) {
        return `infer_imports response missing external import ${propertyName} at index ${index}`;
      }
    }
  }
  for (const [index, unresolved] of parsed.unresolved.entries()) {
    if (!unresolved || typeof unresolved !== 'object' || Array.isArray(unresolved)) {
      return `infer_imports response malformed unresolved import at index ${index}`;
    }
    if (typeof unresolved.from !== 'string' || unresolved.from.length === 0) {
      return `infer_imports response missing unresolved from at index ${index}`;
    }
    if (typeof unresolved.spec !== 'string') {
      return `infer_imports response missing unresolved spec at index ${index}`;
    }
    if (typeof unresolved.reason !== 'string' || unresolved.reason.length === 0) {
      return `infer_imports response missing unresolved reason at index ${index}`;
    }
    if (!unresolvedReasons.has(unresolved.reason)) {
      return `infer_imports response unknown unresolved reason at index ${index}: ${unresolved.reason}`;
    }
    if (unresolved.reason !== 'empty' && unresolved.spec.length === 0) {
      return `infer_imports response missing unresolved spec at index ${index}`;
    }
  }
  for (const [index, moduleEdge] of parsed.moduleEdges.entries()) {
    if (!moduleEdge || typeof moduleEdge !== 'object' || Array.isArray(moduleEdge)) {
      return `infer_imports response malformed module edge at index ${index}`;
    }
    for (const propertyName of ['from', 'to']) {
      if (typeof moduleEdge[propertyName] !== 'string' || moduleEdge[propertyName].length === 0) {
        return `infer_imports response missing module edge ${propertyName} at index ${index}`;
      }
    }
    if (!Number.isInteger(moduleEdge.count) || moduleEdge.count < 1) {
      return `infer_imports response missing module edge count at index ${index}`;
    }
    if (!moduleEdge.kindCounts || typeof moduleEdge.kindCounts !== 'object' || Array.isArray(moduleEdge.kindCounts)) {
      return `infer_imports response missing module edge kindCounts at index ${index}`;
    }
    const kindTotal = Object.entries(moduleEdge.kindCounts).reduce((sum, [kind, value]) => {
      if (!edgeKinds.has(kind)) return NaN;
      if (!Number.isInteger(value) || value < 1) return NaN;
      return sum + value;
    }, 0);
    if (Number.isNaN(kindTotal)) {
      return `infer_imports response malformed module edge kindCounts at index ${index}`;
    }
    if (kindTotal !== moduleEdge.count) {
      return `infer_imports response module edge kindCounts mismatch at index ${index}`;
    }
  }
  return null;
}

export function findNeighborsFailure(parsed, expectedSlug) {
  if (parsed?.center !== expectedSlug) {
    return `find_neighbors center mismatch — expected ${expectedSlug}, got ${parsed?.center}`;
  }
  if (typeof parsed.requested !== 'string' || parsed.requested.length === 0) {
    return 'find_neighbors response missing requested slug';
  }
  if (!['incoming', 'outgoing', 'both'].includes(parsed.direction)) {
    return 'find_neighbors response missing direction';
  }
  if (parsed.types != null && !Array.isArray(parsed.types)) {
    return 'find_neighbors response malformed types array';
  }
  if (!Number.isInteger(parsed.totalEdges) || parsed.totalEdges < 0) {
    return 'find_neighbors response missing totalEdges';
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'find_neighbors response missing limited flag';
  }
  if (!Array.isArray(parsed.edges)) {
    return 'find_neighbors response missing edges array';
  }
  if (parsed.edges.length > parsed.totalEdges) {
    return `find_neighbors response edge count exceeds total — edges ${parsed.edges.length}, total ${parsed.totalEdges}`;
  }
  if (!parsed.limited && parsed.edges.length !== parsed.totalEdges) {
    return `find_neighbors response edge count mismatch — edges ${parsed.edges.length}, total ${parsed.totalEdges}`;
  }
  if (!Array.isArray(parsed.nodes)) {
    return 'find_neighbors response missing nodes array';
  }
  for (const [index, edge] of parsed.edges.entries()) {
    const edgeFailure = graphEdgeFailure('find_neighbors edge', edge, index);
    if (edgeFailure) return edgeFailure;
    if (!['incoming', 'outgoing'].includes(edge.direction)) {
      return `find_neighbors edge missing direction at index ${index}`;
    }
  }
  for (const [index, row] of parsed.nodes.entries()) {
    const failure = readMatchRowFailure('find_neighbors', row, index);
    if (failure) return failure;
  }
  return null;
}

export function findPathFailure(parsed, expectedFrom, expectedTo) {
  if (parsed?.from !== expectedFrom || parsed?.to !== expectedTo) {
    return `find_path endpoint mismatch — expected ${expectedFrom}->${expectedTo}, got ${parsed?.from}->${parsed?.to}`;
  }
  if (typeof parsed.found !== 'boolean') {
    return 'find_path response missing found flag';
  }
  if (parsed.found !== true) {
    return 'find_path response expected found:true';
  }
  if (!Number.isInteger(parsed.hopCount) || parsed.hopCount < 0) {
    return 'find_path response missing hopCount';
  }
  if (!Array.isArray(parsed.hops) || parsed.hops.length !== parsed.hopCount + 1) {
    return 'find_path response hop count mismatch';
  }
  if (parsed.hops[0] !== expectedFrom || parsed.hops.at(-1) !== expectedTo) {
    return 'find_path response endpoint hops mismatch';
  }
  if (!Array.isArray(parsed.edges) || parsed.edges.length !== parsed.hopCount) {
    return 'find_path response edge count mismatch';
  }
  for (const [index, edge] of parsed.edges.entries()) {
    const edgeFailure = graphEdgeFailure('find_path edge', edge, index);
    if (edgeFailure) return edgeFailure;
    if (edge.from !== parsed.hops[index] || edge.to !== parsed.hops[index + 1]) {
      return `find_path edge/hop mismatch at index ${index}`;
    }
  }
  if (parsed.nodes !== undefined) {
    if (!Array.isArray(parsed.nodes) || parsed.nodes.length !== parsed.hops.length) {
      return 'find_path response node count mismatch';
    }
    for (const [index, row] of parsed.nodes.entries()) {
      const failure = pathNodeFailure(row, index);
      if (failure) return failure;
      if (row.slug !== parsed.hops[index]) {
        return `find_path node/hop mismatch at index ${index}`;
      }
    }
  }
  return null;
}

function pathNodeFailure(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `find_path response malformed node at index ${index}`;
  }
  if (typeof row.slug !== 'string' || row.slug.length === 0) {
    return `find_path response missing node slug at index ${index}`;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `find_path response missing node kind: ${row.slug}`;
  }
  if (typeof row.title !== 'string' || row.title.length === 0) {
    return `find_path response missing node title: ${row.slug}`;
  }
  if (row.domain !== undefined && typeof row.domain !== 'string') {
    return `find_path response malformed node domain: ${row.slug}`;
  }
  return null;
}

export function buildGetConceptSmokeSlug(listPayload) {
  if (!Array.isArray(listPayload?.nodes)) return null;
  const nodesWithSlug = listPayload.nodes.filter((node) => (
    typeof node?.slug === 'string' && node.slug.length > 0
  ));
  return nodesWithSlug.find((node) => node.kind !== 'vault-readme')?.slug
    ?? nodesWithSlug[0]?.slug
    ?? null;
}

export function batchRowIsolationFailure(response, key, label) {
  if (!response || !response.result) {
    return `no ${label} row-isolation response`;
  }
  if (response.result.isError === true) {
    return `${label} row-isolation smoke returned top-level tool error`;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(response.result.content?.[0]?.text || '{}');
  } catch (err) {
    return `failed to parse ${label} row-isolation response: ${err.message}`;
  }
  const rows = parsed?.[key];
  const expectedRows = key === 'relations' ? 4 : 5;
  if (!Array.isArray(rows) || rows.length !== expectedRows) {
    return `${label} row-isolation response missing ${expectedRows} result rows`;
  }
  if (Object.prototype.hasOwnProperty.call(parsed, 'postWriteMaintenance')) {
    return `${label} row-isolation response unexpectedly included postWriteMaintenance`;
  }
  const [nonObjectRow, unknownFieldRow, thirdRow, fourthRow, fifthRow] = rows;
  const writeMetadataKeys = ['changed', 'alreadyExists', 'postWriteMaintenance'];
  for (const [index, row] of rows.entries()) {
    if (row?.ok !== false) continue;
    const present = writeMetadataKeys.filter((keyName) => Object.prototype.hasOwnProperty.call(row || {}, keyName));
    if (present.length > 0) {
      return `${label} row-isolation failed row ${index} unexpectedly included write metadata: ${present.join(', ')}`;
    }
  }
  const singleUnknownFieldRow = key === 'relations' ? fourthRow : fifthRow;
  if (nonObjectRow?.ok !== false || typeof nonObjectRow.error !== 'string' || !/must be an object/i.test(nonObjectRow.error)) {
    return `${label} row-isolation response missing non-object row error`;
  }
  if (!rowErrorMentionsIndex(nonObjectRow, 0)) {
    return `${label} row-isolation response missing non-object row index`;
  }
  if (nonObjectRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing non-object row errorCode`;
  }
  if (unknownFieldRow?.ok !== false || typeof unknownFieldRow.error !== 'string' || !/Unknown field/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing unknown-field row error`;
  }
  if (!rowErrorMentionsIndex(unknownFieldRow, 1)) {
    return `${label} row-isolation response missing unknown-field row index`;
  }
  if (key === 'concepts' && !/Unknown fields in concepts\[1\]/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept multi-field error`;
  }
  if (key === 'concepts' && !/"titel" \(did you mean "title"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept typo field error`;
  }
  if (key === 'concepts' && !/"domian" \(did you mean "domain"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept domain field suggestion`;
  }
  if (key === 'concepts' && !/Received fields: domian, kind, slug, titel, title/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing concept received fields`;
  }
  if (key === 'concepts' && unknownFieldRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing concept unknown-field row errorCode`;
  }
  if (
    key === 'concepts' &&
    (
      unknownFieldRow.rowName !== 'concepts[1]' ||
      !sameUnknownFields(unknownFieldRow.unknownFields, [
        ['titel', 'title'],
        ['domian', 'domain'],
      ]) ||
      !sameArray(unknownFieldRow.allowedFields, ['slug', 'kind', 'title', 'domain', 'capabilities', 'elements', 'body']) ||
      !sameArray(unknownFieldRow.receivedFields, ['domian', 'kind', 'slug', 'titel', 'title'])
    )
  ) {
    return `${label} row-isolation response missing concept structured field repair`;
  }
  if (
    key === 'concepts' &&
    (
      singleUnknownFieldRow?.ok !== false ||
      typeof singleUnknownFieldRow.error !== 'string' ||
      !/Unknown field "titel" in concepts\[4\]/i.test(singleUnknownFieldRow.error) ||
      singleUnknownFieldRow.errorCode !== 'invalid_arguments' ||
      singleUnknownFieldRow.rowName !== 'concepts[4]' ||
      singleUnknownFieldRow.receivedField !== 'titel' ||
      !sameUnknownFields(singleUnknownFieldRow.unknownFields, [['titel', 'title']]) ||
      !sameArray(singleUnknownFieldRow.allowedFields, ['slug', 'kind', 'title', 'domain', 'capabilities', 'elements', 'body']) ||
      !sameArray(singleUnknownFieldRow.receivedFields, ['kind', 'slug', 'titel', 'title'])
    )
  ) {
    return `${label} row-isolation response missing concept single-field structured repair`;
  }
  if (
    key === 'concepts' &&
    (
      thirdRow?.ok !== false ||
      typeof thirdRow.error !== 'string'
    )
  ) {
    return `${label} row-isolation response missing duplicate seed row error`;
  }
  if (
    key === 'concepts' &&
    (
      thirdRow.errorCode !== 'invalid_arguments' ||
      thirdRow.valueName !== 'kind' ||
      thirdRow.receivedValue !== 'capabilty' ||
      thirdRow.suggestion !== 'capability' ||
      !sameArray(thirdRow.allowedValues, ADD_CONCEPT_KIND_VALUES)
    )
  ) {
    return `${label} row-isolation response missing duplicate seed structured repair`;
  }
  if (
    key === 'concepts' &&
    (
      fourthRow?.ok !== false ||
      typeof fourthRow.error !== 'string' ||
      !rowErrorMentionsIndex(fourthRow, 3) ||
      !/duplicate slug in input batch/i.test(fourthRow.error) ||
      !/first seen at concepts\[2\]/i.test(fourthRow.error)
    )
  ) {
    return `${label} row-isolation response missing duplicate slug row guidance`;
  }
  if (
    key === 'concepts' &&
    (
      fourthRow.errorCode !== 'conflict' ||
      fourthRow.rowName !== 'concepts[3]' ||
      fourthRow.conflictSlug !== 'verify-duplicate-slug' ||
      fourthRow.firstSeenAt !== 'concepts[2]'
    )
  ) {
    return `${label} row-isolation response missing duplicate slug structured repair`;
  }
  if (key === 'relations' && !/Unknown fields in relations\[1\]/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation multi-field error`;
  }
  if (key === 'relations' && !/"relation" \(did you mean "type"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation typo field error`;
  }
  if (key === 'relations' && !/"frm" \(did you mean "from"\?\)/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation from field suggestion`;
  }
  if (key === 'relations' && !/Received fields: frm, from, relation, to, type/i.test(unknownFieldRow.error)) {
    return `${label} row-isolation response missing relation received fields`;
  }
  if (key === 'relations' && unknownFieldRow.errorCode !== 'invalid_arguments') {
    return `${label} row-isolation response missing relation unknown-field row errorCode`;
  }
  if (
    key === 'relations' &&
    (
      unknownFieldRow.rowName !== 'relations[1]' ||
      !sameUnknownFields(unknownFieldRow.unknownFields, [
        ['relation', 'type'],
        ['frm', 'from'],
      ]) ||
      !sameArray(unknownFieldRow.allowedFields, ['from', 'to', 'type', 'expected_mtime']) ||
      !sameArray(unknownFieldRow.receivedFields, ['frm', 'from', 'relation', 'to', 'type'])
    )
  ) {
    return `${label} row-isolation response missing relation structured field repair`;
  }
  if (
    key === 'relations' &&
    (
      singleUnknownFieldRow?.ok !== false ||
      typeof singleUnknownFieldRow.error !== 'string' ||
      !/Unknown field "relation" in relations\[3\]/i.test(singleUnknownFieldRow.error) ||
      singleUnknownFieldRow.errorCode !== 'invalid_arguments' ||
      singleUnknownFieldRow.rowName !== 'relations[3]' ||
      singleUnknownFieldRow.receivedField !== 'relation' ||
      !sameUnknownFields(singleUnknownFieldRow.unknownFields, [['relation', 'type']]) ||
      !sameArray(singleUnknownFieldRow.allowedFields, ['from', 'to', 'type', 'expected_mtime']) ||
      !sameArray(singleUnknownFieldRow.receivedFields, ['from', 'relation', 'to', 'type'])
    )
  ) {
    return `${label} row-isolation response missing relation single-field structured repair`;
  }
  if (
    key === 'relations' &&
    (
      thirdRow?.ok !== false ||
      typeof thirdRow.error !== 'string' ||
      !rowErrorMentionsIndex(thirdRow, 2) ||
      !/Received: "depend_on"/i.test(thirdRow.error) ||
      !/Did you mean "depends_on"\?/i.test(thirdRow.error)
    )
  ) {
    return `${label} row-isolation response missing relation type suggestion`;
  }
  if (
    key === 'relations' &&
    (
      thirdRow.errorCode !== 'invalid_arguments' ||
      thirdRow.valueName !== 'type' ||
      thirdRow.receivedValue !== 'depend_on' ||
      thirdRow.suggestion !== 'depends_on' ||
      !sameArray(thirdRow.allowedValues, WRITE_RELATION_TYPE_VALUES)
    )
  ) {
    return `${label} row-isolation response missing relation type structured repair`;
  }
  const structuredFailure = structuredContentFailure(response, parsed, `${label} row isolation`);
  if (structuredFailure) {
    return structuredFailure;
  }
  return null;
}

export function batchCapFailure(response, label, expectedNoun) {
  if (!response || !response.result) {
    return `no ${label} batch-cap response`;
  }
  if (response.result.isError !== true) {
    return `${label} batch-cap smoke did not reject over-cap batch`;
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`Too many ${expectedNoun}: 51`, 'i').test(text) || !/Max 50 per call/i.test(text)) {
    return `${label} batch-cap response missing max-50 guidance`;
  }
  return structuredErrorFailure(response, `${label} batch cap`, { errorCode: 'invalid_arguments' });
}

function rowErrorMentionsIndex(row, index) {
  return typeof row?.error === 'string' && new RegExp(`\\[${index}\\]`).test(row.error);
}

function sameUnknownFields(actual, expectedPairs) {
  if (!Array.isArray(actual) || actual.length !== expectedPairs.length) return false;
  return expectedPairs.every(([name, suggestion], index) => (
    actual[index]?.name === name && actual[index]?.suggestion === suggestion
  ));
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
  if (Array.isArray(parsed.problems)) {
    for (const [problemIndex, problem] of parsed.problems.entries()) {
      if (!Array.isArray(problem?.issues)) continue;
      for (const [issueIndex, issue] of problem.issues.entries()) {
        if (!VAULT_ISSUE_CODE_VALUES.includes(issue?.code)) {
          return `validate_vault response unknown issue code at problems[${problemIndex}].issues[${issueIndex}]: ${issue?.code}`;
        }
      }
    }
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

export function compileFullArtifactFailure(parsed) {
  const summaryFailure = compileSummaryFailure(parsed);
  if (summaryFailure) return summaryFailure;
  if (!Array.isArray(parsed.nodes)) {
    return 'compile_ontology full response missing nodes array';
  }
  if (!Array.isArray(parsed.edges)) {
    return 'compile_ontology full response missing edges array';
  }
  const nodesPaginationFailure = paginationMetaFailure('compile_ontology.nodesPagination', parsed.nodesPagination, parsed.nodeCount, parsed.nodes.length);
  if (nodesPaginationFailure) return nodesPaginationFailure;
  const edgesPaginationFailure = paginationMetaFailure('compile_ontology.edgesPagination', parsed.edgesPagination, parsed.edgeCount, parsed.edges.length);
  if (edgesPaginationFailure) return edgesPaginationFailure;
  const node = parsed.nodes[0];
  if (node && (
    typeof node.slug !== 'string' ||
    typeof node.kind !== 'string' ||
    typeof node.title !== 'string' ||
    !Number.isFinite(node.mtime) ||
    !Number.isInteger(node.outDegree) ||
    node.outDegree < 0 ||
    !Number.isInteger(node.inDegree) ||
    node.inDegree < 0
  )) {
    return 'compile_ontology full response malformed node row';
  }
  const edge = parsed.edges[0];
  if (edge && (
    typeof edge.id !== 'string' ||
    typeof edge.from !== 'string' ||
    typeof edge.to !== 'string' ||
    typeof edge.via !== 'string' ||
    typeof edge.ref !== 'string' ||
    typeof edge.resolved !== 'boolean' ||
    typeof edge.external !== 'boolean'
  )) {
    return 'compile_ontology full response malformed edge row';
  }
  if (!Array.isArray(parsed.aliases)) {
    return 'compile_ontology full response missing aliases array';
  }
  if (!Array.isArray(parsed.ambiguousAliases)) {
    return 'compile_ontology full response missing ambiguousAliases array';
  }
  if (!Array.isArray(parsed.issues)) {
    return 'compile_ontology full response missing issues array';
  }
  if (!Array.isArray(parsed.canonicalizationActions)) {
    return 'compile_ontology full response missing canonicalizationActions array';
  }
  const arrayCountFailure = fullArtifactArrayCountFailure(parsed);
  if (arrayCountFailure) return arrayCountFailure;
  const canonicalizationFailure = canonicalizationActionsFailure(parsed.canonicalizationActions);
  if (canonicalizationFailure) return canonicalizationFailure;
  if (!parsed.summary || typeof parsed.summary !== 'object' || Array.isArray(parsed.summary)) {
    return 'compile_ontology full response missing summary';
  }
  const fullSummaryFailure = numericFieldsFailure('compile_ontology.summary', parsed.summary, [
    'nodes',
    'edges',
    'resolvedEdges',
    'externalEdges',
    'unresolvedEdges',
    'aliases',
    'ambiguousAliases',
    'issues',
  ]);
  if (fullSummaryFailure) return fullSummaryFailure;
  if (parsed.summary.nodes !== parsed.nodeCount || parsed.summary.edges !== parsed.edgeCount) {
    return `compile_ontology full response summary mismatch — summary ${parsed.summary.nodes}/${parsed.summary.edges}, counts ${parsed.nodeCount}/${parsed.edgeCount}`;
  }
  if (
    parsed.summary.aliases !== parsed.aliasCount ||
    parsed.summary.ambiguousAliases !== parsed.ambiguousAliasCount ||
    parsed.summary.issues !== parsed.issueCount
  ) {
    return `compile_ontology full response summary count mismatch — summary aliases/ambiguous/issues ${parsed.summary.aliases}/${parsed.summary.ambiguousAliases}/${parsed.summary.issues}, counts ${parsed.aliasCount}/${parsed.ambiguousAliasCount}/${parsed.issueCount}`;
  }
  if (parsed.summary.graphHash !== parsed.graphHash) {
    return 'compile_ontology full response summary graphHash mismatch';
  }
  return null;
}

function canonicalizationActionsFailure(actions) {
  for (const [index, action] of actions.entries()) {
    const label = `compile_ontology canonicalizationActions[${index}]`;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return `${label} must be an object`;
    }
    if (typeof action.slug !== 'string' || action.slug.trim() === '') {
      return `${label}.slug must be a non-empty string`;
    }
    if (!Array.isArray(action.keys) || action.keys.some((key) => typeof key !== 'string' || key.trim() === '')) {
      return `${label}.keys must be an array of non-empty strings`;
    }
    if (!action.frontmatter || typeof action.frontmatter !== 'object' || Array.isArray(action.frontmatter)) {
      return `${label}.frontmatter must be an object`;
    }
    if (!Number.isFinite(action.expected_mtime) || action.expected_mtime < 0) {
      return `${label}.expected_mtime must be a non-negative finite number`;
    }
    const frontmatterKeys = Object.keys(action.frontmatter);
    const declaredKeys = new Set(action.keys);
    for (const key of action.keys) {
      if (!GRAPH_ARRAY_KEY_SET.has(key)) {
        return `${label}.keys contains unsupported relation-array key "${key}"`;
      }
      if (!Object.prototype.hasOwnProperty.call(action.frontmatter, key)) {
        return `${label}.keys declares "${key}" but frontmatter does not include it`;
      }
    }
    for (const key of frontmatterKeys) {
      if (!GRAPH_ARRAY_KEY_SET.has(key)) {
        return `${label}.frontmatter.${key} is not a compiler relation-array key`;
      }
      if (!declaredKeys.has(key)) {
        return `${label}.frontmatter.${key} is missing from keys`;
      }
      const value = action.frontmatter[key];
      if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string' || ref.trim() === '')) {
        return `${label}.frontmatter.${key} must be an array of non-empty strings`;
      }
    }
  }
  return null;
}

function fullArtifactArrayCountFailure(parsed) {
  const checks = [
    ['aliases', 'aliasCount'],
    ['ambiguousAliases', 'ambiguousAliasCount'],
    ['issues', 'issueCount'],
    ['canonicalizationActions', 'canonicalizationActionCount'],
  ];
  for (const [arrayName, countName] of checks) {
    if (parsed[arrayName].length !== parsed[countName]) {
      return `compile_ontology full response ${arrayName} count mismatch — ${arrayName} ${parsed[arrayName].length}, ${countName} ${parsed[countName]}`;
    }
  }
  return null;
}

function paginationMetaFailure(label, meta, total, returned) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return `${label} missing`;
  }
  for (const key of ['offset', 'limit', 'total', 'returned']) {
    if (!Number.isInteger(meta[key]) || meta[key] < 0) {
      return `${label} missing ${key}`;
    }
  }
  if (meta.total !== total) {
    return `${label} total mismatch — meta ${meta.total}, count ${total}`;
  }
  if (meta.returned !== returned) {
    return `${label} returned mismatch — meta ${meta.returned}, array ${returned}`;
  }
  if (typeof meta.hasMore !== 'boolean') {
    return `${label} missing hasMore`;
  }
  if (meta.nextOffset !== null && (!Number.isInteger(meta.nextOffset) || meta.nextOffset < 0)) {
    return `${label} missing nextOffset`;
  }
  if (meta.hasMore && meta.nextOffset === null) {
    return `${label} hasMore without nextOffset`;
  }
  return null;
}

function stringArrayMapFailure(label, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `${label} missing`;
  }
  for (const [key, row] of Object.entries(value)) {
    if (!key || !Array.isArray(row) || row.some((entry) => typeof entry !== 'string' || !entry)) {
      return `${label} malformed row`;
    }
  }
  return null;
}

function stringArrayMapReferenceFailure(label, value, knownValues, noun) {
  for (const row of Object.values(value)) {
    for (const entry of row) {
      if (!knownValues.has(entry)) {
        return `${label} references unknown ${noun}`;
      }
    }
  }
  return null;
}

function groupedIndexCountFailure(label, value, counts) {
  const keys = new Set([...Object.keys(value), ...Object.keys(counts || {})]);
  for (const key of keys) {
    const actual = value[key]?.length ?? 0;
    const expected = counts?.[key] ?? 0;
    if (actual !== expected) {
      return `${label} count mismatch: ${key}`;
    }
  }
  return null;
}

function indexedEdgeMembershipCountFailure(label, value, expected, expectedLabel) {
  const actual = Object.values(value).reduce((sum, row) => sum + row.length, 0);
  if (actual !== expected) {
    return `${label} count mismatch — index ${actual}, ${expectedLabel} ${expected}`;
  }
  return null;
}

export function compileIndexesFailure(parsed) {
  const fullFailure = compileFullArtifactFailure(parsed);
  if (fullFailure) return fullFailure;
  const indexes = parsed.indexes;
  if (!indexes || typeof indexes !== 'object' || Array.isArray(indexes)) {
    return 'compile_ontology indexes response missing indexes';
  }
  for (const name of ['out', 'in', 'byKind', 'byDomain']) {
    const failure = stringArrayMapFailure(`compile_ontology.indexes.${name}`, indexes[name]);
    if (failure) return failure;
  }
  if (!indexes.edgeById || typeof indexes.edgeById !== 'object' || Array.isArray(indexes.edgeById)) {
    return 'compile_ontology.indexes.edgeById missing';
  }
  const edgeIds = Object.keys(indexes.edgeById);
  if (edgeIds.length !== parsed.edgeCount) {
    return `compile_ontology.indexes.edgeById count mismatch — index ${edgeIds.length}, edgeCount ${parsed.edgeCount}`;
  }
  for (const [id, edge] of Object.entries(indexes.edgeById)) {
    if (
      edge?.id !== id ||
      typeof edge.from !== 'string' ||
      typeof edge.to !== 'string' ||
      typeof edge.via !== 'string' ||
      typeof edge.ref !== 'string' ||
      typeof edge.resolved !== 'boolean' ||
      typeof edge.external !== 'boolean'
    ) {
      return 'compile_ontology.indexes.edgeById malformed edge row';
    }
  }
  const edgeIdSet = new Set(edgeIds);
  for (const name of ['out', 'in']) {
    const failure = stringArrayMapReferenceFailure(`compile_ontology.indexes.${name}`, indexes[name], edgeIdSet, 'edge id');
    if (failure) return failure;
  }
  const outCountFailure = indexedEdgeMembershipCountFailure('compile_ontology.indexes.out', indexes.out, parsed.edgeCount, 'edgeCount');
  if (outCountFailure) return outCountFailure;
  const inCountFailure = indexedEdgeMembershipCountFailure('compile_ontology.indexes.in', indexes.in, parsed.resolvedEdgeCount, 'resolvedEdgeCount');
  if (inCountFailure) return inCountFailure;
  const indexedResolved = Object.values(indexes.edgeById).filter((edge) => edge.resolved).length;
  const indexedExternal = Object.values(indexes.edgeById).filter((edge) => edge.external).length;
  const indexedUnresolved = Object.values(indexes.edgeById).filter((edge) => !edge.resolved && !edge.external).length;
  if (
    indexedResolved !== parsed.resolvedEdgeCount ||
    indexedExternal !== parsed.externalEdgeCount ||
    indexedUnresolved !== parsed.unresolvedEdgeCount
  ) {
    return `compile_ontology.indexes.edgeById edge breakdown mismatch — index ${indexedResolved}/${indexedExternal}/${indexedUnresolved}, counts ${parsed.resolvedEdgeCount}/${parsed.externalEdgeCount}/${parsed.unresolvedEdgeCount}`;
  }
  for (const [id, edge] of Object.entries(indexes.edgeById)) {
    if (!indexes.out[edge.from]?.includes(id)) {
      return 'compile_ontology.indexes.out missing edgeById edge';
    }
    if (edge.resolved && !indexes.in[edge.to]?.includes(id)) {
      return 'compile_ontology.indexes.in missing resolved edge';
    }
  }
  if (!indexes.aliasToSlug || typeof indexes.aliasToSlug !== 'object' || Array.isArray(indexes.aliasToSlug)) {
    return 'compile_ontology.indexes.aliasToSlug missing';
  }
  const aliasKeys = Object.keys(indexes.aliasToSlug);
  if (aliasKeys.length !== parsed.aliasCount) {
    return `compile_ontology.indexes.aliasToSlug count mismatch — index ${aliasKeys.length}, aliasCount ${parsed.aliasCount}`;
  }
  for (const [alias, slug] of Object.entries(indexes.aliasToSlug)) {
    if (!alias || typeof slug !== 'string' || !slug) {
      return 'compile_ontology.indexes.aliasToSlug malformed row';
    }
  }
  const knownSlugs = new Set([
    ...parsed.nodes.map((node) => node.slug),
    ...parsed.aliases.map((alias) => alias.slug),
  ]);
  for (const [alias, slug] of Object.entries(indexes.aliasToSlug)) {
    if (!knownSlugs.has(slug)) {
      return `compile_ontology.indexes.aliasToSlug references unknown slug: ${alias}`;
    }
  }
  for (const name of ['byKind', 'byDomain']) {
    const failure = stringArrayMapReferenceFailure(`compile_ontology.indexes.${name}`, indexes[name], knownSlugs, 'node slug');
    if (failure) return failure;
  }
  const byKindCountFailure = groupedIndexCountFailure('compile_ontology.indexes.byKind', indexes.byKind, parsed.byKind);
  if (byKindCountFailure) return byKindCountFailure;
  const byDomainCountFailure = groupedIndexCountFailure('compile_ontology.indexes.byDomain', indexes.byDomain, parsed.byDomain);
  if (byDomainCountFailure) return byDomainCountFailure;
  return null;
}

export function compileIndexesSummary(parsed) {
  const indexes = parsed?.indexes;
  return [
    `out ${objectKeyCount(indexes?.out)}`,
    `in ${objectKeyCount(indexes?.in)}`,
    `edgeById ${objectKeyCount(indexes?.edgeById)}`,
    `aliases ${objectKeyCount(indexes?.aliasToSlug)}`,
    `edges ${edgeBreakdownSummary(parsed)}`,
  ].join(', ');
}

function objectKeyCount(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'n/a';
  return Object.keys(value).length;
}

function edgeBreakdownSummary(parsed) {
  const counts = [
    parsed?.resolvedEdgeCount,
    parsed?.externalEdgeCount,
    parsed?.unresolvedEdgeCount,
  ];
  return counts.map((count) => (Number.isInteger(count) ? count : 'n/a')).join('/');
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
  const executionFailure = queryPlanExecutionFailure(parsed.execution, targetOperation, label);
  if (executionFailure) return executionFailure;
  return null;
}

export function queryPlanExecutionFailure(execution, targetOperation, label = `${targetOperation} query_plan`) {
  if (!execution || typeof execution !== 'object') {
    return `${label} missing execution advice`;
  }
  if (typeof execution.shouldRun !== 'boolean') {
    return `${label} execution missing shouldRun`;
  }
  if (!['run', 'narrow', 'review'].includes(execution.nextStep)) {
    return `${label} execution missing nextStep`;
  }
  if (typeof execution.recommendation !== 'string' || execution.recommendation.trim() === '') {
    return `${label} execution missing recommendation`;
  }
  if (!execution.suggestedQuery || execution.suggestedQuery.operation !== targetOperation) {
    return `${label} execution missing suggestedQuery`;
  }
  if (execution.nextStep === 'narrow' && !execution.saferQuery) {
    return `${label} execution missing saferQuery for narrow advice`;
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
  if (!Array.isArray(parsed.nodes) || parsed.nodes.length !== parsed.hops.length) {
    return 'path response node count mismatch';
  }
  for (const [index, row] of parsed.nodes.entries()) {
    const failure = pathNodeFailure(row, index);
    if (failure) return failure;
    if (row.slug !== parsed.hops[index]) {
      return `path response node/hop mismatch at index ${index}`;
    }
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

export function allPathsQueryFailure(parsed, expectedFrom, expectedTo = expectedFrom) {
  if (parsed?.operation !== 'all_paths') {
    return `all_paths returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed.from !== expectedFrom || parsed.to !== expectedTo) {
    return `all_paths endpoint mismatch — expected ${expectedFrom}->${expectedTo}, got ${parsed.from}->${parsed.to}`;
  }
  if (typeof parsed.found !== 'boolean') {
    return 'all_paths response missing found flag';
  }
  if (!Number.isInteger(parsed.searchBudget) || parsed.searchBudget < 1) {
    return 'all_paths response missing searchBudget';
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit < 1) {
    return 'all_paths response missing limit';
  }
  if (!Number.isInteger(parsed.expandedStates) || parsed.expandedStates < 0) {
    return 'all_paths response missing expandedStates';
  }
  if (parsed.expandedStates > parsed.searchBudget) {
    return `all_paths response exceeded searchBudget — expanded ${parsed.expandedStates}, budget ${parsed.searchBudget}`;
  }
  if (typeof parsed.exhaustive !== 'boolean') {
    return 'all_paths response missing exhaustive flag';
  }
  if (typeof parsed.truncatedByBudget !== 'boolean') {
    return 'all_paths response missing truncatedByBudget flag';
  }
  if (parsed.exhaustive === parsed.truncatedByBudget) {
    return 'all_paths response exhaustive/truncatedByBudget mismatch';
  }
  if (typeof parsed.totalPathsExact !== 'boolean' || parsed.totalPathsExact !== parsed.exhaustive) {
    return 'all_paths response totalPathsExact/exhaustive mismatch';
  }
  if (!Number.isInteger(parsed.totalPaths) || parsed.totalPaths < 0) {
    return 'all_paths response missing totalPaths';
  }
  if (typeof parsed.limited !== 'boolean') {
    return 'all_paths response missing limited flag';
  }
  if (!Array.isArray(parsed.paths)) {
    return 'all_paths response missing paths array';
  }
  if (parsed.paths.length > parsed.limit) {
    return `all_paths response path count exceeds limit — paths ${parsed.paths.length}, limit ${parsed.limit}`;
  }
  if (parsed.paths.length > parsed.totalPaths) {
    return `all_paths response path count exceeds total — paths ${parsed.paths.length}, total ${parsed.totalPaths}`;
  }
  if (!parsed.limited && parsed.paths.length !== parsed.totalPaths) {
    return `all_paths response total mismatch — paths ${parsed.paths.length}, total ${parsed.totalPaths}`;
  }
  const evidenceFailure = allPathsEvidenceFailure(parsed.evidence, parsed);
  if (evidenceFailure) return evidenceFailure;
  for (const [index, row] of parsed.paths.entries()) {
    if (!Number.isInteger(row?.hopCount) || row.hopCount < 0) {
      return `all_paths path missing hopCount at index ${index}`;
    }
    if (!Array.isArray(row.hops) || row.hops.length !== row.hopCount + 1) {
      return `all_paths path hop count mismatch at index ${index}`;
    }
    if (row.hops[0] !== expectedFrom || row.hops.at(-1) !== expectedTo) {
      return `all_paths path endpoint mismatch at index ${index}`;
    }
    if (!Array.isArray(row.edges) || row.edges.length !== row.hopCount) {
      return `all_paths path edge count mismatch at index ${index}`;
    }
    if (!Array.isArray(row.nodes) || row.nodes.length !== row.hops.length) {
      return `all_paths path node count mismatch at index ${index}`;
    }
  }
  return null;
}

function allPathsEvidenceFailure(evidence, parsed) {
  if (!evidence || typeof evidence !== 'object') {
    return 'all_paths response missing evidence guidance';
  }
  const pathsComplete = parsed.exhaustive && !parsed.limited;
  const expectedReason = parsed.truncatedByBudget ? 'search_budget' : parsed.limited ? 'limit' : 'complete';
  if (evidence.status !== (pathsComplete ? 'complete' : 'partial')) {
    return 'all_paths evidence status mismatch';
  }
  if (evidence.reason !== expectedReason) {
    return 'all_paths evidence reason mismatch';
  }
  if (evidence.totalPathsExact !== parsed.totalPathsExact) {
    return 'all_paths evidence totalPathsExact mismatch';
  }
  if (evidence.pathsComplete !== pathsComplete) {
    return 'all_paths evidence pathsComplete mismatch';
  }
  if (evidence.nextStep !== (pathsComplete ? 'use' : 'narrow')) {
    return 'all_paths evidence nextStep mismatch';
  }
  if (typeof evidence.recommendation !== 'string' || evidence.recommendation.length === 0) {
    return 'all_paths evidence missing recommendation';
  }
  if (!evidence.suggestedQuery || typeof evidence.suggestedQuery !== 'object') {
    return 'all_paths evidence missing suggestedQuery';
  }
  if (pathsComplete && evidence.suggestedQuery.operation !== 'all_paths') {
    return 'all_paths evidence suggestedQuery should reuse all_paths when complete';
  }
  if (!pathsComplete && evidence.suggestedQuery.operation !== 'query_plan') {
    return 'all_paths evidence suggestedQuery should query_plan when partial';
  }
  if (!pathsComplete && evidence.suggestedQuery.targetOperation !== 'all_paths') {
    return 'all_paths evidence suggestedQuery missing all_paths target';
  }
  if (!pathsComplete && (!evidence.saferQuery || evidence.saferQuery.operation !== 'all_paths')) {
    return 'all_paths evidence missing saferQuery';
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

export function verifyCountConsistencySummary({ kinds, list, compiled, overview }) {
  const sources = [
    ['list_kinds', kinds?.total],
    ['list_concepts', list?.total],
    ['compile_ontology', compiled?.nodeCount],
    ['overview', overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));
  if (!sources.length) return null;
  const nodeCount = sources[0][1];
  const sourceNames = sources.map(([name]) => name).join('/');
  const kindCount = new Set([
    ...Object.keys(kinds?.byKind ?? {}),
    ...Object.keys(compiled?.byKind ?? {}),
    ...Object.keys(overview?.byKind ?? {}),
  ]).size;
  const kindSuffix = kindCount ? `, ${formatCount(kindCount, 'kind')}` : '';
  return `${formatCount(nodeCount, 'node')} across ${sourceNames}${kindSuffix}`;
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
    for (const [index, action] of parsed.nextActions.entries()) {
      const actionFailure = diagnosisNextActionFailure(label, action, index);
      if (actionFailure) {
        return actionFailure;
      }
    }
    const growthFailure = workspaceBriefGrowthConsistencyFailure(label, parsed);
    if (growthFailure) return growthFailure;
  }
  const checks = diagnosisChecks(parsed, expectedOperation);
  if (!checks) {
    return `${label} response missing health checks`;
  }
  for (const [index, check] of checks.entries()) {
    const checkFailure = diagnosisHealthCheckFailure(label, check, index);
    if (checkFailure) {
      return checkFailure;
    }
  }
  const failedChecks = checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) {
    return `${label} has failing health checks: ${healthChecksSummary(failedChecks)}. Inspect query_ontology({operation:"health"}) before writing.`;
  }
  const blockingActions = blockingNextActions(parsed?.nextActions);
  if (blockingActions.length > 0) {
    return `${label} has actionable nextActions: ${blockingActions.join(', ')}. Inspect workspace_brief.nextActions before writing.`;
  }
  return null;
}

function diagnosisNextActionFailure(label, action, index) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return `${label} response malformed nextAction at index ${index}`;
  }
  if (!hasNonEmptyString(action.id, action.kind)) {
    return `${label} response missing nextAction identifier at index ${index}`;
  }
  if (!hasNonEmptyString(action.severity)) {
    return `${label} response missing nextAction severity at index ${index}`;
  }
  if (!NEXT_ACTION_SEVERITIES.has(action.severity)) {
    return `${label} response unknown nextAction severity at index ${index}: ${action.severity}`;
  }
  if (!hasOptionalNonNegativeInteger(action.count)) {
    return `${label} response malformed nextAction count at index ${index}`;
  }
  const sampleFailure = diagnosisNextActionSampleFailure(label, action, index);
  if (sampleFailure) return sampleFailure;
  return null;
}

function diagnosisNextActionSampleFailure(label, action, index) {
  if (action.sample == null) return null;
  if (!Array.isArray(action.sample)) {
    return `${label} response malformed nextAction sample at index ${index}`;
  }
  if (action.count != null && action.sample.length > action.count) {
    return `${label} response nextAction sample exceeds count at index ${index}`;
  }
  for (const [sampleIndex, sample] of action.sample.entries()) {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      return `${label} response malformed nextAction sample row at index ${index}.${sampleIndex}`;
    }
    if (action.kind === 'add_missing_relations') {
      const actionFailure = diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, 'add_relation');
      if (actionFailure) return actionFailure;
      if (typeof sample.args.from !== 'string' || typeof sample.args.to !== 'string' || typeof sample.args.type !== 'string') {
        return `${label} response malformed add_missing_relations sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === 'materialize_external_elements') {
      const actionFailure = diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, 'add_concept');
      if (actionFailure) return actionFailure;
      if (typeof sample.args.slug !== 'string' || sample.args.kind !== 'element') {
        return `${label} response malformed materialize_external_elements sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === 'resolve_dangling_references') {
      const rowFailure = diagnosisGrowthCandidateSampleFailure(`${label} nextAction resolve_dangling_references sample`, sample, sampleIndex);
      if (rowFailure) return rowFailure;
      if (sample.kind !== 'resolve_dangling_reference') {
        return `${label} response malformed resolve_dangling_references sample kind at index ${index}.${sampleIndex}`;
      }
    }
  }
  return null;
}

function diagnosisGrowthCandidateSampleFailure(label, row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.kind !== 'string' || row.kind.length === 0) {
    return `${label} row missing kind at index ${index}`;
  }
  if (typeof row.score !== 'number' || !Number.isFinite(row.score) || row.score < 0) {
    return `${label} row missing score: ${row.kind}`;
  }
  if (typeof row.reason !== 'string' || row.reason.length === 0) {
    return `${label} row missing reason: ${row.kind}`;
  }
  return null;
}

function diagnosisProposedActionSampleFailure(label, action, sample, index, sampleIndex, expectedTool) {
  if (sample.tool !== expectedTool) {
    return `${label} response nextAction ${action.kind} sample tool mismatch at index ${index}.${sampleIndex}`;
  }
  if (!sample.args || typeof sample.args !== 'object' || Array.isArray(sample.args)) {
    return `${label} response nextAction ${action.kind} sample missing args at index ${index}.${sampleIndex}`;
  }
  return null;
}

function diagnosisHealthCheckFailure(label, check, index) {
  if (!check || typeof check !== 'object' || Array.isArray(check)) {
    return `${label} response malformed health check at index ${index}`;
  }
  if (!hasNonEmptyString(check.id)) {
    return `${label} response missing health check id at index ${index}`;
  }
  if (!hasNonEmptyString(check.status)) {
    return `${label} response missing health check status at index ${index}`;
  }
  if (!HEALTH_CHECK_STATUSES.has(check.status)) {
    return `${label} response unknown health check status at index ${index}: ${check.status}`;
  }
  if (!hasOptionalNonNegativeInteger(check.count)) {
    return `${label} response malformed health check count at index ${index}`;
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
  return values.every((value) => typeof value === 'string' && value.trim().length > 0);
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
    if (!VAULT_ISSUE_CODE_VALUES.includes(code)) {
      return `validate_vault response unknown byCode key: ${code}`;
    }
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
    .map(nextActionDiagnosticLabel);
}

function nextActionDiagnosticLabel(action) {
  const label = nextActionLabel(action);
  const severity = action?.severity || 'unknown';
  const count = Number.isInteger(action?.count) ? `:${action.count}` : '';
  return `${label}:${severity}${count}`;
}

function nextActionLabel(action) {
  const id = typeof action?.id === 'string' && action.id.trim().length > 0 ? action.id : null;
  const kind = typeof action?.kind === 'string' && action.kind.trim().length > 0 ? action.kind : null;
  if (id && kind && id !== kind) return `${id}/${kind}`;
  return id || kind || 'unknown';
}

export function diagnosisIssueCount(parsed) {
  return parsed?.summary?.issues ?? parsed?.summary?.compileIssues ?? 0;
}

export function healthSummary(parsed) {
  return [
    `issues:${diagnosisIssueCount(parsed)}`,
    `unresolved:${parsed?.summary?.unresolvedEdges ?? 0}`,
    `cycles:${parsed?.summary?.dependencyCycles ?? 0}`,
    `${formatCount((parsed?.checks || []).length, 'check')}`,
  ].join(', ');
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

export function advisoryHealthChecksSummary(checks, limit = 3) {
  if (!Array.isArray(checks)) return null;
  const advisory = checks
    .filter((check) => check?.status !== 'pass' && check?.status !== 'fail')
    .map((check) => {
      const count = Number.isInteger(check.count) ? `:${check.count}` : '';
      const message = typeof check.message === 'string' && check.message.length > 0 ? ` - ${check.message}` : '';
      return `${check.id || 'unknown'}:${check.status || 'unknown'}${count}${message}`;
    });
  if (advisory.length === 0) return null;
  const shown = advisory.slice(0, limit);
  const suffix = advisory.length > shown.length ? `, +${advisory.length - shown.length} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

export function tunedHealthScopeOutputSummary(args = VERIFY_TUNED_HEALTH_ARGS) {
  const dependencyTypes = Array.isArray(args.dependencyTypes) && args.dependencyTypes.length > 0
    ? args.dependencyTypes.join('/')
    : 'all';
  const componentTypes = Array.isArray(args.componentTypes) && args.componentTypes.length > 0
    ? args.componentTypes.join('/')
    : 'all';
  return `dependencyTypes=${dependencyTypes}; componentTypes=${componentTypes}`;
}

export function tunedWorkspaceBriefScopeOutputSummary(
  args = VERIFY_TUNED_HEALTH_ARGS,
  nodeLimit = VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
) {
  return `${tunedHealthScopeOutputSummary(args)}; nodeLimit=${nodeLimit}`;
}

export function advisoryNextActionsSummary(actions, limit = 3) {
  if (!Array.isArray(actions)) return null;
  const advisory = actions
    .filter((action) => action?.severity !== 'fail')
    .map((action) => {
      const label = nextActionLabel(action);
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
  const growth = parsed?.growth;
  const growthText = growth && typeof growth === 'object' && !Array.isArray(growth)
    ? `, growth actions:${growth.totalActions ?? 0} external:${growth.externalElementRefs ?? 0} ignoredExternal:${growth.externalElementRefsIgnored ?? 0}`
    : '';
  return `${formatCount(parsed?.summary?.nodes ?? 0, 'node')}, ${formatCount(
    (parsed?.nextActions || []).length,
    'next action',
  )}, ${formatCount((parsed?.health?.checks || []).length, 'health check')}${growthText}`;
}

export function agentBriefSummary(parsed) {
  return `${parsed?.readiness?.status || 'unknown'} ${parsed?.readiness?.score ?? 'n/a'}/100, ${formatCount(
    (parsed?.entrypoints || []).length,
    'entrypoint',
  )}, ${formatCount((parsed?.firstCalls || []).length, 'first call')}, ${formatCount(
    (parsed?.graphDbQueryPack || []).length,
    'graph DB pack item',
  )}, ${formatCount(
    (parsed?.playbooks || []).length,
    'playbook',
  )}, ${formatCount(
    (parsed?.writeGuardrails || []).length,
    'write guardrail',
  )}, ${formatCount(
    (parsed?.resultContracts || []).length,
    'result contract',
  )}`;
}

export function agentBriefFailure(parsed) {
  if (parsed?.operation !== 'agent_brief') {
    return `agent_brief returned unexpected operation: ${parsed?.operation}`;
  }
  if (parsed?.sideEffect !== false) {
    return 'agent_brief response must be side-effect free';
  }
  if (!DIAGNOSIS_STATUSES.has(parsed?.status)) {
    return 'agent_brief response malformed status';
  }
  if (!parsed?.readiness || typeof parsed.readiness !== 'object' || Array.isArray(parsed.readiness)) {
    return 'agent_brief response missing readiness';
  }
  if (!['ready', 'needs_attention', 'needs_shape'].includes(parsed.readiness.status)) {
    return 'agent_brief response malformed readiness status';
  }
  if (!Number.isInteger(parsed.readiness.score) || parsed.readiness.score < 0 || parsed.readiness.score > 100) {
    return 'agent_brief response malformed readiness score';
  }
  const readinessCountFailure = numericFieldsFailure('agent_brief readiness', parsed.readiness, [
    'meaningfulNodes',
    'relationCount',
    'projects',
    'domains',
    'capabilities',
    'elements',
    'unresolvedEdges',
    'externalEdges',
    'growthActions',
    'healthChecks',
  ]);
  if (readinessCountFailure) return readinessCountFailure;
  if (
    !hasNonEmptyString(parsed.handoffPrompt) ||
    !/oh-my-ontology MCP server/.test(parsed.handoffPrompt) ||
    !/first-contact MCP calls/i.test(parsed.handoffPrompt) ||
    !/CLI fallback commands/.test(parsed.handoffPrompt) ||
    !/Graph DB query pack/.test(parsed.handoffPrompt) ||
    !/Investigation playbooks/.test(parsed.handoffPrompt) ||
    !/Traversal strategy/.test(parsed.handoffPrompt) ||
    !/plan_before_enumeration/.test(parsed.handoffPrompt) ||
    !/Write guardrails/.test(parsed.handoffPrompt) ||
    !/Result contracts/.test(parsed.handoffPrompt) ||
    !/totalPathsExact/.test(parsed.handoffPrompt) ||
    !/relation_check/.test(parsed.handoffPrompt) ||
    !/add_relation/.test(parsed.handoffPrompt)
  ) {
    return 'agent_brief response missing copyable handoffPrompt';
  }
  if (
    !Array.isArray(parsed.cliFallbackCommands) ||
    parsed.cliFallbackCommands.length === 0 ||
    parsed.cliFallbackCommands.some((command) => typeof command !== 'string' || !/^oh-my-ontology\s/.test(command))
  ) {
    return 'agent_brief response missing cliFallbackCommands';
  }
  if (!parsed.cliFallbackCommands.some((command) => /hubs \[vault\] --plan/.test(command))) {
    return 'agent_brief cliFallbackCommands missing centrality plan fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /facets \[vault\]/.test(command))) {
    return 'agent_brief cliFallbackCommands missing facets fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /schema \[vault\]/.test(command))) {
    return 'agent_brief cliFallbackCommands missing schema fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /match-nodes \[vault\] --plan/.test(command))) {
    return 'agent_brief cliFallbackCommands missing match-nodes plan fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /match-edges \[vault\] --plan/.test(command))) {
    return 'agent_brief cliFallbackCommands missing match-edges plan fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /domain-matrix \[vault\]/.test(command))) {
    return 'agent_brief cliFallbackCommands missing domain-matrix fallback';
  }
  if (!parsed.cliFallbackCommands.some((command) => /all-paths /.test(command) && / --plan /.test(command))) {
    return 'agent_brief cliFallbackCommands missing all-paths plan fallback';
  }
  if (parsed.readiness.projects > 0) {
    if (!parsed.cliFallbackCommands.some((command) => /pattern-walk /.test(command) && / --pattern /.test(command))) {
      return 'agent_brief cliFallbackCommands missing pattern-walk fallback';
    }
    if (!parsed.cliFallbackCommands.some((command) => /project-map /.test(command))) {
      return 'agent_brief cliFallbackCommands missing project-map fallback';
    }
  }
  if (!parsed.cliFallbackCommands.some((command) => /explain /.test(command))) {
    return 'agent_brief cliFallbackCommands missing explain fallback';
  }
  if (!parsed?.health || !Array.isArray(parsed.health.checks)) {
    return 'agent_brief response missing health checks';
  }
  for (const [index, check] of parsed.health.checks.entries()) {
    const checkFailure = diagnosisHealthCheckFailure('agent_brief', check, index);
    if (checkFailure) return checkFailure;
  }
  const failedChecks = parsed.health.checks.filter((check) => check.status === 'fail');
  if (failedChecks.length > 0) {
    return `agent_brief has failing health checks: ${healthChecksSummary(failedChecks)}. Inspect query_ontology({operation:"health"}) before writing.`;
  }
  if (!Array.isArray(parsed.nextActions)) {
    return 'agent_brief response missing nextActions array';
  }
  for (const [index, action] of parsed.nextActions.entries()) {
    const actionFailure = diagnosisNextActionFailure('agent_brief', action, index);
    if (actionFailure) return actionFailure;
  }
  const blockingActions = blockingNextActions(parsed.nextActions);
  if (blockingActions.length > 0) {
    return `agent_brief has actionable nextActions: ${blockingActions.join(', ')}. Inspect agent_brief.nextActions before writing.`;
  }
  if (!Array.isArray(parsed.entrypoints)) {
    return 'agent_brief response missing entrypoints array';
  }
  for (const [index, entrypoint] of parsed.entrypoints.entries()) {
    if (!hasNonEmptyString(entrypoint?.slug, entrypoint?.title, entrypoint?.kind)) {
      return `agent_brief response malformed entrypoint at index ${index}`;
    }
    if (!hasOptionalNonNegativeInteger(entrypoint.degree) || entrypoint.degree == null) {
      return `agent_brief response malformed entrypoint degree at index ${index}`;
    }
  }
  const firstCallFailure = agentToolCallsFailure('agent_brief firstCalls', parsed.firstCalls);
  if (firstCallFailure) return firstCallFailure;
  if (!agentToolCallsIncludeOperation(parsed.firstCalls, 'relation_check')) {
    return 'agent_brief firstCalls missing relation_check preflight';
  }
  const graphDbQueryPackFailure = agentGraphDbQueryPackFailure(parsed.graphDbQueryPack);
  if (graphDbQueryPackFailure) return graphDbQueryPackFailure;
  if (!Array.isArray(parsed.playbooks) || parsed.playbooks.length === 0) {
    return 'agent_brief response missing playbooks';
  }
  for (const [index, playbook] of parsed.playbooks.entries()) {
    if (!hasNonEmptyString(playbook?.id, playbook?.goal)) {
      return `agent_brief response malformed playbook at index ${index}`;
    }
    if (
      !Array.isArray(playbook.evidence) ||
      playbook.evidence.length === 0 ||
      playbook.evidence.some((item) => !hasNonEmptyString(item))
    ) {
      return `agent_brief playbook ${playbook.id} missing evidence checklist`;
    }
    if (
      !Array.isArray(playbook.stopWhen) ||
      playbook.stopWhen.length === 0 ||
      playbook.stopWhen.some((item) => !hasNonEmptyString(item))
    ) {
      return `agent_brief playbook ${playbook.id} missing stopWhen checklist`;
    }
    const callFailure = agentToolCallsFailure(`agent_brief playbook ${playbook.id}`, playbook.calls);
    if (callFailure) return callFailure;
  }
  const refactorPlaybook = parsed.playbooks.find((playbook) => playbook?.id === 'refactor_impact');
  if (!refactorPlaybook) {
    return 'agent_brief missing refactor_impact playbook';
  }
  if (!agentToolCallsIncludeOperation(refactorPlaybook.calls, 'relation_check')) {
    return 'agent_brief refactor_impact playbook missing relation_check preflight';
  }
  const traversalPlaybook = parsed.playbooks.find((playbook) => playbook?.id === 'graph_traversal');
  if (!traversalPlaybook) {
    return 'agent_brief missing graph_traversal playbook';
  }
  for (const operation of ['schema', 'all_paths', 'pattern_walk', 'project_map']) {
    if (!agentToolCallsIncludeOperation(traversalPlaybook.calls, operation)) {
      return `agent_brief graph_traversal playbook missing ${operation}`;
    }
  }
  const traversalStrategyFailure = agentTraversalStrategyFailure(parsed.traversalStrategy);
  if (traversalStrategyFailure) return traversalStrategyFailure;
  if (!Array.isArray(parsed.writeGuardrails) || parsed.writeGuardrails.length === 0) {
    return 'agent_brief response missing writeGuardrails';
  }
  for (const [index, guardrail] of parsed.writeGuardrails.entries()) {
    if (!hasNonEmptyString(guardrail?.id, guardrail?.goal)) {
      return `agent_brief response malformed writeGuardrail at index ${index}`;
    }
    const callFailure = agentGuardrailCallsFailure(`agent_brief writeGuardrail ${guardrail.id}`, guardrail.calls);
    if (callFailure) return callFailure;
  }
  const relationGuardrail = parsed.writeGuardrails.find((guardrail) => guardrail?.id === 'preflight_relation');
  if (!relationGuardrail || !agentToolCallsIncludeOperation(relationGuardrail.calls, 'relation_check')) {
    return 'agent_brief writeGuardrails missing preflight_relation relation_check';
  }
  const renameGuardrail = parsed.writeGuardrails.find((guardrail) => guardrail?.id === 'preflight_rename');
  if (!renameGuardrail || !renameGuardrail.calls.some((call) => call?.tool === 'find_backlinks')) {
    return 'agent_brief writeGuardrails missing preflight_rename find_backlinks';
  }
  const syncGuardrail = parsed.writeGuardrails.find((guardrail) => guardrail?.id === 'post_change_sync');
  if (!syncGuardrail || !syncGuardrail.calls.some((call) => call?.tool === 'validate_vault')) {
    return 'agent_brief writeGuardrails missing post_change_sync validate_vault';
  }
  for (const operation of ['health', 'cycles', 'growth_plan', 'maintenance_plan']) {
    if (!agentToolCallsIncludeOperation(syncGuardrail.calls, operation)) {
      return `agent_brief writeGuardrails missing post_change_sync ${operation}`;
    }
  }
  if (!Array.isArray(parsed.writePolicy) || parsed.writePolicy.some((row) => typeof row !== 'string' || row.trim() === '')) {
    return 'agent_brief response missing writePolicy guidance';
  }
  if (!parsed.writePolicy.some((row) => /relation_check/.test(row) && /add_relation/.test(row))) {
    return 'agent_brief writePolicy missing relation_check add_relation guidance';
  }
  const resultContractsFailure = agentResultContractsFailure(parsed.resultContracts);
  if (resultContractsFailure) return resultContractsFailure;
  const decisionGuideFailure = agentRelationDecisionGuideFailure(parsed.relationDecisionGuide);
  if (decisionGuideFailure) return decisionGuideFailure;
  return null;
}

function agentTraversalStrategyFailure(strategies) {
  if (!Array.isArray(strategies) || strategies.length === 0) {
    return 'agent_brief response missing traversalStrategy';
  }
  const required = ['plan_before_enumeration', 'bounded_path_evidence', 'containment_cross_check'];
  const seen = new Set();
  for (const [index, strategy] of strategies.entries()) {
    if (!hasNonEmptyString(strategy?.id, strategy?.priority, strategy?.goal, strategy?.useWhen)) {
      return `agent_brief traversalStrategy malformed row at index ${index}`;
    }
    seen.add(strategy.id);
    if (
      !Array.isArray(strategy.evidence) ||
      strategy.evidence.length === 0 ||
      strategy.evidence.some((item) => !hasNonEmptyString(item))
    ) {
      return `agent_brief traversalStrategy ${strategy.id} missing evidence checklist`;
    }
    if (
      !Array.isArray(strategy.stopWhen) ||
      strategy.stopWhen.length === 0 ||
      strategy.stopWhen.some((item) => !hasNonEmptyString(item))
    ) {
      return `agent_brief traversalStrategy ${strategy.id} missing stopWhen checklist`;
    }
    const callFailure = agentToolCallsFailure(`agent_brief traversalStrategy ${strategy.id}`, strategy.calls);
    if (callFailure) return callFailure;
  }
  const missing = required.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return `agent_brief traversalStrategy missing strategies: ${missing.join(', ')}`;
  }
  const plan = strategies.find((strategy) => strategy.id === 'plan_before_enumeration');
  if (!agentToolCallsIncludeOperation(plan?.calls, 'query_plan')) {
    return 'agent_brief traversalStrategy plan_before_enumeration missing query_plan';
  }
  const paths = strategies.find((strategy) => strategy.id === 'bounded_path_evidence');
  if (!agentToolCallsIncludeOperation(paths?.calls, 'all_paths')) {
    return 'agent_brief traversalStrategy bounded_path_evidence missing all_paths';
  }
  if (!paths.evidence.some((item) => /evidence\.pathsComplete/.test(item))) {
    return 'agent_brief traversalStrategy bounded_path_evidence missing pathsComplete evidence';
  }
  const containment = strategies.find((strategy) => strategy.id === 'containment_cross_check');
  for (const operation of ['pattern_walk', 'project_map']) {
    if (!agentToolCallsIncludeOperation(containment?.calls, operation)) {
      return `agent_brief traversalStrategy containment_cross_check missing ${operation}`;
    }
  }
  return null;
}

function agentResultContractsFailure(contracts) {
  if (!Array.isArray(contracts)) {
    return 'agent_brief response missing resultContracts';
  }
  const allPaths = contracts.find((contract) => contract?.operation === 'all_paths');
  if (!allPaths || typeof allPaths !== 'object' || Array.isArray(allPaths)) {
    return 'agent_brief resultContracts missing all_paths contract';
  }
  const requiredFields = [
    'limit',
    'searchBudget',
    'expandedStates',
    'exhaustive',
    'truncatedByBudget',
    'totalPathsExact',
    'evidence.status',
    'evidence.reason',
    'evidence.pathsComplete',
  ];
  if (!Array.isArray(allPaths.mustReport)) {
    return 'agent_brief all_paths resultContract missing mustReport';
  }
  const missingFields = requiredFields.filter((field) => !allPaths.mustReport.includes(field));
  if (missingFields.length > 0) {
    return `agent_brief all_paths resultContract missing mustReport fields: ${missingFields.join(', ')}`;
  }
  if (
    !Array.isArray(allPaths.partialWhen) ||
    !allPaths.partialWhen.some((condition) => /exhaustive=false/.test(condition)) ||
    !allPaths.partialWhen.some((condition) => /totalPathsExact=false/.test(condition)) ||
    !allPaths.partialWhen.some((condition) => /evidence\.status=partial/.test(condition)) ||
    !allPaths.partialWhen.some((condition) => /evidence\.pathsComplete=false/.test(condition))
  ) {
    return 'agent_brief all_paths resultContract missing partial evidence conditions';
  }
  if (
    !hasNonEmptyString(allPaths.policy) ||
    !/partial evidence/.test(allPaths.policy) ||
    !/maxHops\/types/.test(allPaths.policy)
  ) {
    return 'agent_brief all_paths resultContract missing partial-evidence policy';
  }
  return null;
}

function agentGraphDbQueryPackFailure(pack) {
  if (!Array.isArray(pack) || pack.length === 0) {
    return 'agent_brief response missing graphDbQueryPack';
  }
  const required = ['graph_facets', 'node_scan', 'edge_scan', 'domain_coupling', 'path_evidence'];
  const seen = new Set();
  for (const [index, item] of pack.entries()) {
    if (!hasNonEmptyString(item?.id, item?.intent, item?.goal)) {
      return `agent_brief graphDbQueryPack malformed row at index ${index}`;
    }
    seen.add(item.id);
    const callFailure = agentToolCallsFailure(`agent_brief graphDbQueryPack ${item.id}`, item.calls);
    if (callFailure) return callFailure;
  }
  const missing = required.filter((id) => !seen.has(id));
  if (missing.length > 0) {
    return `agent_brief graphDbQueryPack missing packs: ${missing.join(', ')}`;
  }
  const graphFacets = pack.find((item) => item.id === 'graph_facets');
  if (!agentToolCallsIncludeOperation(graphFacets?.calls, 'facets')) {
    return 'agent_brief graphDbQueryPack graph_facets missing facets';
  }
  if (!agentToolCallsIncludeOperation(graphFacets?.calls, 'schema')) {
    return 'agent_brief graphDbQueryPack graph_facets missing schema';
  }
  const nodeScan = pack.find((item) => item.id === 'node_scan');
  if (!agentToolCallsIncludeQueryPlanTarget(nodeScan?.calls, 'match_nodes')) {
    return 'agent_brief graphDbQueryPack node_scan missing match_nodes query_plan';
  }
  if (!agentToolCallsIncludeOperation(nodeScan?.calls, 'match_nodes')) {
    return 'agent_brief graphDbQueryPack node_scan missing match_nodes';
  }
  const edgeScan = pack.find((item) => item.id === 'edge_scan');
  if (!agentToolCallsIncludeQueryPlanTarget(edgeScan?.calls, 'match_edges')) {
    return 'agent_brief graphDbQueryPack edge_scan missing match_edges query_plan';
  }
  if (!agentToolCallsIncludeOperation(edgeScan?.calls, 'match_edges')) {
    return 'agent_brief graphDbQueryPack edge_scan missing match_edges';
  }
  const domainCoupling = pack.find((item) => item.id === 'domain_coupling');
  if (!agentToolCallsIncludeOperation(domainCoupling?.calls, 'domain_matrix')) {
    return 'agent_brief graphDbQueryPack domain_coupling missing domain_matrix';
  }
  if (!agentToolCallsIncludeQueryPlanTarget(domainCoupling?.calls, 'centrality')) {
    return 'agent_brief graphDbQueryPack domain_coupling missing centrality query_plan';
  }
  if (!agentToolCallsIncludeOperation(domainCoupling?.calls, 'centrality')) {
    return 'agent_brief graphDbQueryPack domain_coupling missing centrality';
  }
  const pathEvidence = pack.find((item) => item.id === 'path_evidence');
  if (!agentToolCallsIncludeQueryPlanTarget(pathEvidence?.calls, 'all_paths')) {
    return 'agent_brief graphDbQueryPack path_evidence missing all_paths query_plan';
  }
  if (!agentToolCallsIncludeOperation(pathEvidence?.calls, 'all_paths')) {
    return 'agent_brief graphDbQueryPack path_evidence missing all_paths';
  }
  if (!agentToolCallsIncludeOperation(pathEvidence?.calls, 'explain_relation')) {
    return 'agent_brief graphDbQueryPack path_evidence missing explain_relation';
  }
  return null;
}

function agentRelationDecisionGuideFailure(guide) {
  const required = ['skip_existing', 'review_inverse', 'safe_to_add', 'review_new_schema'];
  if (!Array.isArray(guide)) {
    return 'agent_brief response missing relationDecisionGuide';
  }
  const seen = new Set();
  for (const [index, row] of guide.entries()) {
    if (!hasNonEmptyString(row?.decision, row?.severity, row?.meaning)) {
      return `agent_brief relationDecisionGuide malformed row at index ${index}`;
    }
    if (!required.includes(row.decision)) {
      return `agent_brief relationDecisionGuide unsupported decision at index ${index}: ${row.decision}`;
    }
    if (!['info', 'warn'].includes(row.severity)) {
      return `agent_brief relationDecisionGuide unsupported severity at index ${index}: ${row.severity}`;
    }
    seen.add(row.decision);
  }
  const missing = required.filter((decision) => !seen.has(decision));
  if (missing.length > 0) {
    return `agent_brief relationDecisionGuide missing decisions: ${missing.join(', ')}`;
  }
  return null;
}

function agentToolCallsIncludeOperation(calls, operation) {
  return Array.isArray(calls) && calls.some((call) => call?.tool === 'query_ontology' && call?.arguments?.operation === operation);
}

function agentToolCallsIncludeQueryPlanTarget(calls, targetOperation) {
  return Array.isArray(calls) && calls.some((call) =>
    call?.tool === 'query_ontology' &&
    call?.arguments?.operation === 'query_plan' &&
    call?.arguments?.targetOperation === targetOperation
  );
}

function agentToolCallsFailure(label, calls) {
  if (!Array.isArray(calls) || calls.length === 0) {
    return `${label} missing tool calls`;
  }
  for (const [index, call] of calls.entries()) {
    if (call?.tool !== 'query_ontology') {
      return `${label} tool mismatch at index ${index}`;
    }
    const operation = call?.arguments?.operation;
    if (typeof operation !== 'string' || operation.trim() === '') {
      return `${label} missing query_ontology operation at index ${index}`;
    }
    if (!QUERY_ONTOLOGY_OPERATIONS.includes(operation)) {
      return `${label} unsupported query_ontology operation at index ${index}: ${operation}`;
    }
  }
  return null;
}

function agentGuardrailCallsFailure(label, calls) {
  if (!Array.isArray(calls) || calls.length === 0) {
    return `${label} missing tool calls`;
  }
  for (const [index, call] of calls.entries()) {
    if (call?.tool === 'query_ontology') {
      const operation = call?.arguments?.operation;
      if (typeof operation !== 'string' || operation.trim() === '') {
        return `${label} missing query_ontology operation at index ${index}`;
      }
      if (!QUERY_ONTOLOGY_OPERATIONS.includes(operation)) {
        return `${label} unsupported query_ontology operation at index ${index}: ${operation}`;
      }
      continue;
    }
    if (call?.tool === 'find_backlinks') {
      if (typeof call?.arguments?.slug !== 'string' || call.arguments.slug.trim() === '') {
        return `${label} missing find_backlinks slug at index ${index}`;
      }
      continue;
    }
    if (call?.tool === 'validate_vault') {
      if (!call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments) || Object.keys(call.arguments).length > 0) {
        return `${label} validate_vault must have empty arguments at index ${index}`;
      }
      continue;
    }
    return `${label} unsupported tool at index ${index}: ${call?.tool}`;
  }
  return null;
}

async function step1ParserSmoke() {
  log('info', 'step 1 — parser smoke test');
  return new Promise((res) => {
    const proc = spawn(process.execPath, [PARSER_TEST], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    proc.stdout.on('data', (b) => (stdout += stdoutDecoder.write(b)));
    proc.stderr.on('data', (b) => (stderr += stderrDecoder.write(b)));
    proc.on('close', (code, signal) => {
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      if (code === 0 && /passed/.test(stdout)) {
        log('ok', stdout.trim().split('\n').slice(-1)[0]);
        res(true);
      } else {
        log('fail', parserSmokeFailure(code, signal));
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
  const killGraceMs = parseVerifyKillGraceMs();
  if (killGraceMs === false) {
    log('fail', verifyKillGraceValueErrorMessage());
    return false;
  }
  log('info', `step 2 — server boot + tools/list + list_concepts/project probe/get_concept/get_concepts/find_evidence/find_backlinks/query_concepts/limited query_concepts/analyze_repo_structure/infer_imports/find_neighbors/find_path/find_orphans/list_kinds/destructive dry-runs (vault=${VAULT}, timeout=${timeoutMs}ms)`);

  const lines = buildFirstContactRequests().map((request) => JSON.stringify(request));

  return new Promise((res) => {
    const proc = spawn(process.execPath, [SERVER_ENTRY], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');
    let timedOut = false;
    let completed = false;
    let sentGetConceptSmoke = false;
    let sentGetConceptsSmoke = false;
    let sentFindBacklinksSmoke = false;
    let sentDirectGraphReadSmoke = false;
    let sentLimitedQueryConceptsSmoke = false;
    let sentGraphQuerySmoke = false;
    let sentDestructiveDryRunSmoke = false;
    let sentMaintenanceResumeSmoke = false;
    let destructiveDryRunExpectedResponses = [];
    const expectedFirstContactIds = initialExpectedFirstContactIds();
    let limitedQueryConceptsSmoke = null;
    let timer = null;
    let killTimer = null;
    const stopServer = () => {
      proc.kill('SIGTERM');
      if (!killTimer) {
        killTimer = setTimeout(() => proc.kill('SIGKILL'), killGraceMs);
        killTimer.unref?.();
      }
    };
    proc.stdout.on('data', (b) => {
      stdout += stdoutDecoder.write(b);
      if (!sentGetConceptsSmoke || !sentFindBacklinksSmoke || !sentDirectGraphReadSmoke || !sentLimitedQueryConceptsSmoke || !sentGraphQuerySmoke || !sentDestructiveDryRunSmoke) {
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
          if (!sentGetConceptSmoke) {
            sentGetConceptSmoke = true;
            const slug = buildGetConceptSmokeSlug(listPayload);
            if (slug) {
              expectedFirstContactIds.add(31);
              proc.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 31,
                method: 'tools/call',
                params: {
                  name: 'get_concept',
                  arguments: { slug },
                },
              }) + '\n');
            }
          }
          if (!sentFindBacklinksSmoke) {
            sentFindBacklinksSmoke = true;
            const slug = buildGetConceptSmokeSlug(listPayload);
            if (slug) {
              expectedFirstContactIds.add(33);
              proc.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                id: 33,
                method: 'tools/call',
                params: {
                  name: 'find_backlinks',
                  arguments: { slug },
                },
              }) + '\n');
            }
          }
          if (!sentLimitedQueryConceptsSmoke) {
            sentLimitedQueryConceptsSmoke = true;
            limitedQueryConceptsSmoke = buildLimitedQueryConceptsSmokeRequest(listPayload);
            if (limitedQueryConceptsSmoke?.request) {
              expectedFirstContactIds.add(37);
              proc.stdin.write(JSON.stringify(limitedQueryConceptsSmoke.request) + '\n');
            }
          }
          if (!sentDestructiveDryRunSmoke) {
            sentDestructiveDryRunSmoke = true;
            const destructiveDryRunPlan = buildDestructiveDryRunSmokeRequests(listPayload);
            for (const id of destructiveDryRunPlan.expectedResponseIds) expectedFirstContactIds.add(id);
            destructiveDryRunExpectedResponses = destructiveDryRunPlan.requests.map((request) => [
              request.params.name,
              request.id,
            ]);
            if (destructiveDryRunPlan.requests.length > 0) {
              proc.stdin.write(destructiveDryRunPlan.requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
            }
            const patchConflictGuardRequest = buildPatchConflictGuardSmokeRequest(listPayload);
            if (patchConflictGuardRequest) {
              expectedFirstContactIds.add(patchConflictGuardRequest.id);
              proc.stdin.write(JSON.stringify(patchConflictGuardRequest) + '\n');
            }
          }
          if (!sentGraphQuerySmoke && projectResponse) {
            sentGraphQuerySmoke = true;
            const graphSmoke = buildGraphQuerySmokeArgs(listPayload, projectPayload);
            if (!sentDirectGraphReadSmoke) {
              sentDirectGraphReadSmoke = true;
              const directGraphReadPlan = buildDirectGraphReadSmokeRequests(graphSmoke);
              for (const id of directGraphReadPlan.expectedResponseIds) expectedFirstContactIds.add(id);
              if (directGraphReadPlan.requests.length > 0) {
                proc.stdin.write(directGraphReadPlan.requests.map((request) => JSON.stringify(request)).join('\n') + '\n');
              }
            }
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
      if (!sentMaintenanceResumeSmoke) {
        const maintenanceReadyResponse = parseJsonRpcResponses(stdout).find((response) => response?.id === 26 && response?.result);
        if (maintenanceReadyResponse) {
          sentMaintenanceResumeSmoke = true;
          let maintenanceReadyPayload = null;
          try {
            maintenanceReadyPayload = JSON.parse(maintenanceReadyResponse.result.content?.[0]?.text || '{}');
          } catch {
            maintenanceReadyPayload = null;
          }
          const afterActionId = maintenanceReadyPayload?.actions?.[0]?.id;
          if (typeof afterActionId === 'string' && afterActionId.length > 0) {
            expectedFirstContactIds.add(30);
            proc.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 30,
              method: 'tools/call',
              params: {
                name: 'query_ontology',
                arguments: { operation: 'maintenance_plan', afterActionId, limit: 5 },
              },
            }) + '\n');
          }
        }
      }
      if (!completed && (hasAllFirstContactResponses(stdout, expectedFirstContactIds) || hasFirstContactErrorResponse(stdout, expectedFirstContactIds))) {
        completed = true;
        if (timer) clearTimeout(timer);
        stopServer();
      }
    });
    proc.stderr.on('data', (b) => (stderr += stderrDecoder.write(b)));

    proc.stdin.write(lines.join('\n') + '\n');
    timer = setTimeout(() => {
      timedOut = true;
      stopServer();
    }, timeoutMs);

    proc.on('close', (_code, signal) => {
      if (timer) clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      const responses = parseJsonRpcResponses(stdout);

      const initRes = responses.find((r) => r.id === 1);
      const listRes = responses.find((r) => r.id === 2);
      const callRes = responses.find((r) => r.id === 3);
      const kindsRes = responses.find((r) => r.id === 4);
      const validateRes = responses.find((r) => r.id === 5);
      const briefRes = responses.find((r) => r.id === 6);
      const agentBriefRes = responses.find((r) => r.id === 66);
      const healthRes = responses.find((r) => r.id === 7);
      const tunedHealthRes = responses.find((r) => r.id === 20);
      const tunedBriefRes = responses.find((r) => r.id === 21);
      const compileRes = responses.find((r) => r.id === 8);
      const compilePageRes = responses.find((r) => r.id === 41);
      const compileIndexesRes = responses.find((r) => r.id === 42);
      const overviewRes = responses.find((r) => r.id === 9);
      const overviewPlanRes = responses.find((r) => r.id === 10);
      const getConceptsRes = responses.find((r) => r.id === 11);
      const getConceptRes = responses.find((r) => r.id === 31);
      const findEvidenceRes = responses.find((r) => r.id === 32);
      const findBacklinksRes = responses.find((r) => r.id === 33);
      const queryConceptsRes = responses.find((r) => r.id === 34);
      const limitedQueryConceptsRes = responses.find((r) => r.id === 37);
      const analyzeRepoStructureRes = responses.find((r) => r.id === 38);
      const inferImportsRes = responses.find((r) => r.id === 39);
      const findNeighborsRes = responses.find((r) => r.id === 35);
      const findPathRes = responses.find((r) => r.id === 36);
      const projectMapPlanRes = responses.find((r) => r.id === 12);
      const neighborsRes = responses.find((r) => r.id === 13);
      const pathRes = responses.find((r) => r.id === 14);
      const allPathsRes = responses.find((r) => r.id === 67);
      const projectScopeRes = responses.find((r) => r.id === 15);
      const strictArgsRes = responses.find((r) => r.id === 16);
      const strictMultiArgsRes = responses.find((r) => r.id === 27);
      const strictUnknownToolRes = responses.find((r) => r.id === 65);
      const strictEnumRes = responses.find((r) => r.id === 17);
      const projectProbeRes = responses.find((r) => r.id === 18);
      const orphansRes = responses.find((r) => r.id === 19);
      const strictMaintenancePhaseFilterRes = responses.find((r) => r.id === 22);
      const strictMaintenanceSeverityFilterRes = responses.find((r) => r.id === 23);
      const strictMaintenanceKindFilterRes = responses.find((r) => r.id === 24);
      const strictRelationFilterRes = responses.find((r) => r.id === 40);
      const strictRelationCheckRes = responses.find((r) => r.id === 46);
      const strictAddRelationRes = responses.find((r) => r.id === 50);
      const strictGraphKindFilterRes = responses.find((r) => r.id === 47);
      const strictRecommendRelationsKindFilterRes = responses.find((r) => r.id === 51);
      const strictRecommendRelationsUnsupportedKindFilterRes = responses.find((r) => r.id === 52);
      const strictMatchNodesSortFilterRes = responses.find((r) => r.id === 53);
      const strictMatchEdgesTypeFilterRes = responses.find((r) => r.id === 54);
      const strictFindNeighborsTypeFilterRes = responses.find((r) => r.id === 55);
      const strictFindOrphansKindFilterRes = responses.find((r) => r.id === 56);
      const strictFindOrphansExcludeKindFilterRes = responses.find((r) => r.id === 57);
      const strictQueryConceptsKindFilterRes = responses.find((r) => r.id === 58);
      const strictQueryConceptsHasKeyFilterRes = responses.find((r) => r.id === 59);
      const strictListConceptsKindFilterRes = responses.find((r) => r.id === 60);
      const patchConflictGuardRes = responses.find((r) => r.id === 61);
      const strictGraphFromKindFilterRes = responses.find((r) => r.id === 48);
      const strictGraphToKindFilterRes = responses.find((r) => r.id === 49);
      const maintenanceMissingCursorRes = responses.find((r) => r.id === 25);
      const maintenanceReadyCursorRes = responses.find((r) => r.id === 26);
      const maintenanceResumeCursorRes = responses.find((r) => r.id === 30);
      const addConceptsRowIsolationRes = responses.find((r) => r.id === 28);
      const addRelationsRowIsolationRes = responses.find((r) => r.id === 29);
      let kindsPayload = null;
      let listPayload = null;
      let validationPayload = null;
      let compilePayload = null;
      let overviewPayload = null;
      let graphSmokeArgs = null;
      let getConceptVerified = false;
      let findBacklinksVerified = false;
      let directGraphReadsVerified = false;
      let allPathsVerified = false;
      let maintenanceResumeVerified = false;
      let destructiveDryRunCount = 0;
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

      if (signal && !completed && missingLabels.length > 0) {
        log('fail', serverSignalFailure(signal, stderr, verifyRetryEnvForVault(VAULT)));
        return res(false);
      }

      if (!initRes || !initRes.result) {
        log('fail', serverStartupFailure(stderr, verifyRetryEnvForVault(VAULT)));
        return res(false);
      }
      log('ok', `initialize OK — server ${initRes.result.serverInfo?.name}@${initRes.result.serverInfo?.version}`);

      const instructionFailure = initializeInstructionsFailure(initRes);
      if (instructionFailure) {
        log('fail', instructionFailure);
        return res(false);
      }
      log('ok', 'initialize instructions — tool inventory plus first-contact safety and recovery guidance present');

      if (!listRes || !listRes.result?.tools) {
        log('fail', 'no tools/list response');
        return res(false);
      }
      const inventoryFailure = toolsListInventoryFailure(listRes.result.tools);
      if (inventoryFailure) {
        log('fail', inventoryFailure);
        return res(false);
      }
      const toolNames = listRes.result.tools.map((t) => t.name).sort();
      log('ok', `tools/list ${toolNames.length}/${EXPECTED_TOOLS.length} (${toolsListAnnotationSummary(listRes.result.tools)}) — ${toolNames.join(' · ')}`);
      log('ok', 'tools/list inventory names — missing/extra/duplicate/invalid checks passed');
      const schemaFailure = toolsListSchemaFailure(listRes.result.tools);
      if (schemaFailure) {
        log('fail', schemaFailure);
        return res(false);
      }
      log('ok', `tools/list schema contract — ${TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY}`);
      const strictFailure = strictArgsFailure(strictArgsRes);
      if (strictFailure) {
        log('fail', strictFailure);
        return res(false);
      }
      log('ok', 'strict arguments — unknown tool argument rejected at runtime');
      const strictMultiFailure = strictMultiArgsFailure(strictMultiArgsRes);
      if (strictMultiFailure) {
        log('fail', strictMultiFailure);
        return res(false);
      }
      log('ok', 'strict arguments — multiple unknown tool arguments reported together');
      const strictUnknownToolFailureMessage = strictUnknownToolFailure(strictUnknownToolRes);
      if (strictUnknownToolFailureMessage) {
        log('fail', strictUnknownToolFailureMessage);
        return res(false);
      }
      log('ok', 'strict tool names — unknown tool rejected with closest-name hint');
      const addConceptsRowIsolationFailure = batchRowIsolationFailure(addConceptsRowIsolationRes, 'concepts', 'add_concepts');
      if (addConceptsRowIsolationFailure) {
        log('fail', addConceptsRowIsolationFailure);
        return res(false);
      }
      log('ok', 'add_concepts — non-object, single/multi unknown-field repair, Received fields, duplicate-slug rows isolated with input indexes, and invalid-only batches return no write metadata');
      const addRelationsRowIsolationFailure = batchRowIsolationFailure(addRelationsRowIsolationRes, 'relations', 'add_relations');
      if (addRelationsRowIsolationFailure) {
        log('fail', addRelationsRowIsolationFailure);
        return res(false);
      }
      log('ok', 'add_relations — non-object, single/multi unknown-field repair, Received fields, invalid-type rows isolated with input indexes and closest-value hints, and invalid-only batches return no write metadata');
      const getConceptsBatchCapFailure = batchCapFailure(responses.find((r) => r.id === 64), 'get_concepts', 'slugs');
      if (getConceptsBatchCapFailure) {
        log('fail', getConceptsBatchCapFailure);
        return res(false);
      }
      const addConceptsBatchCapFailure = batchCapFailure(responses.find((r) => r.id === 62), 'add_concepts', 'concepts');
      if (addConceptsBatchCapFailure) {
        log('fail', addConceptsBatchCapFailure);
        return res(false);
      }
      const addRelationsBatchCapFailure = batchCapFailure(responses.find((r) => r.id === 63), 'add_relations', 'relations');
      if (addRelationsBatchCapFailure) {
        log('fail', addRelationsBatchCapFailure);
        return res(false);
      }
      log('ok', 'batch caps — get_concepts/add_concepts/add_relations reject 51 rows with invalid_arguments');
      const destructiveDryRunResponses = destructiveDryRunExpectedResponses.map(([toolName, id]) => [
        toolName,
        responses.find((response) => response.id === id),
      ]);
      if (destructiveDryRunResponses.length > 0) {
        const destructiveFailure = destructiveDryRunSmokeFailure(destructiveDryRunResponses);
        if (destructiveFailure) {
          log('fail', destructiveFailure);
          return res(false);
        }
        destructiveDryRunCount = destructiveDryRunResponses.length;
        log('ok', `destructive dry-runs — ${destructiveDryRunResponses.map(([toolName]) => toolName).join(' · ')} preview without write-maintenance`);
      }
      if (patchConflictGuardRes) {
        const patchConflictFailure = patchConflictGuardFailure(patchConflictGuardRes);
        if (patchConflictFailure) {
          log('fail', patchConflictFailure);
          return res(false);
        }
        log('ok', 'patch_concept conflict guard — stale expected_mtime rejected with vault_conflict');
      }
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
      const strictRelationFilter = strictRelationFilterFailure(strictRelationFilterRes);
      if (strictRelationFilter) {
        log('fail', strictRelationFilter);
        return res(false);
      }
      log('ok', 'strict relation filters — invalid dependencyTypes rejected with closest-value hint');
      const strictFindNeighborsTypeFilter = strictFindNeighborsTypeFailure(strictFindNeighborsTypeFilterRes);
      if (strictFindNeighborsTypeFilter) {
        log('fail', strictFindNeighborsTypeFilter);
        return res(false);
      }
      log('ok', 'strict find_neighbors filters — invalid relation types rejected before slug resolution with closest-value hint');
      const strictFindOrphansKindFilter = strictFindOrphansKindFailure(strictFindOrphansKindFilterRes);
      if (strictFindOrphansKindFilter) {
        log('fail', strictFindOrphansKindFilter);
        return res(false);
      }
      const strictFindOrphansExcludeKindFilter = strictFindOrphansKindFailure(strictFindOrphansExcludeKindFilterRes, { field: 'excludeKinds items' });
      if (strictFindOrphansExcludeKindFilter) {
        log('fail', strictFindOrphansExcludeKindFilter);
        return res(false);
      }
      log('ok', 'strict find_orphans filters — invalid kind/excludeKinds rejected with closest-value hints');
      const strictListConceptsKindFilter = strictListConceptsKindFailure(strictListConceptsKindFilterRes);
      if (strictListConceptsKindFilter) {
        log('fail', strictListConceptsKindFilter);
        return res(false);
      }
      log('ok', 'strict list_concepts filters — invalid kind rejected with closest-value hint');
      const strictQueryConceptsKindFilter = strictQueryConceptsFilterFailure(strictQueryConceptsKindFilterRes);
      if (strictQueryConceptsKindFilter) {
        log('fail', strictQueryConceptsKindFilter);
        return res(false);
      }
      const strictQueryConceptsHasKeyFilter = strictQueryConceptsFilterFailure(
        strictQueryConceptsHasKeyFilterRes,
        { field: 'has key', received: 'capabilties', suggestion: 'capabilities' },
      );
      if (strictQueryConceptsHasKeyFilter) {
        log('fail', strictQueryConceptsHasKeyFilter);
        return res(false);
      }
      log('ok', 'strict query_concepts filters — invalid kind/has-key rejected with closest-value hints');
      const strictRelationCheck = strictRelationCheckFailure(strictRelationCheckRes);
      if (strictRelationCheck) {
        log('fail', strictRelationCheck);
        return res(false);
      }
      log('ok', 'strict relation_check — invalid type rejected before endpoint resolution with closest-value hint and structured repair');
      const strictAddRelation = strictAddRelationFailure(strictAddRelationRes);
      if (strictAddRelation) {
        log('fail', strictAddRelation);
        return res(false);
      }
      log('ok', 'strict add_relation — invalid type rejected before endpoint resolution with structured repair and no write metadata');
      const strictGraphKindFilter = strictGraphKindFilterFailure(strictGraphKindFilterRes);
      if (strictGraphKindFilter) {
        log('fail', strictGraphKindFilter);
        return res(false);
      }
      const strictRecommendRelationsKindFilter = strictRecommendRelationsKindFilterFailure(strictRecommendRelationsKindFilterRes);
      if (strictRecommendRelationsKindFilter) {
        log('fail', strictRecommendRelationsKindFilter);
        return res(false);
      }
      const strictRecommendRelationsUnsupportedKindFilter = strictRecommendRelationsKindFilterFailure(
        strictRecommendRelationsUnsupportedKindFilterRes,
        { received: 'domain', requireSuggestion: false },
      );
      if (strictRecommendRelationsUnsupportedKindFilter) {
        log('fail', strictRecommendRelationsUnsupportedKindFilter);
        return res(false);
      }
      const strictMatchNodesSortFilter = strictMatchNodesSortFailure(strictMatchNodesSortFilterRes);
      if (strictMatchNodesSortFilter) {
        log('fail', strictMatchNodesSortFilter);
        return res(false);
      }
      const strictMatchEdgesTypeFilter = strictMatchEdgesTypeFailure(strictMatchEdgesTypeFilterRes);
      if (strictMatchEdgesTypeFilter) {
        log('fail', strictMatchEdgesTypeFilter);
        return res(false);
      }
      log('ok', 'strict graph filters — invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejected with narrowed diagnostics');
      const strictGraphFromKindFilter = strictGraphKindFilterFailure(strictGraphFromKindFilterRes, { field: 'fromKind' });
      if (strictGraphFromKindFilter) {
        log('fail', strictGraphFromKindFilter);
        return res(false);
      }
      const strictGraphToKindFilter = strictGraphKindFilterFailure(strictGraphToKindFilterRes, {
        field: 'toKind',
        received: 'externl',
        suggestion: 'external',
      });
      if (strictGraphToKindFilter) {
        log('fail', strictGraphToKindFilter);
        return res(false);
      }
      log('ok', 'strict graph edge kind filters — invalid match_edges.fromKind/toKind rejected with closest-value hints');

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
        const structuredFailure = structuredContentFailure(maintenanceMissingCursorRes, parsed, 'maintenance cursor');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
      let maintenanceReadyCursorPayload = null;
      try {
        const text = maintenanceReadyCursorRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = maintenanceReadyCursorFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(maintenanceReadyCursorRes, parsed, 'maintenance cursor');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        maintenanceReadyCursorPayload = parsed;
        log('ok', `maintenance cursor — ready page stable (${formatCount(parsed.summary.remainingActions, 'remaining action')}; ${maintenanceBucketOutputSummary(parsed)}; ${maintenanceNextActionOutputSummary(parsed)})`);
      } catch (err) {
        log('fail', `failed to parse maintenance ready-cursor response: ${err.message}`);
        return res(false);
      }

      const resumeAfterActionId = maintenanceReadyCursorPayload?.actions?.[0]?.id;
      let maintenanceResumeSkipped = false;
      if (typeof resumeAfterActionId === 'string' && resumeAfterActionId.length > 0) {
        if (!maintenanceResumeCursorRes || !maintenanceResumeCursorRes.result) {
          log('fail', 'no query_ontology maintenance resume-cursor response');
          return res(false);
        }
        try {
          const text = maintenanceResumeCursorRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = maintenanceResumeCursorFailure(maintenanceReadyCursorPayload, parsed, resumeAfterActionId);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(maintenanceResumeCursorRes, parsed, 'maintenance cursor');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          maintenanceResumeVerified = true;
          log('ok', `maintenance cursor — resume afterActionId advanced (${resumeAfterActionId}; ${formatCount(parsed.summary.remainingActions, 'remaining action')}; ${maintenanceBucketOutputSummary(parsed)}; ${maintenanceNextActionOutputSummary(parsed)})`);
        } catch (err) {
          log('fail', `failed to parse maintenance resume-cursor response: ${err.message}`);
          return res(false);
        }
      } else {
        maintenanceResumeSkipped = true;
        log('info', 'maintenance cursor — resume skipped (ready page has no actions)');
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
        const structuredFailure = structuredContentFailure(callRes, parsed, 'list_concepts');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        listPayload = parsed;
        let projectProbePayloadForSmoke = null;
        const projectProbeText = projectProbeRes?.result?.content?.[0]?.text;
        if (typeof projectProbeText === 'string') {
          try {
            projectProbePayloadForSmoke = JSON.parse(projectProbeText);
          } catch {
            projectProbePayloadForSmoke = null;
          }
        }
        graphSmokeArgs = buildGraphQuerySmokeArgs(parsed, projectProbePayloadForSmoke);
        log('ok', `list_concepts — vault total ${parsed.total} nodes (vaultRoot ${parsed.vaultRoot})`);
        const emptyVaultFailure = emptyVerifyVaultFailure(parsed);
        if (emptyVaultFailure) {
          log('fail', emptyVaultFailure);
          return res(false);
        }
      } catch (err) {
        log('fail', `failed to parse list_concepts response: ${err.message}`);
        return res(false);
      }

      if (!getConceptsRes || !getConceptsRes.result) {
        log('fail', 'no get_concepts response');
        return res(false);
      }
      if (getConceptRes) {
        const expectedSlug = buildGetConceptSmokeSlug(listPayload);
        if (!expectedSlug) {
          log('fail', 'unexpected get_concept response without a list_concepts slug');
          return res(false);
        }
        try {
          const text = getConceptRes.result?.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = getConceptFailure(parsed, expectedSlug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(getConceptRes, parsed, 'get_concept');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          getConceptVerified = true;
          log('ok', `get_concept — ${parsed.slug} (${parsed.outgoingEdges.length} outgoing edges)`);
        } catch (err) {
          log('fail', `failed to parse get_concept response: ${err.message}`);
          return res(false);
        }
      }
      try {
        const text = getConceptsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = getConceptsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(getConceptsRes, parsed, 'get_concepts');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        const okRows = parsed.concepts.filter((row) => row?.ok === true).length;
        const partialRows = parsed.concepts.filter((row) => row?.ok === false).length;
        log('ok', `get_concepts — ${formatCount(okRows, 'ok row')}, ${formatCount(partialRows, 'partial row')}`);
      } catch (err) {
        log('fail', `failed to parse get_concepts response: ${err.message}`);
        return res(false);
      }

      if (!findEvidenceRes || !findEvidenceRes.result) {
        log('fail', 'no find_evidence response');
        return res(false);
      }
      try {
        const text = findEvidenceRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = findEvidenceFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(findEvidenceRes, parsed, 'find_evidence');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `find_evidence — ${formatCount(parsed.matches.length, 'evidence result')} for "${parsed.query}"`);
      } catch (err) {
        log('fail', `failed to parse find_evidence response: ${err.message}`);
        return res(false);
      }

      if (findBacklinksRes) {
        const expectedSlug = buildGetConceptSmokeSlug(listPayload);
        if (!expectedSlug) {
          log('fail', 'unexpected find_backlinks response without a list_concepts slug');
          return res(false);
        }
        try {
          const text = findBacklinksRes.result?.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = findBacklinksFailure(parsed, expectedSlug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(findBacklinksRes, parsed, 'find_backlinks');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          findBacklinksVerified = true;
          log('ok', `find_backlinks — ${parsed.target} (${formatCount(parsed.total, 'backlink')})`);
        } catch (err) {
          log('fail', `failed to parse find_backlinks response: ${err.message}`);
          return res(false);
        }
      }

      if (!queryConceptsRes || !queryConceptsRes.result) {
        log('fail', 'no query_concepts response');
        return res(false);
      }
      try {
        const text = queryConceptsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = queryConceptsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(queryConceptsRes, parsed, 'query_concepts');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `query_concepts — ${formatCount(parsed.matches.length, 'query result')} / ${formatCount(parsed.total, 'total query result')}`);
      } catch (err) {
        log('fail', `failed to parse query_concepts response: ${err.message}`);
        return res(false);
      }

      let limitedQueryConceptsVerified = false;
      if (limitedQueryConceptsSmoke) {
        if (!limitedQueryConceptsRes || !limitedQueryConceptsRes.result) {
          log('fail', 'no query_concepts_limited response');
          return res(false);
        }
        try {
          const text = limitedQueryConceptsRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = limitedQueryConceptsFailure(
            parsed,
            limitedQueryConceptsSmoke.excludedSlug,
            limitedQueryConceptsSmoke.expectedTotal,
          );
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(limitedQueryConceptsRes, parsed, 'query_concepts_limited');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          limitedQueryConceptsVerified = true;
          log('ok', `query_concepts limited — ${formatCount(parsed.matches.length, 'query result')} / ${formatCount(parsed.total, 'total query result')} (limited ${parsed.limited})`);
        } catch (err) {
          log('fail', `failed to parse query_concepts_limited response: ${err.message}`);
          return res(false);
        }
      }

      if (!analyzeRepoStructureRes || !analyzeRepoStructureRes.result) {
        log('fail', 'no analyze_repo_structure response');
        return res(false);
      }
      try {
        const text = analyzeRepoStructureRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = analyzeRepoStructureFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(analyzeRepoStructureRes, parsed, 'analyze_repo_structure');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `analyze_repo_structure — ${parsed.framework} (${formatCount(parsed.domains.length, 'domain candidate')}, ${formatCount(parsed.capabilities.length, 'capability candidate')}, ${formatCount(parsed.elements.length, 'element candidate')})`);
      } catch (err) {
        log('fail', `failed to parse analyze_repo_structure response: ${err.message}`);
        return res(false);
      }

      if (!inferImportsRes || !inferImportsRes.result) {
        log('fail', 'no infer_imports response');
        return res(false);
      }
      try {
        const text = inferImportsRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = inferImportsFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(inferImportsRes, parsed, 'infer_imports');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `infer_imports — ${formatCount(parsed.filesScanned, 'file')} scanned, ${formatCount(parsed.moduleEdges.length, 'module edge')} (${importModuleEdgeKindOutputSummary(parsed.moduleEdges)})`);
      } catch (err) {
        log('fail', `failed to parse infer_imports response: ${err.message}`);
        return res(false);
      }

      if (graphSmokeArgs?.hasNode) {
        if (!findNeighborsRes || !findNeighborsRes.result) {
          log('fail', 'no find_neighbors response');
          return res(false);
        }
        try {
          const text = findNeighborsRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = findNeighborsFailure(parsed, graphSmokeArgs.slug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(findNeighborsRes, parsed, 'find_neighbors');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          log('ok', `find_neighbors — ${parsed.center} (${parsed.edges.length}/${parsed.totalEdges} edges, limited ${parsed.limited})`);
        } catch (err) {
          log('fail', `failed to parse find_neighbors response: ${err.message}`);
          return res(false);
        }

        if (!findPathRes || !findPathRes.result) {
          log('fail', 'no find_path response');
          return res(false);
        }
        try {
          const text = findPathRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const failure = findPathFailure(parsed, graphSmokeArgs.slug, graphSmokeArgs.pathTarget || graphSmokeArgs.slug);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(findPathRes, parsed, 'find_path');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          directGraphReadsVerified = true;
          log('ok', `find_path — ${parsed.from} → ${parsed.to} (${formatHopCount(parsed.hopCount)}, ${formatCount(parsed.edges.length, 'edge')})`);
        } catch (err) {
          log('fail', `failed to parse find_path response: ${err.message}`);
          return res(false);
        }
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
        const structuredFailure = structuredContentFailure(orphansRes, parsed, 'find_orphans');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(kindsRes, parsed, 'list_kinds');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(validateRes, parsed, 'validate_vault');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(projectProbeRes, parsed, 'project probe');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(briefRes, parsed, 'workspace_brief');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log(
          'ok',
          `workspace_brief — ${parsed.status} (${workspaceBriefSummary(parsed)})`,
        );
        const advisory = advisoryNextActionsSummary(parsed.nextActions);
        if (advisory) log('info', `workspace_brief non-blocking advisory nextActions — ${advisory}`);
      } catch (err) {
        log('fail', `failed to parse workspace_brief response: ${err.message}`);
        return res(false);
      }

      if (!agentBriefRes || !agentBriefRes.result) {
        log('fail', 'no query_ontology agent_brief response');
        return res(false);
      }
      try {
        const text = agentBriefRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = agentBriefFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(agentBriefRes, parsed, 'agent_brief');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `agent_brief — ${parsed.status} (${agentBriefSummary(parsed)})`);
      } catch (err) {
        log('fail', `failed to parse agent_brief response: ${err.message}`);
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
        const structuredFailure = structuredContentFailure(tunedBriefRes, parsed, 'workspace_brief_tuned');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log(
          'ok',
          `workspace_brief_tuned — ${parsed.status} (${workspaceBriefSummary(parsed)}; ${tunedWorkspaceBriefScopeOutputSummary()})`,
        );
        const advisory = advisoryNextActionsSummary(parsed.nextActions);
        if (advisory) log('info', `workspace_brief_tuned non-blocking advisory nextActions — ${advisory}`);
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
        const structuredFailure = structuredContentFailure(healthRes, parsed, 'health');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        const checksSummary = healthChecksSummary(parsed.checks);
        log(
          'ok',
          `health — ${parsed.status} (${healthSummary(parsed)}${
            checksSummary ? `: ${checksSummary}` : ''
          })`,
        );
        const advisory = advisoryHealthChecksSummary(parsed.checks);
        if (advisory) log('info', `health non-blocking advisory checks — ${advisory}`);
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
        const structuredFailure = structuredContentFailure(tunedHealthRes, parsed, 'health_tuned');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        const checksSummary = healthChecksSummary(parsed.checks);
        log(
          'ok',
          `health_tuned — ${parsed.status} (${healthSummary(parsed)}${
            checksSummary ? `: ${checksSummary}` : ''
          }; ${tunedHealthScopeOutputSummary()})`,
        );
        const advisory = advisoryHealthChecksSummary(parsed.checks);
        if (advisory) log('info', `health_tuned non-blocking advisory checks — ${advisory}`);
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
        const structuredFailure = structuredContentFailure(compileRes, parsed, 'compile_ontology');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        compilePayload = parsed;
        log('ok', `compile_ontology — graph ${parsed.graphHash.slice(0, 12)} (${parsed.nodeCount} nodes, ${parsed.edgeCount} edges, issues ${parsed.issueCount})`);
      } catch (err) {
        log('fail', `failed to parse compile_ontology response: ${err.message}`);
        return res(false);
      }

      if (!compilePageRes || !compilePageRes.result) {
        log('fail', 'no compile_ontology paginated full-artifact response');
        return res(false);
      }
      try {
        const text = compilePageRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = compileFullArtifactFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(compilePageRes, parsed, 'compile_ontology_page');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log('ok', `compile_ontology page — ${parsed.nodes.length}/${parsed.nodeCount} nodes, ${parsed.edges.length}/${parsed.edgeCount} edges`);
      } catch (err) {
        log('fail', `failed to parse compile_ontology paginated response: ${err.message}`);
        return res(false);
      }

      if (!compileIndexesRes || !compileIndexesRes.result) {
        log('fail', 'no compile_ontology indexes response');
        return res(false);
      }
      try {
        const text = compileIndexesRes.result.content?.[0]?.text || '';
        const parsed = JSON.parse(text);
        const failure = compileIndexesFailure(parsed);
        if (failure) {
          log('fail', failure);
          return res(false);
        }
        const structuredFailure = structuredContentFailure(compileIndexesRes, parsed, 'compile_ontology_indexes');
        if (structuredFailure) {
          log('fail', structuredFailure);
          return res(false);
        }
        log(
          'ok',
          `compile_ontology indexes — ${compileIndexesSummary(parsed)}`,
        );
      } catch (err) {
        log('fail', `failed to parse compile_ontology indexes response: ${err.message}`);
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
        const structuredFailure = structuredContentFailure(overviewRes, parsed, 'overview');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(overviewPlanRes, parsed, 'overview query_plan');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
        const structuredFailure = structuredContentFailure(projectMapPlanRes, parsed, 'project_map query_plan');
        if (structuredFailure) {
          log('fail', structuredFailure);
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
          const structuredFailure = structuredContentFailure(neighborsRes, parsed, 'neighbors');
          if (structuredFailure) {
            log('fail', structuredFailure);
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
          const structuredFailure = structuredContentFailure(pathRes, parsed, 'path');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          log('ok', `path — ${parsed.from} → ${parsed.to} (${formatHopCount(parsed.hopCount)}, ${formatCount(parsed.edges.length, 'edge')})`);
        } catch (err) {
          log('fail', `failed to parse path response: ${err.message}`);
          return res(false);
        }

        if (!allPathsRes || !allPathsRes.result) {
          log('fail', 'no query_ontology all_paths response');
          return res(false);
        }
        try {
          const text = allPathsRes.result.content?.[0]?.text || '';
          const parsed = JSON.parse(text);
          const expectedSlug = graphSmokeArgs.slug;
          const expectedTarget = graphSmokeArgs.pathTarget || expectedSlug;
          const failure = allPathsQueryFailure(parsed, expectedSlug, expectedTarget);
          if (failure) {
            log('fail', failure);
            return res(false);
          }
          const structuredFailure = structuredContentFailure(allPathsRes, parsed, 'all_paths');
          if (structuredFailure) {
            log('fail', structuredFailure);
            return res(false);
          }
          allPathsVerified = true;
          log(
            'ok',
            `all_paths — ${parsed.from} → ${parsed.to} (${parsed.paths.length}/${parsed.totalPaths} paths, budget ${parsed.searchBudget}, expanded ${parsed.expandedStates}, exhaustive ${parsed.exhaustive}, evidence ${parsed.evidence.status})`,
          );
        } catch (err) {
          log('fail', `failed to parse all_paths response: ${err.message}`);
          return res(false);
        }
      } else {
        log('info', 'neighbors/path/all_paths — skipped (vault has no nodes)');
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
          const structuredFailure = structuredContentFailure(projectScopeRes, parsed, 'project_scope');
          if (structuredFailure) {
            log('fail', structuredFailure);
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
      const countSummary = verifyCountConsistencySummary({
        kinds: kindsPayload,
        list: listPayload,
        compiled: compilePayload,
        overview: overviewPayload,
      });
      if (countSummary) {
        log('ok', `read census consistency — ${countSummary}`);
      }
      log(
        'ok',
        `structuredContent — ${structuredContentVerifySummary({
          hasNode: Boolean(graphSmokeArgs?.hasNode),
          hasProject: Boolean(graphSmokeArgs?.hasProject),
          hasGetConcept: getConceptVerified,
          hasFindBacklinks: findBacklinksVerified,
          hasDirectGraphReads: directGraphReadsVerified,
          hasLimitedQueryConcepts: limitedQueryConceptsVerified,
          hasCompileIndexes: true,
          hasAllPaths: allPathsVerified,
          hasMaintenanceResume: maintenanceResumeVerified,
          hasMaintenanceResumeSkipped: maintenanceResumeSkipped,
          destructiveDryRunCount,
        })}`,
      );
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
    return 0;
  }
  if (VERIFY_ARGS.error) {
    process.stderr.write(`\n[oh-my-ontology-mcp verify]\n\n\x1b[31m✗\x1b[0m ${VERIFY_ARGS.error}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  if (verifyTimeoutMs() === false) {
    process.stderr.write(`\n[oh-my-ontology-mcp verify]\n\n\x1b[31m✗\x1b[0m ${verifyTimeoutValueErrorMessage(VERIFY_TIMEOUT_MS_RAW, verifyRetryEnvForVault(VAULT))}\n`);
    return 1;
  }
  if (parseVerifyKillGraceMs() === false) {
    process.stderr.write(`\n[oh-my-ontology-mcp verify]\n\n\x1b[31m✗\x1b[0m ${verifyKillGraceValueErrorMessage()}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  const vaultPathError = verifyVaultPathError(VAULT);
  if (vaultPathError) {
    process.stderr.write(`\n[oh-my-ontology-mcp verify]\n\n\x1b[31m✗\x1b[0m ${vaultPathError}\n`);
    process.stderr.write(verifyUsage());
    return 1;
  }
  console.log('\n[oh-my-ontology-mcp verify]\n');
  const ok1 = await step1ParserSmoke();
  if (!ok1) return 1;
  const ok2 = await step2BootAndCall();
  if (!ok2) return 1;
  console.log(`\n\x1b[32m${verifySuccessMessage()}\x1b[0m\n`);
  return 0;
}

if (IS_MAIN) {
  process.exitCode = await main();
}
