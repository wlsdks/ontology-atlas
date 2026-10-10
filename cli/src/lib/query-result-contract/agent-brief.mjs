import { AGENT_READINESS_STATUSES, assertAgentBriefCompactShape } from './agent-brief-compact.mjs';
import {
  agentToolCallsIncludeOperation,
  agentToolCallsIncludeQueryPlanTarget,
  validAgentBriefDocs,
  validAgentBusinessOntologyLens,
  validAgentCliFallbackCommands,
  validAgentEntrypoint,
  validAgentGraphDbQueryPack,
  validAgentGuardrail,
  validAgentHandoffPrompt,
  validAgentPlaybook,
  validAgentRelationDecisionGuide,
  validAgentResultContracts,
  validAgentToolCall,
  validAgentTraversalStrategy,
} from './agent-guidance.mjs';
import {
  validMeaningAssessment,
  validMeaningRepair,
  validProjectSourceView,
} from './project-source-meaning.mjs';
import { assertQueryOperation } from './query-operation.mjs';
import { hasNonEmptyString, isPlainObject, validCount } from './value-checks.mjs';
import { DIAGNOSIS_STATUSES, validHealthCheck, validNextAction } from './workspace-health.mjs';

export function assertAgentBriefResponseShape(result) {
  return result?.contract === 'agentBriefCompact:v2'
    ? assertAgentBriefCompactShape(result)
    : assertAgentBriefShape(result);
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
  // Stop a brief that contradicts itself: an agent trusts the headline number without counting the rest.
  assertBriefCountsAgree(result);
  if (!validAgentCliFallbackCommands(result.cliFallbackCommands)) {
    throw new Error('agent_brief cliFallbackCommands must include non-empty runnable CLI fallback commands');
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

export function agentBriefExitCode(result) {
  if (result?.contract === 'agentBriefCompact:v2') {
    if (!DIAGNOSIS_STATUSES.has(result.status)) return 1;
    if (!isPlainObject(result.readiness) || !AGENT_READINESS_STATUSES.has(result.readiness.status)) return 1;
    if (!validCount(result.readiness.score)) return 1;
    return result.status === 'healthy' && result.readiness.status === 'ready' ? 0 : 1;
  }
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

/**
 * Does the brief state the same number it carries? `meaning_assessment` is attached after the count is
 * taken, so the two can disagree. Pin nothing; assert they agree.
 */
export function assertBriefCountsAgree(result) {
  const stated = result?.readiness?.healthChecks;
  const carried = result?.health?.checks;
  if (typeof stated !== 'number' || !Array.isArray(carried)) return result;
  if (stated !== carried.length) {
    throw new Error(
      `agent_brief health-check counts disagree: readiness.healthChecks=${stated} but `
      + `health.checks holds ${carried.length} (${carried.map((c) => c?.id).join(', ')})`,
    );
  }
  return result;
}
