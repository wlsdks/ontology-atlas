import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatFocusedCheckSuggestions,
  normalizeChangedPath,
  suggestFocusedChecks,
} from './focused-check-suggestions.mjs';

const SOURCE_LANGUAGE_COMMAND = 'pnpm source:language';
const DEAD_CODE_COMMAND = 'pnpm knip';

function commandNames(result) {
  return result.commands.map((row) => row.command);
}

// The source-language gate is intentionally cross-cutting. Domain-specific tests
// keep asserting their own exact ordering, while one dedicated test below owns
// the invariant that every supported source path adds this shared gate exactly once.
function domainCommands(result) {
  return commandNames(result).filter(
    (command) => command !== SOURCE_LANGUAGE_COMMAND && command !== DEAD_CODE_COMMAND,
  );
}

describe('focused check suggestions', () => {
  it('normalizes paths for git and shell input', () => {
    assert.equal(normalizeChangedPath('./mcp\\scripts\\verify.mjs'), 'mcp/scripts/verify.mjs');
    assert.equal(normalizeChangedPath('  docs/ontology/project.md  '), 'docs/ontology/project.md');
  });

  it('suggests the narrow registration gate for source-checkout MCP templates', () => {
    const result = suggestFocusedChecks(['.mcp.json', '.mcp.json.example']);

    // `.mcp.json` is also what `agents:check` measures agent-brief MCP grants
    // against, so both gates are correct here.
    assert.deepEqual(domainCommands(result), ['pnpm test:mcp:registration', 'pnpm agents:check']);
    assert.deepEqual(result.escalations, []);
  });

  it('suggests docs-vault, docs contract, dogfood status, and the gateway specimen for dogfood ontology docs', () => {
    const result = suggestFocusedChecks(['docs/ontology/capabilities/mcp-server.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:check',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
      'pnpm vault:validate',
      // The gateway renders one vault file verbatim and states the vault's node count, so any
      // vault edit can invalidate the committed copy of it.
      'pnpm gateway:specimen:check',
      'pnpm test:run tests/contract/em-dash-ratchet.contract.test.ts',
      'pnpm test:run tests/contract/vault-section-shape.contract.test.ts',
    ]);
  });

  it('suggests docs-vault freshness for any markdown doc indexed by the static docs vault', () => {
    const result = suggestFocusedChecks(['docs/FEATURES.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:check',
      'pnpm docs:language',
      'pnpm docs:links',
    ]);
  });

  it('suggests the Markdown language gate for prose and for its implementation', () => {
    const prose = suggestFocusedChecks(['CONTRIBUTING.md']);
    assert.deepEqual(domainCommands(prose), [
      'pnpm docs:language',
      'pnpm docs:links',
    ]);

    const gate = suggestFocusedChecks([
      'scripts/quality/markdown-language/inventory.mjs',
      'scripts/quality/markdown-language/inventory.test.mjs',
    ]);
    assert.deepEqual(domainCommands(gate), [
      'pnpm docs:language',
      'pnpm test:docs:language',
    ]);
  });

  it('suggests the source-comment language gate for every supported source family', () => {
    const result = suggestFocusedChecks([
      'src/shared/lib/example.ts',
      'src-tauri/src/example.rs',
      'app/globals.css',
      'docs/prototypes/example.html',
      '.github/workflows/checks.yml',
      '.claude/hooks/example.sh',
      '.env.example',
    ]);
    assert.equal(
      commandNames(result).filter((command) => command === SOURCE_LANGUAGE_COMMAND).length,
      1,
    );

    const gate = suggestFocusedChecks([
      'scripts/quality/source-language/source-paths.mjs',
      'scripts/quality/source-language/inventory.test.mjs',
    ]);
    assert.deepEqual(commandNames(gate).filter((command) => command !== DEAD_CODE_COMMAND), [
      SOURCE_LANGUAGE_COMMAND,
      'pnpm test:source:language',
    ]);

    assert.ok(!commandNames(suggestFocusedChecks(['messages/ko.json'])).includes(SOURCE_LANGUAGE_COMMAND));
  });

  it('suggests the dead-code analyzer once for every scope, manifest, and analyzer config', () => {
    const paths = [
      'src/shared/lib/example.ts',
      'scripts/quality/dead-code/check.mjs',
      'scripts/quality/dead-code/baseline.json',
      'scripts/quality/dead-code/exceptions.json',
      'cli/src/lib/example.mjs',
      'mcp/src/example.mjs',
      'mcp/scripts/verify.mjs',
      'package.json',
      'package-lock.json',
      'pnpm-lock.yaml',
      'cli/package.json',
      'cli/pnpm-lock.yaml',
      'mcp/package.json',
      'mcp/pnpm-lock.yaml',
      'next.config.ts',
      'tsconfig.json',
      'vitest.config.ts',
      'playwright.config.ts',
      'postcss.config.mjs',
    ];

    for (const path of paths) {
      const count = commandNames(suggestFocusedChecks([path]))
        .filter((command) => command === DEAD_CODE_COMMAND).length;
      assert.equal(count, 1, `${path} must recommend ${DEAD_CODE_COMMAND} exactly once`);
    }
  });

  it('suggests narrow vault tooling tests for vault helper scripts', () => {
    const result = suggestFocusedChecks([
      'scripts/build-docs-vault.mjs',
      'scripts/validate-vault.mjs',
      'scripts/audit-vault-paths.test.mjs',
      'scripts/migrate-vault.mjs',
      'scripts/migrations/2026-05-04-trim-frontmatter-values.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/build-docs-vault.test.mjs',
      'pnpm exec node --test scripts/validate-vault-script.test.mjs',
      'pnpm exec node --test scripts/audit-vault-paths.test.mjs',
      'pnpm test:docs-vault',
      'pnpm test:vault:validate',
      'pnpm test:vault:audit',
      // The generator decides the shape of the bundled vault data, so the desktop static
      // budget measurement is suggested with it (2026-08-19 — preventing a repeat of the
      // budgets being measured only at release time and silently exceeded).
      'pnpm build && pnpm desktop:perf',
      'pnpm test:vault:migrate',
      'pnpm vault:migrate --list',
      'pnpm test:contracts',
    ]);
  });

  it('wires the concurrent-ledger resolver to its runtime test and docs-vault suite', () => {
    const result = suggestFocusedChecks(['scripts/resolve-docs-vault-conflicts.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/resolve-docs-vault-conflicts.test.mjs',
      'pnpm test:docs-vault',
    ]);
  });

  it('suggests the desktop static budget measurement when bundled vault data changes', () => {
    const result = suggestFocusedChecks([
      'src/entities/docs-vault/data/gateway-content.json',
    ]);

    assert.ok(
      result.commands.some((row) => row.command === 'pnpm build && pnpm desktop:perf'),
      'bundled vault data must trigger the desktop budget measurement',
    );
  });

  it('suggests direct locale message validation before the package shortcut', () => {
    const result = suggestFocusedChecks(['scripts/validate-messages.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/validate-messages.test.mjs',
      'pnpm test:i18n:messages',
    ]);
  });

  it('suggests the executable frontmatter-example gate for public guide changes', () => {
    const result = suggestFocusedChecks(['docs/guide/relations.md']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:check',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:guide-examples',
      'pnpm test:run tests/contract/em-dash-ratchet.contract.test.ts',
    ]);
  });

  it('suggests cross-package contracts for parser schema and validator drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/schema.mjs',
      'cli/src/lib/parse-frontmatter.mjs',
      'src/shared/lib/validate-vault-document.ts',
      'tests/fixtures/validate-vault-cases.mjs',
      'tests/fixtures/vault-schema-cases.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/shared/lib/validate-vault-document.ts',
      'pnpm exec vitest run src/shared/lib/validate-vault-document.test.ts',
      'pnpm test:contracts',
      'pnpm test:mcp:unit',
      'pnpm exec tsc --noEmit',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
  });

  it('suggests MCP unit tests for core implementation drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/ontology-compiler.test.mjs',
      'mcp/src/vault.mjs',
      'mcp/scripts/json-rpc-lines.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/json-rpc-lines.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('discovers a new MCP source and sibling test without a hand-maintained allowlist', () => {
    const result = suggestFocusedChecks([
      'mcp/src/task-navigation-evidence.mjs',
      'mcp/src/task-navigation-evidence.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/task-navigation-evidence.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests lifecycle, qualification, and meaning tests for ontology construction drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/construction-lifecycle.mjs',
      'mcp/src/construction-qualification.mjs',
      'mcp/src/meaning-evaluation.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/construction-lifecycle.test.mjs',
      'pnpm exec node --test mcp/src/construction-qualification.test.mjs',
      'pnpm exec node --test mcp/src/meaning-evaluation.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests the source-hidden fixture contract for fixture or test changes', () => {
    const result = suggestFocusedChecks([
      'tests/fixtures/source-hidden-field-trial/v1.json',
      'mcp/src/source-hidden-field-trial.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/source-hidden-field-trial.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP surface integration for server entrypoint changes', () => {
    const result = suggestFocusedChecks(['mcp/src/index.js']);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests broad MCP integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['mcp/src/integration.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm integration:mcp',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP read integration for read/query tool implementation changes', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault.mjs',
      'mcp/src/query.mjs',
      'mcp/src/ontology-engine.mjs',
      'mcp/src/ontology-compiler.mjs',
      'mcp/src/analyze.mjs',
      'mcp/src/infer-imports.mjs',
      'mcp/src/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm exec node --test mcp/src/validate.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP graph integration for graph artifact/query handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/ontology-compiler.mjs',
      'mcp/src/ontology-engine.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests read integration, not graph integration, for the query_concepts DSL parser', () => {
    const result = suggestFocusedChecks(['mcp/src/query.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:read',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP repo-analysis integration for code-to-vault handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/infer-imports.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('routes architecture changes through the cross-surface gate and rendered workflow', () => {
    const result = suggestFocusedChecks([
      'mcp/src/architecture-profile.mjs',
      'cli/src/commands/architecture.mjs',
      'src/views/architecture/ui/ArchitectureWorkbench.tsx',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/views/architecture/ui/ArchitectureWorkbench.tsx',
      'pnpm exec vitest run src/views/architecture/ui/ArchitectureWorkbench.test.tsx',
      'pnpm test:cli:commands',
      'pnpm test:architecture',
      'pnpm exec playwright test tests/e2e/architecture-workbench.spec.ts',
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/architecture-profile.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm exec tsc --noEmit',
      'pnpm integration:cli:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP write integration for server write handler changes', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault.mjs',
      'mcp/src/index.js',
      'mcp/src/redirect-backlinks.test.mjs',
      'mcp/src/conflict-detection.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/redirect-backlinks.test.mjs',
      'pnpm exec node --test mcp/src/conflict-detection.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP vault-read integration for vault read handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault.mjs',
      'mcp/src/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/validate.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('deduplicates direct MCP unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'mcp/src/infer-imports.mjs',
      'mcp/src/infer-imports.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'mcp/src/infer-imports.mjs',
      'mcp/src/infer-imports.test.mjs',
    ]);
  });

  it('suggests direct MCP suggestions tests before the broader suggestions gate', () => {
    const result = suggestFocusedChecks([
      'mcp/src/suggestions.mjs',
      'mcp/src/suggestions.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/suggestions.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm test:mcp:suggestions',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'mcp/src/suggestions.mjs',
      'mcp/src/suggestions.test.mjs',
    ]);
  });

  it('suggests direct CLI lib unit tests before aggregate CLI lib gate', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/captured-summary.mjs',
      'cli/src/lib/query-result-contract.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test cli/src/lib/captured-summary.test.mjs',
      'pnpm exec node --test cli/src/lib/query-result-contract.test.mjs',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
  });

  it('deduplicates direct CLI lib unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/mcp-call.mjs',
      'cli/src/lib/mcp-call.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:mcp-call',
      'pnpm exec node --test cli/src/lib/mcp-call.test.mjs',
      'pnpm test:cli:lib',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.commands[1].paths, [
      'cli/src/lib/mcp-call.mjs',
      'cli/src/lib/mcp-call.test.mjs',
    ]);
  });

  it('suggests focused CLI entry integration for dispatch and command inventory changes', () => {
    const result = suggestFocusedChecks([
      'cli/src/index.mjs',
      'cli/src/lib/cli-commands.mjs',
      'cli/src/lib/cli-commands.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:surface:check',
      'pnpm exec node --test cli/src/lib/cli-commands.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:entry',
      'pnpm vault:validate',
    ]);
  });

  it('suggests broad CLI integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['cli/src/integration.test.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm integration:cli',
      'pnpm vault:validate',
    ]);
  });

  it('suggests setup integration for agent config repair helpers', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/agent-config.mjs',
      'cli/src/lib/agent-config.test.mjs',
      'cli/src/commands/agent-setup.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:cli:lib',
      'pnpm integration:cli:setup',
      'pnpm vault:validate',
    ]);
  });

  it('suggests narrow dogfood helper tests before broader dogfood gates', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/dogfood-args.mjs',
      'scripts/dogfood-compile-fix.test.mjs',
      'scripts/dogfood-status.mjs',
      'scripts/dogfood-graph-db-pack.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/lib/dogfood-args.test.mjs',
      'pnpm exec node --test scripts/dogfood-compile-fix.test.mjs',
      'pnpm exec node --test scripts/dogfood-status.test.mjs',
      'pnpm exec node --test scripts/dogfood-graph-db-pack.test.mjs',
      'pnpm test:dogfood:args',
      'pnpm test:dogfood:compile-fix',
      'pnpm test:dogfood:status',
      'pnpm test:dogfood:graph-db',
      'pnpm test:mcp:maintenance',
      'pnpm vault:validate',
    ]);
  });

  it('suggests direct script helper unit tests before broader script-ref gates', () => {
    const result = suggestFocusedChecks([
      'scripts/run-focused-node-test.mjs',
      'scripts/run-focused-node-test.test.mjs',
      'scripts/lib/focused-check-suggestions.mjs',
      'scripts/lib/pnpm-script-refs.mjs',
      'scripts/lib/test-name-pattern.mjs',
      'scripts/lib/test-name-pattern.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:ci:impact',
      'pnpm exec node --test scripts/run-focused-node-test.test.mjs',
      'pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs',
      'pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs',
      'pnpm exec node --test scripts/lib/test-name-pattern.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:checks:changed',
    ]);
    assert.deepEqual(
      result.commands.find(
        (row) => row.command === 'pnpm exec node --test scripts/run-focused-node-test.test.mjs',
      )?.paths,
      [
      'scripts/run-focused-node-test.mjs',
      'scripts/run-focused-node-test.test.mjs',
      ],
    );
    assert.deepEqual(
      result.commands.find(
        (row) => row.command === 'pnpm exec node --test scripts/lib/test-name-pattern.test.mjs',
      )?.paths,
      [
      'scripts/lib/test-name-pattern.mjs',
      'scripts/lib/test-name-pattern.test.mjs',
      ],
    );
  });

  it('suggests script-reference checks when dogfood help text changes', () => {
    const result = suggestFocusedChecks(['scripts/dogfood-mcp-walk.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/dogfood-mcp-walk.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:dogfood:timeout',
      'pnpm test:mcp:dogfood',
      'pnpm vault:validate',
    ]);
  });

  it('suggests agent hook tests for Claude Code and Codex hook wiring changes', () => {
    const result = suggestFocusedChecks([
      '.claude/settings.json',
      '.claude/hooks/block-npm-publish.sh',
      '.claude/hooks/inject-ontology-summary.sh',
      '.codex/hooks.json',
      '.codex/hooks/block-npm-publish.sh',
      '.codex/hooks/inject-ontology-summary.sh',
      'scripts/claude-hooks.test.mjs',
    ]);

    // Every path here is also inventoried by `agent-files`, and `.claude/settings.json`
    // carries the `permissions.deny` rules the secret-read guard derives from
    // `.gitignore`, so all three gates apply.
    assert.deepEqual(domainCommands(result), [
      'pnpm test:claude:hooks',
      'pnpm agents:check',
      'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts',
    ]);
  });

  it('routes the GitHub Pages deploy workflow to the desktop readiness contract', () => {
    const result = suggestFocusedChecks(['.github/workflows/deploy-pages.yml']);

    const commands = domainCommands(result);
    assert.ok(commands.includes('pnpm test:desktop:check'));
    assert.doesNotMatch(commands.join(' '), /firebase|bundle:check/i);
  });

  it('routes installed-app WebView verifier changes to the desktop contract suite', () => {
    const result = suggestFocusedChecks([
      'scripts/verify-macos-app-launch.mjs',
      'scripts/verify-macos-app-launch.payload-contract.test.mjs',
      'scripts/lib/verify-macos/payload-contract.mjs',
    ]);

    assert.ok(
      result.commands.some((row) => row.command === 'pnpm test:desktop:check'),
      'WebView verifier changes must run the suite that includes its payload contract',
    );
  });

  it('suggests desktop readiness checks for macOS desktop distribution files', () => {
    const result = suggestFocusedChecks([
      'scripts/check-desktop-readiness.mjs',
      'scripts/check-desktop-readiness.test.mjs',
      'scripts/desktop-doctor.mjs',
      'scripts/desktop-doctor.test.mjs',
      'scripts/desktop-smoke.mjs',
      'scripts/desktop-smoke.test.mjs',
      'scripts/verify-macos-dmg.mjs',
      'scripts/verify-macos-install-smoke.mjs',
      'scripts/lib/macos-dmg-layout.mjs',
      'scripts/lib/redact-command.mjs',
      'scripts/check-macos-download-release.mjs',
      'docs/DESKTOP-MACOS.md',
      'src/shared/lib/tauri-vault-fs.ts',
      'src/shared/lib/tauri-vault-fs.test.ts',
      'src/views/root-entry/ui/RootEntryPage.tsx',
      'src/views/root-entry/ui/RootEntryPage.test.tsx',
      'src/views/docs-vault/lib/persistence.ts',
      'src/views/docs-vault/ui/DocsVaultPage.tsx',
      'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx',
      'src-tauri/src/lib.rs',
      'src-tauri/tauri.conf.json',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/check-desktop-readiness.test.mjs',
      'pnpm exec node --test scripts/desktop-doctor.test.mjs',
      'pnpm exec node --test scripts/desktop-smoke.test.mjs',
      'pnpm exec node --test scripts/lib/macos-dmg-layout.test.mjs',
      'pnpm exec node --test scripts/lib/redact-command.test.mjs',
      'pnpm exec eslint --max-warnings 0 src/shared/lib/tauri-vault-fs.ts src/shared/lib/tauri-vault-fs.test.ts ' +
        'src/views/root-entry/ui/RootEntryPage.tsx src/views/root-entry/ui/RootEntryPage.test.tsx ' +
        'src/views/docs-vault/lib/persistence.ts src/views/docs-vault/ui/DocsVaultPage.tsx ' +
        'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx',
      'pnpm exec vitest run src/shared/lib/tauri-vault-fs.test.ts',
      'pnpm exec vitest run src/views/root-entry/ui/RootEntryPage.test.tsx',
      'pnpm exec vitest run src/views/docs-vault/lib/persistence.test.ts',
      'pnpm exec vitest run src/widgets/app-settings-menu/ui/AppSettingsMenu.test.tsx',
      'pnpm docs-vault:check',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:desktop:check',
      'pnpm test:desktop:runtime',
      'pnpm test:desktop:bridge',
      'pnpm desktop:check',
      'pnpm test:contracts',
      // This set includes `src/views/docs-vault/**`, so the docs e2e comes with it.
      'pnpm exec playwright test tests/e2e/docs-deeplink.spec.ts ' +
        'tests/e2e/document-scroll-lock.spec.ts tests/e2e/vault-truth-telling.spec.ts',
      // Since the surface split (2026-07-27) a desktop change does not verify the web on
      // its behalf — the web is unattended, so the smoke test is suggested in the same
      // set.
      'pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
      'pnpm exec tsc --noEmit',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/check-desktop-readiness.mjs',
      'scripts/check-desktop-readiness.test.mjs',
    ]);
  });

  it('suggests the web surface smoke when a desktop capability bridge changes', () => {
    const result = suggestFocusedChecks(['src/shared/lib/tauri-secrets.ts']);

    const commands = domainCommands(result);
    assert.ok(commands.includes('pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts'));
  });

  it('suggests ontology design guard checks when the design surface guard changes', () => {
    const result = suggestFocusedChecks([
      'scripts/check-ontology-design-surface.mjs',
      'scripts/check-ontology-design-surface.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/check-ontology-design-surface.test.mjs',
      'pnpm design:ontology',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/check-ontology-design-surface.mjs',
      'scripts/check-ontology-design-surface.test.mjs',
    ]);
  });

  it('automatically suggests the ontology design guard when Insights changes', () => {
    const result = suggestFocusedChecks([
      'src/views/ontology-insights/lib/insights-tab-state.ts',
    ]);

    assert.ok(domainCommands(result).includes('pnpm design:ontology'));
  });

  it('suggests static export gates when Next config changes', () => {
    const result = suggestFocusedChecks(['next.config.ts']);

    assert.deepEqual(domainCommands(result), [
      'pnpm desktop:check',
      'pnpm exec tsc --noEmit',
      'pnpm build',
    ]);
  });

  it('suggests lint, contracts, and the a11y ratchets for Next app route entries', () => {
    const result = suggestFocusedChecks([
      'app/layout.tsx',
      'app/page.tsx',
      'app/sitemap.ts',
      'app/[locale]/docs/page.tsx',
      'next-env.d.ts',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 app/layout.tsx app/page.tsx app/sitemap.ts app/[locale]/docs/page.tsx',
      'pnpm exec vitest run app/sitemap.test.ts',
      'pnpm test:contracts',
      'pnpm exec tsc --noEmit',
      'pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts tests/e2e/contrast-ratchet.spec.ts',
      'pnpm decisions:check',
    ]);
  });

  // The situation the 2026-08-04 field trial measured — for one new view file plus
  // one new route this advisor suggested **only** `pnpm exec tsc --noEmit`. The lint
  // that carries the design spec, the contracts that classify routes, and the two
  // ratchets that actually measure were all absent. `AGENTS.md` pins "point at this
  // command instead of enumerating the checks", so this omission carries weight.
  it('suggests the design and a11y gates for a brand-new view and route', () => {
    const result = suggestFocusedChecks([
      'src/views/brand-new-surface/ui/BrandNewPage.tsx',
      'app/[locale]/brand-new/page.tsx',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/views/brand-new-surface/ui/BrandNewPage.tsx app/[locale]/brand-new/page.tsx',
      'pnpm test:contracts',
      'pnpm exec tsc --noEmit',
      'pnpm exec playwright test tests/e2e/a11y-ratchet.spec.ts tests/e2e/contrast-ratchet.spec.ts',
      'pnpm decisions:check',
    ]);
  });

  it('suggests i18n message parity and typecheck for locale routing changes', () => {
    const result = suggestFocusedChecks([
      'src/i18n/routing.ts',
      'src/i18n/request.ts',
      'src/i18n/navigation.ts',
      'messages/en.json',
      'messages/ko.json',
      'scripts/validate-messages.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/validate-messages.test.mjs',
      'pnpm exec eslint --max-warnings 0 src/i18n/routing.ts src/i18n/request.ts src/i18n/navigation.ts',
      'pnpm exec tsc --noEmit',
      // Added 2026-08-08 — a message catalogue is not only the consistency check's
      // input. It is also the input of the gates that read "what does this screen claim
      // it can do".
      'pnpm test:desktop:check',
      'pnpm test:i18n:messages',
    ]);
  });

  it('suggests lint when ESLint config changes', () => {
    const result = suggestFocusedChecks(['eslint.config.mjs']);

    assert.deepEqual(domainCommands(result), ['pnpm lint']);
  });

  it('suggests typecheck and repo-analysis gates when TS config changes', () => {
    const result = suggestFocusedChecks(['tsconfig.json']);

    assert.deepEqual(domainCommands(result), [
      'pnpm integration:mcp:repo-analysis',
      'pnpm exec tsc --noEmit',
      'pnpm integration:cli:repo-analysis',
    ]);
  });

  it('routes every E2E scope surface to the direct workflow contracts', () => {
    const command =
      'pnpm exec vitest run tests/contract/e2e-change-scope.contract.test.ts tests/contract/e2e-suite-split.contract.test.ts tests/contract/ci-bounded-network.contract.test.ts';
    const paths = [
      '.github/workflows/e2e.yml',
      '.github/actions/setup-playwright/action.yml',
      'tests/contract/e2e-change-scope.contract.test.ts',
      'tests/contract/e2e-suite-split.contract.test.ts',
      'tests/contract/ci-bounded-network.contract.test.ts',
    ];

    assert.ok(paths.length > 0, 'the E2E scope surface inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes(command),
        `${path} must recommend the E2E workflow contracts`,
      );
    }
  });

  it('suggests docs and package contracts for GitHub quality-gate files', () => {
    const result = suggestFocusedChecks([
      '.github/workflows/release-macos.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
      // A workflow is where a node:test suite becomes reachable or stops being
      // reachable, so editing one re-checks that nothing now runs nowhere.
      'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts',
      'pnpm test:mcp:package',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm package:check']);
  });

  it('suggests docs contracts for GitHub community templates', () => {
    const result = suggestFocusedChecks([
      '.github/DISCUSSIONS-CATEGORIES.md',
      '.github/ISSUE_TEMPLATE/bug_report.yml',
      '.github/ISSUE_TEMPLATE/config.yml',
      '.github/ISSUE_TEMPLATE/feature_request.yml',
      '.github/ISSUE_TEMPLATE/onboarding_friction.yml',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm test:mcp:docs',
    ]);
    assert.deepEqual(result.escalations, []);
  });

  it('suggests direct Vitest sibling tests for app and source files', () => {
    const result = suggestFocusedChecks([
      'src/shared/lib/cn.ts',
      'src/shared/lib/cn.test.ts',
      'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/shared/lib/cn.ts src/shared/lib/cn.test.ts ' +
        'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
      'pnpm exec vitest run src/shared/lib/cn.test.ts',
      'pnpm exec vitest run src/widgets/docs-vault/ui/DocsVaultEditor.test.tsx',
      'pnpm check:tokens',
      'pnpm test:contracts',
      // Touching the docs widget also suggests the e2e that drives that screen (mapping
      // added 2026-08-08 — #987 moved a header control, this suggestion was missing, and
      // `docs-deeplink` stayed red in CI across six PRs).
      'pnpm exec playwright test tests/e2e/docs-deeplink.spec.ts ' +
        'tests/e2e/document-scroll-lock.spec.ts tests/e2e/vault-truth-telling.spec.ts',
      'pnpm exec tsc --noEmit',
    ]);
    assert.deepEqual(result.commands[1].paths, [
      'src/shared/lib/cn.ts',
      'src/shared/lib/cn.test.ts',
    ]);
  });

  it('suggests lint and typecheck for app/source TypeScript files without sibling tests', () => {
    const result = suggestFocusedChecks([
      'src/shared/config/site.ts',
      'src/shared/lib/theme.ts',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec eslint --max-warnings 0 src/shared/config/site.ts src/shared/lib/theme.ts',
      'pnpm exec tsc --noEmit',
    ]);
  });

  it('suggests the map viewport framing E2E for the exact camera-obstacle source owners', () => {
    const paths = [
      'src/widgets/topology-map-v2/interaction/free-area.ts',
      'src/views/home/ui/HomePage.tsx',
    ];
    const command = 'pnpm exec playwright test tests/e2e/map-viewport-reframe.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests the insights census E2E for its exact derivation, page, hero, and domain-capacity owners', () => {
    const paths = [
      'src/shared/lib/use-count-up.ts',
      'src/views/ontology-insights/lib/census-health.ts',
      'src/views/ontology-insights/ui/OntologyInsightsPage.tsx',
      'src/views/ontology-insights/ui/parts/InsightsHeroCensus.tsx',
      'src/views/ontology-insights/ui/tabs/OverviewTab.tsx',
      'src/widgets/domain-capacity-bar/ui/DomainCapacityBar.tsx',
    ];
    const command = 'pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests both framing and legacy-route E2Es for their shared HomePage owner', () => {
    const result = suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']);
    const commands = commandNames(result).filter(
      (command) =>
        command.includes('tests/e2e/map-viewport-reframe.spec.ts') ||
        command.includes('tests/e2e/ontology-ui.spec.ts'),
    );

    assert.deepEqual(commands, [
      'pnpm exec playwright test tests/e2e/map-viewport-reframe.spec.ts',
      'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
    ]);
  });

  it('suggests the contextual meaning-editor E2E for the exact change-review owner', () => {
    const paths = ['src/features/ontology-change-review/ui/OntologyChangeReview.tsx'];
    const command = 'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('suggests the touch-target E2E for the selected-node panel owner', () => {
    const paths = ['src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.tsx'];
    const command = 'pnpm exec playwright test tests/e2e/touch-target-contract.spec.ts';
    const result = suggestFocusedChecks(paths);
    const matches = result.commands.filter((row) => row.command === command);

    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].paths, paths);
  });

  it('does not broaden installed-audit E2E mappings to neighboring tests or helpers', () => {
    const protectedCommands = new Set([
      'pnpm exec playwright test tests/e2e/map-viewport-reframe.spec.ts',
      'pnpm exec playwright test tests/e2e/insights-badge-agreement.spec.ts',
      'pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts',
      'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
      'pnpm exec playwright test tests/e2e/touch-target-contract.spec.ts',
    ]);
    const result = suggestFocusedChecks([
      'src/widgets/topology-map-v2/interaction/free-area.test.ts',
      'src/views/home/model/use-node-datasheet-model.ts',
      'src/views/ontology-insights/ui/tabs/OverviewTab.test.tsx',
      'src/widgets/domain-capacity-bar/ui/DomainCapacityLegend.tsx',
      'src/features/ontology-change-review/ui/OntologyChangeReview.test.tsx',
      'src/widgets/topology-map-v2/ui/TopologyV2DetailPanel.test.tsx',
    ]);

    assert.deepEqual(
      commandNames(result).filter((command) => protectedCommands.has(command)),
      [],
    );
  });

  it('suggests direct Playwright specs for changed e2e tests', () => {
    const result = suggestFocusedChecks([
      'tests/e2e/ontology-ui.spec.ts',
      'tests/e2e/local-vault-picker.spec.ts',
    ]);

    /*
     * ⚠️ `tsc` is appended (added 2026-08-21). e2e specs are TypeScript too and
     * `tsconfig.json`'s `include` is all of `**\/*.ts`, so CI's `tsc --noEmit` really
     * does check these files. Only the advisor did not know that, so anyone editing a
     * spec met type errors first in CI (`#1180`).
     *
     * The order is unchanged — the direct spec comes first.
     */
    assert.deepEqual(domainCommands(result), [
      'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
      'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
      'pnpm exec tsc --noEmit',
    ]);
  });

  it('suggests focused smoke checks for test runner config changes', () => {
    const vitest = suggestFocusedChecks(['vitest.config.ts', 'vitest.setup.ts']);

    assert.deepEqual(domainCommands(vitest), [
      'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    ]);

    const playwright = suggestFocusedChecks(['playwright.config.ts']);

    assert.deepEqual(domainCommands(playwright), [
      'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    ]);
  });

  it('suggests overflow smoke for global styling changes', () => {
    const result = suggestFocusedChecks(['postcss.config.mjs', 'app/globals.css']);

    assert.deepEqual(domainCommands(result), [
      'pnpm check:tokens',
      'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    ]);
  });

  it('suggests focused benchmark and onboarding smoke checks', () => {
    const result = suggestFocusedChecks([
      'scripts/benchmark.mjs',
      'scripts/benchmark-change-flow.mjs',
      'scripts/benchmark-scale.mjs',
      'scripts/perf-vault.mjs',
      'scripts/perf-graph.mjs',
      'scripts/smoke-clean-onboarding.mjs',
      'scripts/smoke-memory-loop.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm benchmark --dry-run',
      'pnpm benchmark:change-flow --dry-run',
      'pnpm benchmark:scale --dry-run',
      'node scripts/perf-vault.mjs 10',
      'node --test scripts/perf-graph.test.mjs',
      'pnpm perf:graph:check',
      'pnpm perf:graph:scale',
      'pnpm smoke:onboarding',
      'pnpm smoke:memory-loop',
    ]);
  });

  it('suggests script-reference checks for docs whose pnpm references are scanned', () => {
    const result = suggestFocusedChecks([
      'README.md',
      'docs/DEVELOPMENT-CHECKS.md',
      'docs/benchmark/README.md',
      'mcp/README.md',
      'cli/README.md',
      'scripts/migrations/README.md',
      '.claude/rules/testing.md',
      '.claude/skills/ontology-bootstrap/SKILL.md',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm docs-vault:check',
      'pnpm docs:language',
      'pnpm docs:links',
      'pnpm docs:surface:check',
      'pnpm vault:migrate --list',
      'pnpm test:dogfood:script-refs',
      // `.claude/rules/testing.md` and the skill are agent files, and a rule's
      // globs are what the nested `AGENTS.md` pointers derive from.
      'pnpm agents:check',
      'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts',
      'pnpm test:mcp:docs',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI and MCP verify gates without jumping straight to full suites', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/mcp-verify.mjs',
      'mcp/scripts/verify.mjs',
      'scripts/smoke-packed-cli.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm integration:cli:mcp-verify',
      'pnpm test:mcp:package',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), [
      'pnpm package:check',
      'pnpm dogfood:verify',
    ]);
  });

  it('suggests package contracts for lockfile changes', () => {
    const rootLock = suggestFocusedChecks(['pnpm-lock.yaml']);

    assert.deepEqual(domainCommands(rootLock), ['pnpm test:mcp:package']);
    assert.deepEqual(rootLock.escalations.map((row) => row.command), ['pnpm package:check']);

    const mcpLock = suggestFocusedChecks(['mcp/package-lock.json']);
    const cliLock = suggestFocusedChecks(['cli/package-lock.json']);

    const packageLockCommands = [
      'pnpm test:mcp:package',
      'pnpm vault:validate',
    ];
    const mcpPackageLockEscalations = [
      'pnpm package:check',
      'pnpm dogfood:verify',
    ];
    const cliPackageLockEscalations = ['pnpm package:check'];

    assert.deepEqual(domainCommands(mcpLock), packageLockCommands);
    assert.deepEqual(mcpLock.escalations.map((row) => row.command), mcpPackageLockEscalations);
    assert.deepEqual(domainCommands(cliLock), packageLockCommands);
    assert.deepEqual(cliLock.escalations.map((row) => row.command), cliPackageLockEscalations);
  });

  it('suggests narrow MCP verify tests before the full verify helper gate', () => {
    const result = suggestFocusedChecks([
      'mcp/scripts/verify.mjs',
      'mcp/src/verify-script.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test mcp/src/verify-script.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm vault:validate',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused CLI diagnosis integration for health, agent-brief, and workspace-brief commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/health.mjs',
      'cli/src/commands/agent-brief.mjs',
      'cli/src/commands/workspace-brief.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:diagnosis',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI graph-read integration for read-only graph commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/backlinks.mjs',
      'cli/src/commands/path.mjs',
      'cli/src/commands/all-paths.mjs',
      'cli/src/commands/relation-check.mjs',
      'cli/src/commands/node-profile.mjs',
      'cli/src/commands/similar.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:graph-read',
      'pnpm vault:validate',
    ]);
  });

  it('suggests CLI plan output unit and graph-read integration for query_plan output helpers', () => {
    const result = suggestFocusedChecks(['cli/src/lib/query-plan-output.mjs']);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test cli/src/lib/query-plan-output.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:graph-read',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI graph-write integration for destructive graph commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/rename.mjs',
      'cli/src/commands/delete.mjs',
      'cli/src/commands/merge.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:graph-write',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI repo-analysis integration for code-to-vault commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/analyze.mjs',
      'cli/src/commands/infer-imports.mjs',
      'cli/src/commands/bootstrap.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm integration:cli:repo-analysis',
      'pnpm vault:validate',
    ]);
  });

  it('suggests focused CLI local vault integration for frontmatter commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/add.mjs',
      'cli/src/commands/import.mjs',
      'cli/src/commands/list.mjs',
      'cli/src/commands/find.mjs',
      'cli/src/commands/validate.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm test:cli:commands',
      'pnpm test:contracts',
      'pnpm integration:cli:local-vault',
      'pnpm vault:validate',
    ]);
  });

  it('suggests the advisor self-test when the focused-check advisor changes', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/focused-check-suggestions.mjs',
      'scripts/suggest-focused-checks.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs',
      'pnpm test:ci:impact',
      'pnpm exec node --test scripts/suggest-focused-checks.test.mjs',
      'pnpm test:checks:changed',
    ]);
  });

  it('routes every CI impact surface to its planner and executor contract', () => {
    const paths = [
      'scripts/classify-change.mjs',
      'scripts/classify-change.test.mjs',
      'scripts/run-ci-lane.mjs',
      'scripts/run-ci-lane.test.mjs',
      'scripts/lib/focused-check-suggestions.mjs',
      'scripts/lib/focused-check-suggestions.test.mjs',
      'scripts/suggest-focused-checks.mjs',
      'scripts/suggest-focused-checks.test.mjs',
      '.github/workflows/checks.yml',
      '.github/workflows/e2e.yml',
      '.github/actions/setup-playwright/action.yml',
    ];

    assert.ok(paths.length > 0, 'CI impact surface inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes('pnpm test:ci:impact'),
        `${path} must recommend the CI impact contract`,
      );
    }
  });

  it('routes every active PO policy surface to the outcome-router and sunset contracts', () => {
    const commands = ['pnpm test:po', 'pnpm po:pilot -- --check'];
    const paths = [
      'scripts/lib/po-risk-router.mjs',
      'scripts/po-risk-router.mjs',
      'scripts/lib/po-pilot.mjs',
      'scripts/po-pilot.mjs',
      'scripts/check-decision-record.mjs',
      'tests/contract/po-council.contract.test.ts',
      'docs/PRODUCT-OWNER-OPERATING-SYSTEM.md',
      'docs/PO-PILOT.md',
      '.claude/skills/po-pass/SKILL.md',
      '.agents/skills/po-council/SKILL.md',
      '.claude/agents/chief.md',
      '.agents/agents/po-craft.md',
      'AGENTS.md',
      'package.json',
    ];

    assert.ok(paths.length > 0, 'the PO policy path inventory must not be empty');
    for (const path of paths) {
      const suggested = commandNames(suggestFocusedChecks([path]));
      for (const command of commands) {
        assert.ok(suggested.includes(command), `${path} must recommend ${command}`);
      }
    }
  });

  it('routes every active design policy surface to the fact-derived proof contracts', () => {
    const paths = [
      'scripts/lib/design-proof-router.mjs',
      'scripts/design-proof-router.mjs',
      'scripts/lib/design-spec-census.mjs',
      'scripts/check-decision-record.mjs',
      'tests/contract/design-proof-router.contract.test.ts',
      'tests/contract/design-spec-ledger.contract.test.ts',
      'tests/contract/design-council.contract.test.ts',
      'docs/PRODUCT-DESIGN-OPERATING-SYSTEM.md',
      '.claude/skills/design-build/SKILL.md',
      '.agents/skills/motion-verify/SKILL.md',
      '.claude/agents/design-guardian.md',
      '.agents/agents/design-motion.md',
      '.claude/rules/design.md',
      'AGENTS.md',
      'package.json',
    ];

    assert.ok(paths.length > 0, 'the design policy path inventory must not be empty');
    for (const path of paths) {
      assert.ok(
        commandNames(suggestFocusedChecks([path])).includes('pnpm test:design-gates'),
        `${path} must recommend the design gate contracts`,
      );
    }
  });

  it('suggests docs contracts when the shared package contract test changes', () => {
    const result = suggestFocusedChecks([
      'scripts/check-package-contracts.mjs',
      'scripts/check-package-contracts.test.mjs',
    ]);

    assert.deepEqual(domainCommands(result), [
      'pnpm exec node --test scripts/check-package-contracts.test.mjs',
      'pnpm test:mcp:package',
      'pnpm test:mcp:docs',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/check-package-contracts.mjs',
      'scripts/check-package-contracts.test.mjs',
    ]);
  });

  it('formats no-change and mapped suggestions for terminal use', () => {
    assert.match(formatFocusedCheckSuggestions(suggestFocusedChecks([])), /no changed paths/);

    const output = formatFocusedCheckSuggestions(suggestFocusedChecks(['scripts/dogfood-status.mjs']));
    assert.match(output, /\[focused-checks\] 1 changed path/);
    assert.match(output, /pnpm test:dogfood:status/);
    assert.match(output, /pnpm test:mcp:maintenance/);
    assert.match(output, /pnpm vault:validate/);
  });

  it('관문의 판·크롬·원점을 고치면 그 격자 검사를 권한다', () => {
    // 2026-08-08 regression: adding one line to the footer turned
    // `download-gateway-grid` red at all eight widths, but the advisor never suggested
    // that spec so it surfaced only in CI. If "point at the tool" is the discipline,
    // then a check the tool cannot point at is a check that does not exist.
    const grid = 'pnpm exec playwright test tests/e2e/download-gateway-grid.spec.ts';
    for (const path of [
      'src/views/download/ui/DownloadPage.tsx',
      'src/widgets/gateway-chrome/ui/GatewayNav.tsx',
      'src/widgets/gateway-chrome/ui/GatewayReadingLinks.tsx',
      'src/shared/lib/gateway-frame.ts',
    ]) {
      assert.ok(
        suggestFocusedChecks([path]).commands.some((s) => s.command === grid),
        `${path} 를 고쳤는데 관문 격자 검사를 안 권한다`,
      );
    }
    // Idling guard — a rule that attaches to any path is noise, not a rule.
    assert.ok(
      !suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']).commands.some((s) => s.command === grid),
      '관문과 무관한 화면에도 격자 검사를 권한다 — 규칙이 너무 넓다',
    );
  });

  it('문구 카탈로그를 고치면 능력 주장을 읽는 게이트도 권한다', () => {
    // 2026-08-08: a false "app-only" claim was fixed, the advisor suggested only
    // catalogue consistency, and the desktop gate pinning that copy went red first in
    // CI.
    const commands = commandNames(suggestFocusedChecks(['messages/ko.json']));
    assert.ok(commands.includes('pnpm test:i18n:messages'), '카탈로그 정합 검사를 안 권한다');
    assert.ok(
      commands.includes('pnpm test:desktop:check'),
      '문구를 고쳤는데 능력 주장을 읽는 게이트를 안 권한다',
    );
    // Idling guard — a rule that attaches to any path is noise, not a rule.
    assert.ok(
      !suggestFocusedChecks(['src/views/home/ui/HomePage.tsx']).commands.some(
        (s) => s.command === 'pnpm test:desktop:check',
      ),
      '문구와 무관한 화면에도 데스크톱 게이트를 권한다 — 규칙이 너무 넓다',
    );
  });

  /**
   * **`tsconfig` decides the reach of type checking — not the advisor.**
   *
   * It broke on 2026-08-21 (`#1180`): only a contract test file was edited, and CI's
   * `Types · Lint · Docs` went red with a type error. There was no way to meet it
   * locally — the advisor did not suggest `tsc` for test files, and **vitest does not
   * check types**. Yet `tsconfig.json`'s `include` is all of `**\/*.ts`.
   *
   * Wherever the check's reach differs from the advisor's reach, **that difference
   * surfaces only in CI.**
   */
  it('타입 검사를 tsconfig 가 보는 곳 전부에 권한다 — 테스트 파일도 포함', () => {
    const typecheck = (path) =>
      suggestFocusedChecks([path]).commands.some(
        (s) => s.command === 'pnpm exec tsc --noEmit',
      );

    // The two that used to be missing — this is why this test exists.
    assert.ok(typecheck('tests/contract/release-preflight.contract.test.ts'), 'tests/**');
    assert.ok(typecheck('src/shared/lib/cn.test.ts'), 'src 의 테스트 파일');

    // What already worked still works — confirming the reach was widened without narrowing.
    assert.ok(typecheck('src/shared/lib/cn.ts'), 'src 의 제품 코드');
    assert.ok(typecheck('app/[locale]/agents/page.tsx'), 'app/**');
    assert.ok(typecheck('tsconfig.json'), 'tsconfig 자신');
  });

  it('타입이 없는 파일에는 타입 검사를 권하지 않는다 — 넓히기만 한 게 아니다', () => {
    const typecheck = (path) =>
      suggestFocusedChecks([path]).commands.some(
        (s) => s.command === 'pnpm exec tsc --noEmit',
      );
    assert.ok(!typecheck('docs/DECISIONS.md'));
    assert.ok(!typecheck('scripts/build-docs-vault.mjs'));
  });

  /**
   * **Do not use a readout as a gate** (2026-08-21).
   *
   * `dogfood:status` exits 1 even when the graph is merely immature — including on
   * main — while its own output says *"Nothing is broken"*. Wiring that into a push
   * gate blocks every vault-editing push for an unrelated reason.
   */
  it('화면에 그려지는 마크다운에는 문구 게이트도 권한다', () => {
    // The integrity check and the copy check **measure different things**. On
    // 2026-08-21 an em dash in vault prose passed `vault:validate` and was caught only
    // in CI.
    const prose = 'pnpm test:run tests/contract/em-dash-ratchet.contract.test.ts';
    for (const path of [
      'docs/ontology/elements/agents-destination.md',
      'docs/guide/getting-started.md',
      'samples/storefront/domains/catalog.md',
      'docs/CHANGELOG.md',
    ]) {
      const commands = domainCommands(suggestFocusedChecks([path]));
      assert.ok(commands.includes(prose), `${path} 에 문구 게이트를 안 권한다`);
    }
    // Does not drag in the vault's non-markdown files.
    const other = commandNames(suggestFocusedChecks(['src/views/agents/ui/AgentsPage.tsx']));
    assert.ok(!other.includes(prose), '관계없는 코드 변경에 문구 게이트를 권한다');
  });

  it('볼트 변경에는 깨진 것만 말하는 검사를 권한다', () => {
    const commands = commandNames(suggestFocusedChecks(['docs/ontology/README.md']));
    assert.ok(commands.includes('pnpm vault:validate'), '무결성 검사를 안 권한다');
    assert.ok(
      // `test:dogfood:status` (that script's unit tests) is a legitimate gate — it
      // measures whether the script runs correctly, not whether the graph is mature.
      !commands.includes('pnpm dogfood:status'),
      '준비도 읽을거리를 게이트로 권한다 — 그것은 덜 여물어도 1 이다',
    );
  });
});

