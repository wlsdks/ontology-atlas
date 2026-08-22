// CLI writes land in the local audit log too.
//
// The `.ontology-atlas/activity.jsonl` audit log used to record only the MCP write
// path (logWrite in mcp/src/index.js). The CLI's add/import/relate write vault
// files through fs directly, so they left no record and put a hole in the promise
// that "an agent writing to your vault leaves a record". (rename/merge/delete
// already go through the MCP server via callMcpTool, so logWrite records those.)
//
// This **reuses** the mcp package's activity-log module, so the schema, the
// rotation, and the best-effort append stay in one place. Module resolution uses
// the same two-step lookup as showActivityLog in agent-activity.mjs (monorepo
// source, then installed package).

let cachedModule = null;

/**
 * Resolves and imports mcp's activity-log.mjs (monorepo source checkout first,
 * then the installed ontology-atlas-mcp package). The result is cached so a batch
 * write (`import`) does not re-resolve per file.
 */
async function loadActivityLogModule() {
  if (cachedModule) return cachedModule;
  const { createRequire } = await import('node:module');
  const { existsSync } = await import('node:fs');
  const { resolve: resolvePath, dirname: dirnamePath } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirnamePath(fileURLToPath(import.meta.url));
  const monoDev = resolvePath(here, '../../../mcp/src/activity-log.mjs');
  let modPath = monoDev;
  if (!existsSync(monoDev)) {
    const require_ = createRequire(import.meta.url);
    modPath = require_.resolve('ontology-atlas-mcp/src/activity-log.mjs');
  }
  cachedModule = await import(`file://${modPath}`);
  return cachedModule;
}

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
