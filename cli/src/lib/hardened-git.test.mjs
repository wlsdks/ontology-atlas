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

test('hooks are disabled for every verb except the snapshot commit', () => {
  // The snapshot commit classifies a rejecting pre-commit hook, so it keeps hooks;
  // status/diff/restore/pull must not run a repo-controlled hook on a no-click path.
  const commit = hardenedGitArgs('/tmp', ['commit', '-m', 'x']);
  assert.ok(!commit.includes('core.hooksPath=/dev/null'), 'the commit keeps hooks');
  for (const verb of [['status'], ['diff', 'HEAD'], ['checkout', '--', 'a'], ['pull']]) {
    const args = hardenedGitArgs('/tmp', verb);
    assert.ok(args.includes('core.hooksPath=/dev/null'), `${verb[0]} disables hooks`);
    assert.ok(args.includes('safe.bareRepository=explicit'), `${verb[0]} keeps the bare-repo guard`);
  }
});

const FILTER_CASES = {
  include: 'a filter reachable only through include config',
  worktree: 'a filter reachable only through worktree config',
  required: 'a required filter',
};

for (const scope of Object.keys(FILTER_CASES)) {
  test(`the hardened args neutralise ${FILTER_CASES[scope]} and let add succeed`, () => {
    const base = mkdtempSync(join(tmpdir(), `atlas-cli-sec-${scope}-`));
    clearFilterCache();
    try {
      const repo = join(base, 'repo');
      mkdirSync(repo, { recursive: true });
      plainGit(repo, ['init', '-q']);
      seedIdentity(repo);
      writeFileSync(join(repo, '.gitattributes'), '*.md filter=hidden\n');
      writeFileSync(join(repo, 'note.md'), '# one\n');
      plainGit(repo, ['add', '-A']);
      plainGit(repo, ['commit', '-qm', 'one']);
      const marker = join(base, 'HIDDEN_FILTER');
      const clean = `sh -c 'touch ${marker}; cat'`;
      if (scope === 'include') {
        writeFileSync(join(repo, '.git/extra.cfg'), `[filter "hidden"]\n\tclean = "${clean}"\n`);
        plainGit(repo, ['config', '--local', 'include.path', 'extra.cfg']);
      } else if (scope === 'worktree') {
        plainGit(repo, ['config', '--local', 'extensions.worktreeConfig', 'true']);
        plainGit(repo, ['config', '--worktree', 'filter.hidden.clean', clean]);
      } else {
        plainGit(repo, ['config', 'filter.hidden.clean', clean]);
        plainGit(repo, ['config', 'filter.hidden.required', 'true']);
      }
      writeFileSync(join(repo, 'note.md'), '# two changed\n');

      const res = spawnSync('git', hardenedGitArgs(repo, ['add', '-A', '--', '.']), { cwd: repo, encoding: 'utf8' });
      assert.equal(res.status, 0, `${scope}: add still succeeds: ${res.stderr}`);
      assert.ok(!existsSync(marker), `${scope}: the filter command must not run`);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}
