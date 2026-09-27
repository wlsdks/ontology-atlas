import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { applyPrune, lockHold, makeGit, ownPids, parseArgs, planBundle, prunePlan, selectBranches } from './bundle-branches.mjs';

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
  const tree = join(root, '.claude', 'worktrees', 'wt-done');
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
  assert.equal(lockHold('claude agent agent-a1 (pid 4242 start Sat)', () => true, new Set([4242])), null);
  assert.match(lockHold('claude agent agent-a1 (pid 4243 start Sat)', () => true, new Set([4242])), /running process \(pid 4243\)/);
});

test('the caller\'s own ancestors include this process and its parent', () => {
  const own = ownPids();
  assert.ok(own.has(process.pid));
  assert.ok(own.has(process.ppid));
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
  assert.equal(actions[0].unlock, 'claude agent agent-ab12 (pid 4242 start test)');
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

const agentTree = (root, sh, name, branch) => {
  const tree = join(root, '.claude', 'worktrees', name);
  sh('worktree', 'add', '-q', '-b', branch, tree, 'main');
  const inTree = (...argv) => execFileSync('git', argv, { cwd: tree, encoding: 'utf8' }).trim();
  return { tree, inTree };
};

test('a lock held by the caller\'s own session lifts for a landed branch; another live pid keeps it', () => fixture(({ root, sh, git }) => {
  const own = agentTree(root, sh, 'agent-0a1', 'feat/own');
  writeFileSync(join(own.tree, 'own.txt'), 'o\n'); own.inTree('add', 'own.txt'); own.inTree('commit', '-q', '-m', 'own');
  const other = agentTree(root, sh, 'agent-0b2', 'feat/other');
  writeFileSync(join(other.tree, 'other.txt'), 'x\n'); other.inTree('add', 'other.txt'); other.inTree('commit', '-q', '-m', 'other');
  sh('worktree', 'lock', '--reason', 'claude agent agent-0a1 (pid 700 start test)', own.tree);
  sh('worktree', 'lock', '--reason', 'claude agent agent-0b2 (pid 800 start test)', other.tree);
  sh('merge', '-q', '--squash', 'feat/own'); sh('commit', '-q', '-m', 'own (#20)');
  sh('merge', '-q', '--squash', 'feat/other'); sh('commit', '-q', '-m', 'other (#21)');

  const [mine, theirs] = prunePlan(git, 'main', ['feat/own', 'feat/other'], { currentPath: root, isAlive: () => true, own: new Set([700]) });
  assert.equal(mine.keep, undefined);
  assert.match(mine.unlock, /pid 700/);
  assert.match(theirs.keep, /running process \(pid 800\)/);
}));

test('an own-session lock on an unlanded branch still keeps it', () => fixture(({ root, sh, git }) => {
  const own = agentTree(root, sh, 'agent-0c3', 'feat/unlanded');
  writeFileSync(join(own.tree, 'u.txt'), 'u\n'); own.inTree('add', 'u.txt'); own.inTree('commit', '-q', '-m', 'u');
  sh('worktree', 'lock', '--reason', 'claude agent agent-0c3 (pid 700 start test)', own.tree);
  const [action] = prunePlan(git, 'main', ['feat/unlanded'], { currentPath: root, own: new Set([700]) });
  assert.match(action.keep, /not provably landed/);
}));

test('prune keeps a branch whose later commit only removes landed content', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/r', 'main'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'r1'); commit('r.txt', 'r\n', 'r2');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/r'); sh('commit', '-q', '-m', 'r (#22)');
  sh('switch', '-q', 'feat/r'); sh('rm', '-q', 'r.txt'); sh('commit', '-q', '-m', 'revert r'); sh('switch', '-q', 'main');
  assert.match(prunePlan(git, 'main', ['feat/r'], { currentPath: root })[0].keep, /moved after what landed/);
}));

test('prune keeps a revert-only commit after main edited the landed line', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/rb', 'main'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'r1'); commit('r.txt', 'r\n', 'r2');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/rb'); sh('commit', '-q', '-m', 'r (#23)');
  commit('shared.txt', 'One!\ntwo\nthree\n', 'later');
  sh('switch', '-q', 'feat/rb'); sh('rm', '-q', 'r.txt'); sh('commit', '-q', '-m', 'revert r'); sh('switch', '-q', 'main');
  assert.match(prunePlan(git, 'main', ['feat/rb'], { currentPath: root })[0].keep, /moved after what landed/);
}));

test('prune proves a landing of a non-ASCII path', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/h', 'main'); commit('\uAC1C\uB150.md', 'h\n', 'h');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/h'); sh('commit', '-q', '-m', 'h (#24)');
  commit('\uAC1C\uB150.md', 'h2\n', 'later');
  const [action] = prunePlan(git, 'main', ['feat/h'], { currentPath: root });
  assert.equal(action.keep, undefined);
  assert.ok(action.landedAt);
}));

