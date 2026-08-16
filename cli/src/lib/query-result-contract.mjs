const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);
const MAINTENANCE_ACTION_SEVERITIES = new Set(['fail', 'warn', 'info']);
const BLAST_RADIUS_RISKS = new Set(['unknown', 'low', 'medium', 'high']);
const BLAST_RADIUS_QUALIFICATION_STATUSES = new Set([
  'unknown',
  'review_required',
  'declared_with_rationale',
]);
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
const EXPLAIN_RELATION_VERDICTS = new Set([
  'same_node',
  'direct',
  'path',
  'common_neighbor',
  'unrelated_within_hops',
]);
const PATH_DIRECTIONS = new Set(['incoming', 'outgoing', 'both', 'undirected']);
const PROJECT_SOURCE_STATUSES = new Set([
  'not_measured',
  'needs_evidence',
  'review_required',
  'invalid',
  'verified_current',
]);
const PROJECT_SOURCE_CURRENTNESS = new Set(['current', 'stale', 'unavailable']);
const MEANING_ASSESSMENT_STATUSES = new Set([
  'verified_current',
  'review_required',
  'needs_evidence',
  'invalid',
]);
const MEANING_STRUCTURE_STATUSES = new Set(['ready', 'needs_structure', 'invalid']);
const MEANING_QUESTION_STATUSES = new Set(['answered', 'partial', 'visible-gap', 'unassessed']);
const MEANING_WITNESS_STATUSES = new Set(['resolved', 'missing', 'unavailable']);
const MEANING_QUESTION_IDS = ['scope', 'domains', 'abilities', 'evidence', 'impact'];
const MEANING_REPAIR_PACKET_MAX_BYTES = 5 * 1024;

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
  if (!validProjectSourceView(result.projectSource, result.projectSlug)) {
    throw new Error('agent_brief projectSource must contain the versioned categorical source receipt view');
  }
  if (!validMeaningAssessment(result.meaningAssessment, result.projectSlug)) {
    throw new Error('agent_brief meaningAssessment must contain the categorical fail-closed project meaning view');
  }
  if (!validMeaningRepair(result.meaningRepair, result.projectSlug)) {
    throw new Error('agent_brief meaningRepair must contain the action-first human review packet');
  }
  if (!validAgentBriefDocs(result.docs)) {
    throw new Error('agent_brief docs must include workflowGuide and graphScanProofChecklist guidance');
  }
  if (!validAgentBusinessOntologyLens(result.businessOntologyLens)) {
    throw new Error('agent_brief businessOntologyLens must describe the business-first outcome-domain-capability-evidence read order');
  }
  if (!validAgentHandoffPrompt(result.handoffPrompt)) {
    throw new Error('agent_brief handoffPrompt must be a non-empty agent handoff string');
  }
  if (!validAgentCliFallbackCommands(result.cliFallbackCommands)) {
    throw new Error('agent_brief cliFallbackCommands must include non-empty ontology-atlas CLI fallback commands');
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
  if (!validAgentGraphDbQueryPack(result.graphDbQueryPack)) {
    throw new Error('agent_brief graphDbQueryPack must include graph facets, node scan, edge scan, domain coupling, and path evidence query packs');
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
  const onboardingPlaybook = result.playbooks.find((playbook) => playbook.id === 'onboarding_map');
  if (!onboardingPlaybook) {
    throw new Error('agent_brief playbooks must include onboarding_map');
  }
  for (const operation of ['query_plan', 'match_nodes', 'node_profile']) {
    if (!agentToolCallsIncludeOperation(onboardingPlaybook.calls, operation)) {
      throw new Error(`agent_brief onboarding_map playbook must include ${operation}`);
    }
  }
  if (!agentToolCallsIncludeQueryPlanTarget(onboardingPlaybook.calls, 'match_nodes')) {
    throw new Error('agent_brief onboarding_map playbook must include query_plan(match_nodes)');
  }
  const couplingPlaybook = result.playbooks.find((playbook) => playbook.id === 'coupling_audit');
  if (!couplingPlaybook) {
    throw new Error('agent_brief playbooks must include coupling_audit');
  }
  for (const operation of ['query_plan', 'centrality', 'match_edges']) {
    if (!agentToolCallsIncludeOperation(couplingPlaybook.calls, operation)) {
      throw new Error(`agent_brief coupling_audit playbook must include ${operation}`);
    }
  }
  if (!agentToolCallsIncludeQueryPlanTarget(couplingPlaybook.calls, 'match_edges')) {
    throw new Error('agent_brief coupling_audit playbook must include query_plan(match_edges)');
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
  for (const operation of ['health', 'cycles', 'growth_plan', 'maintenance_plan']) {
    if (!agentToolCallsIncludeOperation(syncGuardrail.calls, operation)) {
      throw new Error(`agent_brief writeGuardrails must include post_change_sync ${operation}`);
    }
  }
  if (!Array.isArray(result.writePolicy) || !result.writePolicy.every((row) => hasNonEmptyString(row))) {
    throw new Error('agent_brief writePolicy must be an array of non-empty strings');
  }
  if (!result.writePolicy.some((row) => /relation_check/.test(row) && /add_relation/.test(row))) {
    throw new Error('agent_brief writePolicy must mention relation_check before add_relation');
  }
  if (!validAgentResultContracts(result.resultContracts)) {
    throw new Error('agent_brief resultContracts must include all_paths completeness plus match_nodes/match_edges followUp policies');
  }
  if (!validAgentRelationDecisionGuide(result.relationDecisionGuide)) {
    throw new Error('agent_brief relationDecisionGuide must cover relation_check decision outcomes');
  }
  return result;
}

function validProjectSourceView(value, projectSlug) {
  if (
    !hasNonEmptyString(projectSlug)
    || !isPlainObject(value)
    || value.contractVersion !== 1
    || value.projectSlug !== projectSlug
    || !PROJECT_SOURCE_STATUSES.has(value.status)
    || !PROJECT_SOURCE_CURRENTNESS.has(value.currentness)
    || !(value.measuredAt === null || hasNonEmptyString(value.measuredAt))
    || !validCount(value.bindingCardinality)
    || !validProjectSourceGap(value.topGap)
    || !validProjectSourceAction(value.nextAction)
    || containsPrivateSourceField(value)
  ) return false;

  if (value.receipt === null) {
    return ['not_measured', 'invalid'].includes(value.status);
  }
  const receipt = value.receipt;
  if (
    !isPlainObject(receipt)
    || receipt.contractVersion !== value.contractVersion
    || receipt.projectSlug !== projectSlug
    || !['needs_evidence', 'review_required', 'verified_current'].includes(receipt.status)
    || receipt.currentness !== 'current'
    || !hasNonEmptyString(receipt.sourceId)
    || !['git', 'folder'].includes(receipt.sourceKind)
    || !hasNonEmptyString(receipt.sourceRevision)
    || !hasNonEmptyString(receipt.sourceFingerprint)
    || !hasNonEmptyString(receipt.graphHash)
    || !hasNonEmptyString(receipt.measuredAt)
    || !validProjectSourceGap(receipt.topGap)
    || !validProjectSourceAction(receipt.nextAction)
    || !isPlainObject(receipt.witnessSummary)
    || !['total', 'supported', 'missing'].every((field) => validCount(receipt.witnessSummary[field]))
    || receipt.witnessSummary.supported + receipt.witnessSummary.missing !== receipt.witnessSummary.total
    || !Array.isArray(receipt.witnesses)
  ) return false;
  return receipt.witnesses.every((witness) => (
    isPlainObject(witness)
    && hasNonEmptyString(witness.id)
    && hasNonEmptyString(witness.nodeSlug)
    && hasNonEmptyString(witness.role)
    && hasNonEmptyString(witness.path)
    && !/^(?:\/|[A-Za-z]:[\\/]|\.\.\/)/.test(witness.path)
    && typeof witness.supported === 'boolean'
  ));
}

function validMeaningAssessment(value, projectSlug) {
  const rootKeys = ['contract', 'projectSlug', 'status', 'dimensions', 'topGap', 'nextAction', 'provenance'];
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, rootKeys)
    || value.contract !== 'meaningAssessment:v1'
    || value.projectSlug !== projectSlug
    || !MEANING_ASSESSMENT_STATUSES.has(value.status)
  ) return false;

  const dimensions = value.dimensions;
  const structure = dimensions?.structure;
  const competency = dimensions?.competency;
  const source = dimensions?.source;
  if (
    !isPlainObject(dimensions)
    || !hasExactKeys(dimensions, ['structure', 'competency', 'source'])
    || !isPlainObject(structure)
    || !hasExactKeys(structure, ['status', 'basis'])
    || !MEANING_STRUCTURE_STATUSES.has(structure.status)
    || structure.basis !== 'structure_only'
    || !isPlainObject(competency)
    || !hasExactKeys(competency, ['status', 'questions'])
    || !['answered', 'needs_evidence'].includes(competency.status)
    || !Array.isArray(competency.questions)
    || competency.questions.length !== MEANING_QUESTION_IDS.length
    || !isPlainObject(source)
    || !hasExactKeys(source, ['status', 'currentness'])
    || !PROJECT_SOURCE_STATUSES.has(source.status)
    || !PROJECT_SOURCE_CURRENTNESS.has(source.currentness)
  ) return false;

  for (let index = 0; index < competency.questions.length; index += 1) {
    const question = competency.questions[index];
    if (
      !isPlainObject(question)
      || !hasExactKeys(question, ['id', 'status', 'witnessStatus'])
      || question.id !== MEANING_QUESTION_IDS[index]
      || !MEANING_QUESTION_STATUSES.has(question.status)
      || !MEANING_WITNESS_STATUSES.has(question.witnessStatus)
    ) return false;
  }
  const allAnswered = competency.questions.every(
    (question) => question.status === 'answered' && question.witnessStatus === 'resolved',
  );
  if ((competency.status === 'answered') !== allAnswered) return false;

  if (value.topGap !== null && (
    !isPlainObject(value.topGap)
    || !hasAllowedKeys(value.topGap, ['dimension', 'id', 'questionId'])
    || !hasNonEmptyString(value.topGap.dimension, value.topGap.id)
    || (value.topGap.questionId !== undefined && !hasNonEmptyString(value.topGap.questionId))
  )) return false;
  if (
    !isPlainObject(value.nextAction)
    || !hasAllowedKeys(value.nextAction, ['id', 'target'])
    || !hasNonEmptyString(value.nextAction.id)
    || (value.nextAction.target !== undefined && !hasNonEmptyString(value.nextAction.target))
  ) return false;

  const provenanceFields = [
    'evaluator',
    'graphHash',
    'competencyContract',
    'competencyEvaluator',
    'competencyGraphHash',
    'witnessInventoryContract',
    'witnessInventoryGraphHash',
    'witnessInventorySourceFingerprint',
    'sourceGraphHash',
    'sourceReceiptContractVersion',
    'sourceId',
    'sourceRevision',
    'sourceFingerprint',
    'sourceMeasuredAt',
    'sourceGapId',
  ];
  const provenance = value.provenance;
  return isPlainObject(provenance)
    && hasExactKeys(provenance, provenanceFields)
    && hasNonEmptyString(provenance.evaluator)
    && provenanceFields
      .filter((field) => !['evaluator', 'sourceReceiptContractVersion'].includes(field))
      .every((field) => provenance[field] === null || hasNonEmptyString(provenance[field]))
    && (provenance.sourceReceiptContractVersion === null || provenance.sourceReceiptContractVersion === 1);
}

