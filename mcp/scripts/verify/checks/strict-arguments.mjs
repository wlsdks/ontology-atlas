import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../../../src/ontology-engine.mjs';
import { GRAPH_ARRAY_KEYS } from '../../../src/vault/graph/relation-refs.mjs';

import { EXPECTED_TOOLS } from '../tools-list/inventory.mjs';
import { sameArray } from '../value-checks.mjs';

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
  if (!sameArray(structured?.allowedArguments, ['domain', 'filter', 'kind', 'limit', 'mentions', 'offset', 'since', 'summary'])) {
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
  if (!sameArray(structured?.allowedArguments, ['domain', 'filter', 'kind', 'limit', 'mentions', 'offset', 'since', 'summary'])) {
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
    return `${label} structured error code mismatch: expected ${errorCode}, got ${structured.errorCode}`;
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

export function strictListConceptsFilterFailure(
  response,
  { field = 'kind', received = 'capabilty', suggestion = 'capability' } = {},
) {
  if (response?.result?.isError !== true) {
    return 'strict list_concepts filter response was not rejected';
  }
  const text = response.result.content?.[0]?.text || '';
  if (!new RegExp(`${escapeRegExp(field)} must be one of`, 'i').test(text)) {
    return `strict list_concepts filter response did not report the invalid ${field}`;
  }
  if (!new RegExp(`Received: "${escapeRegExp(received)}"`, 'i').test(text)) {
    return `strict list_concepts filter response did not report the invalid ${field} value`;
  }
  if (!new RegExp(`Did you mean "${escapeRegExp(suggestion)}"\\?`, 'i').test(text)) {
    return `strict list_concepts filter response did not suggest the closest ${field} value`;
  }
  return structuredValueRepairFailure(response, 'strict list_concepts filter', {
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

export function retiredToolFailure(response, { retiredTool, replacementIncludes }) {
  if (response?.result?.isError !== true) {
    return `retired ${retiredTool} response was not rejected`;
  }
  const structuredFailure = structuredErrorFailure(response, `retired ${retiredTool}`, { errorCode: 'tool_retired' });
  if (structuredFailure) return structuredFailure;
  const structured = response.result.structuredContent;
  if (structured.retiredTool !== retiredTool || typeof structured.replacement !== 'string' || !structured.replacement.includes(replacementIncludes)) {
    return `retired ${retiredTool} structured error missing the replacement`;
  }
  if (!structured.error.includes(structured.replacement)) {
    return `retired ${retiredTool} message does not name its replacement`;
  }
  return null;
}
