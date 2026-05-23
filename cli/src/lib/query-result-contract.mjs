const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);
const MAINTENANCE_ACTION_SEVERITIES = new Set(['fail', 'warn', 'info']);
const BLAST_RADIUS_RISKS = new Set(['low', 'medium', 'high']);
const RELATION_CHECK_VERDICTS = new Set([
  'already_exists',
  'matches_existing_schema',
  'new_schema_pattern',
]);
const RELATION_CHECK_DECISIONS = new Set([
  'skip_existing',
  'review_inverse',
  'safe_to_add',
  'review_new_schema',
]);
const RELATION_CHECK_RECOMMENDATION_SEVERITIES = new Set(['info', 'warn']);
const ALL_PATHS_EVIDENCE_STATUSES = new Set(['complete', 'partial']);
const ALL_PATHS_EVIDENCE_REASONS = new Set(['complete', 'limit', 'search_budget']);
const ALL_PATHS_EVIDENCE_NEXT_STEPS = new Set(['use', 'narrow']);
const QUERY_PLAN_COST_CLASSES = new Set(['low', 'medium', 'high']);
const QUERY_PLAN_NEXT_STEPS = new Set(['run', 'review', 'narrow']);

export function assertQueryOperation(result, expectedOperation) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${expectedOperation} query returned a non-object response`);
  }
  if (result.operation !== expectedOperation) {
    throw new Error(`${expectedOperation} query returned unexpected operation: ${result.operation}`);
  }
  return result;
}

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
  assertCompiledSummaryShape('growth_plan', result.compiledSummary);
  return result;
}

export function assertHealthShape(result) {
  assertQueryOperation(result, 'health');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`health status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('health summary must be an object');
  }
  if (!Array.isArray(result.checks) || result.checks.length === 0) {
    throw new Error('health checks must be a non-empty array');
  }
  for (let index = 0; index < result.checks.length; index += 1) {
    if (!validHealthCheck(result.checks[index])) {
      throw new Error(`health checks[${index}] has an invalid health-check shape`);
    }
  }
  return result;
}

export function assertWorkspaceBriefShape(result) {
  assertQueryOperation(result, 'workspace_brief');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`workspace_brief status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('workspace_brief summary must be an object');
  }
  if (!Array.isArray(result.nextActions)) {
    throw new Error('workspace_brief nextActions must be an array');
  }
  for (let index = 0; index < result.nextActions.length; index += 1) {
    if (!validNextAction(result.nextActions[index])) {
      throw new Error(`workspace_brief nextActions[${index}] has an invalid next-action shape`);
    }
  }
  if (!isPlainObject(result.health) || !Array.isArray(result.health.checks) || result.health.checks.length === 0) {
    throw new Error('workspace_brief health.checks must be a non-empty array');
  }
  for (let index = 0; index < result.health.checks.length; index += 1) {
    if (!validHealthCheck(result.health.checks[index])) {
      throw new Error(`workspace_brief health.checks[${index}] has an invalid health-check shape`);
    }
  }
  if (result.growth !== undefined && !isPlainObject(result.growth)) {
    throw new Error('workspace_brief growth must be an object when present');
  }
  return result;
}

export function assertAgentBriefShape(result) {
  assertQueryOperation(result, 'agent_brief');
  if (result.sideEffect !== false) {
    throw new Error('agent_brief sideEffect must be false');
  }
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`agent_brief status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!validAgentReadiness(result.readiness)) {
    throw new Error('agent_brief readiness must contain status, score, and non-negative graph counts');
  }
  if (!isPlainObject(result.graph)) {
    throw new Error('agent_brief graph must be an object');
  }
  if (!validAgentHandoffPrompt(result.handoffPrompt)) {
    throw new Error('agent_brief handoffPrompt must be a non-empty agent handoff string');
  }
  if (!validAgentCliFallbackCommands(result.cliFallbackCommands)) {
    throw new Error('agent_brief cliFallbackCommands must include non-empty oh-my-ontology CLI fallback commands');
  }
  if (!isPlainObject(result.health) || !Array.isArray(result.health.checks) || result.health.checks.length === 0) {
    throw new Error('agent_brief health.checks must be a non-empty array');
  }
  for (let index = 0; index < result.health.checks.length; index += 1) {
    if (!validHealthCheck(result.health.checks[index])) {
      throw new Error(`agent_brief health.checks[${index}] has an invalid health-check shape`);
    }
  }
  if (!Array.isArray(result.nextActions)) {
    throw new Error('agent_brief nextActions must be an array');
  }
  for (let index = 0; index < result.nextActions.length; index += 1) {
    if (!validNextAction(result.nextActions[index])) {
      throw new Error(`agent_brief nextActions[${index}] has an invalid next-action shape`);
    }
  }
  if (!Array.isArray(result.entrypoints)) {
    throw new Error('agent_brief entrypoints must be an array');
  }
  for (let index = 0; index < result.entrypoints.length; index += 1) {
    if (!validAgentEntrypoint(result.entrypoints[index])) {
      throw new Error(`agent_brief entrypoints[${index}] has an invalid entrypoint shape`);
    }
  }
  if (!Array.isArray(result.firstCalls) || result.firstCalls.length === 0) {
    throw new Error('agent_brief firstCalls must be a non-empty array');
  }
  for (let index = 0; index < result.firstCalls.length; index += 1) {
    if (!validAgentToolCall(result.firstCalls[index])) {
      throw new Error(`agent_brief firstCalls[${index}] has an invalid tool-call shape`);
    }
  }
  if (!agentToolCallsIncludeOperation(result.firstCalls, 'relation_check')) {
    throw new Error('agent_brief firstCalls must include relation_check preflight');
  }
  if (!Array.isArray(result.playbooks) || result.playbooks.length === 0) {
    throw new Error('agent_brief playbooks must be a non-empty array');
  }
  for (let index = 0; index < result.playbooks.length; index += 1) {
    if (!validAgentPlaybook(result.playbooks[index])) {
      throw new Error(`agent_brief playbooks[${index}] has an invalid playbook shape`);
    }
  }
  const refactorPlaybook = result.playbooks.find((playbook) => playbook.id === 'refactor_impact');
  if (!refactorPlaybook) {
    throw new Error('agent_brief playbooks must include refactor_impact');
  }
  if (!agentToolCallsIncludeOperation(refactorPlaybook.calls, 'relation_check')) {
    throw new Error('agent_brief refactor_impact playbook must include relation_check preflight');
  }
  const traversalPlaybook = result.playbooks.find((playbook) => playbook.id === 'graph_traversal');
  if (!traversalPlaybook) {
    throw new Error('agent_brief playbooks must include graph_traversal');
  }
  for (const operation of ['schema', 'all_paths', 'pattern_walk', 'project_map']) {
    if (!agentToolCallsIncludeOperation(traversalPlaybook.calls, operation)) {
      throw new Error(`agent_brief graph_traversal playbook must include ${operation}`);
    }
  }
  if (!validAgentTraversalStrategy(result.traversalStrategy)) {
    throw new Error('agent_brief traversalStrategy must include plan, bounded path evidence, and containment cross-check guidance');
  }
  if (!Array.isArray(result.writeGuardrails) || result.writeGuardrails.length === 0) {
    throw new Error('agent_brief writeGuardrails must be a non-empty array');
  }
  for (let index = 0; index < result.writeGuardrails.length; index += 1) {
    if (!validAgentGuardrail(result.writeGuardrails[index])) {
      throw new Error(`agent_brief writeGuardrails[${index}] has an invalid guardrail shape`);
    }
  }
  const relationGuardrail = result.writeGuardrails.find((guardrail) => guardrail.id === 'preflight_relation');
  if (!relationGuardrail || !agentToolCallsIncludeOperation(relationGuardrail.calls, 'relation_check')) {
    throw new Error('agent_brief writeGuardrails must include preflight_relation relation_check');
  }
  const renameGuardrail = result.writeGuardrails.find((guardrail) => guardrail.id === 'preflight_rename');
  if (!renameGuardrail || !renameGuardrail.calls.some((call) => call?.tool === 'find_backlinks')) {
    throw new Error('agent_brief writeGuardrails must include preflight_rename find_backlinks');
  }
  const syncGuardrail = result.writeGuardrails.find((guardrail) => guardrail.id === 'post_change_sync');
  if (!syncGuardrail || !syncGuardrail.calls.some((call) => call?.tool === 'validate_vault')) {
    throw new Error('agent_brief writeGuardrails must include post_change_sync validate_vault');
  }
  if (!Array.isArray(result.writePolicy) || !result.writePolicy.every((row) => hasNonEmptyString(row))) {
    throw new Error('agent_brief writePolicy must be an array of non-empty strings');
  }
  if (!result.writePolicy.some((row) => /relation_check/.test(row) && /add_relation/.test(row))) {
    throw new Error('agent_brief writePolicy must mention relation_check before add_relation');
  }
  if (!validAgentResultContracts(result.resultContracts)) {
    throw new Error('agent_brief resultContracts must include all_paths completeness fields and partial-evidence policy');
  }
  if (!validAgentRelationDecisionGuide(result.relationDecisionGuide)) {
    throw new Error('agent_brief relationDecisionGuide must cover relation_check decision outcomes');
  }
  return result;
}

