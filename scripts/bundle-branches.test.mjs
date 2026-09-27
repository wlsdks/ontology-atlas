import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { applyPrune, lockHold, makeGit, parseArgs, planBundle, prunePlan, selectBranches } from './bundle-branches.mjs';

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
  assert.match(actions[1].keep, /not provably landed/);
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

test('prune proves a landing that main later edited', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/x', 'main'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'x'); commit('x.txt', 'x\n', 'x file');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/x'); sh('commit', '-q', '-m', 'x (#12)');
  const landed = sh('rev-parse', 'HEAD');
  commit('shared.txt', 'One!\ntwo\nthree\n', 'a later edit of the same line');

  const [action] = prunePlan(git, 'main', ['feat/x'], { currentPath: root });
  assert.equal(action.keep, undefined);
  assert.equal(action.landedAt, landed);
}));

test('prune keeps a branch whose later commit never landed', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/y', 'main'); commit('y.txt', 'y\n', 'y');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/y'); sh('commit', '-q', '-m', 'y (#13)');
  commit('y.txt', 'y later\n', 'a later edit');
  sh('switch', '-q', 'feat/y'); commit('z.txt', 'z\n', 'a follow-up that never landed'); sh('switch', '-q', 'main');

  assert.match(prunePlan(git, 'main', ['feat/y'], { currentPath: root })[0].keep, /not provably landed/);
}));

test('a worktree lock lifts only when the process that holds it has exited', () => {
  assert.equal(lockHold('claude agent agent-a1 (pid 4242 start Sat)', () => false), null);
  assert.match(lockHold('claude agent agent-a1 (pid 4242 start Sat)', () => true), /running process \(pid 4242\)/);
  assert.match(lockHold('kept by hand', () => false), /worktree locked: kept by hand/);
});

test('apply removes the agent worktree, its twin branch and the landed branch', () => fixture(({ root, sh, git }) => {
  const tree = join(root, '.claude', 'worktrees', 'agent-ab12');
  sh('worktree', 'add', '-q', '-b', 'worktree-agent-ab12', tree, 'main');
  const inTree = (...argv) => execFileSync('git', argv, { cwd: tree, encoding: 'utf8' }).trim();
  inTree('switch', '-q', '-c', 'feat/z');
  writeFileSync(join(tree, 'z.txt'), 'z\n'); inTree('add', 'z.txt'); inTree('commit', '-q', '-m', 'z');
  sh('worktree', 'lock', '--reason', 'claude agent agent-ab12 (pid 4242 start test)', tree);
  sh('merge', '-q', '--squash', 'feat/z'); sh('commit', '-q', '-m', 'z (#14)');

  const actions = prunePlan(git, 'main', ['feat/z'], { currentPath: root, isAlive: () => false });
  assert.equal(actions[0].unlock, true);
  assert.equal(actions[0].twin, 'worktree-agent-ab12');
  applyPrune(git, actions, { apply: true, base: 'main', io: { log() {} } });
  assert.ok(!existsSync(tree), 'the worktree is removed');
  assert.equal(sh('branch', '--list', 'feat/z', 'worktree-agent-ab12'), '');
  assert.doesNotMatch(sh('worktree', 'list', '--porcelain'), /agent-ab12/);
}));

test('prune keeps a worktree whose locking process still runs', () => fixture(({ root, sh, git }) => {
  const tree = join(root, '.claude', 'worktrees', 'agent-cd34');
  sh('worktree', 'add', '-q', '-b', 'feat/w', tree, 'main');
  sh('worktree', 'lock', '--reason', 'claude agent agent-cd34 (pid 4242 start test)', tree);

  const [action] = prunePlan(git, 'main', ['feat/w'], { currentPath: root, isAlive: () => true });
  assert.match(action.keep, /running process/);
}));
