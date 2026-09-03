import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, before, describe, it } from 'node:test';

import { runMcpSourceDependencyPreflight } from './check-mcp-source-dependencies.mjs';

const scratchRoot = '/tmp/atlas-mcp-preflight-agent';
const fixtures = [];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

before(() => mkdirSync(scratchRoot, { recursive: true }));

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function makeMcpFixture({
  dependency = 'missing-mcp-dependency',
  declaredVersion = '1.0.0',
  installedVersion = null,
} = {}) {
  const root = mkdtempSync(join(scratchRoot, 'preflight-'));
  fixtures.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: { [dependency]: declaredVersion } }),
  );
  if (installedVersion) {
    const dependencyRoot = join(root, 'node_modules', ...dependency.split('/'));
    mkdirSync(dependencyRoot, { recursive: true });
    writeFileSync(
      join(dependencyRoot, 'package.json'),
      JSON.stringify({ name: dependency, version: installedVersion, main: 'index.js' }),
    );
    writeFileSync(join(dependencyRoot, 'index.js'), 'export default true;\n');
  }
  return root;
}

describe('MCP source dependency command preflight', () => {
  it('keeps the production exact-pin scan from going idle', () => {
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'mcp/package.json'), 'utf8'),
    );
    const dependencies = Object.entries(packageJson.dependencies ?? {});

    assert.ok(dependencies.length > 0, 'the production preflight must inspect dependencies');
    for (const [dependency, version] of dependencies) {
      const stderr = [];
      const code = runMcpSourceDependencyPreflight({
        mcpRoot: makeMcpFixture({
          dependency,
          declaredVersion: version,
          installedVersion: version,
        }),
        stderr: { write: (chunk) => stderr.push(String(chunk)) },
      });
      assert.equal(
        code,
        0,
        `${dependency} must stay exactly pinned so version parity is measurable`,
      );
      assert.deepEqual(stderr, []);
    }
  });

  it('fails once with the exact recovery command instead of a module-loader stack', () => {
    const stderr = [];
    const code = runMcpSourceDependencyPreflight({
      mcpRoot: makeMcpFixture(),
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
    });
    const output = stderr.join('');

    assert.equal(code, 2);
    assert.equal(
      output,
      'error  Source-checkout MCP dependencies are missing (missing-mcp-dependency). ' +
        'Run: pnpm --dir mcp install --frozen-lockfile\n',
    );
    assert.equal(output.match(/pnpm --dir mcp install --frozen-lockfile/g)?.length, 1);
    assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|node:internal/);
  });

  it('passes silently when every declared runtime dependency resolves', () => {
    const stderr = [];
    const code = runMcpSourceDependencyPreflight({
      mcpRoot: makeMcpFixture({ installedVersion: '1.0.0' }),
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
    });

    assert.equal(code, 0);
    assert.deepEqual(stderr, []);
  });

  it('fails once with the install recovery when an exact-pinned dependency is stale', () => {
    const stderr = [];
    const code = runMcpSourceDependencyPreflight({
      mcpRoot: makeMcpFixture({
        declaredVersion: '2.0.0',
        installedVersion: '1.0.0',
      }),
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
    });
    const output = stderr.join('');

    assert.equal(code, 2);
    assert.equal(
      output,
      'error  Source-checkout MCP dependencies are missing or stale ' +
        '(missing-mcp-dependency expected 2.0.0, found 1.0.0). ' +
        'Run: pnpm --dir mcp install --frozen-lockfile\n',
    );
    assert.equal(output.match(/pnpm --dir mcp install --frozen-lockfile/g)?.length, 1);
  });
});