function validMeaningRepair(value, projectSlug) {
  const rootKeys = [
    'contract',
    'status',
    'projectSlug',
    'blockedBy',
    'primaryQuestion',
    'questionsNeedingReview',
    'provenance',
    'reviewRevision',
    'questions',
    'workflow',
    'stopWhen',
    'writePolicy',
  ];
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, rootKeys)
    || value.contract !== 'meaningRepair:v2'
    || value.projectSlug !== projectSlug
    || new TextEncoder().encode(JSON.stringify(value)).byteLength > MEANING_REPAIR_PACKET_MAX_BYTES
    || !['blocked', 'human_review_required', 'not_needed'].includes(value.status)
    || containsPrivateSourceField(value)
    || !Array.isArray(value.questionsNeedingReview)
    || value.questionsNeedingReview.some((id) => !['abilities', 'evidence'].includes(id))
    || new Set(value.questionsNeedingReview).size !== value.questionsNeedingReview.length
    || !Array.isArray(value.workflow)
    || !Array.isArray(value.stopWhen)
    || value.stopWhen.length === 0
    || value.stopWhen.some((id) => !hasNonEmptyString(id))
    || !isPlainObject(value.writePolicy)
    || !hasExactKeys(value.writePolicy, ['humanApprovalRequired', 'automaticWrite', 'automaticFinalize'])
    || value.writePolicy.humanApprovalRequired !== true
    || value.writePolicy.automaticWrite !== false
    || value.writePolicy.automaticFinalize !== false
  ) return false;
  if (value.status === 'blocked') {
    return hasNonEmptyString(value.blockedBy)
      && value.primaryQuestion === null
      && value.questionsNeedingReview.length === 0
      && value.provenance === null
      && value.reviewRevision === null
      && value.questions === null
      && value.workflow.length === 0;
  }
  if (
    value.blockedBy !== null
    || !(value.primaryQuestion === null || ['abilities', 'evidence'].includes(value.primaryQuestion))
    || !isPlainObject(value.provenance)
    || !hasExactKeys(value.provenance, [
      'graphHash', 'sourceFingerprint', 'sourceMeasuredAt', 'sourceCurrentness',
    ])
    || !hasNonEmptyString(
      value.provenance.graphHash,
      value.provenance.sourceFingerprint,
      value.provenance.sourceMeasuredAt,
    )
    || value.provenance.sourceCurrentness !== 'current'
    || !/^sha256:[a-f0-9]{64}$/.test(value.reviewRevision)
    || !isPlainObject(value.questions)
    || !hasExactKeys(value.questions, ['abilities', 'evidence'])
  ) return false;
  const abilities = value.questions.abilities;
  const evidence = value.questions.evidence;
  if (
    !validMeaningRepairQuestion(abilities, 'typed_containment', 'structural_candidates_only')
    || !validMeaningRepairQuestion(evidence, 'current_source_canonical_path', 'source_path_candidates_only')
  ) return false;
  if (value.status === 'not_needed') {
    return value.primaryQuestion === null
      && value.questionsNeedingReview.length === 0
      && value.workflow.length === 0;
  }
  return value.questionsNeedingReview.length > 0
    && value.primaryQuestion === value.questionsNeedingReview[0]
    && validMeaningRepairWorkflow(value.workflow, value, projectSlug);
}

