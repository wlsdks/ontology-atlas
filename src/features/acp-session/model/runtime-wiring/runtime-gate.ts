/** In-app runtimes need app-owned isolation and the MCP write checkpoint; Codex also enters read-only first, since a filesystem sandbox cannot guard an MCP child's writes. */

/** A runtime absent here is not switched: no mode is imposed on a tool whose mode names were never measured. */
export const GATED_SESSION_MODE: Readonly<Record<string, string>> = {
  'codex-acp': 'read-only',
};

/** The only path to "guarded", or the screen's sentence and the action taken diverge. */
export function isGuardedRuntime(runtimeId: string, isolated: boolean): boolean {
  return isolated || runtimeId in GATED_SESSION_MODE;
}

/** Only config isolation is known to ask before every tool call, our MCP server included; `false` (unmeasured default) keeps the server gate. */
export function runtimeOwnsWriteGate(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/** Connector tools must reach a person as `session/request_permission`; only config isolation is known to do that (Codex does not for our own server). */
export function runtimeCarriesConnectors(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/** Mirrors `ISOLATION` in `src-tauri/src/acp/isolation.rs`; `runtime-gate.test.ts` keeps the two from drifting. */
const CONFIG_ISOLATED_RUNTIMES: ReadonlySet<string> = new Set(['claude-acp']);
