// Scores one answer against a task, and reads what a saved transcript shows
// about whether the Atlas side was really exercised.
import { classifyEvidence } from './definitions.mjs';

function groupRequired(task) {
  const grouped = { vocabulary: [], path: [], phrase: [] };
  for (const token of task.required) grouped[classifyEvidence(token)].push(token);
  return grouped;
}

export function scoreFinalAnswer(finalValue, task) {
  const valid = Boolean(
    finalValue
      && typeof finalValue === 'object'
      && typeof finalValue.answer === 'string'
      && Array.isArray(finalValue.evidence)
      && typeof finalValue.nextAction === 'string'
      && Array.isArray(finalValue.unknowns),
  );
  const haystack = valid ? JSON.stringify(finalValue).toLowerCase() : '';
  const cover = (tokens) => {
    const matched = tokens.filter((value) => haystack.includes(value.toLowerCase()));
    const missing = tokens.filter((value) => !haystack.includes(value.toLowerCase()));
    return {
      matched: matched.length,
      total: tokens.length,
      missing,
      coverage: tokens.length === 0 ? null : Number((matched.length / tokens.length).toFixed(4)),
    };
  };
  const grouped = groupRequired(task);
  const all = cover(task.required);
  const vocabulary = cover(grouped.vocabulary);
  const comparable = cover([...grouped.path, ...grouped.phrase]);
  const foundForbidden = task.forbidden.filter((value) => haystack.includes(value.toLowerCase()));
  const anyRequired = task.requiredAny.length === 0
    || task.requiredAny.some((value) => haystack.includes(value.toLowerCase()));
  return {
    valid,
    required: { matched: all.matched, total: all.total, missing: all.missing },
    requiredAny: { passed: anyRequired, candidates: task.requiredAny },
    forbidden: { found: foundForbidden, total: task.forbidden.length },
    coverage: all.coverage ?? 1,
    vocabularyCoverage: vocabulary.coverage,
    comparableCoverage: comparable.coverage,
    breakdown: {
      vocabulary,
      path: cover(grouped.path),
      phrase: cover(grouped.phrase),
      comparable,
      unknownSignal: anyRequired,
    },
    pass: valid && all.missing.length === 0 && anyRequired && foundForbidden.length === 0,
  };
}

export function transcriptCallCounts(transcript) {
  return {
    mcpCalls: (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \(completed\)/g) ?? []).length,
    failedMcpCalls: (transcript.match(/mcp: ontology-atlas\/[^\s)]+ \((?:failed|error)\)/g) ?? []).length,
    shellCalls: (transcript.match(/^exec$/gm) ?? []).length,
  };
}

/** Did the run exercise Atlas when it should have, and stay free of it when it should not? */
export function armIntegrity(mode, { mcpCalls, failedMcpCalls }) {
  return mode === 'on'
    ? { passed: mcpCalls > 0 && failedMcpCalls === 0, reason: mcpCalls > 0 ? (failedMcpCalls ? 'MCP call failed' : 'MCP observed') : 'MCP arm was not exercised' }
    : { passed: mcpCalls === 0 && failedMcpCalls === 0, reason: mcpCalls === 0 ? 'No MCP exposed' : 'MCP leaked into control arm' };
}
