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
 * Does this runtime **have a permission gate** — may the screen say so?
 *
 * True if **either** method works. `isolated` is Rust's verdict on whether config isolation is
 * possible, and what is added here is the session-mode branch. This function must be the only path —
 * if the screen's sentence and the action actually taken diverge, the screen makes a promise it
 * cannot keep.
 */
export function isGuardedRuntime(runtimeId: string, isolated: boolean): boolean {
  return isolated || runtimeId in GATED_SESSION_MODE;
}

/**
 * Does this runtime's **own configuration** already put a permission request in front
 * of a person for every tool call — including calls into our MCP server?
 *
 * Only config isolation has been measured to do that for Atlas MCP itself (Claude: an isolated
 * `CLAUDE_CONFIG_DIR` with an empty allow-list produced the request, and declining it
 * left the file uncreated). A session mode is not the same thing: Codex can gate direct files while
 * an Atlas MCP child still mutates disk (installed rc.10 acceptance, 2026-08-24), so its server
 * checkpoint remains on even though the pinned mode now gates direct writes too.
 *
 * The answer decides **who holds the single checkpoint** for a session. `true` hands it
 * to the runtime and keeps the server gate off, so nobody is asked twice. `false` — the
 * default for anything unmeasured — turns the server gate on, because an unasked write
 * is worse than one question too many.
 */
export function runtimeOwnsWriteGate(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/**
 * May this runtime be handed an **external** MCP server (`features/mcp-connectors`)?
 *
 * The condition is the one the table above already measures, so this is not a second hand-kept
 * list: a connector's tools must reach a person as a `session/request_permission`, and only config
 * isolation has been measured to produce that for an MCP child. Claude does
 * (`CONFIG_ISOLATED_RUNTIMES`); Codex was measured **not** to, in the installed app on
 * 2026-08-24 - a self-registered Atlas `add_relation` changed the vault with no request and no
 * card. That verdict is about our own server; nobody has yet measured what it does with somebody
 * else's, and the difference between "unmeasured" and "safe" is the whole point of this gate.
 *
 * So connectors ride only the runtime where the answer is known. An unmeasured runtime gets the
 * vault server and nothing else, which is the same safe direction `runtimeOwnsWriteGate` takes.
 */
export function runtimeCarriesConnectors(runtimeId: string | null | undefined): boolean {
  return typeof runtimeId === 'string' && CONFIG_ISOLATED_RUNTIMES.has(runtimeId);
}

/**
 * Runtimes whose configuration the app isolates. Mirrors `ISOLATION` in
 * `src-tauri/src/acp/isolation.rs`; `runtime-gate.test.ts` keeps the two from drifting.
 */
const CONFIG_ISOLATED_RUNTIMES: ReadonlySet<string> = new Set(['claude-acp']);
