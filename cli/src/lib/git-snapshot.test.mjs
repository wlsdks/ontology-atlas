import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  addPaths,
  buildChangeSummary,
  classifyChange,
  commitPathspec,
  findGitRepoRoot,
  findStagedOutsideVault,
  formatSnapshotSummary,
  getCurrentBranch,
  getFullPorcelainStatus,
  getHeadHash,
  getPorcelainStatus,
  getRemoteUrl,
  getUpstreamRef,
  pushCurrentBranch,
  vaultPathspec,
} from './git-snapshot.mjs';

// 실제 git 프로세스를 쓰는 임시 repo fixture — partial-commit pathspec
// 동작(다른 staged 파일 보호)은 mock 으로는 검증할 수 없어 real repo 로
// end-to-end 확인한다. 각 test 는 자기만의 tmp dir 을 만들고 끝에 지운다.

function sh(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function makeTmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function initRepo(prefix = 'oatlas-snapshot-') {
  const repoRoot = makeTmpDir(prefix);
  sh(['init', '-b', 'main'], repoRoot);
  sh(['config', 'user.email', 'test@example.com'], repoRoot);
  sh(['config', 'user.name', 'Test User'], repoRoot);
  sh(['config', 'commit.gpgsign', 'false'], repoRoot);
  return repoRoot;
}

function writeMd(repoRoot, relPath, { kind, slug, title = 'Test' } = {}) {
  const abs = join(repoRoot, relPath);
  mkdirSync(join(abs, '..'), { recursive: true });
  const fm = [
    '---',
    kind ? `kind: ${kind}` : null,
    slug ? `slug: ${slug}` : null,
    `title: ${title}`,
    '---',
    '',
    'body',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
  writeFileSync(abs, fm);
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test('findGitRepoRoot — resolves the toplevel for a path inside a git repo', () => {
  const repoRoot = initRepo();
  try {
    const vaultRoot = join(repoRoot, 'docs', 'ontology');
    mkdirSync(vaultRoot, { recursive: true });
    const found = findGitRepoRoot(vaultRoot);
    // macOS tmp dirs can be symlinked (/tmp -> /private/tmp) — compare realpath-insensitively.
    assert.ok(found, 'expected a repo root');
    assert.match(found, /oatlas-snapshot-/);
  } finally {
    cleanup(repoRoot);
  }
});

test('findGitRepoRoot — returns null outside any git repo', () => {
  const dir = makeTmpDir('oatlas-snapshot-no-git-');
  try {
    assert.equal(findGitRepoRoot(dir), null);
  } finally {
    cleanup(dir);
  }
});

test('vaultPathspec — "." when vault is the repo root, relative path otherwise', () => {
  const repoRoot = '/repo';
  assert.equal(vaultPathspec(repoRoot, '/repo'), '.');
  assert.equal(vaultPathspec(repoRoot, '/repo/docs/ontology'), 'docs/ontology');
});

test('classifyChange — added / modified / deleted from porcelain index+worktree codes', () => {
  assert.equal(classifyChange({ index: '?', worktree: '?' }), 'added');
  assert.equal(classifyChange({ index: 'A', worktree: ' ' }), 'added');
  assert.equal(classifyChange({ index: ' ', worktree: 'M' }), 'modified');
  assert.equal(classifyChange({ index: 'M', worktree: ' ' }), 'modified');
  assert.equal(classifyChange({ index: 'D', worktree: ' ' }), 'deleted');
  assert.equal(classifyChange({ index: ' ', worktree: 'D' }), 'deleted');
});

test('getPorcelainStatus — scope guard: only reports changes under the vault pathspec', () => {
  const repoRoot = initRepo();
  try {
    // Committed baseline so we have tracked files to modify.
    writeMd(repoRoot, 'docs/ontology/capabilities/foo.md', { kind: 'capability', slug: 'capabilities/foo' });
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 1;\n');
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);

    // Now change one file inside the vault and one outside.
    writeMd(repoRoot, 'docs/ontology/capabilities/foo.md', { kind: 'capability', slug: 'capabilities/foo', title: 'Updated' });
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 2;\n');
    writeMd(repoRoot, 'docs/ontology/elements/bar.md', { kind: 'element', slug: 'elements/bar' });

    const rows = getPorcelainStatus({ repoRoot, pathspec: 'docs/ontology' });
    assert.ok(rows);
    const paths = rows.map((r) => r.path).sort();
    assert.deepEqual(paths, ['docs/ontology/capabilities/foo.md', 'docs/ontology/elements/bar.md']);
    // The outside-vault change must never appear in the scoped scan.
    assert.ok(!paths.includes('src-file.ts'));
  } finally {
    cleanup(repoRoot);
  }
});

test('getPorcelainStatus — zero changes returns an empty array', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/project.md', { kind: 'project', slug: 'project' });
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);

    const rows = getPorcelainStatus({ repoRoot, pathspec: 'docs/ontology' });
    assert.deepEqual(rows, []);
  } finally {
    cleanup(repoRoot);
  }
});

