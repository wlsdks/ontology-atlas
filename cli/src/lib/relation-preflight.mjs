// Shared MCP `query_ontology({operation:'relation_check'})` preflight call +
// human-readable render — single source for the `relation-check` (read-only)
// and `relate` (writer, R+ agent-persona-2026-07 QA wishlist #1) commands so
// both show the identical verdict/schema/recommendation plus executable-action
// or non-writing semantic-approval view
// before `relate` decides whether to touch the vault.

import { COLORS } from './colors.mjs';
import { callMcpTool } from './mcp-call.mjs';
import { assertRelationCheckShape } from './query-result-contract.mjs';

/**
 * Runs the relation_check preflight and asserts its shape. Throws (same as
 * the underlying MCP call) when `from`/`to` do not resolve to vault nodes or
 * `type` is invalid — callers should treat a thrown error as a hard reject,
 * not just an advisory.
 */
export async function runRelationCheckQuery(vaultRoot, from, to, type) {
  const result = await callMcpTool(vaultRoot, 'query_ontology', {
    operation: 'relation_check',
    from,
    to,
    type,
  });
  assertRelationCheckShape(result);
  return result;
}

export function renderRelationCheckResult(result, stream = process.stdout) {
  const verdictColor = result.exists ? COLORS.green : COLORS.yellow;
  stream.write(
    `${COLORS.bold}${result.from}${COLORS.reset} ${COLORS.dim}--${COLORS.reset}${COLORS.yellow}${result.relation}${COLORS.reset}${COLORS.dim}-->${COLORS.reset} ${COLORS.bold}${result.to}${COLORS.reset}\n` +
      `  verdict ${verdictColor}${result.verdict}${COLORS.reset} · exists ${result.exists ? 'yes' : 'no'}\n` +
      `  schema  ${COLORS.cyan}${result.fromKind}${COLORS.reset} --${COLORS.yellow}${result.relation}${COLORS.reset}--> ${COLORS.cyan}${result.toKind}${COLORS.reset}\n`,
  );

  if (result.schemaPattern) {
    const pattern = result.schemaPattern;
    stream.write(
      `  pattern count ${pattern.count}` +
        ` · resolved ${pattern.resolved ?? 0}` +
        ` · external ${pattern.external ?? 0}` +
        ` · unresolved ${pattern.unresolved ?? 0}\n`,
    );
  }

  if (result.recommendation) {
    const color = result.recommendation.severity === 'warn' ? COLORS.yellow : COLORS.green;
    stream.write(
      `  recommendation ${color}${result.recommendation.decision}${COLORS.reset}` +
        ` · ${result.recommendation.reason}\n`,
    );
  }

  if (Array.isArray(result.matchingEdges) && result.matchingEdges.length > 0) {
    stream.write(`\n${COLORS.dim}matching edges${COLORS.reset}\n`);
    for (const edge of result.matchingEdges.slice(0, 5)) {
      const ref = edge.ref ? ` ${COLORS.dim}(${edge.ref})${COLORS.reset}` : '';
      stream.write(`  ${edge.from} --${edge.via}--> ${edge.to}${ref}\n`);
    }
  }

  if (Array.isArray(result.inverseEdges) && result.inverseEdges.length > 0) {
    stream.write(`\n${COLORS.dim}inverse edges${COLORS.reset}\n`);
    for (const edge of result.inverseEdges.slice(0, 5)) {
      const ref = edge.ref ? ` ${COLORS.dim}(${edge.ref})${COLORS.reset}` : '';
      stream.write(`  ${edge.from} --${edge.via}--> ${edge.to}${ref}\n`);
    }
  }

  if (Array.isArray(result.nearbyPatterns) && result.nearbyPatterns.length > 0) {
    stream.write(`\n${COLORS.dim}nearby schema patterns${COLORS.reset}\n`);
    for (const pattern of result.nearbyPatterns.slice(0, 5)) {
      stream.write(
        `  ${pattern.similarity} · ${pattern.fromKind} --${pattern.relation}--> ${pattern.toKind}` +
          ` ${COLORS.dim}(count ${pattern.count})${COLORS.reset}\n`,
      );
    }
  }
}