export function assertCyclesShape(result) {
  assertQueryOperation(result, 'cycles');
  if (!Array.isArray(result.cycles)) {
    throw new Error('cycles query cycles must be an array');
  }
  const total = result.totalCycles ?? result.cycles.length;
  if (!validCount(total)) {
    throw new Error('cycles query totalCycles must be a non-negative integer when present');
  }
  for (let index = 0; index < result.cycles.length; index += 1) {
    if (!validCycle(result.cycles[index])) {
      throw new Error(`cycles query cycles[${index}] has an invalid cycle shape`);
    }
  }
  return result;
}

export function assertPathShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_path response must be an object');
  }
  if (result.found === false) return result;
  if (!Array.isArray(result.hops) || result.hops.length === 0) {
    throw new Error('find_path response hops must be a non-empty array when found');
  }
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) {
    throw new Error('find_path response hops must contain non-empty strings');
  }
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) {
    throw new Error('find_path response hopCount must match hops length');
  }
  if (!Array.isArray(result.edges)) {
    throw new Error('find_path response edges must be an array when found');
  }
  if (result.edges.length !== result.hops.length - 1) {
    throw new Error('find_path response edges length must match hops length');
  }
  for (let index = 0; index < result.edges.length; index += 1) {
    if (!validPathEdge(result.edges[index], result.hops[index], result.hops[index + 1])) {
      throw new Error(`find_path response edges[${index}] has an invalid path-edge shape`);
    }
  }
  if (result.nodes !== undefined) {
    if (!Array.isArray(result.nodes) || result.nodes.length !== result.hops.length) {
      throw new Error('find_path response nodes length must match hops length');
    }
    for (let index = 0; index < result.nodes.length; index += 1) {
      if (!validPathNode(result.nodes[index], result.hops[index])) {
        throw new Error(`find_path response nodes[${index}] has an invalid path-node shape`);
      }
    }
  }
  return result;
}

