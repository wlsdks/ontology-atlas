import { assertQueryOperation } from './query-operation.mjs';
import {
  hasNonEmptyString,
  isPlainObject,
  nullableString,
  sumCountBucket,
  validCount,
  validCountBucket,
} from './value-checks.mjs';

const MAINTENANCE_ACTION_SEVERITIES = new Set(['fail', 'warn', 'info']);
/** The gap kinds `mcp/src/uncertainty-reads.mjs` classifies, in its own order. */
const NEXT_READ_KINDS = new Set([
  'unread-range',
  'unread-file',
  'unopened-area',
  'not-executed',
  'unverified-claim',
  'other',
]);

export function assertMaintenancePlanShape(result) {
  assertQueryOperation(result, 'maintenance_plan');
  if (!isPlainObject(result.summary)) {
    throw new Error('maintenance_plan summary must be an object');
  }
  for (const field of [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`maintenance_plan summary.${field} must be a non-negative integer`);
    }
  }
  if (result.summary.executableActions + result.summary.reviewActions !== result.summary.totalActions) {
    throw new Error('maintenance_plan summary executableActions + reviewActions must equal totalActions');
  }
  if (result.summary.filteredActions > result.summary.totalActions) {
    throw new Error('maintenance_plan summary.filteredActions must not exceed totalActions');
  }
  if (result.summary.remainingActions > result.summary.filteredActions) {
    throw new Error('maintenance_plan summary.remainingActions must not exceed filteredActions');
  }
  if (!isPlainObject(result.filters)) {
    throw new Error('maintenance_plan filters must be an object');
  }
  if (typeof result.filters.executableOnly !== 'boolean') {
    throw new Error('maintenance_plan filters.executableOnly must be a boolean');
  }
  for (const field of ['phases', 'severities', 'kinds']) {
    if (!Array.isArray(result.filters[field]) || !result.filters[field].every((value) => hasNonEmptyString(value))) {
      throw new Error(`maintenance_plan filters.${field} must be an array of non-empty strings`);
    }
  }
  if (!isPlainObject(result.cursor)) {
    throw new Error('maintenance_plan cursor must be an object');
  }
  if (typeof result.cursor.found !== 'boolean') {
    throw new Error('maintenance_plan cursor.found must be a boolean');
  }
  if (result.cursor.startIndex != null && !validCount(result.cursor.startIndex)) {
    throw new Error('maintenance_plan cursor.startIndex must be a non-negative integer');
  }
  if (typeof result.cursor.hasMore !== 'boolean') {
    throw new Error('maintenance_plan cursor.hasMore must be a boolean');
  }
  for (const field of ['afterActionId', 'nextAfterActionId', 'reason']) {
    if (!nullableString(result.cursor[field])) {
      throw new Error(`maintenance_plan cursor.${field} must be null or a string`);
    }
  }
  if (!Array.isArray(result.actions)) {
    throw new Error('maintenance_plan actions must be an array');
  }
  if (result.actions.length > result.summary.remainingActions) {
    throw new Error('maintenance_plan actions length must not exceed summary.remainingActions');
  }
  for (let index = 0; index < result.actions.length; index += 1) {
    const action = result.actions[index];
    const actionFailure = maintenanceActionFailure(action, index);
    if (actionFailure) throw new Error(actionFailure);
  }
  for (const field of ['byPhase', 'bySeverity', 'byKind']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`maintenance_plan ${field} must be an object of non-negative integer counts`);
    }
    if (sumCountBucket(result[field]) !== result.summary.remainingActions) {
      throw new Error(`maintenance_plan ${field} total must equal summary.remainingActions`);
    }
  }
  const expectedNextAfterActionId = result.actions.length > 0
    ? result.actions[result.actions.length - 1].id
    : null;
  if (result.cursor.nextAfterActionId !== expectedNextAfterActionId) {
    throw new Error('maintenance_plan cursor.nextAfterActionId must match the last returned action id');
  }
  if (result.cursor.hasMore !== (result.summary.remainingActions > result.actions.length)) {
    throw new Error('maintenance_plan cursor.hasMore must match remaining actions after the current page');
  }
  for (const field of ['nextExecutableAction', 'nextReviewAction']) {
    if (result[field] !== null && !validMaintenanceActionPointer(result[field])) {
      throw new Error(`maintenance_plan ${field} must be null or an action pointer with id, executable, phase, kind, and severity`);
    }
  }
  const firstExecutableAction = result.actions.find((action) => action.executable === true) ?? null;
  if (firstExecutableAction && result.nextExecutableAction?.id !== firstExecutableAction.id) {
    throw new Error('maintenance_plan nextExecutableAction must match the first executable action on the page');
  }
  if (firstExecutableAction) {
    const pointerMismatch = maintenanceActionPointerMismatch(
      firstExecutableAction,
      result.nextExecutableAction,
      'nextExecutableAction',
    );
    if (pointerMismatch) throw new Error(pointerMismatch);
  }
  if (!firstExecutableAction && result.nextExecutableAction !== null) {
    throw new Error('maintenance_plan nextExecutableAction must be null when the page has no executable actions');
  }
  const firstReviewAction = result.actions.find((action) => action.executable === false) ?? null;
  if (firstReviewAction && result.nextReviewAction?.id !== firstReviewAction.id) {
    throw new Error('maintenance_plan nextReviewAction must match the first review action on the page');
  }
  if (firstReviewAction) {
    const pointerMismatch = maintenanceActionPointerMismatch(
      firstReviewAction,
      result.nextReviewAction,
      'nextReviewAction',
    );
    if (pointerMismatch) throw new Error(pointerMismatch);
  }
  if (!firstReviewAction && result.nextReviewAction !== null) {
    throw new Error('maintenance_plan nextReviewAction must be null when the page has no review actions');
  }
  if (typeof result.limited !== 'boolean') {
    throw new Error('maintenance_plan limited must be a boolean');
  }
  assertCompiledSummaryShape('maintenance_plan', result.compiledSummary);
  return result;
}