test('buildChangeSummary + formatSnapshotSummary — kind-aware add/modify/delete counts and capped representative slugs', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a' });
    writeMd(repoRoot, 'docs/ontology/capabilities/b.md', { kind: 'capability', slug: 'capabilities/b' });
    writeMd(repoRoot, 'docs/ontology/elements/c.md', { kind: 'element', slug: 'elements/c' });
    writeMd(repoRoot, 'docs/ontology/elements/d.md', { kind: 'element', slug: 'elements/d' });
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);

    // 2 added, 2 modified, 1 deleted.
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a', title: 'Updated A' });
    writeMd(repoRoot, 'docs/ontology/elements/c.md', { kind: 'element', slug: 'elements/c', title: 'Updated C' });
    unlinkSync(join(repoRoot, 'docs/ontology/elements/d.md'));
    writeMd(repoRoot, 'docs/ontology/domains/new1.md', { kind: 'domain', slug: 'domains/new1' });
    writeMd(repoRoot, 'docs/ontology/domains/new2.md', { kind: 'domain', slug: 'domains/new2' });

    const vaultRoot = join(repoRoot, 'docs', 'ontology');
    const rows = getPorcelainStatus({ repoRoot, pathspec: 'docs/ontology' });
    const changes = buildChangeSummary(rows, { repoRoot, vaultRoot });

    assert.equal(changes.filter((c) => c.status === 'added').length, 2);
    assert.equal(changes.filter((c) => c.status === 'modified').length, 2);
    assert.equal(changes.filter((c) => c.status === 'deleted').length, 1);

    const summary = formatSnapshotSummary(changes);
    assert.match(summary, /\+2 concepts/);
    assert.match(summary, /~2 updated/);
    assert.match(summary, /-1 removed/);
    // 5 total changes, cap 3 + overflow marker.
    assert.match(summary, /\+2\)$/);
  } finally {
    cleanup(repoRoot);
  }
});

test('formatSnapshotSummary — no changes still produces a stable headline', () => {
  assert.equal(formatSnapshotSummary([]), 'ontology snapshot: no concept changes');
});

test('findStagedOutsideVault — flags files staged outside the vault pathspec, ignores untracked/unstaged', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a' });
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 1;\n');
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);

    // Stage an outside-vault change (developer mid-edit elsewhere).
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 2;\n');
    sh(['add', 'src-file.ts'], repoRoot);
    // Unstaged outside-vault untracked file — should NOT be flagged (nothing to lose).
    writeFileSync(join(repoRoot, 'other.txt'), 'noise\n');
    // Vault change too.
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a', title: 'Updated' });

    const fullRows = getFullPorcelainStatus({ repoRoot });
    const outside = findStagedOutsideVault(fullRows, 'docs/ontology');
    assert.deepEqual(outside, ['src-file.ts']);
  } finally {
    cleanup(repoRoot);
  }
});

