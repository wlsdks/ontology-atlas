/** The MCP server: unit and integration suites, registration, bundle, catalogue, and verify helpers. */

export const rules = [
  { order: 30, command: 'pnpm test:mcp:rpc', reason: 'stdio integration harness lifecycle changed', matches: [/^scripts\/lib\/mcp-test-rpc(?:\.test)?\.mjs$/, /^mcp\/src\/integration\.test\.mjs$/] },
  { order: 40, command: 'pnpm mcp:catalogue:check', reason: 'captured registry inputs changed', matches: [/^scripts\/data\/mcp-registry-snapshot\.json$/] },
  {
    order: 120,
    command: 'pnpm test:mcp:registration',
    reason: 'MCP source-checkout registration templates changed',
    matches: [/^\.mcp\.json(?:\.example)?$/, /^\.codex\/config\.toml$/],
  },
  {
    order: 130,
    // The ecosystem channel is two artifacts and one metadata entry, and the
    // pieces verify each other: the image's ownership label must repeat the
    // registry name, and the release must upload the exact artifact name the
    // entry points at. Editing any one piece alone is how that agreement breaks.
    command: 'pnpm test:mcp:bundle && pnpm mcp:registry:check',
    reason: 'the MCP ecosystem channel changed — bundle build, container image, registry entry, or release upload',
    matches: [
      /^scripts\/(?:build-mcp-bundle|build-server-json)\.mjs$/,
      /^scripts\/lib\/mcp-bundle\.mjs$/,
      /^scripts\/mcp-bundle\.test\.mjs$/,
      /^mcp\/Dockerfile$/,
      /^mcp\/package\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
    ],
  },
  {
    order: 320,
    /*
     * The catalogue is committed data with a `--check` mode, exactly like the ACP registry beside
     * it: a hand edit to the generated file, or a curation change that was never regenerated, is
     * invisible in review and shows up as a row pointing at a package that does not exist. The
     * check regenerates and diffs, and runs the generator's own tests in the same breath.
     */
    command: 'pnpm mcp:catalogue:check',
    reason: 'the committed MCP connector catalogue or its generator changed',
    matches: [
      /^scripts\/build-mcp-catalogue\.(?:mjs|test\.mjs)$/,
      /^src\/shared\/config\/mcp-catalogue(?:\.generated)?\.ts$/,
    ],
  },
  {
    order: 450,
    command: 'pnpm test:mcp:unit',
    reason: 'MCP source or unit contract changed',
    matches: [
      /^mcp\/src\/(?!integration\.test\.mjs$)[^/]+\.(?:mjs|js)$/,
      /^tests\/fixtures\/source-hidden-field-trial\/v1\.json$/,
    ],
  },
  {
    order: 460,
    command: 'pnpm integration:mcp:surface',
    reason: 'MCP JSON-RPC tool registry or handler surface changed',
    matches: [/^mcp\/src\/index\.js$/],
  },
  {
    order: 470,
    command: 'pnpm integration:mcp',
    reason: 'MCP integration test harness or broad integration contract changed',
    matches: [/^mcp\/src\/integration\.test\.mjs$/],
  },
  {
    order: 480,
    command: 'pnpm integration:mcp:graph',
    reason: 'MCP graph artifact/query handler surface changed',
    matches: [/^mcp\/src\/(?:ontology-compiler|ontology-engine)\.mjs$/],
  },
  {
    order: 490,
    command: 'pnpm integration:mcp:repo-analysis',
    reason: 'MCP code-to-vault analysis handler surface changed',
    matches: [/^mcp\/src\/(?:analyze|architecture-profile|meaning-evaluation|construction-qualification|construction-lifecycle|infer-imports)\.mjs$/, /^tsconfig\.json$/],
  },
  {
    order: 500,
    command: 'pnpm integration:mcp:vault-read',
    reason: 'MCP vault/frontmatter read handler surface changed',
    matches: [/^mcp\/src\/(?:validate|vault)\.mjs$/],
  },
  {
    order: 510,
    command: 'pnpm integration:mcp:read',
    reason: 'MCP read/query tool handler surface changed',
    matches: [
      /^mcp\/src\/query\.mjs$/,
    ],
  },
  {
    order: 520,
    command: 'pnpm integration:mcp:write',
    reason: 'MCP write tool handler surface changed',
    matches: [/^mcp\/src\/(?:index|vault)\.(?:mjs|js)$/],
  },
  {
    order: 1090,
    command: 'pnpm test:mcp:verify:first-contact',
    reason: 'MCP verify first-contact helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    order: 1100,
    command: 'pnpm test:mcp:verify:timeout',
    reason: 'MCP verify timeout/startup diagnostics changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    order: 1110,
    command: 'pnpm test:mcp:verify',
    reason: 'MCP verify helper changed',
    matches: [/^mcp\/scripts\/verify\.mjs$/, /^mcp\/src\/verify-script\.test\.mjs$/],
  },
  {
    order: 1130,
    command: 'pnpm test:mcp:suggestions',
    reason: 'MCP enum or argument suggestion behavior changed',
    matches: [/^mcp\/src\/suggestions\.(?:mjs|test\.mjs)$/],
  },
];

