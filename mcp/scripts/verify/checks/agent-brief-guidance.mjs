import { QUERY_ONTOLOGY_OPERATIONS } from '../../../src/ontology-engine.mjs';

export function agentToolCallsIncludeOperation(calls, operation) {
  return Array.isArray(calls) && calls.some((call) => call?.tool === 'query_ontology' && call?.arguments?.operation === operation);
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