function validMeaningRepairQuestion(value, basis, state) {
  if (
    !isPlainObject(value)
    || !hasExactKeys(value, ['basis', 'answerStatus', 'targetCount', 'review'])
    || value.basis !== basis
    || !MEANING_QUESTION_STATUSES.has(value.answerStatus)
    || !validCount(value.targetCount)
    || !isPlainObject(value.review)
    || !hasExactKeys(value.review, [
      'state', 'alreadyDeclared', 'candidateAdditions', 'declaredWithoutSupport', 'unresolved',
    ])
    || value.review.state !== state
    || !validCount(value.review.alreadyDeclared)
    || !validCount(value.review.candidateAdditions)
    || !validCount(value.review.declaredWithoutSupport)
    || !validCount(value.review.unresolved)
    || value.review.alreadyDeclared
      + value.review.candidateAdditions
      + value.review.declaredWithoutSupport
      + value.review.unresolved !== value.targetCount
  ) return false;
  return true;
}

function validMeaningRepairWorkflow(workflow, repair, projectSlug) {
  const steps = [
    'read_review_inputs',
    'human_semantic_approval',
    'write_approved_project_body',
    'verify',
    'refresh_conflict_guard',
    'finalize',
  ];
  const shapeValid = workflow.length === steps.length && workflow.every((row, index) => (
    isPlainObject(row)
    && row.step === steps[index]
    && Array.isArray(row.calls)
    && row.calls.every((call) => (
      isPlainObject(call)
      && hasNonEmptyString(call.tool)
      && isPlainObject(call.arguments)
    ))
  ));
  if (!shapeValid) return false;
  const readStep = workflow[0];
  if (
    !hasExactKeys(readStep, ['step', 'derivation', 'calls'])
    || !isPlainObject(readStep.derivation)
    || !hasExactKeys(readStep.derivation, ['operation', 'order'])
    || readStep.derivation.operation !== 'meaning_repair_review'
    || readStep.derivation.order !== 'project_then_domains_then_capabilities'
    || readStep.calls.length !== 1
  ) return false;
  const call = readStep.calls[0];
  return hasExactKeys(call, ['tool', 'arguments'])
    && call.tool === 'query_ontology'
    && hasExactKeys(call.arguments, [
      'operation',
      'project',
      'expectedGraphHash',
      'expectedSourceFingerprint',
      'reviewRevision',
    ])
    && call.arguments.operation === 'meaning_repair_review'
    && call.arguments.project === projectSlug
    && call.arguments.expectedGraphHash === repair.provenance.graphHash
    && call.arguments.expectedSourceFingerprint === repair.provenance.sourceFingerprint
    && call.arguments.reviewRevision === repair.reviewRevision;
}

function validProjectSourceGap(value) {
  return value === null || (isPlainObject(value) && hasNonEmptyString(value.id));
}

