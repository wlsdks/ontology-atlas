/**
 * Shape guard for an ontology node id, `<kind>:<tail>` (`capability:mcp-server`,
 * `element:src/features/auth`). It tells such an id from a project slug (a plain slug with no `:`).
 * The first segment must be a known kind followed by `:`: an exact prefix test, so `oh-my:something`
 * cannot pass.
 */

const KIND_PREFIXES = [
  'project:',
  'domain:',
  'capability:',
  'element:',
  'document:',
  'unknown:',
] as const;

export function isOntologyNodeId(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) return false;
  return KIND_PREFIXES.some((p) => id.startsWith(p) && id.length > p.length);
}
