/**
 * Activity logs retain the exact client/runtime identifier for audit. The UI
 * uses the product name a person recognizes; storage remains byte-for-byte raw.
 */
const KNOWN_AGENT_NAMES: Readonly<Record<string, string>> = {
  'codex-mcp-client': 'Codex',
  codex: 'Codex',
  'codex-acp': 'Codex',
  'claude-code': 'Claude Code',
  'claude-mcp-client': 'Claude Code',
  'claude-acp': 'Claude Agent',
  cursor: 'Cursor',
  antigravity: 'Antigravity',
  'ontology-atlas-cli': 'Atlas CLI',
};

export function agentDisplayName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return KNOWN_AGENT_NAMES[trimmed.toLowerCase()] ?? trimmed;
}