function validProjectSourceAction(value) {
  return isPlainObject(value) && hasNonEmptyString(value.id);
}

function containsPrivateSourceField(value) {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(containsPrivateSourceField);
  for (const [key, nested] of Object.entries(value)) {
    if (['rootPath', 'remote', 'remoteUrl', 'privateRemote'].includes(key)) return true;
    if (containsPrivateSourceField(nested)) return true;
  }
  return false;
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

export function assertExplainRelationShape(result) {
  assertQueryOperation(result, 'explain_relation');
  for (const field of ['from', 'to']) {
    if (!hasNonEmptyString(result[field])) {
      throw new Error(`explain_relation ${field} must be a non-empty string`);
    }
  }
  if (!validNodeSummary(result.fromNode)) {
    throw new Error('explain_relation fromNode must be a valid node summary');
  }
  if (!validNodeSummary(result.toNode)) {
    throw new Error('explain_relation toNode must be a valid node summary');
  }
  if (!EXPLAIN_RELATION_VERDICTS.has(result.verdict)) {
    throw new Error(`explain_relation verdict must be one of: ${[...EXPLAIN_RELATION_VERDICTS].join(', ')}`);
  }
  if (!isPlainObject(result.domains) || !nullableString(result.domains.from) || !nullableString(result.domains.to) || typeof result.domains.sameDomain !== 'boolean') {
    throw new Error('explain_relation domains must include from/to nullable strings and sameDomain boolean');
  }
  if (!isPlainObject(result.direct) || !validCount(result.direct.total) || !Array.isArray(result.direct.edges)) {
    throw new Error('explain_relation direct must include total and edges');
  }
  if (result.direct.edges.length > result.direct.total) {
    throw new Error('explain_relation direct.edges length must not exceed total');
  }
  for (let index = 0; index < result.direct.edges.length; index += 1) {
    if (!validExplainDirectEdge(result.direct.edges[index], result.from, result.to)) {
      throw new Error(`explain_relation direct.edges[${index}] has an invalid direct-edge shape`);
    }
  }
  if (!validExplainShortestPath(result.shortestPath)) {
    throw new Error('explain_relation shortestPath has an invalid path shape');
  }
  if (!isPlainObject(result.commonNeighbors) || !validCount(result.commonNeighbors.total) || typeof result.commonNeighbors.limited !== 'boolean' || !Array.isArray(result.commonNeighbors.rows)) {
    throw new Error('explain_relation commonNeighbors must include total, limited, and rows');
  }
  if (result.commonNeighbors.rows.length > result.commonNeighbors.total) {
    throw new Error('explain_relation commonNeighbors.rows length must not exceed total');
  }
  for (let index = 0; index < result.commonNeighbors.rows.length; index += 1) {
    if (!validExplainCommonNeighbor(result.commonNeighbors.rows[index])) {
      throw new Error(`explain_relation commonNeighbors.rows[${index}] has an invalid common-neighbor shape`);
    }
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
  for (const field of ['edgeScans', 'nodeScans', 'reachableWithinDepth', 'potentialPathUpperBound', 'totalMatches', 'resultUpperBound']) {
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

export function assertMatchNodesShape(result) {
  assertQueryOperation(result, 'match_nodes');
  if (!isPlainObject(result.filters)) {
    throw new Error('match_nodes filters must be an object');
  }
  if (!validCount(result.totalMatches)) {
    throw new Error('match_nodes totalMatches must be a non-negative integer');
  }
  if (typeof result.limited !== 'boolean') {
    throw new Error('match_nodes limited must be a boolean');
  }
  if (!Array.isArray(result.nodes)) {
    throw new Error('match_nodes nodes must be an array');
  }
  if (result.nodes.length > result.totalMatches) {
    throw new Error('match_nodes nodes length must not exceed totalMatches');
  }
  for (let index = 0; index < result.nodes.length; index += 1) {
    if (!validMatchNodeRow(result.nodes[index])) {
      throw new Error(`match_nodes nodes[${index}] has an invalid node row shape`);
    }
  }
  if (result.followUp !== undefined && !validMatchNodesFollowUp(result.followUp)) {
    throw new Error('match_nodes followUp must contain a focusSlug, reason, query_ontology calls, and CLI fallback commands');
  }
  return result;
}

export function assertMatchEdgesShape(result) {
  assertQueryOperation(result, 'match_edges');
  if (!isPlainObject(result.filters)) {
    throw new Error('match_edges filters must be an object');
  }
  if (!validCount(result.totalMatches)) {
    throw new Error('match_edges totalMatches must be a non-negative integer');
  }
  if (typeof result.limited !== 'boolean') {
    throw new Error('match_edges limited must be a boolean');
  }
  if (!Array.isArray(result.edges)) {
    throw new Error('match_edges edges must be an array');
  }
  if (result.edges.length > result.totalMatches) {
    throw new Error('match_edges edges length must not exceed totalMatches');
  }
  for (let index = 0; index < result.edges.length; index += 1) {
    if (!validMatchEdgeRow(result.edges[index])) {
      throw new Error(`match_edges edges[${index}] has an invalid edge row shape`);
    }
  }
  if (result.followUp !== undefined && !validMatchEdgesFollowUp(result.followUp)) {
    throw new Error('match_edges followUp must contain a focusEdge, reason, query_ontology calls, and CLI fallback commands');
  }
  return result;
}

export function assertDomainMatrixShape(result) {
  assertQueryOperation(result, 'domain_matrix');
  if (result.project !== null && result.project !== undefined && !hasNonEmptyString(result.project)) {
    throw new Error('domain_matrix project must be null or a non-empty string');
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('domain_matrix summary must be an object');
  }
  for (const field of [
    'domains',
    'nodes',
    'assignedNodes',
    'unassignedNodes',
    'crossDomainEdges',
    'selfDomainEdges',
    'externalEdges',
    'unresolvedEdges',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`domain_matrix summary.${field} must be a non-negative integer`);
    }
  }
  if (result.summary.assignedNodes + result.summary.unassignedNodes !== result.summary.nodes) {
    throw new Error('domain_matrix assignedNodes + unassignedNodes must equal nodes');
  }
  if (!Array.isArray(result.domains)) {
    throw new Error('domain_matrix domains must be an array');
  }
  if (result.domains.length > result.summary.domains) {
    throw new Error('domain_matrix domains length must not exceed summary.domains');
  }
  for (let index = 0; index < result.domains.length; index += 1) {
    if (!validDomainMatrixDomainRow(result.domains[index])) {
      throw new Error(`domain_matrix domains[${index}] has an invalid domain row shape`);
    }
  }
  if (!validPage(result.connections, validDomainMatrixConnectionRow)) {
    throw new Error('domain_matrix connections must be a page with valid connection rows');
  }
  return result;
}

export function assertReachabilityShape(result) {
  assertQueryOperation(result, 'reachability');
  if (!hasNonEmptyString(result.start)) {
    throw new Error('reachability start must be a non-empty string');
  }
  if (!validNodeSummary(result.node)) {
    throw new Error('reachability node must be a valid node summary');
  }
  if (!['incoming', 'outgoing', 'both'].includes(result.direction)) {
    throw new Error('reachability direction must be one of: incoming, outgoing, both');
  }
  if (!validCount(result.depth)) {
    throw new Error('reachability depth must be a non-negative integer');
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('reachability summary must be an object');
  }
  for (const field of ['reachableNodes', 'traversedEdges', 'layers', 'terminalNodes']) {
    if (!validCount(result.summary[field])) {
      throw new Error(`reachability summary.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['byKind', 'byRelation']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`reachability ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!Array.isArray(result.layers)) {
    throw new Error('reachability layers must be an array');
  }
  for (let index = 0; index < result.layers.length; index += 1) {
    if (!validReachabilityLayer(result.layers[index])) {
      throw new Error(`reachability layers[${index}] has an invalid layer shape`);
    }
  }
  if (!validPage(result.paths, validReachabilityPathRow)) {
    throw new Error('reachability paths must be a page with valid path rows');
  }
  if (!Array.isArray(result.terminalNodes) || !result.terminalNodes.every((node) => validNodeSummary(node))) {
    throw new Error('reachability terminalNodes must be an array of node summaries');
  }
  if (!validPage(result.edges, validBlastRadiusEdgeRow)) {
    throw new Error('reachability edges must be a page with valid edge rows');
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
  if (
    !isPlainObject(result.qualification)
    || !BLAST_RADIUS_QUALIFICATION_STATUSES.has(result.qualification.status)
    || result.qualification.basis !== 'declared_dependencies'
    || result.qualification.completeness !== 'unknown'
    || result.qualification.sourceBacked !== false
  ) {
    throw new Error('blast_radius qualification must report declared dependency evidence and unknown completeness');
  }
  for (const field of [
    'declaredEdges',
    'declaredWithRationaleEdges',
    'reviewRequiredEdges',
    'sourceBackedEdges',
  ]) {
    if (!validCount(result.qualification[field])) {
      throw new Error(`blast_radius qualification.${field} must be a non-negative integer`);
    }
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
  if (result.exists && result.approvalGate !== null && result.approvalGate !== undefined) {
    throw new Error('relation_check existing edge must not include approvalGate');
  }
  if (!result.exists && result.relation === 'dependencies') {
    if (result.proposedAction !== null) {
      throw new Error('relation_check pending depends_on must not include proposedAction before semantic approval');
    }
    if (!validRelationCheckApprovalGate(result.approvalGate)) {
      throw new Error('relation_check pending depends_on must include the non-writing semantic approvalGate');
    }
  } else if (!result.exists && !validRelationCheckProposedAction(result)) {
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

function agentToolCallsIncludeQueryPlanTarget(calls, targetOperation) {
  return Array.isArray(calls)
    && calls.some(
      (call) =>
        call?.tool === 'query_ontology'
        && call?.arguments?.operation === 'query_plan'
        && call?.arguments?.targetOperation === targetOperation,
    );
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

function validAgentGraphDbQueryPack(pack) {
  if (!Array.isArray(pack) || pack.length === 0) return false;
  const byId = new Map();
  for (const item of pack) {
    if (
      !isPlainObject(item) ||
      !hasNonEmptyString(item.id, item.intent, item.goal) ||
      !Array.isArray(item.calls) ||
      item.calls.length === 0 ||
      !item.calls.every((call) => validAgentToolCall(call))
    ) {
      return false;
    }
    byId.set(item.id, item);
  }
  const required = ['graph_facets', 'node_scan', 'edge_scan', 'domain_coupling', 'path_evidence', 'business_questions'];
  if (required.some((id) => !byId.has(id))) return false;
  if (!agentToolCallsIncludeOperation(byId.get('graph_facets').calls, 'facets')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('graph_facets').calls, 'schema')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('node_scan').calls, 'match_nodes')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('node_scan').calls, 'match_nodes')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('edge_scan').calls, 'match_edges')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('edge_scan').calls, 'match_edges')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('domain_coupling').calls, 'domain_matrix')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('domain_coupling').calls, 'centrality')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('domain_coupling').calls, 'centrality')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('path_evidence').calls, 'all_paths')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('path_evidence').calls, 'all_paths')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('path_evidence').calls, 'explain_relation')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('business_questions').calls, 'facets')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('business_questions').calls, 'match_nodes')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('business_questions').calls, 'match_nodes')) return false;
  if (!agentToolCallsIncludeOperation(byId.get('business_questions').calls, 'domain_matrix')) return false;
  if (!agentToolCallsIncludeQueryPlanTarget(byId.get('business_questions').calls, 'match_edges')) return false;
  return agentToolCallsIncludeOperation(byId.get('business_questions').calls, 'match_edges');
}

