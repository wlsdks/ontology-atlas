import { formatCount } from '../output.mjs';
import {
  hasNonEmptyString,
  hasOptionalNonNegativeInteger,
  numericFieldsFailure,
} from '../value-checks.mjs';
import {
  agentBusinessOntologyLensFailure,
  agentGraphDbQueryPackFailure,
  agentGuardrailCallsFailure,
  agentRelationDecisionGuideFailure,
  agentResultContractsFailure,
  agentToolCallsFailure,
  agentToolCallsIncludeOperation,
  agentTraversalStrategyFailure,
} from './agent-brief-guidance.mjs';
import {
  agentBriefPlainObject,
  agentBriefPrivateSourceCoordinate,
  validAgentBriefMeaningAssessment,
  validAgentBriefProjectSource,
} from './agent-brief-shapes.mjs';
import {
  DIAGNOSIS_STATUSES,
  blockingNextActions,
  diagnosisHealthCheckFailure,
  diagnosisNextActionFailure,
  healthChecksSummary,
} from './diagnosis.mjs';
import { validAgentBriefMeaningRepair } from './meaning-repair.mjs';

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
  // An agent trusts the headline count without counting, so the brief must carry what it states.
  if (
    typeof parsed.readiness.healthChecks === 'number'
    && Array.isArray(parsed.health?.checks)
    && parsed.readiness.healthChecks !== parsed.health.checks.length
  ) {
    return `agent_brief health-check counts disagree: readiness.healthChecks=${parsed.readiness.healthChecks} but health.checks holds ${parsed.health.checks.length}`;
  }
  if (!agentBriefPlainObject(parsed.projectSource)) {
    return 'agent_brief response missing categorical projectSource';
  }
  if (agentBriefPrivateSourceCoordinate(parsed.projectSource)) {
    return 'agent_brief projectSource exposes private source coordinates';
  }
  if (!validAgentBriefProjectSource(parsed.projectSource, parsed.projectSlug)) {
    return 'agent_brief response malformed categorical projectSource';
  }
  if (!agentBriefPlainObject(parsed.meaningAssessment)) {
    return 'agent_brief response missing categorical meaningAssessment';
  }
  if (agentBriefPrivateSourceCoordinate(parsed.meaningAssessment)) {
    return 'agent_brief meaningAssessment exposes private source coordinates';
  }
  if (!validAgentBriefMeaningAssessment(parsed.meaningAssessment, parsed.projectSlug)) {
    return 'agent_brief response malformed categorical meaningAssessment';
  }
  if (!agentBriefPlainObject(parsed.meaningRepair)) {
    return 'agent_brief response missing meaningRepair review packet';
  }
  if (agentBriefPrivateSourceCoordinate(parsed.meaningRepair)) {
    return 'agent_brief meaningRepair exposes private source coordinates';
  }
  if (!validAgentBriefMeaningRepair(parsed.meaningRepair, parsed.projectSlug)) {
    return 'agent_brief response malformed meaningRepair review packet';
  }
  if (parsed.meaningRepair.status === 'human_review_required' && (
    parsed.nextActions?.[0]?.id !== 'review_competency_repair'
    || parsed.nextActions[0].detailContract !== parsed.meaningRepair.contract
  )) return 'agent_brief meaningRepair action must be first in nextActions';
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
    !/ontology-atlas MCP server/.test(parsed.handoffPrompt) ||
    !/first-contact MCP calls/i.test(parsed.handoffPrompt) ||
    !/When the ontology-atlas MCP server is unavailable: read the vault's Markdown files directly, write nothing to the vault/.test(parsed.handoffPrompt) ||
    !/Graph DB query pack/.test(parsed.handoffPrompt) ||
    !/Kind classification contract before writing frontmatter/.test(parsed.handoffPrompt) ||
    !/Do not classify from the label alone/.test(parsed.handoffPrompt) ||
    !/domain: shared vocabulary boundary/.test(parsed.handoffPrompt) ||
    !/capability: user-visible behavior/.test(parsed.handoffPrompt) ||
    !/element: concrete implementation part/.test(parsed.handoffPrompt) ||
    !/unknown: temporary review signal/.test(parsed.handoffPrompt) ||
    !/High-confidence gate/.test(parsed.handoffPrompt) ||
    !/Containment spine/.test(parsed.handoffPrompt) ||
    !/Color contract/.test(parsed.handoffPrompt) ||
    !/source path, symbol, route, command, or MCP tool evidence/.test(parsed.handoffPrompt) ||
    !/why not the nearest adjacent kind/.test(parsed.handoffPrompt) ||
    !/similar_nodes/.test(parsed.handoffPrompt) ||
    !/Investigation playbooks/.test(parsed.handoffPrompt) ||
    !/Traversal strategy/.test(parsed.handoffPrompt) ||
    !/plan_before_enumeration/.test(parsed.handoffPrompt) ||
    !/Write guardrails/.test(parsed.handoffPrompt) ||
    !/Result contracts/.test(parsed.handoffPrompt) ||
    !/totalPathsExact/.test(parsed.handoffPrompt) ||
    !/relation_check/.test(parsed.handoffPrompt) ||
    !/add_relations/.test(parsed.handoffPrompt)
  ) {
    return 'agent_brief response missing copyable handoffPrompt';
  }
  if (Object.hasOwn(parsed, 'cliFallbackCommands')) {
    return 'agent_brief response still prints command-line fallbacks';
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
  const businessLensFailure = agentBusinessOntologyLensFailure(parsed.businessOntologyLens);
  if (businessLensFailure) return businessLensFailure;
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
  if (!parsed.writePolicy.some((row) => /relation_check/.test(row) && /add_relations/.test(row))) {
    return 'agent_brief writePolicy missing relation_check add_relations guidance';
  }
  const resultContractsFailure = agentResultContractsFailure(parsed.resultContracts);
  if (resultContractsFailure) return resultContractsFailure;
  const decisionGuideFailure = agentRelationDecisionGuideFailure(parsed.relationDecisionGuide);
  if (decisionGuideFailure) return decisionGuideFailure;
  return null;
}
