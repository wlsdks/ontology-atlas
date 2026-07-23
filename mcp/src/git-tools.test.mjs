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

test('snapshotVaultGit returns a stable subject when the vault has no changes', () => {
  const { root, vault } = makeRepo();
  try {
    const preview = snapshotVaultGit({ repoRoot: root, vaultRoot: vault });
    assert.equal(preview.reason, 'no-changes');
    assert.equal(preview.subject, 'ontology snapshot: no vault changes');
    assert.equal(preview.committed, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detached HEAD is high risk and snapshot confirmation is blocked', () => {
  const { root, vault } = makeRepo();
  try {
    const initialHead = git(root, 'rev-parse', 'HEAD');
    git(root, 'checkout', '--detach', initialHead);
    writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Detached update\n---\n');

    const preview = snapshotVaultGit({ repoRoot: root, vaultRoot: vault });
    assert.equal(preview.risk.level, 'high');
    assert.match(preview.risk.warnings.join('\n'), /detached HEAD/);
    assert.throws(
      () => snapshotVaultGit({
        repoRoot: root,
        vaultRoot: vault,
        confirm: true,
        expectedHead: preview.expectedHead,
      }),
      /detached HEAD/,
    );
    assert.equal(git(root, 'rev-parse', 'HEAD'), initialHead);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('inspectVaultGit preserves unicode and spaces as usable paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'ontology-atlas-git-unicode-'));
  const vault = join(root, '온톨로지 vault');
  try {
    mkdirSync(vault);
    git(root, 'init', '-b', 'main');
    git(root, 'config', 'user.name', 'Atlas Test');
    git(root, 'config', 'user.email', 'atlas@example.test');
    writeFileSync(join(vault, 'project.md'), '---\nkind: project\ntitle: Project\n---\n');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'initial');

    writeFileSync(join(vault, '새 노드.md'), '---\nkind: capability\ntitle: 새 노드\n---\n');
    writeFileSync(join(root, '외부 note.txt'), 'outside\n');
    git(root, 'add', '외부 note.txt');

    const status = inspectVaultGit({ repoRoot: root, vaultRoot: vault });
    assert.equal(status.vaultPathspec, '온톨로지 vault');
    assert.deepEqual(status.files.map((row) => row.path), ['온톨로지 vault/새 노드.md']);
    assert.deepEqual(status.stagedOutsideVault, ['외부 note.txt']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
