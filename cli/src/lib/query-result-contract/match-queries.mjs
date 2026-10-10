import { validAgentCliFallbackCommands, validAgentToolCall } from './agent-guidance.mjs';
import { assertQueryOperation } from './query-operation.mjs';
import { hasNonEmptyString, isPlainObject, validCount, validNodeSummary } from './value-checks.mjs';

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