export function assertGrowthPlanShape(result) {
  assertQueryOperation(result, 'growth_plan');
  if (!isPlainObject(result.summary)) {
    throw new Error('growth_plan summary must be an object');
  }
  for (const field of [
    'relationRecommendations',
    'externalElementRefs',
    'externalElementRefsIgnored',
    'danglingReferences',
    'unassignedNodes',
    'emptyDomains',
    'nextReads',
    'totalActions',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`growth_plan summary.${field} must be a non-negative integer`);
    }
  }
  const computedTotal = result.summary.relationRecommendations
    + result.summary.externalElementRefs
    + result.summary.danglingReferences;
  if (result.summary.totalActions !== computedTotal) {
    throw new Error('growth_plan summary.totalActions must equal the actionable candidate totals');
  }
  assertRelationRecommendationsGroup(result.relationRecommendations, result.summary.relationRecommendations);
  assertGrowthRowsGroup('externalElementRefs', result.externalElementRefs, result.summary.externalElementRefs);
  if ((result.externalElementRefs.ignored ?? 0) !== result.summary.externalElementRefsIgnored) {
    throw new Error('growth_plan externalElementRefs.ignored must equal summary.externalElementRefsIgnored');
  }
  assertGrowthRowsGroup('danglingReferences', result.danglingReferences, result.summary.danglingReferences);
  assertGrowthRowsGroup('unassignedNodes', result.unassignedNodes, result.summary.unassignedNodes);
  assertGrowthRowsGroup('emptyDomains', result.emptyDomains, result.summary.emptyDomains);
  assertNextReadsGroup(result.nextReads, result.summary.nextReads);
  assertCompiledSummaryShape('growth_plan', result.compiledSummary);
  return result;
}

/**
 * Next reads keep their own contract: they are reads, not proposed writes, so they carry the author's
 * sentence and a path instead of a score and an executable `proposedAction`.
 */
