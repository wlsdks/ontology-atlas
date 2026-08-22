/**
 * **How the permission gate is raised** per runtime — the method differs by tool.
 *
 * ## Two methods, and what works differs per tool (measured 2026-08-16)
 *
 * | | Claude | Codex |
 * |---|---|---|
 * | config isolation (`CLAUDE_CONFIG_DIR` / `CODEX_HOME`) | **works** | it is read, but **the approval policy is ignored** |
 * | session mode (`session/set_mode`) | has no read-only | **`read-only` works** |
 *
 * The codex measurement was the surprise. Putting `approval_policy = "untrusted"` and
 * `sandbox_mode = "workspace-write"` into an isolated `CODEX_HOME` still produced **zero permission
 * requests and files created outside the vault.** Yet the `model` value in the same folder was
 * honoured — so our config **is read, and only the approval policy is overridden by the adapter's
 * session mode.**
 *
 * So for codex the gate is raised by changing the mode right after the session stands.
 *
 * ## Why the map is still writable under `read-only`
 *
 * What that mode blocks is **the agent touching files directly**, and every vault write of ours goes
 * through **the MCP server we wired**. Measured, `mcp.atlas-vault.list_concepts` worked normally
 * under `read-only`, and only writes outside the vault were asked about and then blocked. That is
 * exactly the shape of ledger decision ⑤ (*"writes go only through Atlas MCP tools, in every case"*),
 * so this mode does not cut a feature — **it enforces that decision.**
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
