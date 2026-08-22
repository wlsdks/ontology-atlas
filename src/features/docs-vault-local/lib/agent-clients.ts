/**
 * The supported MCP clients and **the file each one uses** — the source of truth for the per-tool
 * buttons.
 *
 * **Why this table exists.** One press of "Connect to Claude Code" wrote three files (`.mcp.json`,
 * `.mcp.json.example`, `.codex/config.toml`), because the planner emitted the entire allowlist as
 * targets and the call site iterated all of them.
 *
 * **That is a label telling a lie** — the class of defect this repository already gates against
 * ("back to the map" pointing at `/`, decorative trailing arrows on labels, dead npm commands). On
 * top of that, a config for a tool the user does not use shows up in their git diff, contradicting
 * this product's own claim that every change is a readable diff.
 *
 * **The list was decided by research** (2026-07-30). Three criteria: ① does it accept stdio
 * JSON-RPC ② does it have a **project-scoped** config (writing inside the vault and auditing by git
 * diff is the contract) ③ does it actually exist.
 *
 * | Tool | Basis |
 * |---|---|
 * | Claude Code | `.mcp.json` — the official docs name it as "checked into version control" |
 * | Codex | in-repo `.codex/config.toml` officially supported (trusted-folder condition) |
 * | Cursor | `.cursor/mcp.json` project scope — **promoted from a deeplink to writing the file** |
 * | Antigravity | workspace `.agents/mcp_config.json`, stdio explicit |
 *
 * **Leaving VS Code out is not a preference.** It supports `.vscode/mcp.json`, but its key is
 * **`servers`** rather than `mcpServers` — it alone demands a second writer while having the
 * smallest target overlap. Cursor and Antigravity use the same `mcpServers` key and so fall through
 * **the existing writer** (`agentConfigContents`'s default branch).
 *
 * **openclaw and Hermes Agent were rejected.** Both exist and have users
 * (`~/.openclaw/openclaw.json`, `~/.hermes/config.yaml`), but they support **global home config
 * only**, which would require breaking criterion ② above. Star counts are not grounds for bending a
 * contract.
 *
 * **First on the waiting list: opencode** — its project `opencode.json` satisfies the contract. Its
 * `command` is an array and needs one adapter, so it goes in when there is a reason to write that
 * adapter.
 */

export type AgentClientId = 'claude-code' | 'codex' | 'cursor' | 'antigravity';

export interface AgentClient {
  id: AgentClientId;
  /** i18n key for that tool's button label (a sentence carrying the filename and the method). */
  labelKey: string;
  /**
   * The tool's **brand name**. Not an i18n key because proper nouns are not translated ("Claude
   * Code" is "Claude Code" in every language). Putting it in the locale files would only create a
   * place for two files to hold the same string and drift.
   */
  name: string;
  /**
   * The file **written** when this tool is connected, relative to the vault (or repo root).
   *
   * That there is exactly one is the contract — one button writes one file. It is an array because
   * a future tool might require two, and even then **only that tool's files** are written.
   */
  files: readonly string[];
  /**
   * Where this tool documents that its config belongs — shown on screen as the basis. A user must
   * be able to confirm "why is this file appearing" in **the tool's own words** rather than ours.
   */
  docsUrl: string;
}

export const AGENT_CLIENTS: readonly AgentClient[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    labelKey: 'claudeCode',
    files: ['.mcp.json'],
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/mcp',
  },
  {
    id: 'codex',
    name: 'Codex',
    labelKey: 'codex',
    files: ['.codex/config.toml'],
    docsUrl: 'https://developers.openai.com/codex/mcp',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    labelKey: 'cursor',
    files: ['.cursor/mcp.json'],
    docsUrl: 'https://docs.cursor.com/context/model-context-protocol',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    labelKey: 'antigravity',
    files: ['.agents/mcp_config.json'],
    docsUrl: 'https://antigravity.google/docs/mcp',
  },
];

/** Only the files this tool writes — the call site must filter `plan.targets` by this for the label to be true. */
export function filesForClient(id: AgentClientId): readonly string[] {
  return AGENT_CLIENTS.find((client) => client.id === id)?.files ?? [];
}

/**
 * Every file the app may write — must be **identical** to Rust's `ALLOWED_CONFIG_FILES`.
 *
 * That side is a security allowlist (anything outside it is refused) and this side is the UI's
 * source of truth, so a mismatch means either a button exists whose write is refused, or the
 * reverse. A contract test compares the two lists.
 */
export function allAgentConfigFiles(): readonly string[] {
  return [...new Set(AGENT_CLIENTS.flatMap((client) => client.files))].sort();
}