function assertNextReadsGroup(group, expectedTotal) {
  if (!isPlainObject(group)) {
    throw new Error('growth_plan nextReads must be an object');
  }
  if (!validCount(group.total)) {
    throw new Error('growth_plan nextReads.total must be a non-negative integer');
  }
  if (group.total !== expectedTotal) {
    throw new Error('growth_plan nextReads.total must equal summary.nextReads');
  }
  if (typeof group.limited !== 'boolean') {
    throw new Error('growth_plan nextReads.limited must be a boolean');
  }
  if (!Array.isArray(group.rows)) {
    throw new Error('growth_plan nextReads.rows must be an array');
  }
  if (group.rows.length > group.total) {
    throw new Error('growth_plan nextReads.rows length must not exceed total');
  }
  if (!group.limited && group.rows.length !== group.total) {
    throw new Error('growth_plan nextReads.rows length must equal total when not limited');
  }
  // `no_bodies` is the one reason an empty group is not a clean vault, so it is
  // required to be stated rather than inferred from a zero.
  if (group.reason !== null && group.reason !== undefined && group.reason !== 'no_bodies') {
    throw new Error('growth_plan nextReads.reason must be null or "no_bodies"');
  }
  if (group.reason === 'no_bodies' && group.total !== 0) {
    throw new Error('growth_plan nextReads.reason "no_bodies" must accompany a zero total');
  }
  for (let index = 0; index < group.rows.length; index += 1) {
    const failure = nextReadRowFailure(group.rows[index]);
    if (failure) throw new Error(`growth_plan nextReads.rows[${index}] ${failure}`);
  }
}

function nextReadRowFailure(row) {
  if (!isPlainObject(row)) return 'must be an object';
  if (!hasNonEmptyString(row.slug, row.kind, row.statement, row.proposedAction)) {
    return 'must carry slug, kind, statement, and proposedAction strings';
  }
  if (!NEXT_READ_KINDS.has(row.kind)) {
    return `kind must be one of: ${[...NEXT_READ_KINDS].join(', ')}`;
  }
  if (!Array.isArray(row.paths) || row.paths.some((path) => !hasNonEmptyString(path))) {
    return 'paths must be an array of non-empty strings';
  }
  if (!Array.isArray(row.ranges)) return 'ranges must be an array';
  for (const range of row.ranges) {
    if (!isPlainObject(range) || !hasNonEmptyString(range.path)) {
      return 'ranges entries must carry a path';
    }
    if (!Number.isInteger(range.from) || !Number.isInteger(range.to) || range.from > range.to) {
      return 'ranges entries must carry an ordered integer line span';
    }
  }
  return null;
}

export function compileResultExitCode(artifact) {
  const counts = compileBlockingCounts(artifact);
  if (!validCount(counts.issues) || !validCount(counts.unresolvedEdges)) return 1;
  return counts.issues > 0 || counts.unresolvedEdges > 0 ? 1 : 0;
}

export function compileBlockingCounts(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { issues: Number.NaN, unresolvedEdges: Number.NaN };
  }
  const summary = artifact.summary && typeof artifact.summary === 'object' && !Array.isArray(artifact.summary)
    ? artifact.summary
    : artifact;
  return {
    issues: countValue(summary.issues ?? summary.issueCount ?? artifact.issueCount),
    unresolvedEdges: countValue(summary.unresolvedEdges ?? summary.unresolvedEdgeCount ?? artifact.unresolvedEdgeCount),
  };
}

function maintenanceActionFailure(action, index) {
  if (!isPlainObject(action)) {
    return `maintenance_plan actions[${index}] must be an object`;
  }
  for (const field of ['id', 'phase', 'kind', 'reason']) {
    if (!hasNonEmptyString(action[field])) {
      return `maintenance_plan actions[${index}].${field} must be a non-empty string`;
    }
  }
  if (!MAINTENANCE_ACTION_SEVERITIES.has(action.severity)) {
    return `maintenance_plan actions[${index}].severity must be one of: ${[...MAINTENANCE_ACTION_SEVERITIES].join(', ')}`;
  }
  if (typeof action.executable !== 'boolean') {
    return `maintenance_plan actions[${index}].executable must be a boolean`;
  }
  if (!Number.isFinite(action.score) || action.score < 0) {
    return `maintenance_plan actions[${index}].score must be a non-negative number`;
  }
  if (action.executable && !isPlainObject(action.proposedAction)) {
    return `maintenance_plan executable action ${action.id} must include proposedAction`;
  }
  if (action.proposedAction !== undefined && action.proposedAction !== null) {
    if (!isPlainObject(action.proposedAction)) {
      return `maintenance_plan action ${action.id} proposedAction must be an object when present`;
    }
    if (!hasNonEmptyString(action.proposedAction.tool)) {
      return `maintenance_plan action ${action.id} proposedAction.tool must be a non-empty string`;
    }
    if (!isPlainObject(action.proposedAction.args)) {
      return `maintenance_plan action ${action.id} proposedAction.args must be an object`;
    }
    const proposedActionFailure = maintenanceProposedActionFailure(action);
    if (proposedActionFailure) return proposedActionFailure;
  }
  return null;
}

