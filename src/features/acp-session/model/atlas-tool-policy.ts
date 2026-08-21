/**
 * ACP permission requests only carry the MCP tool name. The server's generated
 * surface is the authority for whether a registered tool reads or writes; the
 * sibling contract test compares every entry so this fail-closed list cannot
 * silently drift when the server inventory changes.
 */
const ATLAS_READ_TOOLS = new Set([
  'connection_info',
  'git_status',
  'git_history',
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_evidence',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'find_orphans',
  'query_concepts',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'analyze_repo_structure',
  'infer_imports',
  'index_project',
]);

export type AtlasToolMode = 'read' | 'write';

/**
 * Returns null for another server. Unknown tools on our server are writes:
 * adding a read tool without updating the generated-surface contract must add
 * friction, never grant a new write path by accident.
 */
export function atlasToolMode(
  permissionToolName: string | null,
  serverName: string,
): AtlasToolMode | null {
  if (!permissionToolName || !serverName) return null;
  const prefix = `mcp__${serverName}__`;
  if (!permissionToolName.startsWith(prefix)) return null;
  const toolName = permissionToolName.slice(prefix.length);
  if (!toolName || toolName.includes('__')) return null;
  return ATLAS_READ_TOOLS.has(toolName) ? 'read' : 'write';
}
