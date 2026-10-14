function runner(moduleFile, exportName) {
  return {
    modulePath: `./commands/${moduleFile}`,
    moduleFile,
    exportName,
  };
}

export const CLI_COMMAND_RUNNERS = Object.freeze({
  list: runner('local-vault/list.mjs', 'runList'),
  validate: runner('local-vault/validate.mjs', 'runValidate'),
  'wiki-validate': runner('library/wiki-validate.mjs', 'runWikiValidate'),
  'wiki-index': runner('library/wiki-index.mjs', 'runWikiIndex'),
  'mcp-verify': runner('agent-setup/mcp-verify.mjs', 'runMcpVerify'),
  'agent-setup': runner('agent-setup/agent-setup.mjs', 'runAgentSetup'),
  'agent-files': runner('agent-setup/agent-files.mjs', 'runAgentFiles'),
  'agent-activity': runner('diagnosis/agent-activity.mjs', 'runAgentActivity'),
  add: runner('local-vault/add.mjs', 'runAdd'),
  find: runner('local-vault/find.mjs', 'runFind'),
  import: runner('local-vault/import.mjs', 'runImport'),
  absorb: runner('local-vault/absorb.mjs', 'runAbsorb'),
  moment: runner('diagnosis/moment.mjs', 'runMoment'),
  backlinks: runner('graph-traversal/backlinks.mjs', 'runBacklinks'),
  constellations: runner('library/constellations.mjs', 'runConstellations'),
  constellation: runner('library/constellation.mjs', 'runConstellation'),
  orphans: runner('graph-traversal/orphans.mjs', 'runOrphans'),
  path: runner('graph-traversal/path.mjs', 'runPath'),
  explain: runner('graph-traversal/explain.mjs', 'runExplain'),
  'all-paths': runner('graph-traversal/all-paths.mjs', 'runAllPaths'),
  reachability: runner('graph-traversal/reachability.mjs', 'runReachability'),
  'relation-check': runner('graph-write/relation-check.mjs', 'runRelationCheck'),
  relate: runner('graph-write/relate.mjs', 'runRelate'),
  'remove-relation': runner('graph-write/remove-relation.mjs', 'runRemoveRelation'),
  'install-shim': runner('agent-setup/install-shim.mjs', 'runInstallShim'),
  overview: runner('graph-query/overview.mjs', 'runOverview'),
  hubs: runner('graph-query/hubs.mjs', 'runHubs'),
  'blast-radius': runner('graph-traversal/blast-radius.mjs', 'runBlastRadius'),
  cycles: runner('graph-traversal/cycles.mjs', 'runCycles'),
  components: runner('graph-traversal/components.mjs', 'runComponents'),
  'topological-order': runner('graph-traversal/topological-order.mjs', 'runTopologicalOrder'),
  health: runner('diagnosis/health.mjs', 'runHealth'),
  analysis: runner('repo-analysis/analysis.mjs', 'runAnalysis'),
  'agent-brief': runner('diagnosis/agent-brief.mjs', 'runAgentBrief'),
  'workspace-brief': runner('diagnosis/workspace-brief.mjs', 'runWorkspaceBrief'),
  growth: runner('diagnosis/growth.mjs', 'runGrowth'),
  maintenance: runner('diagnosis/maintenance.mjs', 'runMaintenance'),
  node: runner('graph-query/node-profile.mjs', 'runNodeProfile'),
  similar: runner('graph-query/similar.mjs', 'runSimilar'),
  'match-nodes': runner('graph-query/match-nodes.mjs', 'runMatchNodes'),
  'match-edges': runner('graph-query/match-edges.mjs', 'runMatchEdges'),
  'domain-matrix': runner('graph-query/domain-matrix.mjs', 'runDomainMatrix'),
  facets: runner('graph-query/facets.mjs', 'runFacets'),
  schema: runner('graph-query/schema.mjs', 'runSchema'),
  'pattern-walk': runner('graph-traversal/pattern-walk.mjs', 'runPatternWalk'),
  'project-map': runner('graph-query/project-map.mjs', 'runProjectMap'),
  query: runner('graph-query/query.mjs', 'runQuery'),
  compile: runner('graph-query/compile.mjs', 'runCompile'),
  export: runner('graph-query/export.mjs', 'runExport'),
  rename: runner('graph-write/rename.mjs', 'runRename'),
  merge: runner('graph-write/merge.mjs', 'runMerge'),
  delete: runner('graph-write/delete.mjs', 'runDelete'),
  index: runner('repo-analysis/index.mjs', 'runIndex'),
  bootstrap: runner('repo-analysis/bootstrap.mjs', 'runBootstrap'),
  analyze: runner('repo-analysis/analyze.mjs', 'runAnalyze'),
  architecture: runner('repo-analysis/architecture.mjs', 'runArchitecture'),
  'infer-imports': runner('repo-analysis/infer-imports.mjs', 'runInferImports'),
  preflight: runner('graph-traversal/preflight.mjs', 'runPreflight'),
  snapshot: runner('graph-write/snapshot.mjs', 'runSnapshot'),
  'connect-source': runner('repo-analysis/connect-source.mjs', 'runConnectSource'),
  'disconnect-source': runner('repo-analysis/disconnect-source.mjs', 'runDisconnectSource'),
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
