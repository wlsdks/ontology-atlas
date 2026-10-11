/**
 * In-app runtimes need app-owned isolation and the MCP write checkpoint.
 * Codex also enters read-only before use; a filesystem sandbox cannot guard an MCP child's writes.
 */

/**
 * The mode to switch to once a session stands. A runtime absent here is not switched —
 * **no mode is imposed on a tool that was never measured** (imposing one without knowing what that
 * name means on that tool is guesswork).
 */
export const GATED_SESSION_MODE: Readonly<Record<string, string>> = {
  'codex-acp': 'read-only',
};

/**
 * True if either method gives a gate. This must be the only path, or the screen's sentence
 * and the action taken diverge.
 */
export function isGuardedRuntime(runtimeId: string, isolated: boolean): boolean {
  return isolated || runtimeId in GATED_SESSION_MODE;
}

/**
 * Does the runtime's own config ask before every tool call, including our MCP server? Only
 * config isolation is known to. `true` hands the checkpoint to the runtime; `false`
 * (unmeasured default) keeps the server gate.
 */
export function runtimeOwnsWriteGate(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/**
 * May this runtime be handed an external MCP server? Connector tools must reach a person as
 * `session/request_permission`; only config isolation is known to do that, and Codex does
 * not for our own server. An unmeasured runtime gets the vault server only.
 */
export function runtimeCarriesConnectors(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/**
 * Runtimes whose configuration the app isolates. Mirrors `ISOLATION` in
 * `src-tauri/src/acp/isolation.rs`; `runtime-gate.test.ts` keeps the two from drifting.
 */
const CONFIG_ISOLATED_RUNTIMES: ReadonlySet<string> = new Set(['claude-acp']);
