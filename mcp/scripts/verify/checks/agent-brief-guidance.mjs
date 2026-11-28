import { QUERY_ONTOLOGY_OPERATIONS } from '../../../src/ontology-engine.mjs';

import { hasNonEmptyString } from '../value-checks.mjs';

export function agentBusinessOntologyLensFailure(lens) {
  if (!lens || typeof lens !== 'object' || Array.isArray(lens)) {
    return 'agent_brief response missing business-first ontology lens';
  }
  if (lens.policy !== 'business-first') {
    return 'agent_brief response missing business-first ontology lens';
  }
  if (!Array.isArray(lens.readOrder) || lens.readOrder.join('\0') !== ['outcome', 'domain', 'capability', 'element'].join('\0')) {
    return 'agent_brief response missing business-first ontology lens';
  }
  for (const field of ['businessDomains', 'capabilityOutcomes', 'implementationEvidence']) {
    if (!Array.isArray(lens[field]) || lens[field].some((item) => typeof item !== 'string')) {
      return 'agent_brief response missing business-first ontology lens';
    }
  }
  if (
    !Array.isArray(lens.decisionQuestions) ||
    lens.decisionQuestions.length < 4 ||
    lens.decisionQuestions.some((item) => !hasNonEmptyString(item)) ||
    !lens.decisionQuestions.some((item) => /business outcome should this ontology explain or improve/i.test(item)) ||
    !lens.decisionQuestions.some((item) => /business\/product domain boundary/i.test(item)) ||
    !lens.decisionQuestions.some((item) => /capability claim/i.test(item)) ||
    !lens.decisionQuestions.some((item) => /implementation evidence proves or disproves that capability/i.test(item))
  ) {
    return 'agent_brief response missing business-first ontology lens';
  }
  if (
    !Array.isArray(lens.guidance) ||
    lens.guidance.some((item) => !hasNonEmptyString(item)) ||
    !lens.guidance.some((item) => /business outcome first/i.test(item)) ||
    !lens.guidance.some((item) => /do not treat paths, APIs, routes, or commands as the ontology root/i.test(item))
  ) {
    return 'agent_brief response missing business-first ontology lens';
  }
  return null;
}

export function agentRelationDecisionGuideFailure(guide) {
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

export function agentToolCallsIncludeOperation(calls, operation) {
  return Array.isArray(calls) && calls.some((call) => call?.tool === 'query_ontology' && call?.arguments?.operation === operation);
}

function agentToolCallsIncludeQueryPlanTarget(calls, targetOperation) {
  return Array.isArray(calls) && calls.some((call) =>
    call?.tool === 'query_ontology' &&
    call?.arguments?.operation === 'query_plan' &&
    call?.arguments?.targetOperation === targetOperation
  );
}

export function agentToolCallsFailure(label, calls) {
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

export function agentGuardrailCallsFailure(label, calls) {
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
