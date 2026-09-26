/** The CLI: command and shared-helper suites and the per-command integration lanes. */

export const rules = [
  {
    order: 110,
    // cli/src/lib has had this aggregate for a while (test:cli:lib below);
    // cli/src/commands never got its twin, so a command suite whose file name
    // is not the sibling `<command>.test.mjs` — relate.snapshot-write,
    // validate.exit-codes — ran only inside `pnpm package:check` on the
    // push-to-main lane and on no pull request at all (2026-09-01 review).
    command: 'pnpm test:cli:commands',
    reason: 'a CLI command implementation changed',
    matches: [/^cli\/src\/commands\//],
  },
  {
    order: 1120,
    command: 'pnpm test:mcp:maintenance',
    reason: 'maintenance_plan queue or formatter behavior changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/, /^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 1140,
    command: 'pnpm test:cli:args',
    reason: 'CLI argument parser changed',
    matches: [/^cli\/src\/lib\/cli-args\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 1150,
    command: 'pnpm test:cli:mcp-call',
    reason: 'CLI MCP response wrapper changed',
    matches: [/^cli\/src\/lib\/mcp-call\.(?:mjs|test\.mjs)$/],
  },
  {
    order: 1160,
    command: 'pnpm test:cli:lib',
    reason: 'CLI shared helper changed',
    matches: [/^cli\/src\/lib\//],
  },
  {
    order: 1170,
    command: 'pnpm integration:cli:entry',
    reason: 'CLI entrypoint, help, or init dispatch changed',
    matches: [/^cli\/src\/index\.mjs$/, /^cli\/src\/lib\/cli-commands\.mjs$/],
  },
  {
    order: 1180,
    command: 'pnpm integration:cli:setup',
    reason: 'agent config merge, root rebind, or setup flow changed',
    matches: [
      /^cli\/src\/lib\/agent-config\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/commands\/agent-setup\.mjs$/,
    ],
  },
  {
    order: 1190,
    command: 'pnpm integration:cli',
    reason: 'CLI integration test harness or broad integration contract changed',
    matches: [/^cli\/src\/integration\.test\.mjs$/],
  },
  {
    order: 1200,
    command: 'pnpm integration:cli:compile',
    reason: 'CLI compile command changed',
    matches: [/^cli\/src\/commands\/compile\.mjs$/],
  },
  {
    order: 1210,
    command: 'pnpm integration:cli:mcp-verify',
    reason: 'CLI mcp-verify command changed',
    matches: [/^cli\/src\/commands\/mcp-verify\.mjs$/],
  },
  {
    order: 1220,
    command: 'pnpm integration:cli:diagnosis',
    reason: 'CLI health/agent-brief/workspace-brief diagnosis command changed',
    matches: [/^cli\/src\/commands\/(?:health|agent-brief|workspace-brief)\.mjs$/],
  },
  {
    order: 1230,
    command: 'pnpm integration:cli:graph-read',
    reason: 'CLI graph read command changed',
    matches: [
      /^cli\/src\/commands\/(?:backlinks|path|all-paths|relation-check|orphans|query|overview|hubs|blast-radius|cycles|node-profile|similar)\.mjs$/,
      /^cli\/src\/lib\/query-plan-output\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    order: 1240,
    command: 'pnpm integration:cli:graph-write',
    reason: 'CLI graph write command changed',
    matches: [/^cli\/src\/commands\/(?:rename|delete|merge)\.mjs$/],
  },
  {
    order: 1250,
    command: 'pnpm integration:cli:repo-analysis',
    reason: 'CLI repo analysis or bootstrap command changed',
    matches: [/^cli\/src\/commands\/(?:analyze|infer-imports|architecture|bootstrap)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    order: 1260,
    command: 'pnpm integration:cli:local-vault',
    reason: 'CLI local vault/frontmatter command changed',
    matches: [/^cli\/src\/commands\/(?:add|import|list|find|validate)\.mjs$/],
  },
  {
    order: 1270,
    command: 'pnpm integration:cli:growth',
    reason: 'CLI growth command changed',
    matches: [/^cli\/src\/commands\/growth\.mjs$/],
  },
  {
    order: 1280,
    command: 'pnpm integration:cli:maintenance',
    reason: 'CLI maintenance command changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/],
  },
];

export const directTests = {
  cli: [
    ['cli/src/lib/captured-summary.mjs', 'cli/src/lib/captured-summary.test.mjs'],
    ['cli/src/lib/cli-args.mjs', 'cli/src/lib/cli-args.test.mjs'],
    ['cli/src/lib/cli-commands.mjs', 'cli/src/lib/cli-commands.test.mjs'],
    ['cli/src/lib/diagnosis-colors.mjs', 'cli/src/lib/diagnosis-colors.test.mjs'],
    ['cli/src/lib/diagnosis-options.mjs', 'cli/src/lib/diagnosis-options.test.mjs'],
    ['cli/src/lib/import-analysis-results.mjs', 'cli/src/lib/import-analysis-results.test.mjs'],
    ['cli/src/lib/mcp-call.mjs', 'cli/src/lib/mcp-call.test.mjs'],
    ['cli/src/lib/mcp-metadata.mjs', 'cli/src/lib/mcp-metadata.test.mjs'],
    ['cli/src/lib/mcp-module.mjs', 'cli/src/lib/mcp-module.test.mjs'],
    ['cli/src/lib/mcp-module.test.mjs', 'cli/src/lib/mcp-module.test.mjs'],
    ['cli/src/lib/query-plan-output.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
    ['cli/src/lib/query-plan-output.test.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
    ['cli/src/lib/query-result-contract.mjs', 'cli/src/lib/query-result-contract.test.mjs'],
    ['cli/src/lib/repo-analysis-results.mjs', 'cli/src/lib/repo-analysis-results.test.mjs'],
    ['cli/src/lib/resolve-vault.mjs', 'cli/src/lib/resolve-vault.test.mjs'],
  ],
};
