import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

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
});
