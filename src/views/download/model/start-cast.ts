/**
 * What the start steps' scenes show: this repository's own folder and concepts (held by
 * `StartSection.test.tsx`), so the drawing is a real project, not an invented one.
 */

export const START_FOLDER = [
  { name: 'docs/', folder: true, depth: 0 },
  { name: 'ontology/', folder: true, depth: 1 },
  { name: 'src/', folder: true, depth: 0 },
  { name: 'AGENTS.md', folder: false, depth: 0 },
] as const;

export const START_PATH = 'docs/ontology';

export const START_DRAFT = ['domain:agent-access', 'capability:mcp-tool-server', 'capability:agent-connector-setup'] as const;

export const kindOf = (id: string) => id.slice(0, id.indexOf(':'));