export function assertAllPathsShape(result) {
  assertQueryOperation(result, 'all_paths');
  for (const field of ['from', 'to', 'direction']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`all_paths ${field} must be a non-empty string`);
    }
  }
  for (const field of ['maxHops', 'limit', 'searchBudget', 'expandedStates', 'totalPaths']) {
    if (!validCount(result[field])) {
      throw new Error(`all_paths ${field} must be a non-negative integer`);
    }
  }
  if (result.limit < 1 || result.searchBudget < 1) {
    throw new Error('all_paths limit and searchBudget must be positive integers');
  }
  if (result.expandedStates > result.searchBudget) {
    throw new Error('all_paths expandedStates must not exceed searchBudget');
  }
  for (const field of ['found', 'exhaustive', 'truncatedByBudget', 'totalPathsExact', 'limited']) {
    if (typeof result[field] !== 'boolean') {
      throw new Error(`all_paths ${field} must be a boolean`);
    }
  }
  if (result.exhaustive === result.truncatedByBudget) {
    throw new Error('all_paths exhaustive/truncatedByBudget mismatch');
  }
  if (result.totalPathsExact !== result.exhaustive) {
    throw new Error('all_paths totalPathsExact must match exhaustive');
  }
  if (result.shortestHopCount !== null && !validCount(result.shortestHopCount)) {
    throw new Error('all_paths shortestHopCount must be null or a non-negative integer');
  }
  if (!validCountBucket(result.byLength)) {
    throw new Error('all_paths byLength must be an object of non-negative integer counts');
  }
  if (!Array.isArray(result.paths)) {
    throw new Error('all_paths paths must be an array');
  }
  if (result.paths.length > result.limit) {
    throw new Error('all_paths paths length must not exceed limit');
  }
  if (result.totalPathsExact && result.paths.length > result.totalPaths) {
    throw new Error('all_paths paths length must not exceed totalPaths when exact');
  }
  if (result.found === false && result.totalPaths !== 0) {
    throw new Error('all_paths found=false must have totalPaths 0');
  }
  if (result.found === false && result.paths.length !== 0) {
    throw new Error('all_paths found=false must not include path rows');
  }
  if (result.found === true && result.paths.length === 0 && result.totalPathsExact) {
    throw new Error('all_paths found=true must include at least one path when totals are exact');
  }
  for (let index = 0; index < result.paths.length; index += 1) {
    const failure = allPathsRowFailure(result.paths[index], index);
    if (failure) throw new Error(failure);
  }
  if (result.totalPathsExact && sumCountBucket(result.byLength) !== result.totalPaths) {
    throw new Error('all_paths byLength total must equal totalPaths when exact');
  }
  if (!validAllPathsEvidence(result.evidence, result)) {
    throw new Error('all_paths evidence has an invalid completeness shape');
  }
  return result;
}

export function assertQueryPlanShape(result, expectedTargetOperation) {
  assertQueryOperation(result, 'query_plan');
  if (expectedTargetOperation && result.targetOperation !== expectedTargetOperation) {
    throw new Error(`query_plan targetOperation must be ${expectedTargetOperation}`);
  }
  if (result.sideEffect !== false) {
    throw new Error('query_plan sideEffect must be false');
  }
  if (!isPlainObject(result.graph) || !validCount(result.graph.nodes) || !validCount(result.graph.edges)) {
    throw new Error('query_plan graph must include non-negative node and edge counts');
  }
  if (result.graph.resolvedEdges !== undefined && !validCount(result.graph.resolvedEdges)) {
    throw new Error('query_plan graph.resolvedEdges must be a non-negative integer when present');
  }
  if (result.graph.graphHash !== undefined && !hasNonEmptyString(result.graph.graphHash)) {
    throw new Error('query_plan graph.graphHash must be a non-empty string when present');
  }
  if (!isPlainObject(result.normalized) || result.normalized.targetOperation !== result.targetOperation) {
    throw new Error('query_plan normalized.targetOperation must match targetOperation');
  }
  if (!Array.isArray(result.indexesUsed) || !result.indexesUsed.every((index) => hasNonEmptyString(index))) {
    throw new Error('query_plan indexesUsed must be an array of non-empty strings');
  }
  if (!isPlainObject(result.estimate) || !hasNonEmptyString(result.estimate.strategy)) {
    throw new Error('query_plan estimate must include a strategy');
  }
  if (!QUERY_PLAN_COST_CLASSES.has(result.estimate.costClass)) {
    throw new Error('query_plan estimate.costClass must be low, medium, or high');
  }
  for (const field of ['edgeScans', 'nodeScans', 'reachableWithinDepth', 'potentialPathUpperBound', 'resultUpperBound']) {
    if (result.estimate[field] !== undefined && !validCount(result.estimate[field])) {
      throw new Error(`query_plan estimate.${field} must be a non-negative integer when present`);
    }
  }
  if (result.estimate.frontierByDepth !== undefined) {
    if (!Array.isArray(result.estimate.frontierByDepth)) {
      throw new Error('query_plan estimate.frontierByDepth must be an array when present');
    }
    for (let index = 0; index < result.estimate.frontierByDepth.length; index += 1) {
      if (!validFrontierRow(result.estimate.frontierByDepth[index])) {
        throw new Error(`query_plan estimate.frontierByDepth[${index}] has an invalid frontier row shape`);
      }
    }
  }
  if (!Array.isArray(result.warnings) || !result.warnings.every((warning) => hasNonEmptyString(warning))) {
    throw new Error('query_plan warnings must be an array of non-empty strings');
  }
  if (!validQueryPlanExecution(result.execution, result.targetOperation)) {
    throw new Error('query_plan execution has an invalid advice shape');
  }
  return result;
}

export function assertBacklinksShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_backlinks response must be an object');
  }
  if (!hasNonEmptyString(result.target)) {
    throw new Error('find_backlinks target must be a non-empty string');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('find_backlinks matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('find_backlinks total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validBacklinkRow(result.matches[index])) {
      throw new Error(`find_backlinks matches[${index}] has an invalid backlink shape`);
    }
  }
  return result;
}