describe('agent-file surface', () => {
  /*
   * These paths recommended nothing that measures them before 2026-08-24. CI ran
   * `agents:check`, so the answer existed — it just cost an eight-minute round
   * instead of the fifty milliseconds the command actually takes.
   */
  it('recommends the agent-file gate for every tree it inventories', () => {
    for (const path of [
      'CLAUDE.md',
      'AGENTS.md',
      'src/AGENTS.md',
      '.claude/agents/po-wedge.md',
      '.claude/skills/po-pass/SKILL.md',
      '.claude/settings.json',
      '.agents/skills/po-pass/SKILL.md',
      '.agents/agents/po-wedge.md',
      '.codex/hooks.json',
      '.mcp.json',
      'cli/src/lib/agent-files.mjs',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes('pnpm agents:check'),
        `${path} must recommend pnpm agents:check`,
      );
    }
  });

  it('leaves the starter-vault templates out — they are product data', () => {
    for (const path of ['cli/templates/vault/AGENTS.md', 'cli/templates/vault-ko/AGENTS.md']) {
      assert.ok(
        !domainCommands(suggestFocusedChecks([path])).includes('pnpm agents:check'),
        `${path} is a shipped starter vault, not this repository's agent surface`,
      );
    }
  });

  it('recommends the hook tests for every hook script, not a chosen two', () => {
    for (const path of [
      '.claude/hooks/block-unsafe-git.sh',
      '.claude/hooks/block-generated-edit.sh',
      '.claude/hooks/block-npm-publish.sh',
      '.claude/hooks/inject-ontology-summary.sh',
      '.claude/hooks/report-agent-file-drift.sh',
      '.codex/hooks/block-unsafe-git.sh',
      '.githooks/commit-msg',
      '.githooks/commit-msg-language.mjs',
      '.codex/hooks/block-secret-read.sh',
      '.gitignore',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes('pnpm test:claude:hooks'),
        `${path} must recommend pnpm test:claude:hooks`,
      );
    }
  });

  it('recommends the paired contracts when either implementation moves alone', () => {
    const contract =
      'pnpm exec vitest run tests/contract/agent-files.contract.test.ts tests/contract/nested-agents-pointers.contract.test.ts tests/contract/skill-routing.contract.test.ts tests/contract/rules-path-scope.contract.test.ts tests/contract/secret-read-guard.contract.test.ts tests/contract/node-test-reachability.contract.test.ts tests/contract/agent-file-citations.contract.test.ts';
    for (const path of [
      'cli/src/lib/agent-files.mjs',
      'src/views/docs-vault/lib/agent-files.ts',
      'tests/fixtures/agent-files-cases.mjs',
      '.claude/rules/testing.md',
      'src/AGENTS.md',
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/rules/forbidden.md',
      '.claude/settings.json',
      '.gitignore',
      '.claude/skills/po-pass/SKILL.md',
      '.agents/skills/po-pass/SKILL.md',
    ]) {
      assert.ok(
        domainCommands(suggestFocusedChecks([path])).includes(contract),
        `${path} must recommend the agent-files and nested-pointer contracts`,
      );
    }
  });
});

describe('deleted paths participate in rule matching without reaching file-reading commands', () => {
  // Bug sweep 2026-09-01: deletions were dropped before ALL matching, so a
  // deletion-only change printed "nothing to run" and exited 0 — deleting a
  // route file suggested no decisions:check, a vault doc no docs-vault:check.
  it('a deleted vault doc still suggests the docs-vault and ledger checks', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['docs/ontology/capabilities/gone.md'],
    });
    const commands = suggestions.commands.map((c) => c.command);
    assert.ok(commands.includes('pnpm docs-vault:check'), commands.join('\n'));
    assert.deepEqual(suggestions.deletedPaths, ['docs/ontology/capabilities/gone.md']);
  });

  it('a deleted route file still suggests decisions:check', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['app/[locale]/foo/page.tsx'],
    });
    const commands = suggestions.commands.map((c) => c.command);
    assert.ok(commands.includes('pnpm decisions:check'), commands.join('\n'));
  });

  it('no per-file command embeds a deleted path', () => {
    const suggestions = suggestFocusedChecks([], {
      deletedPaths: ['src/views/gone/ui/GonePage.tsx'],
    });
    for (const c of suggestions.commands) {
      assert.ok(!c.command.includes('GonePage'), c.command);
    }
  });
});
