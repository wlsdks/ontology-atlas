import { AGENT_BRIEF_TASK_MAX_CHARS } from '../agent-brief/agent-brief-compact.mjs';
import {
  EDGE_TARGET_KIND_VALUES,
  MAINTENANCE_KIND_VALUES,
  MAINTENANCE_PHASE_VALUES,
  MAINTENANCE_SEVERITY_VALUES,
  NODE_KIND_VALUES,
  QUERY_ONTOLOGY_OPERATIONS,
  QUERY_PLAN_TARGET_OPERATIONS,
  RELATION_TYPE_VALUES,
} from '../ontology-engine.mjs';
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
  requireOptionalEnum(args.operation, 'operation', QUERY_ONTOLOGY_OPERATIONS);
  requireOptionalNonBlankString(args.targetOperation, 'targetOperation');
  requireOptionalEnum(args.targetOperation, 'targetOperation', QUERY_PLAN_TARGET_OPERATIONS);
  requireOptionalNonBlankString(args.recordId, 'recordId');
  requireOptionalNonBlankString(args.analysisCursor, 'analysisCursor');
  requireOptionalEnum(args.analysisMode, 'analysisMode', ['meaning', 'architecture']);
  if (args.operation === 'analysis_record') requireNonBlankString(args.recordId, 'recordId');
  if (args.recordId !== undefined && args.operation !== 'analysis_record') throw new Error('recordId is only valid for analysis_record.');
  if ((args.analysisMode !== undefined || args.analysisCursor !== undefined) && args.operation !== 'analysis_history') throw new Error('Analysis history filters require analysis_history.');
  if (args.operation === 'analysis_history' && args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 100)) throw new Error('Analysis history limit must be between 1 and 100 scanned files.');

  for (const key of [
    'slug',
    'seed',
    'candidateSlug',
    'title',
    'task',
    'from',
    'project',
    'to',
    'type',
    'kind',
    'domain',
    'slugContains',
    'fromKind',
    'toKind',
    'relation',
    'afterActionId',
    'expectedGraphHash',
    'expectedSourceFingerprint',
    'reviewRevision',
    'cursor',
  ]) {
    requireOptionalNonBlankString(args[key], key);
  }
  requireOptionalEnum(args.detail, 'detail', ['compact', 'full']);
  if (args.detail !== undefined && args.operation !== 'agent_brief') {
    throw new Error('detail is only valid for operation "agent_brief".');
  }
  if (args.task !== undefined && (args.operation !== 'agent_brief' || args.detail !== 'compact')) {
    throw new Error('task is only valid for operation "agent_brief" with detail "compact".');
  }
  if (args.operation === 'agent_brief' && args.detail === 'compact' && args.task === undefined) {
    throw new Error('agent_brief detail "compact" requires task.');
  }
  if (typeof args.task === 'string' && args.task.length > AGENT_BRIEF_TASK_MAX_CHARS) {
    throw new Error(`task must contain at most ${AGENT_BRIEF_TASK_MAX_CHARS} characters.`);
  }
  for (const key of [
    'limit',
    'itemLimit',
    'nodeLimit',
    'componentLimit',
    'cycleLimit',
    'recommendationLimit',
    'orderLimit',
  ]) {
    requireOptionalPositiveInteger(args[key], key, { max: 500 });
  }
  requireOptionalPositiveInteger(args.iterations, 'iterations', { max: 100 });
  requireOptionalNonNegativeInteger(args.maxHops, 'maxHops', { max: 20 });
  requireOptionalNonNegativeInteger(args.depth, 'depth', { max: 20 });
  for (const key of ['minDegree', 'maxDegree', 'minInDegree', 'minOutDegree']) {
    requireOptionalNonNegativeInteger(args[key], key);
  }
  requireOptionalDirection(args.direction, 'direction', ['incoming', 'outgoing', 'both', 'undirected']);
  requireOptionalEnum(args.sort, 'sort', ['degree', 'inDegree', 'outDegree', 'slug']);
  if (args.operation === 'recommend_relations') {
    requireOptionalEnum(args.kind, 'kind', ['capability', 'element']);
  } else if (args.operation === 'match_nodes') {
    requireOptionalEnum(args.kind, 'kind', NODE_KIND_VALUES);
  }
  if (args.operation === 'match_edges') {
    requireOptionalEnum(args.fromKind, 'fromKind', NODE_KIND_VALUES);
    requireOptionalEnum(args.toKind, 'toKind', EDGE_TARGET_KIND_VALUES);
  }
  for (const key of [
    'includeExternal',
    'includeUnresolved',
    'includeIsolated',
    'includeOrphans',
    'executableOnly',
    'hasIncoming',
    'hasOutgoing',
  ]) {
    requireOptionalBoolean(args[key], key);
  }
  requireOptionalStringArray(args.types, 'types', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.pattern, 'pattern', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.phases, 'phases', { max: MAINTENANCE_PHASE_VALUES.length });
  requireOptionalStringArray(args.severities, 'severities', { max: MAINTENANCE_SEVERITY_VALUES.length });
  requireOptionalStringArray(args.kinds, 'kinds', { max: MAINTENANCE_KIND_VALUES.length });
  requireOptionalStringArray(args.dependencyTypes, 'dependencyTypes', { max: RELATION_TYPE_VALUES.length });
  requireOptionalStringArray(args.componentTypes, 'componentTypes', { max: RELATION_TYPE_VALUES.length });
  if (args.operation === 'meaning_repair_review') {
    requireNonBlankString(args.project, 'project');
    requireNonBlankString(args.reviewRevision, 'reviewRevision');
    if (args.cursor === undefined) {
      requireNonBlankString(args.expectedGraphHash, 'expectedGraphHash');
      requireNonBlankString(args.expectedSourceFingerprint, 'expectedSourceFingerprint');
    }
    if (args.expectedGraphHash !== undefined && !/^project-graph-v1:[a-f0-9]{8}$/.test(args.expectedGraphHash)) {
      throw new Error('expectedGraphHash must be a project-graph-v1 hash.');
    }
    if (!/^sha256:[a-f0-9]{64}$/.test(args.reviewRevision)) {
      throw new Error('reviewRevision must be a sha256 digest.');
    }
    if (args.expectedSourceFingerprint !== undefined && args.expectedSourceFingerprint.length > 200) {
      throw new Error('expectedSourceFingerprint must contain at most 200 characters.');
    }
    if (args.cursor !== undefined && args.cursor.length > 4096) {
      throw new Error('cursor must contain at most 4096 characters.');
    }
    if (args.cursor !== undefined && !/^mrp1\.[a-f0-9]{32}$/.test(args.cursor)) {
      throw new Error('cursor must be an opaque meaning repair cursor returned by nextCall.');
    }
  }
}
