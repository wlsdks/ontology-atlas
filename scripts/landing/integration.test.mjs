import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { makeGit } from './bundle-branches.mjs';
import { add, components, integrationBranch, prBody, prunePlanFor, runIntegration, start } from './integration.mjs';

const NOW = new Date(2026, 10, 21);

/** A main checkout with a bare origin, so pushes and `origin/main` behave as in the repository. */
function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-integration-')));
  const bare = `${root}-origin.git`;
  const at = (dir) => (...argv) => execFileSync('git', argv, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sh = at(root);
  const commitIn = (dir, file, body, message) => {
    writeFileSync(join(dir, file), body);
    at(dir)('add', file);
    at(dir)('commit', '-q', '-m', message);
  };
  try {
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare]);
    sh('init', '-q', '-b', 'main');
    sh('config', 'user.name', 'Fixture');
    sh('config', 'user.email', 'fixture@example.invalid');
    commitIn(root, 'shared.txt', 'one\ntwo\nthree\n', 'base');
    sh('remote', 'add', 'origin', bare);
    sh('push', '-q', '-u', 'origin', 'main');
    const slice = (name, file, body) => {
      sh('branch', name, 'origin/main');
      const dir = join(root, '.claude', 'worktrees', name.replace(/\//g, '-'));
      sh('worktree', 'add', '-q', dir, name);
      commitIn(dir, file, body, `${name}: one`);
      commitIn(dir, `${file}.note`, 'n\n', `${name}: two`);
      return { dir, head: at(dir)('rev-parse', 'HEAD') };
    };
    fn({ root, bare, sh, at, commitIn, slice, git: makeGit(root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(bare, { recursive: true, force: true });
  }
}

test('the integration branch is named for its topic and the local date, and refuses a path-like topic', () => {
  assert.equal(integrationBranch('library-sources', NOW), 'integration/library-sources-2026-11-21');
  assert.throws(() => integrationBranch('Library/Sources', NOW), /lowercase words joined by hyphens/);
});

test('start branches from origin/main in its own worktree and pushes it', () => fixture(({ root, sh, bare }) => {
  const { branch, path } = start(makeGit(root), 'topic', { now: NOW });
  assert.equal(branch, 'integration/topic-2026-11-21');
  assert.equal(path, join(root, '.claude', 'worktrees', 'integration-topic'));
  assert.equal(execFileSync('git', ['--git-dir', bare, 'rev-parse', branch], { encoding: 'utf8' }).trim(), sh('rev-parse', 'origin/main'));
}));

test('add merges a slice with --no-ff even when a fast-forward was possible, keeping every slice commit', () => fixture(({ root, at, slice }) => {
  const { path } = start(makeGit(root), 'topic', { now: NOW });
  const a = slice('feat/a', 'a.txt', 'a\n');
  const result = add(makeGit(path), 'feat/a');
  assert.equal(result.state, 'merged');
  const [, first, second] = at(path)('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
  assert.equal(second, a.head, 'the merge commit names the slice head as its second parent');
  assert.notEqual(first, a.head, 'a fast-forward would have made the slice head HEAD itself');
  for (const sha of at(a.dir)('rev-list', 'origin/main..HEAD').split('\n')) {
    assert.equal(at(path)('merge-base', '--is-ancestor', sha, 'HEAD'), '', 'each slice commit is in the integration history');
  }
  assert.deepEqual(result.paths.sort(), ['a.txt', 'a.txt.note']);
  assert.equal(add(makeGit(path), 'feat/a').state, 'merged', 'run again right after, it continues to checks and push');
}));

test('add stops on a conflict with the files listed and the merge left for the lead', () => fixture(({ root, at, slice }) => {
  const { path } = start(makeGit(root), 'topic', { now: NOW });
  slice('feat/a', 'shared.txt', 'A\ntwo\nthree\n');
  slice('feat/b', 'shared.txt', 'B\ntwo\nthree\n');
  assert.equal(add(makeGit(path), 'feat/a').state, 'merged');
  const result = add(makeGit(path), 'feat/b');
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.conflicts, ['shared.txt']);
  assert.match(at(path)('status', '--porcelain'), /^UU shared\.txt/m);

  writeFileSync(join(path, 'shared.txt'), 'AB\ntwo\nthree\n');
  at(path)('add', 'shared.txt');
  at(path)('commit', '-q', '--no-edit');
  assert.equal(add(makeGit(path), 'feat/b').state, 'merged', 'after the lead commits the resolution, add continues');
}));

test('add refuses outside an integration branch', () => fixture(({ root, slice }) => {
  slice('feat/a', 'a.txt', 'a\n');
  assert.throws(() => add(makeGit(root), 'feat/a'), /run this in the integration worktree/);
}));

test('the pull request body lists each component at its head and every conflicted file', () => fixture(({ root, at, slice }) => {
  const { path } = start(makeGit(root), 'topic', { now: NOW });
  const a = slice('feat/a', 'shared.txt', 'A\ntwo\nthree\n');
  const b = slice('feat/b', 'shared.txt', 'B\ntwo\nthree\n');
  add(makeGit(path), 'feat/a');
  add(makeGit(path), 'feat/b');
  writeFileSync(join(path, 'shared.txt'), 'AB\ntwo\nthree\n');
  at(path)('add', 'shared.txt');
  at(path)('commit', '-q', '--no-edit');

  const items = components(makeGit(path), 'HEAD', 'origin/main');
  assert.deepEqual(items.map((item) => [item.branch, item.head]), [['feat/a', a.head], ['feat/b', b.head]]);
  const body = prBody({ items, lanes: ['pnpm typecheck'] });
  assert.match(body, new RegExp(`- \`feat/a\` @ ${a.head.slice(0, 9)}, merged with \`--no-ff\``));
  assert.match(body, /### Conflicts\n\n- `shared\.txt`: conflicted when `feat\/b` merged/);
  assert.match(body, /## Test plan\n\n- `pnpm typecheck` passed on the integration tree/);
}));

test('prune refuses until main holds the integration head, then removes it with every merged component and keeps a moved one', () => fixture(({ root, sh, at, commitIn, slice }) => {
  const { branch, path } = start(makeGit(root), 'topic', { now: NOW });
  const a = slice('feat/a', 'a.txt', 'a\n');
  const b = slice('feat/b', 'b.txt', 'b\n');
  add(makeGit(path), 'feat/a');
  add(makeGit(path), 'feat/b');
  at(path)('push', '-q', 'origin', 'HEAD');

  assert.match(prunePlanFor(makeGit(root), branch).refused, /not provably landed.*pnpm pr:land/);

  sh('merge', '-q', '--no-ff', '-m', `Merge ${branch} (#1)`, branch);
  sh('push', '-q', 'origin', 'main');
  commitIn(b.dir, 'late.txt', 'late\n', 'feat/b: after the merge');

  const { actions } = prunePlanFor(makeGit(root), branch);
  const byBranch = Object.fromEntries(actions.map((action) => [action.branch, action]));
  assert.deepEqual(Object.keys(byBranch).sort(), ['feat/a', 'feat/b', branch].sort());
  assert.equal(byBranch[branch].keep, undefined);
  assert.equal(byBranch[branch].worktree, path);
  assert.equal(byBranch['feat/a'].keep, undefined);
  assert.equal(byBranch['feat/a'].head, a.head);
  assert.match(byBranch['feat/b'].keep, /not provably landed/, 'a slice that moved after the merge is reported, not deleted');

  const log = [];
  const pulls = { openFor: () => null, close() { throw new Error('no pull request is open'); } };
  assert.equal(runIntegration(['prune', branch, '--apply'], { cwd: root, io: { log: (line) => log.push(line) }, pulls }), 1);
  assert.ok(!existsSync(path), 'the integration worktree is gone');
  assert.ok(!existsSync(a.dir), 'the merged slice worktree is gone');
  assert.ok(existsSync(b.dir), 'the moved slice keeps its worktree');
  assert.equal(sh('branch', '--list', branch, 'feat/a'), '');
  assert.equal(sh('ls-remote', '--heads', 'origin', branch), '');
  assert.match(log.join('\n'), /1 branch\(es\) kept/);
  assert.match(sh('log', '--format=%s', 'main'), /feat\/a: one\nfeat\/a: two|feat\/a: two\n.*feat\/a: one/s, 'every slice commit stays in main');
}));
