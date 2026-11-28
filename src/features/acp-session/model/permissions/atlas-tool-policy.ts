/** ACP permission requests carry only the MCP tool name; the server's generated surface decides read vs write, and the sibling contract test compares every entry so this fail-closed list cannot drift. */
const ATLAS_READ_TOOLS = new Set([
  'connection_info',
  'list_concepts',
  'get_concept',
  'get_concepts',
  'find_backlinks',
  'find_neighbors',
  'find_path',
  'list_kinds',
  'compile_ontology',
  'query_ontology',
  'validate_vault',
  'validate_wiki',
  'read_source',
  'inspect_architecture',
  'analyze_repo_structure',
  'infer_imports',
  'index_project',
  'get_constellation',
]);

export type AtlasToolMode = 'read' | 'write';

/** Null for another server. An unknown tool on our server is a write: a read tool added without updating the contract adds friction, never a new write path. */
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
