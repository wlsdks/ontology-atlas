// CLI writes land in the local audit log too.
//
// The `.ontology-atlas/activity.jsonl` audit log used to record only the MCP write
// path (logWrite in mcp/src/index.js). The CLI's add/import/relate write vault
// files through fs directly, so they left no record and put a hole in the promise
// that "an agent writing to your vault leaves a record". (rename/merge/delete
// already go through the MCP server via callMcpTool, so logWrite records those.)
//
// This **reuses** the mcp package's activity-log module, so the schema, the
// rotation, and the best-effort append stay in one place. Resolution goes through
// mcp-module.mjs, the one rule every CLI re-export of an MCP module shares
// (monorepo source, then installed package), and it caches, so a batch write
// (`import`) never re-resolves per file.

import { loadMcpModule } from './mcp-module.mjs';

/** @returns {Promise<Record<string, Function>>} mcp's activity-log module. */
const loadActivityLogModule = () => loadMcpModule('activity-log.mjs');

/**
 * Reads the agent name from the heartbeat file, best-effort (null when absent).
 *
 * This is what lets the `created_by` stamp (decision ledger 2026-08-01 — the CLI
 * uses the same door as MCP) draw on **the same identity source** as MCP's
 * `agentProvenance()`, keeping the 2026-07-31 decision that no second identity
 * scheme is created.
 */
export async function readHeartbeatAgentName(vaultRoot) {
  try {
    const { readHeartbeatAgent } = await loadActivityLogModule();
    return readHeartbeatAgent(vaultRoot);
  } catch {
    return null;
  }
}

/**
 * Appends one CLI write to the audit log. Purely best-effort: it never throws and
 * never changes the caller's exit code or output contract. **Do not call it** for
 * a dry run or a failed write — the audit log carries what happened, nothing else.
 *
 * @param {string} vaultRoot absolute path.
 * @param {{tool:string, target:string, summary:string, why?:string|null}} entry
 *   `tool` is prefixed (`cli:add`) so a CLI write is distinguishable. The agent
 *   field is copied from the heartbeat file (null when absent), as in MCP logWrite.
 */
export async function recordCliWrite(vaultRoot, { tool, target, summary, why = null }) {
  try {
    const { appendActivityEntry, buildActivityEntry, readHeartbeatAgent } =
      await loadActivityLogModule();
    appendActivityEntry(
      vaultRoot,
      buildActivityEntry({
        tool,
        target,
        summary,
        why: why ?? null,
        agent: readHeartbeatAgent(vaultRoot),
      }),
    );
  } catch {
    /* The audit log is a side effect — it must never damage the write result or exit code. */
  }
}
