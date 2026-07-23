import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { inspectVaultGit, snapshotVaultGit } from './git-tools.mjs';

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim();
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-git-'));
  const vault = join(root, 'vault');
  mkdirSync(vault);
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Atlas Test');
  git(root, 'config', 'user.email', 'atlas@example.test');
  writeFileSync(join(root, 'outside.txt'), 'outside v1\n');
  writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Project\n---\n');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'initial');
  return { root, vault };
}

test('inspectVaultGit reports vault files and outside staged risk separately', () => {
  const { root, vault } = makeRepo();
  try {
    writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Updated\n---\n');
    writeFileSync(join(root, 'outside.txt'), 'outside v2\n');
    git(root, 'add', 'outside.txt');

    const status = inspectVaultGit({ repoRoot: root, vaultRoot: vault });
    assert.equal(status.ok, true);
    assert.equal(status.vaultPathspec, 'vault');
    assert.equal(status.counts.total, 1);
    assert.equal(status.counts.stagedOutsideVault, 1);
    assert.deepEqual(status.stagedOutsideVault, ['outside.txt']);
    assert.equal(status.risk.level, 'medium');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('snapshotVaultGit is dry-run first and commits only the vault pathspec', () => {
  const { root, vault } = makeRepo();
  try {
    writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Updated\n---\n');
    writeFileSync(join(root, 'outside.txt'), 'outside v2\n');
    git(root, 'add', 'outside.txt');

    const preview = snapshotVaultGit({ repoRoot: root, vaultRoot: vault });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.committed, false);
    assert.equal(preview.pushSupported, false);

    const result = snapshotVaultGit({
      repoRoot: root,
      vaultRoot: vault,
      confirm: true,
      expectedHead: preview.expectedHead,
      message: 'docs(ontology): snapshot vault',
    });
    assert.equal(result.committed, true);
    assert.notEqual(result.commitHash, result.previousHead);
    assert.equal(git(root, 'show', '--pretty=', '--name-only', 'HEAD'), 'vault/project.md');
    assert.equal(git(root, 'diff', '--cached', '--name-only'), 'outside.txt');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('snapshotVaultGit rejects a stale expected HEAD', () => {
  const { root, vault } = makeRepo();
  try {
    writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Updated\n---\n');
    assert.throws(
      () => snapshotVaultGit({ repoRoot: root, vaultRoot: vault, confirm: true, expectedHead: '0'.repeat(40) }),
      /HEAD changed since preview/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
