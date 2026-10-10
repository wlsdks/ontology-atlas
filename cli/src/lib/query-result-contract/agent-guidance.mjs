import {
  RELATION_CHECK_DECISIONS,
  RELATION_CHECK_RECOMMENDATION_SEVERITIES,
} from './relation-check.mjs';
import { hasNonEmptyString, isPlainObject, validCount } from './value-checks.mjs';

export function validAgentEntrypoint(row) {
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

export function validAgentToolCall(call) {
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

export function agentToolCallsIncludeOperation(calls, operation) {
  return Array.isArray(calls)
    && calls.some((call) => call?.tool === 'query_ontology' && call?.arguments?.operation === operation);
}

export function agentToolCallsIncludeQueryPlanTarget(calls, targetOperation) {
  return Array.isArray(calls)
    && calls.some(
      (call) =>
        call?.tool === 'query_ontology'
        && call?.arguments?.operation === 'query_plan'
        && call?.arguments?.targetOperation === targetOperation,
    );
}

export function validAgentPlaybook(playbook) {
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

export function validAgentGraphDbQueryPack(pack) {
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

export function validAgentBusinessOntologyLens(lens) {
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

export function validAgentHandoffPrompt(value) {
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

export function validAgentBriefDocs(value) {
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
 * Is the "use this when MCP is unavailable" line in a runnable shape (`node <…>/cli/src/index.mjs <sub> …`)?
 * The bare `ontology-atlas` form is rejected: no global command by that name exists.
 */
export function validAgentCliFallbackCommands(commands) {
  return Array.isArray(commands)
    && commands.length > 0
    && commands.every(validAgentCliFallbackCommand);
}

function validAgentCliFallbackCommand(command) {
  if (!hasNonEmptyString(command) || /[\r\n]/.test(command)) return false;
  const normalized = command.replaceAll('\\', '/');
  const entryMarker = 'cli/src/index.mjs';
  const entryIndex = normalized.indexOf(entryMarker);
  if (!normalized.startsWith('node ') || entryIndex < 'node '.length) return false;
  if (normalized.slice('node '.length, entryIndex).trim() === '') return false;
  return /^(?:['"])?\s+\S/.test(normalized.slice(entryIndex + entryMarker.length));
}

export function validAgentTraversalStrategy(strategies) {
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

export function validAgentGuardrail(guardrail) {
  return Boolean(
    isPlainObject(guardrail)
    && hasNonEmptyString(guardrail.id)
    && hasNonEmptyString(guardrail.goal)
    && Array.isArray(guardrail.calls)
    && guardrail.calls.length > 0
    && guardrail.calls.every((call) => validAgentGuardrailToolCall(call))
  );
}

export function validAgentRelationDecisionGuide(guide) {
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

export function validAgentResultContracts(contracts) {
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
