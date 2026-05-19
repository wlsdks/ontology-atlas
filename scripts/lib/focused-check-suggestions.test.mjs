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
      'pnpm integration:mcp:repo-analysis',
      'pnpm integration:mcp:vault-read',
      'pnpm integration:mcp:read',
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
      'mcp/src/query.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
      'pnpm exec node --test mcp/src/ontology-compiler.test.mjs',
      'pnpm exec node --test mcp/src/ontology-engine.test.mjs',
      'pnpm exec node --test mcp/src/query.test.mjs',
      'pnpm test:mcp:unit',
      'pnpm integration:mcp:graph',
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
      'pnpm integration:mcp:read',
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
      'pnpm integration:mcp:read',
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
      'pnpm integration:mcp:read',
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
      'pnpm integration:mcp:read',
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
      'pnpm test:dogfood:script-refs',
      'pnpm test:mcp:dogfood:timeout',
      'pnpm test:mcp:dogfood',
      'pnpm dogfood:status',
    ]);
  });

  it('suggests script-reference checks for docs whose pnpm references are scanned', () => {
    const result = suggestFocusedChecks([
      'README.md',
      'docs/DEVELOPMENT-CHECKS.md',
      'mcp/README.md',
      'cli/README.md',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
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

  it('suggests focused CLI diagnosis integration for health and workspace-brief commands', () => {
    const result = suggestFocusedChecks([
      'cli/src/commands/health.mjs',
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
      'cli/src/commands/node-profile.mjs',
      'cli/src/commands/similar.mjs',
    ]);

    assert.deepEqual(result.commands.map((row) => row.command), [
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
