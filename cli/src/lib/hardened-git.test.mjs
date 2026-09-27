import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hardenedGitArgs, clearFilterCache } from './hardened-git.mjs';

// Security regression: a hostile repository must not run code that its own git
// config asks for when the CLI spawns git in it (with the cwd option, no -C). Each
// test proves the fixture is a live weapon unhardened, then that the hardened args
// leave no marker. Reintroducing the defect fails these.

function plainGit(cwd, args) {
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function seedIdentity(cwd) {
  plainGit(cwd, ['config', 'user.email', 'test@example.invalid']);
  plainGit(cwd, ['config', 'user.name', 'atlas test']);
  plainGit(cwd, ['config', 'commit.gpgsign', 'false']);
  plainGit(cwd, ['config', 'core.autocrlf', 'false']);
}

const STATUS_ARGS = ['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all', '--', '.'];

test('a hostile embedded repo config does not execute on status', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-cli-sec-embed-'));
  clearFilterCache();
  try {
    const upstream = join(base, 'upstream');
    mkdirSync(join(upstream, 'atlas/objects'), { recursive: true });
    mkdirSync(join(upstream, 'atlas/refs/heads'), { recursive: true });
    writeFileSync(join(upstream, 'atlas/objects/.keep'), '');
    writeFileSync(join(upstream, 'atlas/refs/heads/.keep'), '');
    writeFileSync(join(upstream, 'atlas/HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(upstream, 'atlas/README.md'), '# node\n');
    const marker = join(base, 'EMBEDDED_EXECUTED');
    writeFileSync(
      join(upstream, 'atlas/config'),
      `[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tworktree = .\n\tfsmonitor = "touch ${marker}; false"\n`,
    );
    plainGit(upstream, ['init', '-q']);
    seedIdentity(upstream);
    plainGit(upstream, ['add', '-A']);
    plainGit(upstream, ['commit', '-qm', 'seed']);

    const clone = join(base, 'clone');
    execFileSync('git', ['clone', '-q', upstream, clone]);
    const atlas = join(clone, 'atlas');

    spawnSync('git', STATUS_ARGS, { cwd: atlas, encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture precondition: unhardened git runs the embedded config');
    rmSync(marker);

    spawnSync('git', hardenedGitArgs(atlas, STATUS_ARGS), { cwd: atlas, encoding: 'utf8' });
    assert.ok(!existsSync(marker), 'hardened args must not execute a hostile embedded repo config');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

function buildCleanFilterRepo(base, marker) {
  const repo = join(base, 'repo');
  mkdirSync(repo, { recursive: true });
  plainGit(repo, ['init', '-q']);
  seedIdentity(repo);
  writeFileSync(join(repo, '.gitattributes'), '*.md filter=evil\n');
  writeFileSync(join(repo, 'note.md'), '# one\n');
  plainGit(repo, ['add', '-A']);
  plainGit(repo, ['commit', '-qm', 'one']);
  plainGit(repo, ['config', 'filter.evil.clean', `sh -c 'touch ${marker}; cat'`]);
  writeFileSync(join(repo, 'note.md'), '# two changed\n');
  return repo;
}

test('a hostile clean filter fires on an unhardened add', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-cli-sec-filter-weapon-'));
  try {
    const marker = join(base, 'CLEAN_FILTER_EXECUTED');
    const repo = buildCleanFilterRepo(base, marker);
    spawnSync('git', ['add', '-A', '--', '.'], { cwd: repo, encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture precondition: clean filter fires on an unhardened add');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a hostile clean filter is neutralised on a hardened add', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-cli-sec-filter-fix-'));
  clearFilterCache();
  try {
    const marker = join(base, 'CLEAN_FILTER_EXECUTED');
    const repo = buildCleanFilterRepo(base, marker);
    const res = spawnSync('git', hardenedGitArgs(repo, ['add', '-A', '--', '.']), { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, `add still succeeds: ${res.stderr}`);
    assert.ok(!existsSync(marker), 'a repo-local clean filter must not run under the hardened args');
    const staged = spawnSync('git', hardenedGitArgs(repo, ['diff', '--cached', '--name-only']), { cwd: repo, encoding: 'utf8' });
    assert.match(staged.stdout, /note\.md/, 'the file is still staged');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('repository hooks are left alone so a commit still runs the user pre-commit hook', () => {
  // The snapshot flow classifies a rejecting pre-commit hook, so the hardening must
  // not disable hooks; only the config-execution vectors are neutralised.
  const args = hardenedGitArgs('/tmp', ['commit', '-m', 'x']);
  assert.ok(!args.includes('core.hooksPath=/dev/null'), 'hooks are not disabled');
  assert.ok(args.includes('safe.bareRepository=explicit'), 'bare-repo guard stays');
  assert.ok(args.includes('core.fsmonitor=false'), 'fsmonitor guard stays');
});
