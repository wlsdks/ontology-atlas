import { strict as assert } from 'node:assert';
import test from 'node:test';
import { getStagedFiles } from './git-staged.mjs';

test('getStagedFiles — parses newline-separated git output into a trimmed list', () => {
  const files = getStagedFiles({
    run: () => 'src/a.ts\nsrc/b/c.ts\n',
  });
  assert.deepEqual(files, ['src/a.ts', 'src/b/c.ts']);
});

test('getStagedFiles — drops blank lines and normalizes backslashes', () => {
  const files = getStagedFiles({
    run: () => 'src\\a.ts\n\n  \nsrc/b.ts\n',
  });
  assert.deepEqual(files, ['src/a.ts', 'src/b.ts']);
});

test('getStagedFiles — empty staged set returns an empty array (not null)', () => {
  const files = getStagedFiles({ run: () => '' });
  assert.deepEqual(files, []);
});

test('getStagedFiles — returns null when the git command throws (not a repo)', () => {
  const files = getStagedFiles({
    run: () => {
      throw new Error('not a git repository');
    },
  });
  assert.equal(files, null);
});

test('getStagedFiles — returns null when run() resolves to a non-string', () => {
  const files = getStagedFiles({ run: () => undefined });
  assert.equal(files, null);
});

test('getStagedFiles — passes the expected diff-filter args and cwd through', () => {
  let capturedArgs;
  let capturedCwd;
  getStagedFiles({
    cwd: '/tmp/some-repo',
    run: (args, cwd) => {
      capturedArgs = args;
      capturedCwd = cwd;
      return '';
    },
  });
  assert.deepEqual(capturedArgs, ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  assert.equal(capturedCwd, '/tmp/some-repo');
});