function validAgentBusinessOntologyLens(lens) {
  if (!isPlainObject(lens)) return false;
  if (lens.policy !== 'business-first') return false;
  if (!Array.isArray(lens.readOrder) || lens.readOrder.join('\0') !== ['outcome', 'domain', 'capability', 'element'].join('\0')) {
    return false;
  }
  for (const field of ['businessDomains', 'capabilityOutcomes', 'implementationEvidence']) {
    if (!Array.isArray(lens[field]) || !lens[field].every((row) => typeof row === 'string')) {
      return false;
    }
  }
  if (
    !Array.isArray(lens.decisionQuestions) ||
    lens.decisionQuestions.length < 4 ||
    !lens.decisionQuestions.every((row) => hasNonEmptyString(row))
  ) {
    return false;
  }
  if (!lens.decisionQuestions.some((row) => /business outcome should this ontology explain or improve/i.test(row))) return false;
  if (!lens.decisionQuestions.some((row) => /business\/product domain boundary/i.test(row))) return false;
  if (!lens.decisionQuestions.some((row) => /capability claim/i.test(row))) return false;
  if (!lens.decisionQuestions.some((row) => /implementation evidence proves or disproves that capability/i.test(row))) return false;
  return Array.isArray(lens.guidance)
    && lens.guidance.every((row) => hasNonEmptyString(row))
    && lens.guidance.some((row) => /business outcome first/i.test(row))
    && lens.guidance.some((row) => /do not treat paths, APIs, routes, or commands as the ontology root/i.test(row));
}

