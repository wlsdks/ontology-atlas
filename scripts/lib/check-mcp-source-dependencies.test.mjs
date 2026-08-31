import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, before, describe, it } from 'node:test';

import { runMcpSourceDependencyPreflight } from './check-mcp-source-dependencies.mjs';

const scratchRoot = '/tmp/atlas-mcp-preflight-agent';
const fixtures = [];

before(() => mkdirSync(scratchRoot, { recursive: true }));

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

function makeMcpFixture({ installDependency = false } = {}) {
  const root = mkdtempSync(join(scratchRoot, 'preflight-'));
  fixtures.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: { 'missing-mcp-dependency': '1.0.0' } }),
  );
  if (installDependency) {
    const dependencyRoot = join(root, 'node_modules', 'missing-mcp-dependency');
    mkdirSync(dependencyRoot, { recursive: true });
    writeFileSync(
      join(dependencyRoot, 'package.json'),
      JSON.stringify({ name: 'missing-mcp-dependency', version: '1.0.0', main: 'index.js' }),
    );
    writeFileSync(join(dependencyRoot, 'index.js'), 'export default true;\n');
  }
  return root;
}

describe('MCP source dependency command preflight', () => {
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
      mcpRoot: makeMcpFixture({ installDependency: true }),
      stderr: { write: (chunk) => stderr.push(String(chunk)) },
    });

    assert.equal(code, 0);
    assert.deepEqual(stderr, []);
  });
});
