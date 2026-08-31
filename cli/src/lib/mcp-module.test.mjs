import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';

import {
  SOURCE_CHECKOUT_MCP_INSTALL_COMMAND,
  assertSourceCheckoutMcpDependencies,
  findMissingSourceCheckoutMcpDependencies,
  sourceCheckoutMcpDependencyError,
} from './mcp-module.mjs';

const scratchRoot = '/tmp/atlas-mcp-preflight-agent';
const fixtures = [];

before(() => mkdirSync(scratchRoot, { recursive: true }));

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function makeMcpFixture({ installDependency = false } = {}) {
  const root = mkdtempSync(join(scratchRoot, 'mcp-'));
  fixtures.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      type: 'module',
      dependencies: { 'fixture-mcp-dependency': '1.0.0' },
    }),
  );
  if (installDependency) {
    const dependencyRoot = join(root, 'node_modules', 'fixture-mcp-dependency');
    mkdirSync(dependencyRoot, { recursive: true });
    writeFileSync(
      join(dependencyRoot, 'package.json'),
      JSON.stringify({ name: 'fixture-mcp-dependency', version: '1.0.0', main: 'index.js' }),
    );
    writeFileSync(join(dependencyRoot, 'index.js'), 'export default true;\n');
  }
  return root;
}

describe('source-checkout MCP dependency preflight', () => {
  it('reports every declared runtime dependency that Node cannot resolve from mcp/', () => {
    const root = makeMcpFixture();

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), [
      'fixture-mcp-dependency',
    ]);
  });

  it('is silent when declared runtime dependencies resolve from mcp/', () => {
    const root = makeMcpFixture({ installDependency: true });

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), []);
    assert.doesNotThrow(() => assertSourceCheckoutMcpDependencies(root));
  });

  it('owns one exact source-checkout recovery command', () => {
    const root = makeMcpFixture();

    assert.equal(
      SOURCE_CHECKOUT_MCP_INSTALL_COMMAND,
      'pnpm --dir mcp install --frozen-lockfile',
    );
    assert.throws(
      () => assertSourceCheckoutMcpDependencies(root),
      {
        message:
          'Source-checkout MCP dependencies are missing (fixture-mcp-dependency). ' +
          'Run: pnpm --dir mcp install --frozen-lockfile',
      },
    );
  });

  it('recognizes a source server loader crash without echoing its raw stack', () => {
    const root = makeMcpFixture();
    const entry = join(root, 'src', 'index.js');
    const raw = [
      "Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'fixture-mcp-dependency' imported from /tmp/mcp/src/index.js",
      '    at packageResolve (node:internal/modules/esm/resolve:767:9)',
    ].join('\n');

    const error = sourceCheckoutMcpDependencyError(raw, { entry, mcpRoot: root });

    assert.equal(
      error?.message,
      'Source-checkout MCP dependencies are missing (fixture-mcp-dependency). ' +
        'Run: pnpm --dir mcp install --frozen-lockfile',
    );
    assert.doesNotMatch(error?.message ?? '', /ERR_MODULE_NOT_FOUND|OATLAS_MCP_PATH|timeout/i);
    assert.equal(
      sourceCheckoutMcpDependencyError(raw, { entry: '/tmp/installed/index.js', mcpRoot: root }),
      null,
    );
  });
});
