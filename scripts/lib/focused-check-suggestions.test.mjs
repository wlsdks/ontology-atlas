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

  it('suggests narrow vault tooling tests for vault helper scripts', () => {
    const result = suggestFocusedChecks([
      'scripts/build-docs-vault.mjs',
      'scripts/validate-vault.mjs',
      'scripts/audit-vault-paths.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:docs-vault',
      'pnpm test:vault:validate',
      'pnpm test:vault:audit',
    ]);
  });

  it('suggests cross-package contracts for parser schema and validator drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/schema.mjs',
      'cli/src/lib/parse-frontmatter.mjs',
      'src/shared/lib/validate-vault-document.ts',
      'tests/fixtures/validate-vault-cases.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:contracts',
      'pnpm test:cli:lib',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests MCP unit tests for core implementation drift', () => {
    const result = suggestFocusedChecks([
      'mcp/src/analyze.mjs',
      'mcp/src/ontology-compiler.test.mjs',
      'mcp/src/vault.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/analyze.test.mjs',
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/vault.test.mjs',
      'pnpm test:mcp:unit',
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

  it('suggests narrow dogfood helper tests before broader dogfood gates', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/dogfood-args.mjs',
      'scripts/dogfood-compile-fix.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:dogfood:args',
      'pnpm test:dogfood:compile-fix',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests direct script helper unit tests before broader script-ref gates', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/pnpm-script-refs.mjs',
      'scripts/lib/test-name-pattern.mjs',
      'scripts/lib/test-name-pattern.test.mjs',
      'scripts/lib/vault-census.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test scripts/lib/pnpm-script-refs.test.mjs',
      'pnpm exec node --test scripts/lib/test-name-pattern.test.mjs',
      'pnpm exec node --test scripts/lib/vault-census.test.mjs',
      'pnpm test:dogfood:script-refs',
    ]);
    assert.deepEqual(result.commands[1].paths, [
      'scripts/lib/test-name-pattern.mjs',
      'scripts/lib/test-name-pattern.test.mjs',
    ]);
  });

  it('suggests focused CLI and MCP verify gates without jumping straight to full suites', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/mcp-verify.mjs',
      'mcp/scripts/verify.mjs',
      'scripts/smoke-packed-cli.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
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

  it('suggests the advisor self-test when the focused-check advisor changes', () => {
    const result = suggestFocusedChecks([
      'scripts/lib/focused-check-suggestions.mjs',
      'scripts/suggest-focused-checks.test.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), ['pnpm test:checks:changed']);
  });

  it('suggests docs contracts when the shared package contract test changes', () => {
    const result = suggestFocusedChecks(['scripts/check-package-contracts.test.mjs']);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm test:mcp:package',
      'pnpm test:mcp:docs',
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