function validAgentHandoffPrompt(value) {
  return hasNonEmptyString(value)
    && /ontology-atlas MCP server/.test(value)
    && /first-contact MCP calls/i.test(value)
    && /CLI fallback commands/.test(value)
    && /Graph DB query pack/.test(value)
    && /Kind classification contract before writing frontmatter/.test(value)
    && /Do not classify from the label alone/.test(value)
    && /domain: shared vocabulary boundary/.test(value)
    && /capability: user-visible behavior/.test(value)
    && /element: concrete implementation part/.test(value)
    && /unknown: temporary review signal/.test(value)
    && /High-confidence gate/.test(value)
    && /Containment spine/.test(value)
    && /Color contract/.test(value)
    && /source path, symbol, route, command, or MCP tool evidence/.test(value)
    && /why not the nearest adjacent kind/.test(value)
    && /similar_nodes/.test(value)
    && /Investigation playbooks/.test(value)
    && /Traversal strategy/.test(value)
    && /Write guardrails/.test(value)
    && /relation_check/.test(value)
    && /add_relation/.test(value);
}

function validAgentBriefDocs(value) {
  if (!isPlainObject(value) || !isPlainObject(value.workflowGuide)) return false;
  const guide = value.workflowGuide;
  if (
    !hasNonEmptyString(guide.path, guide.title, guide.description) ||
    guide.path !== 'docs/AGENT-GRAPH-WORKFLOW.md'
  ) {
    return false;
  }
  if (!validAgentModeComparison(value.modeComparison)) {
    return false;
  }
  if (!Array.isArray(value.graphScanProofChecklist) || value.graphScanProofChecklist.length < 4) {
    return false;
  }
  const byId = new Map(value.graphScanProofChecklist.map((row) => [row?.id, row]));
  const required = [
    ['report_scan_scope', ['totalMatches', 'limited']],
    ['prove_node_rows', ['node_profile', 'blast_radius']],
    ['prove_edge_rows', ['explain_relation', 'path', 'relation_check']],
    ['prove_path_completeness', ['evidence.pathsComplete']],
  ];
  for (const [id, evidence] of required) {
    const row = byId.get(id);
    if (!isPlainObject(row) || !hasNonEmptyString(row.id, row.label) || !Array.isArray(row.evidence)) {
      return false;
    }
    for (const item of evidence) {
      if (!row.evidence.includes(item)) return false;
    }
  }
  return true;
}

function validAgentModeComparison(value) {
  if (!Array.isArray(value) || value.length < 4) return false;
  const byId = new Map(value.map((row) => [row?.id, row]));
  const required = [
    ['cli_only', ['CLI-only', 'terminal-only', 'graph DB pack']],
    ['mcp_connected', ['MCP-connected', 'structured repair fields', 'write guardrails']],
    ['graph_db_pack', ['Graph DB pack', 'database-style graph exploration', 'proof follow-ups']],
    ['setup_gate', ['Setup gate', 'JSON readiness', 'restart guidance']],
  ];
  for (const [id, fragments] of required) {
    const row = byId.get(id);
    if (!isPlainObject(row) || !hasNonEmptyString(row.id, row.label, row.when, row.gives)) {
      return false;
    }
    const haystack = `${row.label}\n${row.when}\n${row.gives}`;
    for (const fragment of fragments) {
      if (!haystack.includes(fragment)) return false;
    }
  }
  return true;
}

/**
 * 「MCP 가 없을 때 이걸 쓰세요」 줄이 **실행 가능한 모양**인가.
 *
 * ⚠️ 종전 검사는 `^ontology-atlas\s` 를 **요구**했다 — 그 이름의 전역 명령은
 * 없는데(레지스트리 발행 폐기, 2026-07-27 원장), 그러니 이 검사는 거짓말을
 * 막는 게 아니라 **강제하고 있었다.** 실제로 붙여넣으면 `command not found` 다
 * (2026-08-17 실측).
 *
 * 지금 받는 것은 실행되는 모양(`node <…>/cli/src/index.mjs <sub> …`)이다.
 * 옛 모양은 **거절한다** — 받아 주면 그 거짓말이 다시 돌아온다.
 */
