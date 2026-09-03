import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
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

function makeMcpFixture({
  dependency = 'fixture-mcp-dependency',
  declaredVersion = '1.0.0',
  installedVersion = null,
  installLayout = 'direct',
  packageExports = null,
} = {}) {
  const root = mkdtempSync(join(scratchRoot, 'mcp-'));
  fixtures.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      type: 'module',
      dependencies: { [dependency]: declaredVersion },
    }),
  );
  if (installedVersion) {
    const dependencyRoot =
      installLayout === 'pnpm-symlink'
        ? join(
            root,
            'node_modules',
            '.pnpm',
            `${dependency.replace('/', '+')}@${installedVersion}`,
            'node_modules',
            ...dependency.split('/'),
          )
        : join(root, 'node_modules', ...dependency.split('/'));
    mkdirSync(dependencyRoot, { recursive: true });
    writeFileSync(
      join(dependencyRoot, 'package.json'),
      JSON.stringify({
        name: dependency,
        version: installedVersion,
        type: 'module',
        ...(packageExports ? { exports: packageExports } : { main: 'index.js' }),
      }),
    );
    writeFileSync(join(dependencyRoot, 'index.js'), 'export default true;\n');
    if (installLayout === 'pnpm-symlink') {
      const packageLink = join(root, 'node_modules', ...dependency.split('/'));
      mkdirSync(dirname(packageLink), { recursive: true });
      symlinkSync(
        dependencyRoot,
        packageLink,
        process.platform === 'win32' ? 'junction' : 'dir',
      );
    }
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
    const root = makeMcpFixture({ installedVersion: '1.0.0' });

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), []);
    assert.doesNotThrow(() => assertSourceCheckoutMcpDependencies(root));
  });

  it('reports an exact-pinned dependency when the resolvable installation is stale', () => {
    const root = makeMcpFixture({
      declaredVersion: '2.0.0',
      installedVersion: '1.0.0',
    });

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), [
      'fixture-mcp-dependency',
    ]);
    assert.throws(
      () => assertSourceCheckoutMcpDependencies(root),
      {
        message:
          'Source-checkout MCP dependencies are missing or stale ' +
          '(fixture-mcp-dependency expected 2.0.0, found 1.0.0). ' +
          'Run: pnpm --dir mcp install --frozen-lockfile',
      },
    );
  });

  it('refuses to let non-exact runtime dependency specs bypass version parity', () => {
    const root = makeMcpFixture({
      declaredVersion: '^1.0.0',
      installedVersion: '1.0.0',
    });

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), [
      'fixture-mcp-dependency',
    ]);
    assert.throws(
      () => assertSourceCheckoutMcpDependencies(root),
      /not exactly pinned \(fixture-mcp-dependency declares "\^1\.0\.0"\).*mcp\/package\.json.*frozen-lockfile/,
    );
  });

  it('reads the installed version through a pnpm-style package symlink', () => {
    const root = makeMcpFixture({
      installedVersion: '1.0.0',
      installLayout: 'pnpm-symlink',
    });

    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), []);
  });

  it('accepts a scoped ESM dependency that exposes only the import condition', async () => {
    const dependency = '@scope/import-only';
    const root = makeMcpFixture({
      dependency,
      installedVersion: '1.0.0',
      packageExports: { '.': { import: './index.js' } },
    });
    const probePath = join(root, 'probe.mjs');
    writeFileSync(probePath, `import value from '${dependency}'; export default value;\n`);

    assert.equal((await import(pathToFileURL(probePath).href)).default, true);
    assert.deepEqual(findMissingSourceCheckoutMcpDependencies(root), []);
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
