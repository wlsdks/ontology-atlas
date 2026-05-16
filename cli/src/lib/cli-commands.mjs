export const CLI_COMMAND_MODULES = Object.freeze({
  list: 'list.mjs',
  validate: 'validate.mjs',
  'mcp-verify': 'mcp-verify.mjs',
  add: 'add.mjs',
  find: 'find.mjs',
  import: 'import.mjs',
  backlinks: 'backlinks.mjs',
  orphans: 'orphans.mjs',
  path: 'path.mjs',
  overview: 'overview.mjs',
  hubs: 'hubs.mjs',
  'blast-radius': 'blast-radius.mjs',
  cycles: 'cycles.mjs',
  health: 'health.mjs',
  'workspace-brief': 'workspace-brief.mjs',
  node: 'node-profile.mjs',
  similar: 'similar.mjs',
  query: 'query.mjs',
  compile: 'compile.mjs',
  rename: 'rename.mjs',
  merge: 'merge.mjs',
  delete: 'delete.mjs',
  bootstrap: 'bootstrap.mjs',
  analyze: 'analyze.mjs',
  'infer-imports': 'infer-imports.mjs',
});

export const CLI_COMMANDS = Object.freeze(['init', ...Object.keys(CLI_COMMAND_MODULES)]);
export const CLI_COMMAND_COUNT = CLI_COMMANDS.length;

export function parseCliCommandMetadataFromDescription(description) {
  const match = String(description || '').match(/(\d+)[ -]command(?:s)?\b/i);
  if (!match) return null;
  return { commandCount: Number(match[1]) };
}
