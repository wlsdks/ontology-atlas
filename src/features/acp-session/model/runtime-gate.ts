/**
 * **How the permission gate is raised** per runtime — the method differs by tool.
 *
 * ## Two methods, and what works differs per tool (measured 2026-08-16)
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | config isolation (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`) | **works** | read, but per-turn mode is authoritative |
 * | session mode (`session/set_mode`) | has no read-only | 1.6.2 `read-only` makes direct writes ask; MCP uses the server gate |
 *
 * The codex measurement was the surprise. codex-acp 1.8.0 called its mode `read-only` while sending
 * `workspaceWrite`, and an installed session created an inside-vault file with zero requests. The
 * launch snapshot is deliberately pinned to 1.6.2, whose same mode id sends a real `readOnly`
 * sandbox. In the installed app a direct write stopped at an ordinary permission card, rejection
 * preserved absence, one-time approval wrote once, and the next write asked again. We set the mode
 * both at process start and here before the conversation becomes usable.
 *
 * ⚠️ **This named 1.8.0 alone until 2026-09-05, and that read like one bad release.** 1.9.0 ships
 * the same shape: `AgentMode.ReadOnly` keeps the id `read-only` and the name "Ask for approval"
 * while its `sandboxPolicy` is `workspaceWrite`. The id is the only part that held still. The pin
 * is retained on the reviewed 1.6.2, and `src-tauri/src/acp.rs` carries the same note beside the
 * config it writes — including the fact that the pinned adapter depends on `@openai/codex`
 * `^0.148.0`, so the CLI an app-opened session actually runs is 0.148, not the 0.153 named in the
 * `approval_policy` history there.
 *
 * The earlier conclusion that this made Codex guarded was overturned by installed-app acceptance
 * on 2026-08-24. A self-registered Atlas `add_relation` produced no `session/request_permission`, no review
 * card, and changed the vault immediately. A mode can be called read-only while an MCP child still
 * mutates disk; the app must own the MCP write checkpoint before Codex is eligible for in-app chat.
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
 * Runtimes whose configuration the app isolates. Mirrors `ISOLATION` in
 * `src-tauri/src/acp.rs`; `runtime-gate.test.ts` keeps the two from drifting.
 */
const CONFIG_ISOLATED_RUNTIMES: ReadonlySet<string> = new Set(['claude-acp']);
