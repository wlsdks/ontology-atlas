/**
 * Shape guard for an ontology node id — `<kind>:<tail>` (e.g.
 * `capability:mcp-server`, `domain:auth`, `element:src/features/auth`).
 *
 * `derive-ontology-from-vault.ts` gives every document with a frontmatter `kind:`
 * an id of this form, and the topology, tree and ego graph share that id space.
 * The guard is needed to tell such an id apart from a project slug (a plain slug
 * with no `:`, such as `ontology-atlas`).
 *
 * The rule: the first segment must be a known ontology kind followed by `:`. It is
 * an exact prefix test, not a substring one, so `oh-my:something` cannot pass.
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
