import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, chmodSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { hardenedGitArgv, clearFilterCache, gitEnv } from './hardened-git.mjs';

// Security regression: a hostile repository must not run code that its own git
// config asks for when the MCP server spawns git in it. Each test proves the
// fixture is a live weapon under an unhardened invocation, then that the hardened
// argv leaves no marker. Reintroducing the defect fails these.

function plainGit(cwd, args) {
  const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return typeof out === 'string' ? out : '';
}

function seedIdentity(cwd) {
  plainGit(cwd, ['config', 'user.email', 'test@example.invalid']);
  plainGit(cwd, ['config', 'user.name', 'atlas test']);
  plainGit(cwd, ['config', 'commit.gpgsign', 'false']);
  plainGit(cwd, ['config', 'core.autocrlf', 'false']);
}

const STATUS_ARGS = ['-c', 'core.quotepath=false', 'status', '--porcelain', '--untracked-files=all', '--', '.'];

test('a hostile embedded repo config does not execute on status', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-embed-'));
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

    spawnSync('git', ['-C', atlas, ...STATUS_ARGS], { encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture precondition: unhardened git runs the embedded config');
    rmSync(marker);

    spawnSync('git', hardenedGitArgv(atlas, STATUS_ARGS), { encoding: 'utf8' });
    assert.ok(!existsSync(marker), 'hardened argv must not execute a hostile embedded repo config');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// A repo whose local config binds a clean filter to *.md — every git that stages a
// matching worktree file runs the filter command. Built fresh so the only `add` is
// the one under test (a reset would itself re-run the unhardened filter).
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
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-filter-weapon-'));
  try {
    const marker = join(base, 'CLEAN_FILTER_EXECUTED');
    const repo = buildCleanFilterRepo(base, marker);
    spawnSync('git', ['-C', repo, 'add', '-A', '--', '.'], { encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture precondition: clean filter fires on an unhardened add');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a hostile clean filter is neutralised on a hardened add', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-filter-fix-'));
  clearFilterCache();
  try {
    const marker = join(base, 'CLEAN_FILTER_EXECUTED');
    const repo = buildCleanFilterRepo(base, marker);
    const result = spawnSync('git', hardenedGitArgv(repo, ['add', '-A', '--', '.']), { encoding: 'utf8' });
    assert.equal(result.status, 0, `add still succeeds: ${result.stderr}`);
    assert.ok(!existsSync(marker), 'a repo-local clean filter must not run under the hardened argv');
    const staged = spawnSync('git', hardenedGitArgv(repo, ['diff', '--cached', '--name-only']), { encoding: 'utf8' });
    assert.match(staged.stdout, /note\.md/, 'the file is still staged');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

function commitOne(repo) {
  writeFileSync(join(repo, 'note.md'), '# one\n');
  plainGit(repo, ['add', '-A']);
  plainGit(repo, ['commit', '-qm', 'one']);
}

function writeHook(repo, name, marker) {
  const path = join(repo, '.git/hooks', name);
  writeFileSync(path, `#!/bin/sh\ntouch ${marker}\n`);
  chmodSync(path, 0o755);
}

test('a hostile repo hook does not run on a non-commit verb', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-hook-'));
  clearFilterCache();
  try {
    const repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    plainGit(repo, ['init', '-q']);
    seedIdentity(repo);
    commitOne(repo);
    // post-checkout fires deterministically on a path checkout; every verb but
    // commit shares the same hooks-off decision, status included.
    const marker = join(base, 'POST_CHECKOUT');
    writeHook(repo, 'post-checkout', marker);
    writeFileSync(join(repo, 'note.md'), '# two\n');

    spawnSync('git', ['-C', repo, 'checkout', '--', 'note.md'], { encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture: the hook fires on an unhardened checkout');
    rmSync(marker);

    writeFileSync(join(repo, 'note.md'), '# three\n');
    spawnSync('git', hardenedGitArgv(repo, ['checkout', '--', 'note.md']), { encoding: 'utf8' });
    assert.ok(!existsSync(marker), 'hooks must not run on a non-commit verb');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

for (const scope of ['include', 'worktree']) {
  test(`a filter reachable only through ${scope} config is still neutralised`, () => {
    const base = mkdtempSync(join(tmpdir(), `atlas-mcp-sec-${scope}-`));
    clearFilterCache();
    try {
      const repo = join(base, 'repo');
      mkdirSync(repo, { recursive: true });
      plainGit(repo, ['init', '-q']);
      seedIdentity(repo);
      writeFileSync(join(repo, '.gitattributes'), '*.md filter=hidden\n');
      commitOne(repo);
      const marker = join(base, 'HIDDEN_FILTER');
      const clean = `sh -c 'touch ${marker}; cat'`;
      if (scope === 'include') {
        writeFileSync(join(repo, '.git/extra.cfg'), `[filter "hidden"]\n\tclean = "${clean}"\n`);
        plainGit(repo, ['config', '--local', 'include.path', 'extra.cfg']);
      } else {
        plainGit(repo, ['config', '--local', 'extensions.worktreeConfig', 'true']);
        plainGit(repo, ['config', '--worktree', 'filter.hidden.clean', clean]);
      }
      writeFileSync(join(repo, 'note.md'), '# two changed\n');

      const result = spawnSync('git', hardenedGitArgv(repo, ['add', '-A', '--', '.']), { encoding: 'utf8' });
      assert.equal(result.status, 0, `add still succeeds: ${result.stderr}`);
      assert.ok(!existsSync(marker), `a ${scope}-scoped filter must be neutralised`);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
}

test('a required filter still lets a hardened add succeed', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-required-'));
  clearFilterCache();
  try {
    const repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    plainGit(repo, ['init', '-q']);
    seedIdentity(repo);
    writeFileSync(join(repo, '.gitattributes'), '*.md filter=keep\n');
    commitOne(repo);
    plainGit(repo, ['config', 'filter.keep.clean', "sh -c 'cat'"]);
    plainGit(repo, ['config', 'filter.keep.required', 'true']);
    writeFileSync(join(repo, 'note.md'), '# two changed\n');

    const result = spawnSync('git', hardenedGitArgv(repo, ['add', '-A', '--', '.']), { encoding: 'utf8' });
    assert.equal(result.status, 0, `a required filter must still let add succeed: ${result.stderr}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('git reads every path as a name, spawns without a setting that conflicts with that, and cannot fetch', () => {
  const argv = hardenedGitArgv(tmpdir(), ['status', '--', 'a']);
  assert.ok(argv.includes('--literal-pathspecs'));
  assert.ok(argv.indexOf('--literal-pathspecs') < argv.indexOf('status'), 'a global option precedes the subcommand');
  const inherited = {
    PATH: '/usr/bin',
    GIT_TRACE: '0',
    GIT_GLOB_PATHSPECS: '1',
    GIT_NOGLOB_PATHSPECS: '1',
    GIT_ICASE_PATHSPECS: '1',
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_COMMON_DIR: '/elsewhere/.git',
    GIT_INDEX_FILE: '/elsewhere/.git/index',
  };
  assert.deepEqual(gitEnv(inherited), { PATH: '/usr/bin', GIT_TRACE: '0', GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '' });
  assert.deepEqual(gitEnv(inherited, { runsUserHooks: true }), { PATH: '/usr/bin', GIT_TRACE: '0' });
  assert.equal(inherited.GIT_ICASE_PATHSPECS, '1', 'the caller\'s environment is not changed');
});

// A partial clone fetches a missing object through the transport its own config
// names, here `remote.origin.uploadpack`; a read such as `ls-files` that needs
// `.gitignore` triggers it. Only an attacker-authored `.git` can carry this.
function buildLazyFetchRepo(base, marker) {
  const repo = join(base, 'repo');
  mkdirSync(repo, { recursive: true });
  plainGit(repo, ['init', '-q']);
  seedIdentity(repo);
  writeFileSync(join(repo, '.gitignore'), 'target/\n');
  plainGit(repo, ['add', '.gitignore']);
  plainGit(repo, ['commit', '-qm', 'ignore']);
  const blob = plainGit(repo, ['rev-parse', 'HEAD:.gitignore']).trim();
  plainGit(repo, ['update-index', '--skip-worktree', '.gitignore']);
  unlinkSync(join(repo, '.gitignore'));
  unlinkSync(join(repo, '.git', 'objects', blob.slice(0, 2), blob.slice(2)));
  plainGit(repo, ['config', 'core.repositoryformatversion', '1']);
  plainGit(repo, ['config', 'extensions.partialClone', 'origin']);
  plainGit(repo, ['config', 'remote.origin.url', join(base, 'nowhere')]);
  plainGit(repo, ['config', 'remote.origin.promisor', 'true']);
  plainGit(repo, ['config', 'remote.origin.uploadpack', `touch ${marker} #`]);
  // An untracked file makes the read judge it against `.gitignore`, the missing object.
  mkdirSync(join(repo, 'target'));
  writeFileSync(join(repo, 'target', 'out.js'), 'export {};\n');
  return repo;
}

test('a hostile partial clone cannot run its transport command on a hardened read', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-lazy-'));
  clearFilterCache();
  try {
    const marker = join(base, 'LAZY_FETCH_EXECUTED');
    const repo = buildLazyFetchRepo(base, marker);
    const read = ['ls-files', '-z', '--others', '--ignored', '--exclude-standard', '--directory'];
    spawnSync('git', ['-C', repo, ...read], { encoding: 'utf8' });
    assert.ok(existsSync(marker), 'fixture precondition: unhardened git fetches through the configured command');
    rmSync(marker);
    spawnSync('git', hardenedGitArgv(repo, read), { encoding: 'utf8', env: gitEnv() });
    assert.ok(!existsSync(marker), 'a hardened read must not fetch a missing object');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('a config that never finishes reading refuses the run instead of hanging', () => {
  const base = mkdtempSync(join(tmpdir(), 'atlas-mcp-sec-stall-'));
  clearFilterCache();
  try {
    const repo = join(base, 'repo');
    mkdirSync(repo, { recursive: true });
    plainGit(repo, ['init', '-q']);
    execFileSync('/usr/bin/mkfifo', [join(repo, '.git', 'pipe')]);
    plainGit(repo, ['config', 'include.path', 'pipe']);
    assert.throws(() => hardenedGitArgv(repo, ['status']), /did not finish/);
  } finally {
    clearFilterCache();
    rmSync(base, { recursive: true, force: true });
  }
});
