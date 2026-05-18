import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { focusedTestTargets, runFocusedNodeTest } from './run-focused-node-test.mjs';

const SCRIPT = 'scripts/run-focused-node-test.mjs';

function withFixture(body, fn) {
  const root = mkdtempSync(join(tmpdir(), 'omot-focused-test-'));
  const file = join(root, 'fixture.test.mjs');
  try {
    writeFileSync(file, body);
    return fn(file);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(args) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (key.startsWith('NODE_TEST')) {
      delete env[key];
    }
  }
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    env,
    encoding: 'utf-8',
  });
}

describe('focused node test wrapper', () => {
  it('ignores node test option values when deriving focused targets', () => {
    assert.deepEqual(
      focusedTestTargets([
        '--test-name-pattern',
        'target case',
        '--test-concurrency',
        '1',
        '--test-timeout',
        '1000',
        '--test-reporter=spec',
        '--test-shard',
        '1/2',
        'fixture.test.mjs',
      ]),
      ['fixture.test.mjs'],
    );
  });

  it('fails before spawning when no test-name pattern is provided', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['fixture.test.mjs'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        throw new Error('spawn should not run without a pattern');
      },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, [
      '[focused-node-test] --test-name-pattern is required for fixture.test.mjs; use node --test directly for a full test run\n',
    ]);
  });

  it('fails before spawning when no test target is provided', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern', 'target case', '--test-concurrency', '1', '--test-timeout', '1000'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        throw new Error('spawn should not run without a test target');
      },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, [
      '[focused-node-test] at least one test target is required; use node --test directly for a full test run\n',
    ]);
  });

  it('passes through a focused run that executes at least one test', () => {
    withFixture(
      "import test from 'node:test';\ntest('target case', () => {});\ntest('other case', () => {});\n",
      (file) => {
        const result = run(['--test-name-pattern', 'target case', file]);

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /# pass 1/);
      },
    );
  });

  it('passes through equals-form --test-name-pattern via the shared parser', () => {
    withFixture(
      "import test from 'node:test';\ntest('target case', () => {});\ntest('other case', () => {});\n",
      (file) => {
        const result = run([`--test-name-pattern=target case`, file]);

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /# pass 1/);
      },
    );
  });

  it('fails when a focused pattern matches zero tests even though node exits cleanly', () => {
    withFixture("import test from 'node:test';\ntest('target case', () => {});\n", (file) => {
      const result = run(['--test-name-pattern', 'missing case', file]);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /# pass 0/);
      assert.match(result.stderr, new RegExp(`no tests matched --test-name-pattern=missing case in ${file}`));
    });
  });

  it('reports node --test signal exits with the focused target path', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern', 'target case', 'fixture.test.mjs'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        return { status: null, signal: 'SIGTERM', stdout: '', stderr: '' };
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(diagnostics, [
      '[focused-node-test] node --test terminated by SIGTERM in fixture.test.mjs\n',
    ]);
  });

  it('reports missing node --test exit status with the focused target path', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern=target case', 'fixture.test.mjs'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        return { status: null, signal: null, stdout: '', stderr: '' };
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(diagnostics, [
      '[focused-node-test] node --test ended without an exit status in fixture.test.mjs\n',
    ]);
  });
});
