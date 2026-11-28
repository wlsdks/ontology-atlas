import {
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../ontology-engine.mjs';
import { retiredQueryOperationError } from '../server/retired-arguments.mjs';
import {
  requireNonBlankString,
  requireOptionalBoolean,
  requireOptionalDirection,
  requireOptionalEnum,
  requireOptionalNonBlankString,
  requireOptionalNonNegativeInteger,
  requireOptionalPositiveInteger,
  requireOptionalStringArray,
} from '../server/validate.mjs';

export function validateQueryOntologyArgs(args = {}) {
  requireNonBlankString(args.operation, 'operation');
  const retired = retiredQueryOperationError(args.operation);
  if (retired) throw retired;
  requireOptionalEnum(args.operation, 'operation', QUERY_ONTOLOGY_OPERATIONS);
  requireOptionalNonBlankString(args.targetOperation, 'targetOperation');
  requireOptionalEnum(args.targetOperation, 'targetOperation', QUERY_PLAN_TARGET_OPERATIONS);
  requireOptionalNonBlankString(args.recordId, 'recordId');
  if (args.operation === 'analysis_record') requireNonBlankString(args.recordId, 'recordId');
  if (args.recordId !== undefined && args.operation !== 'analysis_record') throw new Error('recordId is only valid for analysis_record.');

  for (const key of [
    'slug',
    'candidateSlug',
    'title',
    'from',
    'project',
    'to',
    'type',
    'kind',
    'domain',
    'afterActionId',
  ]) {
    requireOptionalNonBlankString(args[key], key);
  }
  for (const key of ['limit', 'itemLimit']) {
    requireOptionalPositiveInteger(args[key], key, { max: 500 });
  }
  requireOptionalPositiveInteger(args.searchBudget, 'searchBudget', { max: 50_000 });
  requireOptionalNonNegativeInteger(args.maxHops, 'maxHops', { max: 20 });
  requireOptionalNonNegativeInteger(args.depth, 'depth', { max: 20 });
  requireOptionalDirection(args.direction, 'direction', ['incoming', 'outgoing', 'both', 'undirected']);
  requireOptionalEnum(args.sort, 'sort', ['degree', 'inDegree', 'outDegree', 'slug']);
  if (args.operation === 'recommend_relations') {
    requireOptionalEnum(args.kind, 'kind', ['capability', 'element']);
  } else if (args.operation === 'match_nodes') {
    requireOptionalEnum(args.kind, 'kind', NODE_KIND_VALUES);
  }
  for (const key of [
    'includeExternal',
    'includeUnresolved',
    'includeOrphans',
    'executableOnly',
    'hasIncoming',
    'hasOutgoing',
  ]) {
    requireOptionalBoolean(args[key], key);
  }
  requireOptionalNonNegativeInteger(args.offset, 'offset');
  requireOptionalStringArray(args.excludeKinds, 'excludeKinds', { max: NODE_KIND_VALUES.length });
  for (const kind of args.excludeKinds ?? []) requireOptionalEnum(kind, 'excludeKinds items', NODE_KIND_VALUES);
  requireOptionalStringArray(args.types, 'types', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.pattern, 'pattern', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.phases, 'phases', { max: MAINTENANCE_PHASE_VALUES.length });
  requireOptionalStringArray(args.severities, 'severities', { max: MAINTENANCE_SEVERITY_VALUES.length });
  requireOptionalStringArray(args.kinds, 'kinds', { max: MAINTENANCE_KIND_VALUES.length });
}
