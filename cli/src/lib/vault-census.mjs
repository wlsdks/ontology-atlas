// Shared vault-inventory output helper for analyze --apply / bootstrap /
// index --apply, so after one command the user sees in a single line *what just
// landed in the vault*: "→ vault now has N nodes (...)".
//
// One helper covers the list_kinds call, the text formatting, and the JSON data,
// because all three commands want the same after-write summary.
//
// A failed call (the MCP server not starting, say) is silent and never affects the
// caller's exit code.

import { COLORS } from './colors.mjs';
import { callMcpTool } from './mcp-call.mjs';


/**
 * Calls the MCP list_kinds → { total, byKind } | null.
 * Errors return null silently — callers tolerate a missing inventory.
 */
export async function getVaultCensus(vaultRoot, { call = callMcpTool } = {}) {
  try {
    const result = await call(vaultRoot, 'list_kinds', {});
    if (
      result
      && typeof result.total === 'number'
      && result.byKind
      && typeof result.byKind === 'object'
    ) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Prints one line to stdout:
 * \"→ vault now has N nodes (project=A · capability=B · ...)\".
 * A null inventory is a no-op.
 *
 * Order follows the hierarchy top-down: project · domain · capability · element ·
 * document · vault-readme. Kinds at 0 are omitted.
 */
export function writeVaultCensus(census) {
  if (!census || typeof census.total !== 'number') return;
  const order = [
    'project',
    'domain',
    'capability',
    'element',
    'document',
    'vault-readme',
  ];
  const byKind = census.byKind || {};
  const parts = order.filter((k) => byKind[k]).map((k) => `${k}=${byKind[k]}`);
  process.stdout.write(
    `\n  ${COLORS.dim}→ vault now has ${COLORS.bold}${census.total}${COLORS.reset}${COLORS.dim} nodes` +
      (parts.length > 0 ? ` (${parts.join(' · ')})` : '') +
      `${COLORS.reset}\n`,
  );
}
