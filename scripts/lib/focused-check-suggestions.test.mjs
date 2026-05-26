import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatFocusedCheckSuggestions,
  normalizeChangedPath,
  suggestFocusedChecks,
} from './focused-check-suggestions.mjs';

describe('focused check suggestions', () => {
  it('normalizes paths for git and shell input', () => {
    assert.equal(normalizeChangedPath('./mcp\\scripts\\verify.mjs'), 'mcp/scripts/verify.mjs');
    assert.equal(normalizeChangedPath('  docs/ontology/project.md  '), 'docs/ontology/project.md');
  });

  it('suggests the narrow registration gate for source-checkout MCP templates', () => {
    const result = suggestFocusedChecks(['.mcp.json', '.mcp.json.example']);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm test:mcp:registration']);
    assert.deepEqual(result.escalations, []);
  });

  it('suggests docs-vault, docs contract, and dogfood status for dogfood ontology docs', () => {
    const result = suggestFocusedChecks(['docs/ontology/capabilities/mcp-server.md']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm docs-vault:check',
      'pnpm test:mcp:docs',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests docs-vault freshness for any markdown doc indexed by the static docs vault', () => {
    const result = suggestFocusedChecks(['docs/FEATURES.md']);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm docs-vault:check']);
  });

  it('suggests narrow vault tooling tests for vault helper scripts', () => {
    const result = suggestFocusedChecks([
      'scripts/build-docs-vault.mjs',
      'scripts/validate-vault.mjs',
      'scripts/audit-vault-paths.test.mjs',
      'scripts/migrate-vault.mjs',
      'scripts/migrations/2026-05-04-trim-frontmatter-values.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/build-docs-vault.test.mjs',
      'pnpm exec node --test scripts/validate-vault-script.test.mjs',
      'pnpm exec node --test scripts/audit-vault-paths.test.mjs',
      'pnpm test:docs-vault',
      'pnpm test:vault:validate',
      'pnpm test:vault:audit',
      'pnpm vault:migrate --list',
      'pnpm test:contracts',
    ]);
  });

  it('suggests direct locale message validation before the package shortcut', () => {
    const result = suggestFocusedChecks(['scripts/validate-messages.test.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/validate-messages.test.mjs',
      'pnpm test:i18n:messages',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec vitest run src/shared/lib/validate-vault-document.test.ts',
      'pnpm test:contracts',
      'pnpm exec tsc --noEmit',
      'pnpm test:cli:lib',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests MCP unit tests for core implementation drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/ontology-compiler.test.mjs',
      'mcp/src/vault.mjs',
      'mcp/scripts/json-rpc-lines.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/json-rpc-lines.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP surface integration for server entrypoint changes', () => {
    const result = suggestFocusedChecks(['mcp/src/index.js']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:write',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests broad MCP integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['mcp/src/integration.test.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:mcp',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
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
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP graph integration for graph artifact/query handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/ontology-compiler.mjs',
      'mcp/src/ontology-engine.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests read integration, not graph integration, for the query_concepts DSL parser', () => {
    const result = suggestFocusedChecks(['mcp/src/query.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:read',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP repo-analysis integration for code-to-vault handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/infer-imports.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/redirect-backlinks.test.mjs',
      'pnpm exec node --test mcp/src/conflict-detection.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:surface',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused MCP vault-read integration for vault read handlers', () => {
    const result = suggestFocusedChecks([
      'mcp/src/vault.mjs',
      'mcp/src/validate.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:contracts',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm exec node --test mcp/src/validate.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:write',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('deduplicates direct MCP unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'mcp/src/infer-imports.mjs',
      'mcp/src/infer-imports.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/infer-imports.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:repo-analysis',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/suggestions.test.mjs',
      'pnpm test:mcp:suggestions',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'mcp/src/suggestions.mjs',
      'mcp/src/suggestions.test.mjs',
    ]);
  });

  it('suggests direct CLI lib unit tests before aggregate CLI lib gate', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/batch-results.mjs',
      'cli/src/lib/query-result-contract.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test cli/src/lib/batch-results.test.mjs',
      'pnpm exec node --test cli/src/lib/query-result-contract.test.mjs',
      'pnpm test:cli:lib',
      'pnpm dogfood:status',
    ]);
  });

  it('deduplicates direct CLI lib unit tests when source and test both changed', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/mcp-call.mjs',
      'cli/src/lib/mcp-call.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:cli:mcp-call',
      'pnpm exec node --test cli/src/lib/mcp-call.test.mjs',
      'pnpm test:cli:lib',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.commands[1].paths, [
      'cli/src/lib/mcp-call.mjs',
      'cli/src/lib/mcp-call.test.mjs',
    ]);
  });

  it('suggests the direct CLI vault census helper test', () => {
    const result = suggestFocusedChecks([
      'cli/src/lib/vault-census.mjs',
      'cli/src/lib/vault-census.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test cli/src/lib/vault-census.test.mjs',
      'pnpm test:cli:lib',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'cli/src/lib/vault-census.mjs',
      'cli/src/lib/vault-census.test.mjs',
    ]);
  });

  it('suggests focused CLI entry integration for dispatch and command inventory changes', () => {
    const result = suggestFocusedChecks([
      'cli/src/index.mjs',
      'cli/src/lib/cli-commands.mjs',
      'cli/src/lib/cli-commands.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test cli/src/lib/cli-commands.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:entry',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests broad CLI integration when the integration harness changes', () => {
    const result = suggestFocusedChecks(['cli/src/integration.test.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:cli',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests narrow dogfood helper tests before broader dogfood gates', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/dogfood-args.mjs',
      'scripts/dogfood-compile-fix.test.mjs',
      'scripts/dogfood-status.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/lib/dogfood-args.test.mjs',
      'pnpm exec node --test scripts/dogfood-compile-fix.test.mjs',
      'pnpm exec node --test scripts/dogfood-status.test.mjs',
      'pnpm test:dogfood:args',
      'pnpm test:dogfood:compile-fix',
      'pnpm test:dogfood:status',
      'pnpm test:mcp:maintenance',
      'pnpm dogfood:status',
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
      'scripts/lib/vault-census.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/run-focused-node-test.test.mjs',
      'pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs',
      'pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs',
      'pnpm exec node --test scripts/lib/test-name-pattern.test.mjs',
      'pnpm exec node --test scripts/lib/vault-census.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:checks:changed',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/run-focused-node-test.mjs',
      'scripts/run-focused-node-test.test.mjs',
    ]);
    assert.deepEqual(result.commands[3].paths, [
      'scripts/lib/test-name-pattern.mjs',
      'scripts/lib/test-name-pattern.test.mjs',
    ]);
  });

  it('suggests script-reference checks when dogfood help text changes', () => {
    const result = suggestFocusedChecks(['scripts/dogfood-mcp-walk.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/dogfood-mcp-walk.test.mjs',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:dogfood:timeout',
      'pnpm test:mcp:dogfood',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm test:claude:hooks']);
  });

  it('suggests build and bundle check when the bundle guard changes', () => {
    const result = suggestFocusedChecks(['scripts/check-bundle.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm build',
      'pnpm bundle:check',
    ]);
  });

  it('suggests desktop readiness checks for macOS desktop distribution files', () => {
    const result = suggestFocusedChecks([
      'scripts/check-desktop-readiness.mjs',
      'scripts/check-desktop-readiness.test.mjs',
      'scripts/desktop-doctor.mjs',
      'scripts/desktop-doctor.test.mjs',
      'scripts/desktop-smoke.mjs',
      'scripts/desktop-smoke.test.mjs',
      'scripts/verify-macos-install-smoke.mjs',
      'scripts/check-macos-download-release.mjs',
      'docs/DESKTOP-MACOS.md',
      'src/shared/lib/tauri-vault-fs.ts',
      'src/shared/lib/tauri-vault-fs.test.ts',
      'src/views/root-entry/ui/RootEntryPage.tsx',
      'src/views/root-entry/ui/RootEntryPage.test.tsx',
      'src/views/docs-vault/lib/persistence.ts',
      'src/views/docs-vault/ui/DocsVaultPage.tsx',
      'src/widgets/operations-nav/ui/OperationsNav.tsx',
      'src-tauri/src/lib.rs',
      'src-tauri/tauri.conf.json',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/check-desktop-readiness.test.mjs',
      'pnpm exec node --test scripts/desktop-doctor.test.mjs',
      'pnpm exec node --test scripts/desktop-smoke.test.mjs',
      'pnpm exec vitest run src/shared/lib/tauri-vault-fs.test.ts',
      'pnpm exec vitest run src/views/root-entry/ui/RootEntryPage.test.tsx',
      'pnpm exec vitest run src/views/docs-vault/lib/persistence.test.ts',
      'pnpm exec vitest run src/widgets/operations-nav/ui/OperationsNav.test.tsx',
      'pnpm docs-vault:check',
      'pnpm test:desktop:check',
      'pnpm test:desktop:runtime',
      'pnpm test:desktop:bridge',
      'pnpm desktop:check',
      'pnpm exec tsc --noEmit',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'scripts/check-desktop-readiness.mjs',
      'scripts/check-desktop-readiness.test.mjs',
    ]);
  });

  it('suggests static export gates when Next config changes', () => {
    const result = suggestFocusedChecks(['next.config.ts']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm desktop:check',
      'pnpm exec tsc --noEmit',
      'pnpm build',
      'pnpm bundle:check',
    ]);
  });

  it('suggests typecheck for Next app route and metadata entries', () => {
    const result = suggestFocusedChecks([
      'app/layout.tsx',
      'app/page.tsx',
      'app/sitemap.ts',
      'app/[locale]/docs/page.tsx',
      'next-env.d.ts',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm exec tsc --noEmit']);
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/validate-messages.test.mjs',
      'pnpm exec tsc --noEmit',
      'pnpm test:i18n:messages',
    ]);
  });

  it('suggests lint when ESLint config changes', () => {
    const result = suggestFocusedChecks(['eslint.config.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm lint']);
  });

  it('suggests typecheck and repo-analysis gates when TS config changes', () => {
    const result = suggestFocusedChecks(['tsconfig.json']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:mcp:repo-analysis',
      'pnpm exec tsc --noEmit',
      'pnpm integration:cli:repo-analysis',
    ]);
  });

  it('suggests docs and package contracts for GitHub quality-gate files', () => {
    const result = suggestFocusedChecks([
      '.github/workflows/ci.yml',
      '.github/PULL_REQUEST_TEMPLATE.md',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:mcp:docs',
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

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm test:mcp:docs']);
    assert.deepEqual(result.escalations, []);
  });

  it('suggests typecheck for the pre-push hook', () => {
    const result = suggestFocusedChecks(['.githooks/pre-push']);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm exec tsc --noEmit']);
  });

  it('suggests direct Vitest sibling tests for app and source files', () => {
    const result = suggestFocusedChecks([
      'src/shared/lib/cn.ts',
      'src/shared/lib/cn.test.ts',
      'src/widgets/docs-vault/ui/DocsVaultEditor.tsx',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec vitest run src/shared/lib/cn.test.ts',
      'pnpm exec vitest run src/widgets/docs-vault/ui/DocsVaultEditor.test.tsx',
      'pnpm exec tsc --noEmit',
    ]);
    assert.deepEqual(result.commands[0].paths, [
      'src/shared/lib/cn.ts',
      'src/shared/lib/cn.test.ts',
    ]);
  });

  it('suggests typecheck for app/source TypeScript files without sibling tests', () => {
    const result = suggestFocusedChecks([
      'src/shared/config/site.ts',
      'src/shared/lib/theme.ts',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm exec tsc --noEmit']);
  });

  it('suggests direct Playwright specs for changed e2e tests', () => {
    const result = suggestFocusedChecks([
      'tests/e2e/ontology-ui.spec.ts',
      'tests/e2e/local-vault-picker.spec.ts',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec playwright test tests/e2e/ontology-ui.spec.ts',
      'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    ]);
  });

  it('suggests focused smoke checks for test runner config changes', () => {
    const vitest = suggestFocusedChecks(['vitest.config.ts', 'vitest.setup.ts']);

    assert.deepEqual(vitest.commands.map((row) => row.command), [
      'pnpm exec vitest run src/shared/lib/cn.test.ts tests/contract/vault-schema.contract.test.ts',
    ]);

    const playwright = suggestFocusedChecks(['playwright.config.ts']);

    assert.deepEqual(playwright.commands.map((row) => row.command), [
      'pnpm exec playwright test tests/e2e/local-vault-picker.spec.ts',
    ]);
  });

  it('suggests overflow smoke for global styling changes', () => {
    const result = suggestFocusedChecks(['postcss.config.mjs', 'app/globals.css']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec playwright test tests/e2e/overflow-sweep.spec.ts',
    ]);
  });

  it('suggests focused benchmark and onboarding smoke checks', () => {
    const result = suggestFocusedChecks([
      'scripts/benchmark.mjs',
      'scripts/benchmark-scale.mjs',
      'scripts/perf-vault.mjs',
      'scripts/perf-graph.mjs',
      'scripts/smoke-clean-onboarding.mjs',
      'scripts/smoke-memory-loop.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm benchmark --dry-run',
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
      '.claude/LOOP-PRINCIPLES.md',
      '.claude/rules/testing.md',
      '.claude/skills/ontology-bootstrap/SKILL.md',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm docs-vault:check',
      'pnpm vault:migrate --list',
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:docs',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests focused CLI and MCP verify gates without jumping straight to full suites', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/mcp-verify.mjs',
      'mcp/scripts/verify.mjs',
      'scripts/smoke-packed-cli.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm integration:cli:mcp-verify',
      'pnpm test:mcp:package',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), [
      'pnpm package:check',
      'pnpm dogfood:verify',
    ]);
  });

  it('suggests package contracts for lockfile changes', () => {
    const rootLock = suggestFocusedChecks(['pnpm-lock.yaml']);

    assert.deepEqual(rootLock.commands.map((row) => row.command), ['pnpm test:mcp:package']);
    assert.deepEqual(rootLock.escalations.map((row) => row.command), ['pnpm package:check']);

    const mcpLock = suggestFocusedChecks(['mcp/package-lock.json']);
    const cliLock = suggestFocusedChecks(['cli/package-lock.json']);

    const packageLockCommands = [
      'pnpm test:mcp:package',
      'pnpm dogfood:status',
    ];
    const mcpPackageLockEscalations = [
      'pnpm package:check',
      'pnpm dogfood:verify',
    ];
    const cliPackageLockEscalations = ['pnpm package:check'];

    assert.deepEqual(mcpLock.commands.map((row) => row.command), packageLockCommands);
    assert.deepEqual(mcpLock.escalations.map((row) => row.command), mcpPackageLockEscalations);
    assert.deepEqual(cliLock.commands.map((row) => row.command), packageLockCommands);
    assert.deepEqual(cliLock.escalations.map((row) => row.command), cliPackageLockEscalations);
  });

  it('suggests narrow MCP verify tests before the full verify helper gate', () => {
    const result = suggestFocusedChecks([
      'mcp/scripts/verify.mjs',
      'mcp/src/verify-script.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:verify:first-contact',
      'pnpm test:mcp:verify:timeout',
      'pnpm test:mcp:verify',
      'pnpm dogfood:status',
    ]);
    assert.deepEqual(result.escalations.map((row) => row.command), ['pnpm dogfood:verify']);
  });

  it('suggests focused CLI diagnosis integration for health, agent-brief, and workspace-brief commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/health.mjs',
      'cli/src/commands/agent-brief.mjs',
      'cli/src/commands/workspace-brief.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:cli:diagnosis',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:cli:graph-read',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests CLI plan output unit and graph-read integration for query_plan output helpers', () => {
    const result = suggestFocusedChecks(['cli/src/lib/query-plan-output.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test cli/src/lib/query-plan-output.test.mjs',
      'pnpm test:cli:lib',
      'pnpm integration:cli:graph-read',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests focused CLI graph-write integration for destructive graph commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/rename.mjs',
      'cli/src/commands/delete.mjs',
      'cli/src/commands/merge.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:cli:graph-write',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests focused CLI repo-analysis integration for code-to-vault commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/analyze.mjs',
      'cli/src/commands/infer-imports.mjs',
      'cli/src/commands/bootstrap.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm integration:cli:repo-analysis',
      'pnpm dogfood:status',
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

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:contracts',
      'pnpm integration:cli:local-vault',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests the advisor self-test when the focused-check advisor changes', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/focused-check-suggestions.mjs',
      'scripts/suggest-focused-checks.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/lib/focused-check-suggestions.test.mjs',
      'pnpm exec node --test scripts/suggest-focused-checks.test.mjs',
      'pnpm test:checks:changed',
    ]);
  });

  it('suggests docs contracts when the shared package contract test changes', () => {
    const result = suggestFocusedChecks([
      'scripts/check-package-contracts.mjs',
      'scripts/check-package-contracts.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
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
    assert.match(output, /pnpm dogfood:status/);
  });
});
