/**
 * The supported MCP clients and the one file each uses: the source of truth for the per-tool buttons.
 * Each accepts stdio JSON-RPC and a project-scoped config, so auditing by git diff holds.
 * VS Code is out: its key is `servers`, which needs a second writer.
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
  /**
   * The bundled mark and its brand ink, as the runtime registry (`src-tauri/src/acp-registry.json`)
   * records them for the same tools — one drawing per tool on both tabs of the Agents destination.
   * The ink is data about a vendor, not a design token, which is why it is not a CSS variable.
   */
  icon: `/acp-icons/${string}.svg`;
  brandInk: string | null;
}

export const AGENT_CLIENTS: readonly AgentClient[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    labelKey: 'claudeCode',
    files: ['.mcp.json'],
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/mcp',
    icon: '/acp-icons/claude-acp.svg',
    brandInk: '#D97757',
  },
  {
    id: 'codex',
    name: 'Codex',
    labelKey: 'codex',
    files: ['.codex/config.toml'],
    docsUrl: 'https://developers.openai.com/codex/mcp',
    icon: '/acp-icons/codex-acp.svg',
    brandInk: null,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    labelKey: 'cursor',
    files: ['.cursor/mcp.json'],
    docsUrl: 'https://docs.cursor.com/context/model-context-protocol',
    icon: '/acp-icons/cursor.svg',
    brandInk: null,
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    labelKey: 'antigravity',
    files: ['.agents/mcp_config.json'],
    docsUrl: 'https://antigravity.google/docs/mcp',
    icon: '/acp-icons/antigravity-acp.svg',
    brandInk: null,
  },
];

/** Only the files this tool writes — the call site must filter `plan.targets` by this for the label to be true. */
export function filesForClient(id: AgentClientId): readonly string[] {
  return AGENT_CLIENTS.find((client) => client.id === id)?.files ?? [];
}