test('prune keeps a branch whose origin copy has commits it lacks', () => fixture(({ root, sh, commit, git }) => {
  const bare = `${root}-origin.git`;
  execFileSync('git', ['init', '-q', '--bare', bare]);
  try {
    sh('remote', 'add', 'origin', bare); sh('push', '-q', 'origin', 'main');
    sh('switch', '-q', '-c', 'feat/p', 'main'); commit('p.txt', 'p\n', 'p');
    commit('p2.txt', 'extra\n', 'pushed only'); sh('push', '-q', 'origin', 'feat/p');
    sh('reset', '-q', '--hard', 'HEAD~1'); sh('fetch', '-q', 'origin');
    sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'feat/p'); sh('commit', '-q', '-m', 'p (#25)');
    assert.equal(prunePlan(git, 'main', ['feat/p'], { currentPath: root })[0].keep, 'origin has commits this branch lacks');
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
}));

test('a failed removal restores the worktree lock and keeps the branch', () => fixture(({ root, sh, git }) => {
  const { tree, inTree } = agentTree(root, sh, 'agent-ee99', 'feat/q');
  writeFileSync(join(tree, 'q.txt'), 'q\n'); inTree('add', 'q.txt'); inTree('commit', '-q', '-m', 'q');
  sh('worktree', 'lock', '--reason', 'claude agent agent-ee99 (pid 999999 start test)', tree);
  sh('merge', '-q', '--squash', 'feat/q'); sh('commit', '-q', '-m', 'q (#26)');
  const actions = prunePlan(git, 'main', ['feat/q'], { currentPath: root, isAlive: () => false });
  assert.equal(actions[0].keep, undefined);
  writeFileSync(join(tree, 'late.txt'), 'written between plan and apply\n');
  const lines = [];
  applyPrune(git, actions, { apply: true, base: 'main', io: { log: (line) => lines.push(line) } });
  assert.match(lines.join('\n'), /could not be removed/);
  assert.match(sh('worktree', 'list', '--porcelain'), /locked claude agent agent-ee99 \(pid 999999 start test\)/);
  assert.ok(existsSync(tree));
  assert.match(sh('branch', '--list', 'feat/q'), /feat\/q/);
}));

test('prune proves both components of a squashed integration branch that share a file', () => fixture(({ root, sh, commit, git }) => {
  sh('switch', '-q', '-c', 'feat/a', 'main'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'a'); commit('a.txt', 'a\n', 'a2');
  sh('switch', '-q', '-c', 'feat/b', 'main'); commit('shared.txt', 'one\ntwo\nTHREE\n', 'b'); commit('b.txt', 'b\n', 'b2');
  sh('switch', '-q', '-c', 'bundle', 'main');
  sh('merge', '-q', '--no-ff', '--no-edit', 'feat/a'); sh('merge', '-q', '--no-ff', '--no-edit', 'feat/b');
  sh('switch', '-q', 'main'); sh('merge', '-q', '--squash', 'bundle'); sh('commit', '-q', '-m', 'bundle (#28)');
  const actions = prunePlan(git, 'main', ['feat/a', 'feat/b'], { currentPath: root });
  assert.deepEqual(actions.map((a) => a.keep), [undefined, undefined]);
}));

test('prune never removes a checkout outside .claude/worktrees', () => fixture(({ root, sh, git }) => {
  const other = `${root}-other-session`;
  sh('worktree', 'add', '-q', '-b', 'feat/other-session', other, 'main');
  try {
    const inOther = (...argv) => execFileSync('git', argv, { cwd: other, encoding: 'utf8' }).trim();
    writeFileSync(join(other, 'o.txt'), 'o\n'); inOther('add', 'o.txt'); inOther('commit', '-q', '-m', 'other session work');
    sh('merge', '-q', '--squash', 'feat/other-session'); sh('commit', '-q', '-m', 'other (#27)');
    const picked = selectBranches(git, { branches: [], match: ['feat/*'], worktrees: [] }, root);
    const actions = prunePlan(git, 'main', picked, { currentPath: root });
    assert.match(actions[0].keep, /outside \.claude\/worktrees/);
    applyPrune(git, actions, { apply: true, base: 'main', io: { log() {} } });
    assert.ok(existsSync(other));
    assert.equal(prunePlan(git, 'main', picked, { currentPath: root, worktreeDirs: [`${root}-other-session`] })[0].keep, undefined);
  } finally {
    rmSync(other, { recursive: true, force: true });
  }
}));
