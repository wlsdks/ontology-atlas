import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  disallowedReporterOption,
  disallowedReporterSource,
  focusedTestTargets,
  runFocusedNodeTest,
} from './run-focused-node-test.mjs';

const SCRIPT = 'scripts/run-focused-node-test.mjs';

function withFixture(body, fn) {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-focused-test-'));
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

  it('does not leak option values as targets when a split option value is missing', () => {
    assert.deepEqual(
      focusedTestTargets(['--test-name-pattern', '--test-timeout', '1000']),
      [],
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

  it('fails before spawning when split --test-name-pattern is missing its value', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern', '--test-timeout', '1000'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        throw new Error('spawn should not be called');
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(
      diagnostics.join(''),
      '[focused-node-test] --test-name-pattern is required; use node --test directly for a full test run\n',
    );
  });

  it('fails before spawning when reporter options hide TAP counts', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern', 'target case', '--test-reporter=spec', 'fixture.test.mjs'],
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        throw new Error('spawn should not run with a custom reporter');
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(disallowedReporterOption(['--test-reporter', 'spec']), '--test-reporter');
    assert.equal(disallowedReporterOption(['--test-reporter-destination=out.txt']), '--test-reporter-destination');
    assert.deepEqual(diagnostics, [
      '[focused-node-test] --test-reporter is not supported; the wrapper requires the default TAP reporter to verify focused test counts\n',
    ]);
  });

  it('fails before spawning when NODE_OPTIONS configures a custom reporter', () => {
    const diagnostics = [];
    const exitCode = runFocusedNodeTest({
      argv: ['--test-name-pattern', 'target case', 'fixture.test.mjs'],
      env: { NODE_OPTIONS: '--test-reporter=spec' },
      stderr: { write: (text) => diagnostics.push(text) },
      stdout: { write() {} },
      spawn() {
        throw new Error('spawn should not run with a custom reporter');
      },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(
      disallowedReporterSource({
        argv: ['--test-name-pattern=target case'],
        env: { NODE_OPTIONS: '--test-reporter-destination=out.txt' },
      }),
      { option: '--test-reporter-destination', source: 'NODE_OPTIONS' },
    );
    assert.deepEqual(diagnostics, [
      '[focused-node-test] --test-reporter from NODE_OPTIONS is not supported; the wrapper requires the default TAP reporter to verify focused test counts\n',
    ]);
  });

  it('passes through a focused run that executes at least one test', () => {
    withFixture(
      "import test from 'node:test';\ntest('target case', () => {});\ntest('other case', () => {});\n",
      (file) => {
        const result = run(['--test-name-pattern', 'target case', file]);

        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /# pass 1/);
        assert.match(result.stdout, /\[focused-node-test\] pattern=target case targets=.+fixture\.test\.mjs matched=1 tests=2 pass=1 fail=0 cancelled=0 skipped=1/);
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
        assert.match(result.stdout, /\[focused-node-test\] pattern=target case targets=.+fixture\.test\.mjs matched=1 tests=2 pass=1 fail=0 cancelled=0 skipped=1/);
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

  it('prints matched counts when a focused matched test fails', () => {
    withFixture(
      "import test from 'node:test';\ntest('target case', () => { throw new Error('boom'); });\ntest('other case', () => {});\n",
      (file) => {
        const result = run(['--test-name-pattern', 'target case', file]);

        assert.equal(result.status, 1);
        assert.match(result.stdout, /# fail 1/);
        assert.match(result.stdout, /\[focused-node-test\] pattern=target case targets=.+fixture\.test\.mjs matched=1 tests=2 pass=0 fail=1 cancelled=0 skipped=1/);
      },
    );
  });

  it('separates setup failures from focused matched tests', () => {
    withFixture("throw new Error('setup boom');\n", (file) => {
      const result = run(['--test-name-pattern', 'target case', file]);

      assert.equal(result.status, 1);
      assert.match(result.stdout, /# fail 1/);
      assert.match(result.stdout, /\[focused-node-test\] pattern=target case targets=.+fixture\.test\.mjs matched=0 tests=1 pass=0 fail=1 cancelled=0 skipped=0 setupFailures=1/);
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
