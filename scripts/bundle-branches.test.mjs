import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { makeGit, parseArgs, planBundle, prunePlan, selectBranches } from './bundle-branches.mjs';

function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-bundle-')));
  const sh = (...argv) => execFileSync('git', argv, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = (file, body, message) => {
    writeFileSync(join(root, file), body);
    sh('add', file);
    sh('commit', '-q', '-m', message);
  };
  try {
    sh('init', '-q', '-b', 'main');
    sh('config', 'user.name', 'Fixture');
    sh('config', 'user.email', 'fixture@example.invalid');
    commit('shared.txt', 'one\ntwo\nthree\n', 'base');
    fn({ root, sh, commit, git: makeGit(root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('selection must be explicit', () => {
  assert.throws(() => parseArgs(['plan']), /select branches explicitly/);
  assert.deepEqual(parseArgs(['plan', '--', '--match=wf/*', 'a']).match, ['wf/*']);
});

test('plan separates empty, contained and pending branches and names shared files', () => fixture(({ sh, commit, git }) => {
  sh('branch', 'wf/empty');
  sh('switch', '-q', '-c', 'wf/a', 'main'); commit('a.txt', 'a\n', 'a'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'a shared');
  sh('switch', '-q', '-c', 'wf/b', 'main'); commit('b.txt', 'b\n', 'b'); commit('shared.txt', 'one\ntwo\nTHREE\n', 'b shared');
  sh('switch', '-q', '-c', 'wf/landed', 'main'); commit('c.txt', 'c\n', 'c');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'wf/landed'); sh('commit', '-q', '-m', 'landed');

  const branches = selectBranches(git, { branches: [], match: ['wf/*'], worktrees: [] });
  const plan = planBundle(git, 'main', branches);
  const state = Object.fromEntries(plan.rows.map((r) => [r.branch, r.state]));
  assert.deepEqual(state, { 'wf/a': 'pending', 'wf/b': 'pending', 'wf/empty': 'empty', 'wf/landed': 'contained' });
  assert.deepEqual(plan.overlaps, [{ file: 'shared.txt', branches: ['wf/a', 'wf/b'] }]);
  assert.deepEqual(plan.steps.map((s) => s.conflicts), [[], []], 'edits to different lines merge cleanly');
  assert.equal(sh('rev-parse', '--abbrev-ref', 'HEAD'), 'main', 'the trial merge moves no ref');
}));

test('plan reports the conflicting step and keeps measuring the rest', () => fixture(({ sh, commit, git }) => {
  sh('switch', '-q', '-c', 'x', 'main'); commit('shared.txt', 'X\ntwo\nthree\n', 'x');
  sh('switch', '-q', '-c', 'y', 'main'); commit('shared.txt', 'Y\ntwo\nthree\n', 'y');
  sh('switch', '-q', '-c', 'z', 'main'); commit('z.txt', 'z\n', 'z');
  sh('switch', '-q', 'main');
  const plan = planBundle(git, 'main', ['x', 'y', 'z']);
  assert.deepEqual(plan.steps, [
    { branch: 'x', conflicts: [] },
    { branch: 'y', conflicts: ['shared.txt'] },
    { branch: 'z', conflicts: [] },
  ]);
}));

test('prune touches only branches main provably contains', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'done', 'main'); commit('d.txt', 'd\n', 'd');
  sh('switch', '-q', '-c', 'open', 'main'); commit('o.txt', 'o\n', 'o');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'done'); sh('commit', '-q', '-m', 'bundle');
  const tree = join(root, 'wt-done');
  sh('worktree', 'add', '-q', tree, 'done');

  const actions = prunePlan(git, 'main', ['done', 'open', 'missing'], { currentPath: root });
  assert.equal(actions[0].branch, 'done');
  assert.equal(actions[0].keep, undefined);
  assert.equal(actions[0].worktree, tree);
  assert.match(actions[1].keep, /not provably contained/);
  assert.equal(actions[2].keep, 'no local branch');

  writeFileSync(join(tree, 'd.txt'), 'edited\n');
  assert.match(prunePlan(git, 'main', ['done'], { currentPath: root })[0].keep, /uncommitted changes/);
  assert.ok(existsSync(tree), 'planning deletes nothing');
}));

test('plan sees through a branch cut from commits that later landed as one squash', () => fixture(({ sh, commit, git }) => {
  sh('switch', '-q', '-c', 'first', 'main'); commit('a.txt', 'a\n', 'a1'); commit('b.txt', 'b\n', 'a2');
  sh('switch', '-q', '-c', 'second', 'first'); commit('c.txt', 'c\n', 'follow-up');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'first'); sh('commit', '-q', '-m', 'first, squashed');

  const [row] = planBundle(git, 'main', ['second']).rows;
  assert.equal(row.state, 'pending');
  assert.deepEqual(row.files, ['c.txt'], 'only the follow-up is new to main');
  assert.equal(row.landed, sh('rev-parse', 'first'), 'names the commit to rebase from');
}));