function validAgentCliFallbackCommands(commands) {
  return Array.isArray(commands)
    && commands.length > 0
    && commands.every(
      (command) =>
        hasNonEmptyString(command) && /^node\s+\S*cli\/src\/index\.mjs\s+\S/.test(command),
    );
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

/**
 * 백링크 한 행 — **근거는 둘 중 하나면 된다.**
 *
 * 종전엔 `matchedKeys` 를 무조건 요구했다. 그런데 서버는 본문 링크
 * (`[[slug]]` · `(slug.md)` · `/slug.md`)로만 걸린 행에 `matchedKeys` 를
 * **넣지 않고** `matchedInBody: true` 를 넣는다(`mcp/src/vault.mjs:1419-1420`,
 * outputSchema 의 `required` 도 `slug·kind·title·mtime` 넷뿐이다). 그래서 CLI
 * 검증기가 서버보다 **엄격해져** 정상 응답을 거부했다.
 *
 * 증상은 조용하지 않았다 — `init` 직후 3번째 명령에서 종료 코드 2 와
 * "invalid backlink shape" 라는 내부 계약 문구가 나왔다. 게다가 스타터
 * 문서(`domains/example-domain.md`)가 스스로 `domains/auth.md` 를 안내하므로,
 * 안내대로 따른 사람이 정확히 이 경로를 밟는다.
 *
 * **왜 dogfood 볼트가 못 잡았나**: 이 저장소의 볼트는 참조가 전부 frontmatter
 * 로 배선돼 있어 `matchedKeys` 가 항상 찬다. 본문 링크만으로 걸리는 행은
 * `cli/` 아래 어떤 픽스처에도 없었다 — 그래서 통과했다.
 *
 * 규칙의 정본은 `mcp/scripts/verify.mjs:5047` 이고 여기 옮긴 것이다:
 * 근거가 **하나도 없는** 행은 여전히 거부한다(왜 걸렸는지 못 말하는 백링크는
 * 백링크가 아니다).
 */
function validBacklinkRow(row) {
  if (!validNodeSummary(row)) return false;
  if (row.matchedKeys !== undefined) {
    if (!Array.isArray(row.matchedKeys)) return false;
    if (!row.matchedKeys.every((key) => hasNonEmptyString(key))) return false;
  }
  if (row.matchedInBody !== undefined && typeof row.matchedInBody !== 'boolean') return false;
  const hasKeys = Array.isArray(row.matchedKeys) && row.matchedKeys.length > 0;
  return hasKeys || row.matchedInBody === true;
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

function validMatchNodeRow(row) {
  return Boolean(
    validNodeSummary(row)
    && validCount(row.degree)
    && (row.inDegree === undefined || validCount(row.inDegree))
    && (row.outDegree === undefined || validCount(row.outDegree))
    && (row.domain === undefined || typeof row.domain === 'string')
  );
}

function validMatchNodesFollowUp(followUp) {
  return Boolean(
    isPlainObject(followUp)
    && hasNonEmptyString(followUp.focusSlug)
    && hasNonEmptyString(followUp.reason)
    && Array.isArray(followUp.calls)
    && followUp.calls.length > 0
    && followUp.calls.every((call) => (
      validAgentToolCall(call)
      && hasNonEmptyString(call.id)
      && hasNonEmptyString(call.label)
    ))
    && validAgentCliFallbackCommands(followUp.cliFallbackCommands)
  );
}

function validMatchEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && validNodeSummary(row.fromNode)
    && (row.toNode === null || row.toNode === undefined || validNodeSummary(row.toNode))
    && hasNonEmptyString(row.toKind)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.ref === undefined || hasNonEmptyString(row.ref))
    && (row.resolved === undefined || typeof row.resolved === 'boolean')
    && (row.external === undefined || typeof row.external === 'boolean')
  );
}

function validMatchEdgesFollowUp(followUp) {
  return Boolean(
    isPlainObject(followUp)
    && isPlainObject(followUp.focusEdge)
    && hasNonEmptyString(followUp.focusEdge.from)
    && hasNonEmptyString(followUp.focusEdge.to)
    && hasNonEmptyString(followUp.focusEdge.via)
    && hasNonEmptyString(followUp.reason)
    && Array.isArray(followUp.calls)
    && followUp.calls.length > 0
    && followUp.calls.every((call) => (
      validAgentToolCall(call)
      && hasNonEmptyString(call.id)
      && hasNonEmptyString(call.label)
    ))
    && validAgentCliFallbackCommands(followUp.cliFallbackCommands)
  );
}

function validDomainMatrixDomainRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validNodeSummary(row.node)
    && row.node.slug === row.slug
    && validCount(row.nodes)
    && validCount(row.outgoing)
    && validCount(row.incoming)
    && validCount(row.selfEdges)
    && validCount(row.externalEdges)
    && validCount(row.unresolvedEdges)
  );
}

function validDomainMatrixConnectionRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && validCount(row.count)
    && row.count > 0
    && validCountBucket(row.byRelation)
    && sumCountBucket(row.byRelation) === row.count
    && validNodeSummary(row.fromNode)
    && row.fromNode.slug === row.from
    && validNodeSummary(row.toNode)
    && row.toNode.slug === row.to
    && Array.isArray(row.examples)
    && row.examples.length <= row.count
    && row.examples.every(validCompiledEdgeRow)
  );
}

function validExplainDirectEdge(row, from, to) {
  return Boolean(
    validCompiledEdgeRow(row)
    && ((row.from === from && row.to === to && row.direction === 'outgoing')
      || (row.from === to && row.to === from && row.direction === 'incoming'))
    && validNodeSummary(row.fromNode)
    && validNodeSummary(row.toNode)
  );
}

