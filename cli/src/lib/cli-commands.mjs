function runner(moduleFile, exportName) {
  return {
    modulePath: `./commands/${moduleFile}`,
    moduleFile,
    exportName,
  };
}

export const CLI_COMMAND_RUNNERS = Object.freeze({
  list: runner('list.mjs', 'runList'),
  validate: runner('validate.mjs', 'runValidate'),
  'mcp-verify': runner('mcp-verify.mjs', 'runMcpVerify'),
  add: runner('add.mjs', 'runAdd'),
  find: runner('find.mjs', 'runFind'),
  import: runner('import.mjs', 'runImport'),
  backlinks: runner('backlinks.mjs', 'runBacklinks'),
  orphans: runner('orphans.mjs', 'runOrphans'),
  path: runner('path.mjs', 'runPath'),
  explain: runner('explain.mjs', 'runExplain'),
  'all-paths': runner('all-paths.mjs', 'runAllPaths'),
  reachability: runner('reachability.mjs', 'runReachability'),
  'relation-check': runner('relation-check.mjs', 'runRelationCheck'),
  overview: runner('overview.mjs', 'runOverview'),
  hubs: runner('hubs.mjs', 'runHubs'),
  'blast-radius': runner('blast-radius.mjs', 'runBlastRadius'),
  cycles: runner('cycles.mjs', 'runCycles'),
  components: runner('components.mjs', 'runComponents'),
  'topological-order': runner('topological-order.mjs', 'runTopologicalOrder'),
  health: runner('health.mjs', 'runHealth'),
  'agent-brief': runner('agent-brief.mjs', 'runAgentBrief'),
  'workspace-brief': runner('workspace-brief.mjs', 'runWorkspaceBrief'),
  growth: runner('growth.mjs', 'runGrowth'),
  maintenance: runner('maintenance.mjs', 'runMaintenance'),
  node: runner('node-profile.mjs', 'runNodeProfile'),
  similar: runner('similar.mjs', 'runSimilar'),
  'match-nodes': runner('match-nodes.mjs', 'runMatchNodes'),
  'match-edges': runner('match-edges.mjs', 'runMatchEdges'),
  'domain-matrix': runner('domain-matrix.mjs', 'runDomainMatrix'),
  facets: runner('facets.mjs', 'runFacets'),
  schema: runner('schema.mjs', 'runSchema'),
  query: runner('query.mjs', 'runQuery'),
  compile: runner('compile.mjs', 'runCompile'),
  rename: runner('rename.mjs', 'runRename'),
  merge: runner('merge.mjs', 'runMerge'),
  delete: runner('delete.mjs', 'runDelete'),
  bootstrap: runner('bootstrap.mjs', 'runBootstrap'),
  analyze: runner('analyze.mjs', 'runAnalyze'),
  'infer-imports': runner('infer-imports.mjs', 'runInferImports'),
});

export const CLI_COMMAND_MODULES = Object.freeze(
  Object.fromEntries(
    Object.entries(CLI_COMMAND_RUNNERS).map(([command, runner]) => [
      command,
      runner.moduleFile,
    ]),
  ),
);

export const CLI_COMMANDS = Object.freeze(['init', ...Object.keys(CLI_COMMAND_MODULES)]);
export const CLI_COMMAND_COUNT = CLI_COMMANDS.length;

export function parseCliCommandMetadataFromDescription(description) {
  const match = String(description || '').match(/(\d+)[ -]command(?:s)?\b/i);
  if (!match) return null;
  return { commandCount: Number(match[1]) };
}