function maintenanceProposedActionFailure(action) {
  const { tool, args } = action.proposedAction;
  if (action.kind === 'add_missing_relation') {
    if (tool !== 'add_relation') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be add_relation`;
    }
    if (!isPlainObject(action.nodes) || !isPlainObject(action.nodes.from) || !isPlainObject(action.nodes.to)) {
      return `maintenance_plan action ${action.id} add_missing_relation must include from/to node summaries`;
    }
    if (args.from !== action.nodes.from.slug || args.to !== action.nodes.to.slug) {
      return `maintenance_plan action ${action.id} proposedAction endpoints must match node summaries`;
    }
    if (!hasNonEmptyString(args.type)) {
      return `maintenance_plan action ${action.id} proposedAction.type must be a non-empty string`;
    }
  }
  if (action.kind === 'canonicalize_graph_arrays') {
    if (tool !== 'patch_concept') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be patch_concept`;
    }
    if (isPlainObject(action.node) && hasNonEmptyString(action.node.slug) && args.slug !== action.node.slug) {
      return `maintenance_plan action ${action.id} proposedAction.slug must match node summary`;
    }
  }
  if (action.kind === 'materialize_external_element' || action.kind === 'resolve_dangling_reference') {
    if (tool !== 'add_concept') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be add_concept`;
    }
    if (!hasNonEmptyString(args.slug)) {
      return `maintenance_plan action ${action.id} proposedAction.slug must be a non-empty string`;
    }
    if (action.kind === 'materialize_external_element' && args.kind !== 'element') {
      return `maintenance_plan action ${action.id} proposedAction.kind must be element`;
    }
  }
  return null;
}

function validMaintenanceActionPointer(action) {
  return Boolean(
    isPlainObject(action)
    && hasNonEmptyString(action.id)
    && hasNonEmptyString(action.phase)
    && hasNonEmptyString(action.kind)
    && MAINTENANCE_ACTION_SEVERITIES.has(action.severity)
    && typeof action.executable === 'boolean'
  );
}

function maintenanceActionPointerMismatch(expectedAction, pointer, label) {
  for (const field of ['executable', 'phase', 'kind', 'severity']) {
    if (pointer[field] !== expectedAction[field]) {
      return `maintenance_plan ${label}.${field} must match the first page action`;
    }
  }
  return null;
}

function assertRelationRecommendationsGroup(group, expectedTotal) {
  if (!isPlainObject(group)) {
    throw new Error('growth_plan relationRecommendations must be an object');
  }
  if (group.operation !== 'recommend_relations') {
    throw new Error(`growth_plan relationRecommendations operation mismatch: ${group.operation}`);
  }
  if (!validCount(group.totalRecommendations)) {
    throw new Error('growth_plan relationRecommendations.totalRecommendations must be a non-negative integer');
  }
  if (group.totalRecommendations !== expectedTotal) {
    throw new Error('growth_plan relationRecommendations.totalRecommendations must equal summary.relationRecommendations');
  }
  if (typeof group.limited !== 'boolean') {
    throw new Error('growth_plan relationRecommendations.limited must be a boolean');
  }
  if (!Array.isArray(group.recommendations)) {
    throw new Error('growth_plan relationRecommendations.recommendations must be an array');
  }
  if (group.recommendations.length > group.totalRecommendations) {
    throw new Error('growth_plan relationRecommendations recommendations length must not exceed totalRecommendations');
  }
  if (!group.limited && group.recommendations.length !== group.totalRecommendations) {
    throw new Error('growth_plan relationRecommendations recommendations length must equal totalRecommendations when not limited');
  }
  for (let index = 0; index < group.recommendations.length; index += 1) {
    const failure = growthCandidateRowFailure(group.recommendations[index], { requireProposedAction: true });
    if (failure) throw new Error(`growth_plan relationRecommendations.recommendations[${index}] ${failure}`);
  }
}

function assertGrowthRowsGroup(name, group, expectedTotal) {
  if (!isPlainObject(group)) {
    throw new Error(`growth_plan ${name} must be an object`);
  }
  if (!validCount(group.total)) {
    throw new Error(`growth_plan ${name}.total must be a non-negative integer`);
  }
  if (group.total !== expectedTotal) {
    throw new Error(`growth_plan ${name}.total must equal summary.${name}`);
  }
  if (typeof group.limited !== 'boolean') {
    throw new Error(`growth_plan ${name}.limited must be a boolean`);
  }
  if (!Array.isArray(group.rows)) {
    throw new Error(`growth_plan ${name}.rows must be an array`);
  }
  if (group.rows.length > group.total) {
    throw new Error(`growth_plan ${name}.rows length must not exceed total`);
  }
  if (!group.limited && group.rows.length !== group.total) {
    throw new Error(`growth_plan ${name}.rows length must equal total when not limited`);
  }
  for (let index = 0; index < group.rows.length; index += 1) {
    const failure = growthCandidateRowFailure(group.rows[index]);
    if (failure) throw new Error(`growth_plan ${name}.rows[${index}] ${failure}`);
  }
}

function assertCompiledSummaryShape(operation, compiledSummary) {
  if (compiledSummary === undefined) return;
  if (!isPlainObject(compiledSummary)) {
    throw new Error(`${operation} compiledSummary must be an object when present`);
  }
  for (const field of ['nodes', 'edges', 'issues']) {
    if (compiledSummary[field] !== undefined && !validCount(compiledSummary[field])) {
      throw new Error(`${operation} compiledSummary.${field} must be a non-negative integer when present`);
    }
  }
}

function growthCandidateRowFailure(row, { requireProposedAction = false } = {}) {
  if (!isPlainObject(row) || !hasNonEmptyString(row.kind, row.reason) || !Number.isFinite(row.score) || row.score < 0) {
    return 'has an invalid growth-candidate shape';
  }
  if (requireProposedAction && !isPlainObject(row.proposedAction)) return 'must include proposedAction';
  if (row.proposedAction !== undefined && row.proposedAction !== null) {
    if (!isPlainObject(row.proposedAction) || !hasNonEmptyString(row.proposedAction.tool) || !isPlainObject(row.proposedAction.args)) {
      return 'has an invalid proposedAction shape';
    }
    const actionFailure = growthProposedActionFailure(row);
    if (actionFailure) return actionFailure;
  }
  return null;
}

function growthProposedActionFailure(row) {
  const { tool, args } = row.proposedAction;
  if (row.kind === 'missing_domain_containment') {
    if (tool !== 'add_relation') return 'proposedAction.tool must be add_relation';
    if (args.from !== row.from || args.to !== row.to || args.type !== row.relation) {
      return 'proposedAction relation args must match row endpoints and relation';
    }
  }
  if (row.kind === 'materialize_external_element') {
    if (tool !== 'add_concept') return 'proposedAction.tool must be add_concept';
    if (args.slug !== row.suggestedSlug) return 'proposedAction.slug must match suggestedSlug';
    if (args.kind !== 'element') return 'proposedAction.kind must be element';
  }
  if (row.kind === 'resolve_dangling_reference') {
    if (tool !== 'add_concept') return 'proposedAction.tool must be add_concept';
    if (args.slug !== row.suggestedSlug) return 'proposedAction.slug must match suggestedSlug';
    if (args.kind !== row.inferredKind) return 'proposedAction.kind must match inferredKind';
  }
  return null;
}

function countValue(value) {
  return validCount(value) ? value : Number.NaN;
}
