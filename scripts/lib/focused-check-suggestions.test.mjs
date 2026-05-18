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

  it('formats no-change and mapped suggestions for terminal use', () => {
    assert.match(formatFocusedCheckSuggestions(suggestFocusedChecks([])), /no changed paths/);

    const output = formatFocusedCheckSuggestions(suggestFocusedChecks(['scripts/dogfood-status.mjs']));
    assert.match(output, /\[focused-checks\] 1 changed path/);
    assert.match(output, /pnpm test:dogfood:status/);
    assert.match(output, /pnpm test:mcp:maintenance/);
    assert.match(output, /pnpm dogfood:status/);
  });
});