export function assertOrphansShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_orphans response must be an object');
  }
  if (!Array.isArray(result.orphans)) {
    throw new Error('find_orphans orphans must be an array');
  }
  const total = result.total ?? result.orphans.length;
  if (!validCount(total)) {
    throw new Error('find_orphans total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.orphans.length; index += 1) {
    if (!validNodeSummary(result.orphans[index])) {
      throw new Error(`find_orphans orphans[${index}] has an invalid orphan shape`);
    }
  }
  return result;
}

export function assertQueryConceptsShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('query_concepts response must be an object');
  }
  if (!hasNonEmptyString(result.filter)) {
    throw new Error('query_concepts filter must be a non-empty string');
  }
  if (result.parsedAs !== undefined && !hasNonEmptyString(result.parsedAs)) {
    throw new Error('query_concepts parsedAs must be a non-empty string when present');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('query_concepts matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('query_concepts total must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('query_concepts limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validNodeSummary(result.matches[index])) {
      throw new Error(`query_concepts matches[${index}] has an invalid query-result shape`);
    }
  }
  return result;
}

export function assertOverviewShape(result) {
  assertQueryOperation(result, 'overview');
  if (!isPlainObject(result.graph)) {
    throw new Error('overview graph must be an object');
  }
  for (const field of ['nodes', 'edges']) {
    if (!validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['resolvedEdges', 'externalEdges', 'unresolvedEdges', 'issues']) {
    if (result.graph[field] !== undefined && !validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer when present`);
    }
  }
  for (const field of ['byKind', 'byDomain', 'byRelation']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`overview ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!Array.isArray(result.hubs)) {
    throw new Error('overview hubs must be an array');
  }
  for (let index = 0; index < result.hubs.length; index += 1) {
    if (!validHubRow(result.hubs[index])) {
      throw new Error(`overview hubs[${index}] has an invalid hub shape`);
    }
  }
  return result;
}

export function assertNodeProfileShape(result) {
  assertQueryOperation(result, 'node_profile');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('node_profile center must be a non-empty string');
  }
  if (!validNodeSummary(result.node)) {
    throw new Error('node_profile node must be a valid node summary');
  }
  if (!validDegree(result.degree)) {
    throw new Error('node_profile degree must contain non-negative in/out/total counts');
  }
  if (result.aliases !== undefined && (!Array.isArray(result.aliases) || result.aliases.some((alias) => !hasNonEmptyString(alias)))) {
    throw new Error('node_profile aliases must contain non-empty strings when present');
  }
  if (!isPlainObject(result.edges)) {
    throw new Error('node_profile edges must be an object');
  }
  for (const direction of ['incoming', 'outgoing']) {
    if (!validEdgeGroup(result.edges[direction], direction)) {
      throw new Error(`node_profile edges.${direction} must be a valid edge group`);
    }
  }
  if (result.lineage !== undefined && !validLineage(result.lineage)) {
    throw new Error('node_profile lineage must contain valid ancestor/descendant pages when present');
  }
  return result;
}

export function assertSimilarNodesShape(result) {
  assertQueryOperation(result, 'similar_nodes');
  if (!Array.isArray(result.matches)) {
    throw new Error('similar_nodes matches must be an array');
  }
  const total = result.totalMatches ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('similar_nodes totalMatches must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('similar_nodes limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validSimilarMatch(result.matches[index])) {
      throw new Error(`similar_nodes matches[${index}] has an invalid similar-node shape`);
    }
  }
  return result;
}

export function assertCentralityShape(result) {
  assertQueryOperation(result, 'centrality');
  if (!isPlainObject(result.rankings)) {
    throw new Error('centrality rankings must be an object');
  }
  for (const section of ['pageRank', 'bridges', 'authorities', 'hubs']) {
    const rows = result.rankings[section];
    if (!Array.isArray(rows)) {
      throw new Error(`centrality rankings.${section} must be an array`);
    }
    for (let index = 0; index < rows.length; index += 1) {
      if (!validCentralityRow(rows[index])) {
        throw new Error(`centrality rankings.${section}[${index}] has an invalid ranking shape`);
      }
    }
  }
  return result;
}