test('commitPathspec — vault-scoped partial commit leaves staged changes outside the vault untouched', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a' });
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 1;\n');
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);
    const baselineHash = sh(['rev-parse', 'HEAD'], repoRoot).trim();

    // Stage an outside-vault change.
    writeFileSync(join(repoRoot, 'src-file.ts'), 'export const x = 2;\n');
    sh(['add', 'src-file.ts'], repoRoot);

    // Vault change (untracked new node).
    writeMd(repoRoot, 'docs/ontology/elements/new.md', { kind: 'element', slug: 'elements/new' });

    addPaths({ repoRoot, paths: ['docs/ontology/elements/new.md'] });
    commitPathspec({ repoRoot, pathspec: 'docs/ontology', message: 'ontology snapshot: +1 concept\n\n  A  docs/ontology/elements/new.md' });

    const headHash = getHeadHash({ repoRoot });
    assert.notEqual(headHash, baselineHash, 'a new commit should have landed');

    // The outside-vault change must still be staged, not committed.
    const status = sh(['status', '--porcelain'], repoRoot);
    assert.match(status, /^M  src-file\.ts$/m, 'src-file.ts should remain staged after the vault-scoped commit');

    // And it must not be part of the new commit's tree diff.
    const committedFiles = sh(['diff-tree', '--no-commit-id', '--name-only', '-r', headHash], repoRoot);
    assert.ok(!committedFiles.includes('src-file.ts'));
    assert.ok(committedFiles.includes('docs/ontology/elements/new.md'));
  } finally {
    cleanup(repoRoot);
  }
});

test('commitPathspec — captures a tracked modification without an explicit git add', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a' });
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);

    writeMd(repoRoot, 'docs/ontology/capabilities/a.md', { kind: 'capability', slug: 'capabilities/a', title: 'Updated' });
    // No `git add` here — pathspec-scoped commit should still pick up the
    // working-tree change for this already-tracked file.
    commitPathspec({ repoRoot, pathspec: 'docs/ontology', message: 'ontology snapshot: ~1 updated' });

    const status = sh(['status', '--porcelain'], repoRoot);
    assert.equal(status.trim(), '', 'vault should be clean after the scoped commit');
  } finally {
    cleanup(repoRoot);
  }
});

test('getUpstreamRef — null when no upstream is configured', () => {
  const repoRoot = initRepo();
  try {
    writeMd(repoRoot, 'docs/ontology/project.md', { kind: 'project', slug: 'project' });
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);
    assert.equal(getUpstreamRef({ repoRoot }), null);
    assert.equal(getCurrentBranch({ repoRoot }), 'main');
  } finally {
    cleanup(repoRoot);
  }
});

test('push flow — local bare repo fixture (no real remote network access)', () => {
  const bareRoot = makeTmpDir('oatlas-snapshot-bare-');
  const repoRoot = initRepo();
  try {
    sh(['init', '--bare', '-b', 'main'], bareRoot);
    sh(['remote', 'add', 'origin', bareRoot], repoRoot);

    writeMd(repoRoot, 'docs/ontology/project.md', { kind: 'project', slug: 'project' });
    sh(['add', '.'], repoRoot);
    sh(['commit', '-m', 'baseline'], repoRoot);
    // Snapshot itself never configures an upstream (trust charter) — the
    // fixture sets it up out-of-band to simulate "developer already has a
    // remote wired", which is the only case `--push` is allowed to act on.
    sh(['push', '-u', 'origin', 'main'], repoRoot);

    const upstream = getUpstreamRef({ repoRoot });
    assert.equal(upstream, 'origin/main');

    writeMd(repoRoot, 'docs/ontology/capabilities/new.md', { kind: 'capability', slug: 'capabilities/new' });
    addPaths({ repoRoot, paths: ['docs/ontology/capabilities/new.md'] });
    commitPathspec({ repoRoot, pathspec: 'docs/ontology', message: 'ontology snapshot: +1 concept' });

    pushCurrentBranch({ repoRoot });
    const remoteUrl = getRemoteUrl({ repoRoot, remoteName: 'origin' });
    assert.equal(remoteUrl, bareRoot);

    // Verify the commit actually landed on the bare "remote".
    const bareLog = sh(['log', '--oneline', 'main'], bareRoot);
    assert.match(bareLog, /ontology snapshot: \+1 concept/);
  } finally {
    cleanup(repoRoot);
    cleanup(bareRoot);
  }
});

test('getPorcelainStatus / findGitRepoRoot — a vault directory with no .git anywhere above it', () => {
  const dir = makeTmpDir('oatlas-snapshot-orphan-');
  try {
    const vaultRoot = join(dir, 'docs', 'ontology');
    mkdirSync(vaultRoot, { recursive: true });
    assert.equal(findGitRepoRoot(vaultRoot), null);
  } finally {
    cleanup(dir);
  }
});

test('sanity — the fixtures directory is actually removed from disk after each test (no leakage)', () => {
  const dir = makeTmpDir('oatlas-snapshot-leak-check-');
  cleanup(dir);
  assert.equal(existsSync(dir), false);
});