export const escalations = [
  {
    order: 20,
    command: 'pnpm dogfood:verify',
    reason: 'shared MCP/CLI verification surface changed',
    matches: [/^mcp\//, /^cli\/src\/commands\/mcp-verify\.mjs$/, /^scripts\/smoke-packed-cli\.mjs$/],
  },
];

export const directTests = {
  mcp: [
    ['mcp/src/analyze.mjs', 'mcp/src/analyze.test.mjs'],
    ['mcp/src/architecture-profile.mjs', 'mcp/src/architecture-profile.test.mjs'],
    ['mcp/src/meaning-evaluation.mjs', 'mcp/src/meaning-evaluation.test.mjs'],
    ['mcp/src/construction-qualification.mjs', 'mcp/src/construction-qualification.test.mjs'],
    ['mcp/src/construction-lifecycle.mjs', 'mcp/src/construction-lifecycle.test.mjs'],
    ['mcp/src/infer-imports.mjs', 'mcp/src/infer-imports.test.mjs'],
    ['mcp/src/ontology-atlas-ignore.mjs', 'mcp/src/ontology-atlas-ignore.test.mjs'],
    ['mcp/src/ontology-compiler.mjs', 'mcp/src/ontology-compiler.test.mjs'],
    ['mcp/src/ontology-engine.mjs', 'mcp/src/ontology-engine.test.mjs'],
    ['mcp/src/parser.mjs', 'mcp/src/parser.test.mjs'],
    ['mcp/src/query.mjs', 'mcp/src/query.test.mjs'],
    ['mcp/src/suggestions.mjs', 'mcp/src/suggestions.test.mjs'],
    ['mcp/src/validate.mjs', 'mcp/src/validate.test.mjs'],
    ['mcp/src/vault.mjs', 'mcp/src/vault.test.mjs'],
    ['mcp/scripts/json-rpc-lines.mjs', 'mcp/src/json-rpc-lines.test.mjs'],
    ['tests/fixtures/source-hidden-field-trial/v1.json', 'mcp/src/source-hidden-field-trial.test.mjs'],
    ['mcp/src/redirect-backlinks.test.mjs', 'mcp/src/redirect-backlinks.test.mjs'],
    ['mcp/src/conflict-detection.test.mjs', 'mcp/src/conflict-detection.test.mjs'],
    ['mcp/src/json-rpc-lines.test.mjs', 'mcp/src/json-rpc-lines.test.mjs'],
    ['mcp/src/source-hidden-field-trial.test.mjs', 'mcp/src/source-hidden-field-trial.test.mjs'],
  ],
};