export function assertBlastRadiusShape(result) {
  assertQueryOperation(result, 'blast_radius');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('blast_radius center must be a non-empty string');
  }
  if (!BLAST_RADIUS_RISKS.has(result.risk)) {
    throw new Error(`blast_radius risk must be one of: ${[...BLAST_RADIUS_RISKS].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('blast_radius summary must be an object');
  }
  for (const field of ['affectedNodes', 'affectedEdges', 'affectedKinds', 'affectedDomains', 'crossDomainEdges']) {
    if (!validCount(result.summary[field])) {
      throw new Error(`blast_radius summary.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['byKind', 'byDomain']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`blast_radius ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!validPage(result.nodes, validBlastRadiusNodeRow)) {
    throw new Error('blast_radius nodes must be a page with valid node rows');
  }
  if (!validPage(result.edges, validBlastRadiusEdgeRow)) {
    throw new Error('blast_radius edges must be a page with valid edge rows');
  }
  return result;
}

export function assertRelationCheckShape(result) {
  assertQueryOperation(result, 'relation_check');
  for (const field of ['from', 'to', 'relation', 'fromKind', 'toKind', 'verdict']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`relation_check ${field} must be a non-empty string`);
    }
  }
  if (typeof result.exists !== 'boolean') {
    throw new Error('relation_check exists must be a boolean');
  }
  if (!RELATION_CHECK_VERDICTS.has(result.verdict)) {
    throw new Error(`relation_check verdict must be one of: ${[...RELATION_CHECK_VERDICTS].join(', ')}`);
  }
  if (!validRelationCheckRecommendation(result.recommendation)) {
    throw new Error('relation_check recommendation must include decision, severity, and reason');
  }
  if (!Array.isArray(result.matchingEdges)) {
    throw new Error('relation_check matchingEdges must be an array');
  }
  for (let index = 0; index < result.matchingEdges.length; index += 1) {
    if (!validRelationCheckEdge(result.matchingEdges[index])) {
      throw new Error(`relation_check matchingEdges[${index}] has an invalid edge shape`);
    }
  }
  if (!Array.isArray(result.inverseEdges)) {
    throw new Error('relation_check inverseEdges must be an array');
  }
  for (let index = 0; index < result.inverseEdges.length; index += 1) {
    if (!validRelationCheckEdge(result.inverseEdges[index])) {
      throw new Error(`relation_check inverseEdges[${index}] has an invalid edge shape`);
    }
  }
  if (result.schemaPattern !== null && result.schemaPattern !== undefined && !validRelationCheckPattern(result.schemaPattern)) {
    throw new Error('relation_check schemaPattern must be a valid schema-pattern row when present');
  }
  if (!Array.isArray(result.nearbyPatterns)) {
    throw new Error('relation_check nearbyPatterns must be an array');
  }
  for (let index = 0; index < result.nearbyPatterns.length; index += 1) {
    if (!validRelationCheckPattern(result.nearbyPatterns[index], { requireSimilarity: true })) {
      throw new Error(`relation_check nearbyPatterns[${index}] has an invalid schema-pattern shape`);
    }
  }
  if (result.exists && result.proposedAction !== null && result.proposedAction !== undefined) {
    throw new Error('relation_check existing edge must not include proposedAction');
  }
  if (!result.exists && !validRelationCheckProposedAction(result)) {
    throw new Error('relation_check missing edge must include add_relation proposedAction with matching args');
  }
  return result;
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

export function cyclesResultExitCode(result) {
  if (!Array.isArray(result?.cycles)) return 1;
  const cycles = result.cycles;
  const total = numberValue(result?.totalCycles, cycles.length);
  if (!Number.isInteger(total) || total < 0) return 1;
  if (cycles.some((cycle) => !validCycle(cycle))) return 1;
  return total === 0 ? 0 : 1;
}

export function pathResultExitCode(result) {
  if (result?.found === false) return 1;
  if (!Array.isArray(result?.hops) || result.hops.length === 0) return 1;
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) return 1;
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) return 1;
  if (!Array.isArray(result.edges) || result.edges.length !== result.hops.length - 1) return 1;
  if (result.edges.some((edge, index) => !validPathEdge(edge, result.hops[index], result.hops[index + 1]))) {
    return 1;
  }
  return 0;
}

export function allPathsResultExitCode(result) {
  return result?.found === false ? 1 : 0;
}

export function healthResultExitCode(result) {
  const status = result?.status ?? 'unknown';
  if (!DIAGNOSIS_STATUSES.has(status)) return 1;
  if (!Array.isArray(result?.checks)) return 1;
  const checks = result.checks;
  if (checks.length === 0) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (checks.some((check) => check?.status === 'fail')) return 1;
  return status === 'healthy' ? 0 : 1;
}

export function workspaceBriefExitCode(result) {
  if (!DIAGNOSIS_STATUSES.has(result?.status)) return 1;
  if (!Array.isArray(result?.nextActions)) return 1;
  if (!Array.isArray(result?.health?.checks)) return 1;
  const next = result.nextActions;
  const checks = result.health.checks;
  if (checks.length === 0) return 1;
  if (next.some((action) => !validNextAction(action))) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (next.some((action) => action?.severity === 'fail')) return 1;
  return checks.some((check) => check?.status === 'fail') ? 1 : 0;
}

export function agentBriefExitCode(result) {
  if (!DIAGNOSIS_STATUSES.has(result?.status)) return 1;
  if (!validAgentReadiness(result?.readiness)) return 1;
  if (!Array.isArray(result?.health?.checks)) return 1;
  if (!Array.isArray(result?.nextActions)) return 1;
  const checks = result.health.checks;
  const next = result.nextActions;
  if (checks.length === 0) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (next.some((action) => !validNextAction(action))) return 1;
  if (checks.some((check) => check?.status === 'fail')) return 1;
  if (next.some((action) => action?.severity === 'fail')) return 1;
  if (result.status !== 'healthy') return 1;
  return result.readiness.status === 'ready' ? 0 : 1;
}

function validNextAction(action) {
  return Boolean(
    action
    && typeof action === 'object'
    && !Array.isArray(action)
    && hasNonEmptyString(action.id, action.kind)
    && NEXT_ACTION_SEVERITIES.has(action.severity)
  );
}

function validAgentReadiness(readiness) {
  return Boolean(
    isPlainObject(readiness)
    && hasNonEmptyString(readiness.status)
    && validCount(readiness.score)
    && readiness.score <= 100
    && [
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
    ].every((field) => validCount(readiness[field]))
  );
}

function validAgentEntrypoint(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.title)
    && hasNonEmptyString(row.kind)
    && validCount(row.degree)
    && validCount(row.inDegree)
    && validCount(row.outDegree)
  );
}

function validAgentToolCall(call) {
  return Boolean(
    isPlainObject(call)
    && call.tool === 'query_ontology'
    && isPlainObject(call.arguments)
    && hasNonEmptyString(call.arguments.operation)
  );
}

function validAgentGuardrailToolCall(call) {
  if (!isPlainObject(call) || !isPlainObject(call.arguments)) return false;
  if (call.tool === 'query_ontology') {
    return hasNonEmptyString(call.arguments.operation);
  }
  if (call.tool === 'find_backlinks') {
    return hasNonEmptyString(call.arguments.slug);
  }
  if (call.tool === 'validate_vault') {
    return Object.keys(call.arguments).length === 0;
  }
  return false;
}

function agentToolCallsIncludeOperation(calls, operation) {
  return Array.isArray(calls)
    && calls.some((call) => call?.tool === 'query_ontology' && call?.arguments?.operation === operation);
}

function validAgentPlaybook(playbook) {
  return Boolean(
    isPlainObject(playbook)
    && hasNonEmptyString(playbook.id)
    && hasNonEmptyString(playbook.goal)
    && Array.isArray(playbook.evidence)
    && playbook.evidence.length > 0
    && playbook.evidence.every((item) => hasNonEmptyString(item))
    && Array.isArray(playbook.stopWhen)
    && playbook.stopWhen.length > 0
    && playbook.stopWhen.every((item) => hasNonEmptyString(item))
    && Array.isArray(playbook.calls)
    && playbook.calls.length > 0
    && playbook.calls.every((call) => validAgentToolCall(call))
  );
}

function validAgentHandoffPrompt(value) {
  return hasNonEmptyString(value)
    && /oh-my-ontology MCP server/.test(value)
    && /first-contact MCP calls/i.test(value)
    && /CLI fallback commands/.test(value)
    && /Investigation playbooks/.test(value)
    && /Traversal strategy/.test(value)
    && /Write guardrails/.test(value)
    && /relation_check/.test(value)
    && /add_relation/.test(value);
}

function validAgentCliFallbackCommands(commands) {
  return Array.isArray(commands)
    && commands.length > 0
    && commands.every((command) => hasNonEmptyString(command) && /^oh-my-ontology\s/.test(command));
}

function validAgentTraversalStrategy(strategies) {
  if (!Array.isArray(strategies) || strategies.length === 0) return false;
  const required = ['plan_before_enumeration', 'bounded_path_evidence', 'containment_cross_check'];
  const byId = new Map();
  for (const strategy of strategies) {
    if (
      !isPlainObject(strategy) ||
      !hasNonEmptyString(strategy.id, strategy.priority, strategy.goal, strategy.useWhen) ||
      !Array.isArray(strategy.evidence) ||
      strategy.evidence.length === 0 ||
      !strategy.evidence.every((item) => hasNonEmptyString(item)) ||
      !Array.isArray(strategy.stopWhen) ||
      strategy.stopWhen.length === 0 ||
      !strategy.stopWhen.every((item) => hasNonEmptyString(item)) ||
      !Array.isArray(strategy.calls) ||
      strategy.calls.length === 0 ||
      !strategy.calls.every((call) => validAgentToolCall(call))
    ) {
      return false;
    }
    byId.set(strategy.id, strategy);
  }
  if (required.some((id) => !byId.has(id))) return false;
  if (!agentToolCallsIncludeOperation(byId.get('plan_before_enumeration').calls, 'query_plan')) return false;
  const bounded = byId.get('bounded_path_evidence');
  if (!agentToolCallsIncludeOperation(bounded.calls, 'all_paths')) return false;
  if (!bounded.evidence.some((item) => /evidence\.pathsComplete/.test(item))) return false;
  const containment = byId.get('containment_cross_check');
  return agentToolCallsIncludeOperation(containment.calls, 'pattern_walk') &&
    agentToolCallsIncludeOperation(containment.calls, 'project_map');
}

function validAgentGuardrail(guardrail) {
  return Boolean(
    isPlainObject(guardrail)
    && hasNonEmptyString(guardrail.id)
    && hasNonEmptyString(guardrail.goal)
    && Array.isArray(guardrail.calls)
    && guardrail.calls.length > 0
    && guardrail.calls.every((call) => validAgentGuardrailToolCall(call))
  );
}

function validHealthCheck(check) {
  return Boolean(
    check
    && typeof check === 'object'
    && !Array.isArray(check)
    && hasNonEmptyString(check.id)
    && HEALTH_CHECK_STATUSES.has(check.status)
    && validCount(check.count)
  );
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

function validNodeSummary(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.mtime === undefined || Number.isFinite(row.mtime))
  );
}

function validPathNode(row, expectedSlug) {
  return Boolean(
    isPlainObject(row)
    && row.slug === expectedSlug
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.domain === undefined || typeof row.domain === 'string')
  );
}

function allPathsRowFailure(row, index) {
  const label = `all_paths paths[${index}]`;
  if (!isPlainObject(row)) return `${label} must be an object`;
  if (!validCount(row.hopCount)) return `${label}.hopCount must be a non-negative integer`;
  if (!Array.isArray(row.hops) || row.hops.length === 0) return `${label}.hops must be a non-empty array`;
  if (row.hops.some((hop) => !hasNonEmptyString(hop))) return `${label}.hops must contain non-empty strings`;
  if (row.hopCount !== row.hops.length - 1) return `${label}.hopCount must match hops length`;
  if (!Array.isArray(row.edges)) return `${label}.edges must be an array`;
  if (row.edges.length !== row.hops.length - 1) return `${label}.edges length must match hops length`;
  for (let edgeIndex = 0; edgeIndex < row.edges.length; edgeIndex += 1) {
    if (!validUndirectedPathEdge(row.edges[edgeIndex], row.hops[edgeIndex], row.hops[edgeIndex + 1])) {
      return `${label}.edges[${edgeIndex}] has an invalid path-edge shape`;
    }
  }
  if (!Array.isArray(row.nodes) || row.nodes.length !== row.hops.length) {
    return `${label}.nodes length must match hops length`;
  }
  for (let nodeIndex = 0; nodeIndex < row.nodes.length; nodeIndex += 1) {
    if (!validPathNode(row.nodes[nodeIndex], row.hops[nodeIndex])) {
      return `${label}.nodes[${nodeIndex}] has an invalid path-node shape`;
    }
  }
  if (!validCountBucket(row.byRelation)) {
    return `${label}.byRelation must be an object of non-negative integer counts`;
  }
  if (sumCountBucket(row.byRelation) !== row.edges.length) {
    return `${label}.byRelation total must equal edge count`;
  }
  return null;
}

function validUndirectedPathEdge(edge, a, b) {
  return validPathEdge(edge, a, b) || validPathEdge(edge, b, a);
}

function validFrontierRow(row) {
  return Boolean(
    isPlainObject(row)
    && validCount(row.distance)
    && validCount(row.frontierNodes)
    && validCount(row.candidateEdges)
    && validCount(row.newNodes)
  );
}

function validQueryPlanExecution(execution, targetOperation) {
  return Boolean(
    isPlainObject(execution)
    && typeof execution.shouldRun === 'boolean'
    && QUERY_PLAN_NEXT_STEPS.has(execution.nextStep)
    && hasNonEmptyString(execution.recommendation)
    && validPlannedQuery(execution.suggestedQuery, targetOperation)
    && (execution.saferQuery === undefined || validPlannedQuery(execution.saferQuery, targetOperation))
    && ((execution.shouldRun && execution.nextStep === 'run') || (!execution.shouldRun && execution.nextStep !== 'run'))
  );
}

function validPlannedQuery(query, targetOperation) {
  return Boolean(
    isPlainObject(query)
    && query.operation === targetOperation
  );
}

function validAllPathsEvidence(evidence, result) {
  return Boolean(
    isPlainObject(evidence)
    && ALL_PATHS_EVIDENCE_STATUSES.has(evidence.status)
    && ALL_PATHS_EVIDENCE_REASONS.has(evidence.reason)
    && evidence.totalPathsExact === result.totalPathsExact
    && typeof evidence.pathsComplete === 'boolean'
    && ALL_PATHS_EVIDENCE_NEXT_STEPS.has(evidence.nextStep)
    && hasNonEmptyString(evidence.recommendation)
    && validAllPathsSuggestedQuery(evidence.suggestedQuery)
    && (evidence.saferQuery === undefined || validAllPathsSuggestedQuery(evidence.saferQuery))
    && ((evidence.pathsComplete && evidence.status === 'complete' && evidence.nextStep === 'use')
      || (!evidence.pathsComplete && evidence.status === 'partial' && evidence.nextStep === 'narrow'))
  );
}

function validAllPathsSuggestedQuery(query) {
  if (!isPlainObject(query)) return false;
  if (query.operation === 'all_paths') return true;
  return query.operation === 'query_plan' && query.targetOperation === 'all_paths';
}

function validBacklinkRow(row) {
  return Boolean(
    validNodeSummary(row)
    && Array.isArray(row.matchedKeys)
    && row.matchedKeys.every((key) => hasNonEmptyString(key))
  );
}

function validDegree(degree) {
  return Boolean(
    isPlainObject(degree)
    && validCount(degree.in)
    && validCount(degree.out)
    && validCount(degree.total)
  );
}

function validEdgeGroup(group, direction) {
  return Boolean(
    isPlainObject(group)
    && validCount(group.total)
    && (group.limited === undefined || typeof group.limited === 'boolean')
    && validCountBucket(group.byRelation ?? {})
    && Array.isArray(group.edges)
    && group.edges.every((edge) => validProfileEdge(edge, direction))
  );
}

function validProfileEdge(edge, direction) {
  const peerField = direction === 'incoming' ? 'from' : 'to';
  return Boolean(
    isPlainObject(edge)
    && hasNonEmptyString(edge.from)
    && hasNonEmptyString(edge.to)
    && hasNonEmptyString(edge.via)
    && (edge.id === undefined || hasNonEmptyString(edge.id))
    && (edge.ref === undefined || hasNonEmptyString(edge.ref))
    && (edge.resolved === undefined || typeof edge.resolved === 'boolean')
    && (edge.external === undefined || typeof edge.external === 'boolean')
    && hasNonEmptyString(edge[peerField])
    && (edge.otherKind === undefined || hasNonEmptyString(edge.otherKind))
    && (edge.otherNode === null || edge.otherNode === undefined || validNodeSummary(edge.otherNode))
  );
}

function validLineage(lineage) {
  if (!isPlainObject(lineage)) return false;
  for (const field of ['ancestors', 'descendants']) {
    if (lineage[field] !== undefined && !validLineagePage(lineage[field])) return false;
  }
  return true;
}

function validLineagePage(page) {
  return Boolean(
    isPlainObject(page)
    && validCount(page.total)
    && (page.limited === undefined || typeof page.limited === 'boolean')
    && Array.isArray(page.nodes)
    && page.nodes.every((row) => (
      isPlainObject(row)
      && hasNonEmptyString(row.slug)
      && validCount(row.distance)
      && (row.via === undefined || hasNonEmptyString(row.via))
      && validNodeSummary(row.node)
    ))
  );
}

function validSimilarMatch(match) {
  return Boolean(
    isPlainObject(match)
    && validNodeSummary(match.node)
    && Number.isFinite(match.score)
    && match.score >= 0
    && validSignalBucket(match.signals ?? {})
    && (match.sharedNeighbors === undefined || (
      Array.isArray(match.sharedNeighbors)
      && match.sharedNeighbors.every((slug) => hasNonEmptyString(slug))
    ))
  );
}

function validSignalBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((score) => Number.isFinite(score) && score >= 0);
}

function validHubRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && validCount(row.inDegree)
    && validCount(row.outDegree)
    && validCount(row.degree)
  );
}

function validCentralityRow(row) {
  return Boolean(
    validHubRow(row)
    && Number.isFinite(row.pageRank)
    && row.pageRank >= 0
    && validCount(row.bridgeScore)
  );
}

function validPage(page, rowPredicate) {
  if (!isPlainObject(page)) return false;
  if (!validCount(page.total)) return false;
  if (typeof page.limited !== 'boolean') return false;
  if (!Array.isArray(page.rows)) return false;
  return page.rows.every((row) => rowPredicate(row));
}

function validBlastRadiusNodeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validCount(row.distance)
    && isPlainObject(row.node)
    && hasNonEmptyString(row.node.slug)
    && hasNonEmptyString(row.node.kind)
    && hasNonEmptyString(row.node.title)
    && (row.node.inDegree === undefined || validCount(row.node.inDegree))
    && (row.node.outDegree === undefined || validCount(row.node.outDegree))
  );
}

function validBlastRadiusEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.traversedFrom === undefined || hasNonEmptyString(row.traversedFrom))
    && (row.traversedTo === undefined || hasNonEmptyString(row.traversedTo))
    && (row.crossDomain === undefined || typeof row.crossDomain === 'boolean')
  );
}

function validRelationCheckRecommendation(recommendation) {
  return Boolean(
    isPlainObject(recommendation)
    && RELATION_CHECK_DECISIONS.has(recommendation.decision)
    && RELATION_CHECK_RECOMMENDATION_SEVERITIES.has(recommendation.severity)
    && hasNonEmptyString(recommendation.reason)
  );
}

function validAgentRelationDecisionGuide(guide) {
  if (!Array.isArray(guide)) return false;
  const seen = new Set();
  for (const row of guide) {
    if (
      !isPlainObject(row)
      || !RELATION_CHECK_DECISIONS.has(row.decision)
      || !RELATION_CHECK_RECOMMENDATION_SEVERITIES.has(row.severity)
      || !hasNonEmptyString(row.meaning)
    ) {
      return false;
    }
    seen.add(row.decision);
  }
  return [...RELATION_CHECK_DECISIONS].every((decision) => seen.has(decision));
}

function validAgentResultContracts(contracts) {
  if (!Array.isArray(contracts)) return false;
  const allPaths = contracts.find((contract) => contract?.operation === 'all_paths');
  if (!isPlainObject(allPaths)) return false;
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
  return Array.isArray(allPaths.mustReport)
    && requiredFields.every((field) => allPaths.mustReport.includes(field))
    && Array.isArray(allPaths.partialWhen)
    && allPaths.partialWhen.some((condition) => /exhaustive=false/.test(condition))
    && allPaths.partialWhen.some((condition) => /totalPathsExact=false/.test(condition))
    && allPaths.partialWhen.some((condition) => /evidence\.status=partial/.test(condition))
    && allPaths.partialWhen.some((condition) => /evidence\.pathsComplete=false/.test(condition))
    && hasNonEmptyString(allPaths.policy)
    && /partial evidence/.test(allPaths.policy)
    && /maxHops\/types/.test(allPaths.policy);
}

function validRelationCheckEdge(edge) {
  return Boolean(
    isPlainObject(edge)
    && hasNonEmptyString(edge.from)
    && hasNonEmptyString(edge.to)
    && hasNonEmptyString(edge.via)
    && (edge.ref === undefined || hasNonEmptyString(edge.ref))
    && (edge.resolved === undefined || typeof edge.resolved === 'boolean')
    && (edge.external === undefined || typeof edge.external === 'boolean')
  );
}

function validRelationCheckPattern(pattern, { requireSimilarity = false } = {}) {
  return Boolean(
    isPlainObject(pattern)
    && hasNonEmptyString(pattern.fromKind)
    && hasNonEmptyString(pattern.relation)
    && hasNonEmptyString(pattern.toKind)
    && validCount(pattern.count)
    && validCount(pattern.resolved ?? 0)
    && validCount(pattern.external ?? 0)
    && validCount(pattern.unresolved ?? 0)
    && (!requireSimilarity || (Number.isFinite(pattern.similarity) && pattern.similarity >= 0))
    && (pattern.examples === undefined || (
      Array.isArray(pattern.examples)
      && pattern.examples.every((example) => (
        isPlainObject(example)
        && hasNonEmptyString(example.from)
        && hasNonEmptyString(example.to)
        && (example.ref === undefined || hasNonEmptyString(example.ref))
      ))
    ))
  );
}

function validRelationCheckProposedAction(result) {
  const action = result.proposedAction;
  return Boolean(
    isPlainObject(action)
    && action.tool === 'add_relation'
    && isPlainObject(action.args)
    && action.args.from === result.from
    && action.args.to === result.to
    && action.args.type === result.relation
  );
}

function validCountBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((count) => validCount(count));
}

function sumCountBucket(value) {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function validCycle(cycle) {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return false;
  const nodes = Array.isArray(cycle.nodes) ? cycle.nodes : cycle.slugs;
  if (!Array.isArray(nodes) || nodes.length < 2) return false;
  if (!nodes.every((slug) => hasNonEmptyString(slug))) return false;
  if (cycle.nodeSummaries !== undefined) {
    if (!Array.isArray(cycle.nodeSummaries) || cycle.nodeSummaries.length !== nodes.length) return false;
    for (let index = 0; index < cycle.nodeSummaries.length; index += 1) {
      if (!validPathNode(cycle.nodeSummaries[index], nodes[index])) return false;
    }
  }
  if (cycle.edges === undefined) return true;
  return Array.isArray(cycle.edges) && cycle.edges.length === nodes.length - 1;
}

function validPathEdge(edge, from, to) {
  return Boolean(
    edge
    && typeof edge === 'object'
    && !Array.isArray(edge)
    && edge.from === from
    && edge.to === to
    && hasNonEmptyString(edge.via)
  );
}

function hasNonEmptyString(...values) {
  return values.every((value) => typeof value === 'string' && value.trim().length > 0);
}

function nullableString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberValue(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countValue(value) {
  return validCount(value) ? value : Number.NaN;
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}
