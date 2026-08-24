/**
 * **How the permission gate is raised** per runtime — the method differs by tool.
 *
 * ## Two methods, and what works differs per tool (measured 2026-08-16)
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | config isolation (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`) | **works** | it is read, but **the approval policy is ignored** |
 * | session mode (`session/set_mode`) | has no read-only | blocks direct files, **not Atlas MCP writes** |
 *
 * The codex measurement was the surprise. Putting `approval_policy = "untrusted"` and
 * `sandbox_mode = "workspace-write"` into an isolated `CODEX_HOME` still produced **zero permission
 * requests and files created outside the vault.** Yet the `model` value in the same folder was
 * honoured — so our config **is read, and only the approval policy is overridden by the adapter's
 * session mode.**
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
export const GATED_SESSION_MODE: Readonly<Record<string, string>> = {};

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
 * Only config isolation has been measured to do that (Claude: an isolated
 * `CLAUDE_CONFIG_DIR` with an empty allow-list produced the request, and declining it
 * left the file uncreated). A session mode is not the same thing: Codex `read-only`
 * blocked direct file access while an Atlas MCP write went through with no request at
 * all (installed rc.10 acceptance, 2026-08-24).
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
