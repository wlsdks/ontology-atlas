/**
 * The supported MCP clients and the one file each uses: the source of truth for the per-tool buttons.
 * Each accepts stdio JSON-RPC and a project-scoped config, so auditing by git diff holds.
 * VS Code is out: its key is `servers`, which needs a second writer.
 */

export type AgentClientId = 'claude-code' | 'codex' | 'cursor' | 'antigravity';

export interface AgentClient {
  id: AgentClientId;
  labelKey: string;
  /** The brand name: proper nouns are not translated, and locale files would only give two files the same string to drift. */
  name: string;
  /** The file written when this tool is connected, relative to the vault or repo root. One button writes one file; it is an array in case a tool needs two, and then only that tool's files are written. */
  files: readonly string[];
  /** Where the tool documents that its config belongs, shown as the basis so a person can confirm "why is this file appearing" in the tool's own words. */
  docsUrl: string;
  /** The bundled mark as `src-tauri/src/acp-registry.json` records it, one drawing per tool on both Agents tabs; a vendor's ink is data, not a design token. */
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
