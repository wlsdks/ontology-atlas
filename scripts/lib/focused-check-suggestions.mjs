import { existsSync } from 'node:fs';

const RULES = [
  {
    command: 'pnpm test:mcp:registration',
    reason: 'MCP source-checkout registration templates changed',
    matches: [/^\.mcp\.json(?:\.example)?$/, /^\.codex\/config\.toml$/],
  },
  {
    command: 'pnpm docs-vault:check',
    reason: 'static docs-vault input or generated manifest changed',
    matches: [/^docs\/.+\.md$/, /^src\/entities\/docs-vault\/data\/manifest\.json$/],
  },
  {
    command: 'pnpm test:docs-vault',
    reason: 'docs-vault build/check helper changed',
    matches: [/^scripts\/build-docs-vault\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'GitHub workflow or community template changed',
    matches: [
      /^\.github\/workflows\/ci\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^\.github\/DISCUSSIONS-CATEGORIES\.md$/,
      /^\.github\/ISSUE_TEMPLATE\/[^/]+\.yml$/,
    ],
  },
  {
    command: 'pnpm test:vault:validate',
    reason: 'vault validator script changed',
    matches: [/^scripts\/validate-vault(?:-script)?\.test\.mjs$/, /^scripts\/validate-vault\.mjs$/],
  },
  {
    command: 'pnpm test:vault:audit',
    reason: 'vault path audit script changed',
    matches: [/^scripts\/audit-vault-paths\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm vault:migrate --list',
    reason: 'vault migration inventory or runner changed',
    matches: [
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/(?:README\.md|[^/]+\.mjs)$/,
    ],
  },
  {
    command: 'pnpm test:contracts',
    reason: 'cross-package parser/schema/validator contract changed',
    matches: [
      /^tests\/contract\//,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault|vault-schema)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^src\/shared\/lib\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/[^/]+\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:unit',
    reason: 'MCP core unit implementation changed',
    matches: [
      /^mcp\/src\/(?:analyze|infer-imports|omot-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|index)\.(?:mjs|js)$/,
      /^mcp\/src\/(?:analyze|infer-imports|omot-ignore|ontology-compiler|ontology-engine|parser|query|validate|vault|redirect-backlinks|conflict-detection|json-rpc-lines)\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:surface',
    reason: 'MCP JSON-RPC tool registry or handler surface changed',
    matches: [/^mcp\/src\/index\.js$/],
  },
  {
    command: 'pnpm integration:mcp',
    reason: 'MCP integration test harness or broad integration contract changed',
    matches: [/^mcp\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:graph',
    reason: 'MCP graph artifact/query handler surface changed',
    matches: [/^mcp\/src\/(?:ontology-compiler|ontology-engine)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:repo-analysis',
    reason: 'MCP code-to-vault analysis handler surface changed',
    matches: [/^mcp\/src\/(?:analyze|infer-imports)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:mcp:vault-read',
    reason: 'MCP vault/frontmatter read handler surface changed',
    matches: [/^mcp\/src\/(?:validate|vault)\.mjs$/],
  },
  {
    command: 'pnpm integration:mcp:read',
    reason: 'MCP read/query tool handler surface changed',
    matches: [
      /^mcp\/src\/query\.mjs$/,
    ],
  },
  {
    command: 'pnpm integration:mcp:write',
    reason: 'MCP write tool handler surface changed',
    matches: [/^mcp\/src\/(?:index|vault)\.(?:mjs|js)$/],
  },
  {
    command: 'pnpm test:dogfood:script-refs',
    reason: 'help text, package-script references, or focused wrapper behavior changed',
    matches: [
      /^package\.json$/,
      /^scripts\/lib\/pnpm-script-refs\.(?:mjs|test\.mjs)$/,
      /^scripts\/lib\/test-name-pattern\.(?:mjs|test\.mjs)$/,
      /^scripts\/run-focused-node-test\.(?:mjs|test\.mjs)$/,
      /^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/commands\/mcp-verify\.mjs$/,
      /^mcp\/scripts\/verify\.mjs$/,
      /^README\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/benchmark\/README\.md$/,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/migrations\/README\.md$/,
      /^\.agents\/skills\/[^/]+\/SKILL\.md$/,
      /^\.claude\/LOOP-PRINCIPLES\.md$/,
      /^\.claude\/rules\/[^/]+\.md$/,
      /^\.claude\/skills\/[^/]+\/SKILL\.md$/,
    ],
  },
  {
    command: 'pnpm test:claude:hooks',
    reason: 'Claude Code/Codex hook wiring or publish guard changed',
    matches: [
      /^\.claude\/hooks\/(?:block-npm-publish|inject-ontology-summary)\.sh$/,
      /^\.claude\/settings\.json$/,
      /^\.codex\/hooks\.json$/,
      /^\.codex\/hooks\/(?:block-npm-publish|inject-ontology-summary)\.sh$/,
      /^scripts\/claude-hooks\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:dogfood:args',
    reason: 'dogfood shortcut argument helper changed',
    matches: [/^scripts\/lib\/dogfood-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:dogfood:compile-fix',
    reason: 'dogfood compile-fix idempotence helper changed',
    matches: [/^scripts\/dogfood-compile-fix\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:checks:changed',
    reason: 'changed-path focused-check advisor changed',
    matches: [
      /^scripts\/lib\/focused-check-suggestions\.(?:mjs|test\.mjs)$/,
      /^scripts\/suggest-focused-checks\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    reason: 'Vitest config, setup, or test discovery changed',
    matches: [/^vitest\.config\.ts$/, /^vitest\.setup\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    reason: 'Playwright config or webServer behavior changed',
    matches: [/^playwright\.config\.ts$/],
  },
  {
    command: 'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    reason: 'global CSS, Tailwind, or PostCSS styling behavior changed',
    matches: [/^app\/globals\.css$/, /^postcss\.config\.mjs$/],
  },
  {
    command: 'pnpm test:dogfood:status',
    reason: 'dogfood status shortcut changed',
    matches: [/^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm benchmark --dry-run',
    reason: 'Codex benchmark runner config changed',
    matches: [/^scripts\/benchmark\.mjs$/],
  },
  {
    command: 'pnpm benchmark:scale --dry-run',
    reason: 'Codex scale benchmark runner config changed',
    matches: [/^scripts\/benchmark-scale\.mjs$/],
  },
  {
    command: 'node scripts/perf-vault.mjs 10',
    reason: 'vault parser perf smoke changed',
    matches: [/^scripts\/perf-vault\.mjs$/],
  },
  {
    command: 'node --test scripts/perf-graph.test.mjs',
    reason: 'graph compiler/query perf audit helper contract changed',
    matches: [/^scripts\/perf-graph\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm perf:graph:check',
    reason: 'graph compiler/query perf budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm perf:graph:scale',
    reason: 'graph compiler/query scale budget changed',
    matches: [/^scripts\/perf-graph\.mjs$/],
  },
  {
    command: 'pnpm smoke:onboarding',
    reason: 'clean onboarding smoke changed',
    matches: [/^scripts\/smoke-clean-onboarding\.mjs$/],
  },
  {
    command: 'pnpm exec tsc --noEmit',
    reason: 'TypeScript or Next.js static export config changed',
    matches: [
      /^app\/.*\.(?:ts|tsx)$/,
      /^next\.config\.ts$/,
      /^next-env\.d\.ts$/,
      /^src\/(?!.*\.(?:test|spec)\.).*\.(?:ts|tsx)$/,
      /^src\/i18n\/.*\.ts$/,
      /^tsconfig\.json$/,
      /^\.githooks\/pre-push$/,
    ],
  },
  {
    command: 'pnpm test:i18n:messages',
    reason: 'locale routing or message catalog changed',
    matches: [
      /^messages\/[^/]+\.json$/,
      /^src\/i18n\/.*\.ts$/,
      /^scripts\/validate-messages\.test\.mjs$/,
    ],
  },
  {
    command: 'pnpm lint',
    reason: 'ESLint boundary or style rules changed',
    matches: [/^eslint\.config\.mjs$/],
  },
  {
    command: 'pnpm build',
    reason: 'static export artifact is needed before checking bundle-sensitive changes',
    matches: [/^scripts\/check-bundle\.mjs$/, /^next\.config\.ts$/],
  },
  {
    command: 'pnpm bundle:check',
    reason: 'local-first bundle or static export config changed',
    matches: [/^scripts\/check-bundle\.mjs$/, /^next\.config\.ts$/],
  },
  {
    command: 'pnpm test:mcp:dogfood:timeout',
    reason: 'MCP dogfood timeout/argument diagnostics changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:dogfood',
    reason: 'MCP dogfood helper changed',
    matches: [/^scripts\/dogfood-mcp-walk\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:verify:first-contact',
    reason: 'MCP verify first-contact helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify:timeout',
    reason: 'MCP verify timeout/startup diagnostics changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:verify',
    reason: 'MCP verify helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:maintenance',
    reason: 'maintenance_plan queue or formatter behavior changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/, /^scripts\/dogfood-status\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:mcp:suggestions',
    reason: 'MCP enum or argument suggestion behavior changed',
    matches: [/^mcp\/src\/suggestions\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:args',
    reason: 'CLI argument parser changed',
    matches: [/^cli\/src\/lib\/cli-args\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:mcp-call',
    reason: 'CLI MCP response wrapper changed',
    matches: [/^cli\/src\/lib\/mcp-call\.(?:mjs|test\.mjs)$/],
  },
  {
    command: 'pnpm test:cli:lib',
    reason: 'CLI shared helper changed',
    matches: [/^cli\/src\/lib\//],
  },
  {
    command: 'pnpm integration:cli:entry',
    reason: 'CLI entrypoint, help, or init dispatch changed',
    matches: [/^cli\/src\/index\.mjs$/, /^cli\/src\/lib\/cli-commands\.mjs$/],
  },
  {
    command: 'pnpm integration:cli',
    reason: 'CLI integration test harness or broad integration contract changed',
    matches: [/^cli\/src\/integration\.test\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:compile',
    reason: 'CLI compile command changed',
    matches: [/^cli\/src\/commands\/compile\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:mcp-verify',
    reason: 'CLI mcp-verify command changed',
    matches: [/^cli\/src\/commands\/mcp-verify\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:diagnosis',
    reason: 'CLI health/agent-brief/workspace-brief diagnosis command changed',
    matches: [/^cli\/src\/commands\/(?:health|agent-brief|workspace-brief)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:graph-read',
    reason: 'CLI graph read command changed',
    matches: [
      /^cli\/src\/commands\/(?:backlinks|path|all-paths|relation-check|orphans|query|overview|hubs|blast-radius|cycles|node-profile|similar)\.mjs$/,
      /^cli\/src\/lib\/query-plan-output\.(?:mjs|test\.mjs)$/,
    ],
  },
  {
    command: 'pnpm integration:cli:graph-write',
    reason: 'CLI graph write command changed',
    matches: [/^cli\/src\/commands\/(?:rename|delete|merge)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:repo-analysis',
    reason: 'CLI repo analysis or bootstrap command changed',
    matches: [/^cli\/src\/commands\/(?:analyze|infer-imports|bootstrap)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    command: 'pnpm integration:cli:local-vault',
    reason: 'CLI local vault/frontmatter command changed',
    matches: [/^cli\/src\/commands\/(?:add|import|list|find|validate)\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:growth',
    reason: 'CLI growth command changed',
    matches: [/^cli\/src\/commands\/growth\.mjs$/],
  },
  {
    command: 'pnpm integration:cli:maintenance',
    reason: 'CLI maintenance command changed',
    matches: [/^cli\/src\/commands\/maintenance\.mjs$/],
  },
  {
    command: 'pnpm test:mcp:package',
    reason: 'package or release contract changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/ci\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm test:mcp:docs',
    reason: 'public docs or dogfood ontology docs changed',
    matches: [
      /^README\.md$/,
      /^AGENTS\.md$/,
      /^CLAUDE\.md$/,
      /^docs\/DEVELOPMENT-CHECKS\.md$/,
      /^docs\/CHANGELOG\.md$/,
      /^docs\/ontology\//,
      /^mcp\/README\.md$/,
      /^cli\/README\.md$/,
      /^scripts\/check-package-contracts\.test\.mjs$/,
      /^firebase\.json$/,
    ],
  },
  {
    command: 'pnpm dogfood:status',
    reason: 'dogfood ontology or MCP/CLI dogfood surface changed',
    matches: [/^docs\/ontology\//, /^mcp\//, /^cli\//, /^scripts\/dogfood/],
  },
];

const ESCALATIONS = [
  {
    command: 'pnpm package:check',
    reason: 'package manifests, docs contracts, or release scripts changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/ci\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
  {
    command: 'pnpm dogfood:verify',
    reason: 'shared MCP/CLI verification surface changed',
    matches: [/^mcp\//, /^cli\/src\/commands\/mcp-verify\.mjs$/, /^scripts\/smoke-packed-cli\.mjs$/],
  },
];

const MCP_DIRECT_UNIT_TESTS = new Map([
  ['mcp/src/analyze.mjs', 'mcp/src/analyze.test.mjs'],
  ['mcp/src/infer-imports.mjs', 'mcp/src/infer-imports.test.mjs'],
  ['mcp/src/omot-ignore.mjs', 'mcp/src/omot-ignore.test.mjs'],
  ['mcp/src/ontology-compiler.mjs', 'mcp/src/ontology-compiler.test.mjs'],
  ['mcp/src/ontology-engine.mjs', 'mcp/src/ontology-engine.test.mjs'],
  ['mcp/src/parser.mjs', 'mcp/src/parser.test.mjs'],
  ['mcp/src/query.mjs', 'mcp/src/query.test.mjs'],
  ['mcp/src/suggestions.mjs', 'mcp/src/suggestions.test.mjs'],
  ['mcp/src/validate.mjs', 'mcp/src/validate.test.mjs'],
  ['mcp/src/vault.mjs', 'mcp/src/vault.test.mjs'],
  ['mcp/scripts/json-rpc-lines.mjs', 'mcp/src/json-rpc-lines.test.mjs'],
]);

const MCP_DIRECT_UNIT_TEST_FILES = new Set([
  ...MCP_DIRECT_UNIT_TESTS.values(),
  'mcp/src/redirect-backlinks.test.mjs',
  'mcp/src/conflict-detection.test.mjs',
  'mcp/src/json-rpc-lines.test.mjs',
]);

const CLI_DIRECT_LIB_TESTS = new Map([
  ['cli/src/lib/batch-results.mjs', 'cli/src/lib/batch-results.test.mjs'],
  ['cli/src/lib/captured-summary.mjs', 'cli/src/lib/captured-summary.test.mjs'],
  ['cli/src/lib/cli-args.mjs', 'cli/src/lib/cli-args.test.mjs'],
  ['cli/src/lib/cli-commands.mjs', 'cli/src/lib/cli-commands.test.mjs'],
  ['cli/src/lib/diagnosis-colors.mjs', 'cli/src/lib/diagnosis-colors.test.mjs'],
  ['cli/src/lib/diagnosis-options.mjs', 'cli/src/lib/diagnosis-options.test.mjs'],
  ['cli/src/lib/import-analysis-results.mjs', 'cli/src/lib/import-analysis-results.test.mjs'],
  ['cli/src/lib/mcp-call.mjs', 'cli/src/lib/mcp-call.test.mjs'],
  ['cli/src/lib/mcp-metadata.mjs', 'cli/src/lib/mcp-metadata.test.mjs'],
  ['cli/src/lib/query-plan-output.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-plan-output.test.mjs', 'cli/src/lib/query-plan-output.test.mjs'],
  ['cli/src/lib/query-result-contract.mjs', 'cli/src/lib/query-result-contract.test.mjs'],
  ['cli/src/lib/repo-analysis-results.mjs', 'cli/src/lib/repo-analysis-results.test.mjs'],
  ['cli/src/lib/resolve-vault.mjs', 'cli/src/lib/resolve-vault.test.mjs'],
  ['cli/src/lib/vault-census.mjs', 'cli/src/lib/vault-census.test.mjs'],
]);

const CLI_DIRECT_LIB_TEST_FILES = new Set(CLI_DIRECT_LIB_TESTS.values());

const SCRIPT_DIRECT_LIB_TESTS = new Map([
  ['scripts/audit-vault-paths.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/audit-vault-paths.test.mjs', 'scripts/audit-vault-paths.test.mjs'],
  ['scripts/build-docs-vault.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/build-docs-vault.test.mjs', 'scripts/build-docs-vault.test.mjs'],
  ['scripts/dogfood-compile-fix.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-compile-fix.test.mjs', 'scripts/dogfood-compile-fix.test.mjs'],
  ['scripts/dogfood-mcp-walk.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-mcp-walk.test.mjs', 'scripts/dogfood-mcp-walk.test.mjs'],
  ['scripts/dogfood-status.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/dogfood-status.test.mjs', 'scripts/dogfood-status.test.mjs'],
  ['scripts/run-focused-node-test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/run-focused-node-test.test.mjs', 'scripts/run-focused-node-test.test.mjs'],
  ['scripts/lib/dogfood-args.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/dogfood-args.test.mjs', 'scripts/lib/dogfood-args.test.mjs'],
  ['scripts/lib/focused-check-suggestions.mjs', 'scripts/lib/focused-check-suggestions.test.mjs'],
  ['scripts/lib/pnpm-script-refs.mjs', 'scripts/lib/pnpm-script-refs.test.mjs'],
  ['scripts/lib/test-name-pattern.mjs', 'scripts/lib/test-name-pattern.test.mjs'],
  ['scripts/lib/vault-census.mjs', 'scripts/lib/vault-census.test.mjs'],
  ['scripts/validate-messages.test.mjs', 'scripts/validate-messages.test.mjs'],
  ['scripts/validate-vault.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/validate-vault-script.test.mjs', 'scripts/validate-vault-script.test.mjs'],
  ['scripts/check-package-contracts.mjs', 'scripts/check-package-contracts.test.mjs'],
  ['scripts/check-package-contracts.test.mjs', 'scripts/check-package-contracts.test.mjs'],
]);

const SCRIPT_DIRECT_LIB_TEST_FILES = new Set(SCRIPT_DIRECT_LIB_TESTS.values());

const FOCUSED_CHECK_DIRECT_TESTS = new Map([
  ['scripts/suggest-focused-checks.mjs', 'scripts/suggest-focused-checks.test.mjs'],
  ['scripts/suggest-focused-checks.test.mjs', 'scripts/suggest-focused-checks.test.mjs'],
]);

export function normalizeChangedPath(path) {
  return String(path || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

export function suggestFocusedChecks(paths = []) {
  const normalizedPaths = [...new Set(paths.map(normalizeChangedPath).filter(Boolean))];
  const staticCommands = rulesToSuggestions(RULES, normalizedPaths);
  const withVitestDirect = prependSuggestions(
    staticCommands,
    directVitestTestSuggestions(normalizedPaths),
  );
  const withPlaywrightDirect = prependSuggestions(
    withVitestDirect,
    directPlaywrightTestSuggestions(normalizedPaths),
  );
  const withMcpDirect = insertBeforeCommand(
    withPlaywrightDirect,
    directMcpUnitTestSuggestions(normalizedPaths),
    'pnpm test:mcp:unit',
  );
  const commands = insertBeforeCommand(
    withMcpDirect,
    directCliLibTestSuggestions(normalizedPaths),
    'pnpm test:cli:lib',
  );
  const withScriptDirect = insertBeforeCommand(
    commands,
    directScriptLibTestSuggestions(normalizedPaths),
    'pnpm test:dogfood:script-refs',
  );
  const withFocusedCheckDirect = insertBeforeCommand(
    withScriptDirect,
    directFocusedCheckTestSuggestions(normalizedPaths),
    'pnpm test:checks:changed',
  );
  const escalations = rulesToSuggestions(ESCALATIONS, normalizedPaths);
  return { paths: normalizedPaths, commands: withFocusedCheckDirect, escalations };
}

function directVitestTestSuggestions(paths) {
  const pathSet = new Set(paths);
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = resolveVitestTestFile(path, pathSet);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec vitest run ${testFile}`,
      reason: 'direct Vitest sibling test for changed app/source file',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directPlaywrightTestSuggestions(paths) {
  return paths
    .filter((path) => /^tests\/e2e\/.+\.spec\.ts$/.test(path))
    .map((path) => ({
      command: `pnpm exec playwright test ${path}`,
      reason: 'direct Playwright spec for changed e2e test',
      paths: [path],
    }));
}

function resolveVitestTestFile(path, pathSet) {
  if (!/^(?:src|app)\//.test(path)) return null;
  if (!/\.(?:ts|tsx)$/.test(path)) return null;
  if (/\.(?:test|spec)\.(?:ts|tsx)$/.test(path)) return path;

  const testFile = path.replace(/\.(tsx?)$/, '.test.$1');
  if (pathSet.has(testFile) || existsSync(testFile)) return testFile;
  return null;
}

function directMcpUnitTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = MCP_DIRECT_UNIT_TESTS.get(path) ?? (MCP_DIRECT_UNIT_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct MCP unit test for changed core file',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directCliLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = CLI_DIRECT_LIB_TESTS.get(path) ?? (CLI_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct CLI lib unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directScriptLibTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = SCRIPT_DIRECT_LIB_TESTS.get(path) ?? (SCRIPT_DIRECT_LIB_TEST_FILES.has(path) ? path : null);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct script helper unit test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function directFocusedCheckTestSuggestions(paths) {
  const byTestFile = new Map();
  for (const path of paths) {
    const testFile = FOCUSED_CHECK_DIRECT_TESTS.get(path);
    if (!testFile) continue;
    const row = byTestFile.get(testFile) ?? {
      command: `pnpm exec node --test ${testFile}`,
      reason: 'direct focused-check advisor test for changed helper',
      paths: [],
    };
    row.paths.push(path);
    byTestFile.set(testFile, row);
  }
  return [...byTestFile.values()];
}

function prependSuggestions(suggestions, additions) {
  if (additions.length === 0) return suggestions;
  const existing = new Set(suggestions.map((item) => item.command));
  const uniqueAdditions = additions.filter((item) => !existing.has(item.command));
  return [...uniqueAdditions, ...suggestions];
}

function insertBeforeCommand(suggestions, additions, command) {
  if (additions.length === 0) return suggestions;
  const seen = new Set();
  const uniqueAdditions = additions.filter((item) => {
    if (seen.has(item.command)) return false;
    seen.add(item.command);
    return true;
  });
  const index = suggestions.findIndex((item) => item.command === command);
  if (index === -1) return [...uniqueAdditions, ...suggestions];
  return [
    ...suggestions.slice(0, index),
    ...uniqueAdditions,
    ...suggestions.slice(index),
  ];
}

function rulesToSuggestions(rules, paths) {
  const seen = new Set();
  const suggestions = [];
  for (const rule of rules) {
    const matchedPaths = paths.filter((path) => rule.matches.some((pattern) => pattern.test(path)));
    if (matchedPaths.length === 0 || seen.has(rule.command)) continue;
    seen.add(rule.command);
    suggestions.push({ command: rule.command, reason: rule.reason, paths: matchedPaths });
  }
  return suggestions;
}

export function formatFocusedCheckSuggestions({ paths = [], commands = [], escalations = [] } = {}) {
  if (paths.length === 0) {
    return [
      '[focused-checks] no changed paths against HEAD or untracked files',
      'Use `pnpm checks:changed -- <path...>` to inspect a planned file set.',
    ].join('\n');
  }
  const lines = [
    `[focused-checks] ${paths.length} changed path${paths.length === 1 ? '' : 's'}`,
  ];
  if (commands.length === 0) {
    lines.push('First checks: no focused mapping; choose the nearest area from docs/DEVELOPMENT-CHECKS.md.');
  } else {
    lines.push('First checks:');
    for (const suggestion of commands) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  if (escalations.length > 0) {
    lines.push('Escalate when needed:');
    for (const suggestion of escalations) {
      lines.push(`  ${suggestion.command}  # ${suggestion.reason}`);
    }
  }
  return lines.join('\n');
}
