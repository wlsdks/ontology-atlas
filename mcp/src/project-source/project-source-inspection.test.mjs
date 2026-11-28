import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inspectProjectSource } from './project-source-inspection.mjs';

function folder(t) {
  const root = mkdtempSync(join(tmpdir(), 'atlas-source-probe-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function git(root, ...args) {
  return execFileSync('git', ['-c', 'user.name=Atlas Test', '-c', 'user.email=atlas@example.invalid', ...args], { cwd: root, encoding: 'utf8' });
}

function commitAll(root) {
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'fixture');
}

test('a source with more than 16,000 files is listed whole, as a folder and as a repository', (t) => {
  const root = folder(t);
  for (let shard = 0; shard < 17; shard += 1) {
    mkdirSync(join(root, `shard-${shard}`));
    for (let file = 0; file < 1000; file += 1) writeFileSync(join(root, `shard-${shard}`, `f${file}.txt`), 'x');
  }
  const asFolder = inspectProjectSource(root);
  assert.equal(asFolder.kind, 'folder');
  assert.equal(asFolder.files.length, 17000);
  assert.equal(asFolder.truncated, false);

  commitAll(root);
  const asRepository = inspectProjectSource(root);
  assert.equal(asRepository.kind, 'git');
  assert.equal(asRepository.files.length, 17000);
  assert.equal(asRepository.truncated, false);
});

test('a name is read in one spelling whichever way the disk stored it', (t) => {
  const decomposed = '한글.txt'.normalize('NFD');
  const composed = decomposed.normalize('NFC');
  const root = folder(t);
  writeFileSync(join(root, decomposed), 'text');
  const asFolder = inspectProjectSource(root);
  assert.deepEqual(asFolder.files, [composed]);

  commitAll(root);
  assert.deepEqual(inspectProjectSource(root).files, [composed]);
});

test('a name with a backslash stays one name where the system allows one', (t) => {
  if (process.platform === 'win32') {
    t.skip('a Windows name cannot hold a backslash: it separates folders');
    return;
  }
  const root = folder(t);
  writeFileSync(join(root, 'back\\slash.txt'), 'text');
  commitAll(root);
  assert.deepEqual(inspectProjectSource(root).files, ['back\\slash.txt']);
});

test('a repository with no commit yet is a source with an empty revision, not an error', (t) => {
  const root = folder(t);
  git(root, 'init', '-q');
  writeFileSync(join(root, 'draft.txt'), 'text');
  const probe = inspectProjectSource(root);
  assert.equal(probe.kind, 'git');
  assert.equal(probe.revision, '(unborn)');
  assert.deepEqual(probe.files, ['draft.txt']);
  assert.equal(probe.dirty, true);
});

test('an edit that keeps a file the same size changes the fingerprint', (t) => {
  const root = folder(t);
  writeFileSync(join(root, 'tracked.txt'), 'aaaa');
  commitAll(root);
  const clean = inspectProjectSource(root).fingerprint;

  writeFileSync(join(root, 'tracked.txt'), 'bbbb');
  const edited = inspectProjectSource(root).fingerprint;
  assert.notEqual(edited, clean);

  writeFileSync(join(root, 'new.txt'), 'cccc');
  const withNew = inspectProjectSource(root).fingerprint;
  writeFileSync(join(root, 'new.txt'), 'dddd');
  assert.notEqual(inspectProjectSource(root).fingerprint, withNew, 'an untracked file is read, not only measured');

  writeFileSync(join(root, 'tracked.txt'), 'aaaa');
  rmSync(join(root, 'new.txt'));
  assert.equal(inspectProjectSource(root).fingerprint, clean, 'undoing the changes returns the fingerprint');
});