function validExplainShortestPath(path) {
  if (!isPlainObject(path)) return false;
  if (typeof path.found !== 'boolean') return false;
  if (!PATH_DIRECTIONS.has(path.direction)) return false;
  if (!validCount(path.maxHops)) return false;
  if (path.hopCount !== null && !validCount(path.hopCount)) return false;
  if (!Array.isArray(path.hops)) return false;
  if (!Array.isArray(path.nodes)) return false;
  if (!Array.isArray(path.edges)) return false;
  if (!path.found) {
    return path.hopCount === null && path.hops.length === 0 && path.nodes.length === 0 && path.edges.length === 0;
  }
  if (path.hops.length === 0 || path.hops.some((hop) => !hasNonEmptyString(hop))) return false;
  if (path.hopCount !== path.hops.length - 1) return false;
  if (path.nodes.length !== path.hops.length) return false;
  for (let index = 0; index < path.nodes.length; index += 1) {
    if (!validPathNode(path.nodes[index], path.hops[index])) return false;
  }
  if (path.edges.length !== path.hops.length - 1) return false;
  for (let index = 0; index < path.edges.length; index += 1) {
    if (!validUndirectedPathEdge(path.edges[index], path.hops[index], path.hops[index + 1])) {
      return false;
    }
  }
  return true;
}

function validExplainCommonNeighbor(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validNodeSummary(row.node)
    && row.node.slug === row.slug
    && Array.isArray(row.fromEdges)
    && row.fromEdges.every(validExplainNeighborEdge)
    && Array.isArray(row.toEdges)
    && row.toEdges.every(validExplainNeighborEdge)
  );
}

function validExplainNeighborEdge(row) {
  return Boolean(
    validCompiledEdgeRow(row)
    && (row.direction === 'incoming' || row.direction === 'outgoing')
  );
}

function validCompiledEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.ref === undefined || hasNonEmptyString(row.ref))
    && (row.resolved === undefined || typeof row.resolved === 'boolean')
    && (row.external === undefined || typeof row.external === 'boolean')
  );
}

function validReachabilityLayer(layer) {
  return Boolean(
    isPlainObject(layer)
    && validCount(layer.distance)
    && validCount(layer.total)
    && Array.isArray(layer.nodes)
    && layer.nodes.every((node) => validNodeSummary(node))
  );
}

function validReachabilityPathRow(row) {
  if (!isPlainObject(row)) return false;
  if (!hasNonEmptyString(row.slug)) return false;
  if (!validCount(row.distance)) return false;
  if (!Array.isArray(row.path) || row.path.length !== row.distance + 1) return false;
  if (!row.path.every((slug) => hasNonEmptyString(slug))) return false;
  if (row.path[0] === row.slug) return false;
  if (row.path[row.path.length - 1] !== row.slug) return false;
  if (!Array.isArray(row.edges) || row.edges.length !== row.distance) return false;
  for (let index = 0; index < row.edges.length; index += 1) {
    if (!validUndirectedPathEdge(row.edges[index], row.path[index], row.path[index + 1])) {
      return false;
    }
  }
  return validNodeSummary(row.node);
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
    && (row.rationale === undefined || row.rationale === null || hasNonEmptyString(row.rationale))
    && (row.qualification === undefined || BLAST_RADIUS_QUALIFICATION_STATUSES.has(row.qualification))
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
  const validAllPaths = Array.isArray(allPaths.mustReport)
    && requiredFields.every((field) => allPaths.mustReport.includes(field))
    && Array.isArray(allPaths.partialWhen)
    && allPaths.partialWhen.some((condition) => /exhaustive=false/.test(condition))
    && allPaths.partialWhen.some((condition) => /totalPathsExact=false/.test(condition))
    && allPaths.partialWhen.some((condition) => /evidence\.status=partial/.test(condition))
    && allPaths.partialWhen.some((condition) => /evidence\.pathsComplete=false/.test(condition))
    && hasNonEmptyString(allPaths.policy)
    && /partial evidence/.test(allPaths.policy)
    && /maxHops\/types/.test(allPaths.policy);
  if (!validAllPaths) return false;

  const matchNodes = contracts.find((contract) => contract?.operation === 'match_nodes');
  if (
    !validScanResultContract(matchNodes, [
      'totalMatches',
      'limited',
      'nodes.length',
      'followUp.focusSlug',
      'followUp.calls',
      'followUp.cliFallbackCommands',
    ])
    || !/scan candidates/.test(matchNodes.policy)
    || !/node_profile/.test(matchNodes.policy)
    || !/blast_radius/.test(matchNodes.policy)
  ) {
    return false;
  }

  const matchEdges = contracts.find((contract) => contract?.operation === 'match_edges');
  return Boolean(
    validScanResultContract(matchEdges, [
      'totalMatches',
      'limited',
      'edges.length',
      'followUp.focusEdge',
      'followUp.calls',
      'followUp.cliFallbackCommands',
    ])
    && /scan candidates/.test(matchEdges.policy)
    && /explain_relation/.test(matchEdges.policy)
    && /relation_check/.test(matchEdges.policy)
  );
}

function validScanResultContract(contract, requiredFields) {
  return Boolean(
    isPlainObject(contract)
    && Array.isArray(contract.mustReport)
    && requiredFields.every((field) => contract.mustReport.includes(field))
    && Array.isArray(contract.partialWhen)
    && contract.partialWhen.some((condition) => /limited=true/.test(condition))
    && contract.partialWhen.some((condition) => /followUp missing/.test(condition))
    && hasNonEmptyString(contract.policy)
    && /followUp/.test(contract.policy)
  );
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
    && relationTypesMatch(action.args.type, result.relation)
  );
}

function validRelationCheckApprovalGate(gate) {
  return Boolean(
    isPlainObject(gate)
    && gate.status === 'semantic_approval_required'
    && gate.writeAllowed === false
    && Array.isArray(gate.required)
    && ['observable_ability', 'semantic_rationale', 'explicit_human_approval', 'why']
      .every((item) => gate.required.includes(item))
    && hasNonEmptyString(gate.next)
  );
}

function relationTypesMatch(writeType, readType) {
  if (writeType === readType) return true;
  return writeType === 'depends_on' && readType === 'dependencies';
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

function hasExactKeys(value, keys) {
  return isPlainObject(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function hasAllowedKeys(value, keys) {
  return isPlainObject(value) && Object.keys(value).every((key) => keys.includes(key));
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
