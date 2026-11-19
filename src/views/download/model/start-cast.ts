/**
 * What the start steps' scenes show: this repository's own folder and concepts (held by
 * `StartSection.test.tsx`), so the drawing is a real project, not an invented one.
 */

/** The top of this repository as the folder picker lists it; `docs/ontology` is the map. */
export const START_FOLDER = [
  { name: 'docs/', folder: true, depth: 0 },
  { name: 'ontology/', folder: true, depth: 1 },
  { name: 'src/', folder: true, depth: 0 },
  { name: 'AGENTS.md', folder: false, depth: 0 },
] as const;

/** The folder the person picks, as the path the app shows before it writes anything. */
export const START_PATH = 'docs/ontology';

/** One concept of each kind an agent writes first: a domain, a capability in it, an element of that. */
export const START_DRAFT = ['domain:agent-access', 'capability:mcp-tool-server', 'element:mcp-server-runtime'] as const;

export const kindOf = (id: string) => id.slice(0, id.indexOf(':'));
