// CLI writes (add, import, relate) land in `.ontology-atlas/activity.jsonl` too; rename, merge and delete
// go through MCP and its logWrite. Reuses mcp's activity-log module through mcp-module.mjs, cached so a
// batch `import` resolves it once.

import { loadMcpModule } from './mcp-module.mjs';

/** @returns {Promise<Record<string, Function>>} mcp's activity-log module. */
const loadActivityLogModule = () => loadMcpModule('activity-log.mjs');

/**
 * Reads the agent name from the heartbeat file, best-effort (null when absent), so `created_by` uses
 * the same identity source as MCP `agentProvenance()`.
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
 * Appends one CLI write to the audit log, best-effort: it never throws or changes the caller's exit
 * code or output. Do not call it for a dry run or a failed write.
 *
 * @param {string} vaultRoot absolute path.
 * @param {{tool:string, target:string, summary:string, why?:string|null}} entry `tool` is prefixed
 *   (`cli:add`); the agent is copied from the heartbeat file, as in MCP logWrite.
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
