import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { makeGit } from './bundle-branches.mjs';
import { GH_FILE_CAP, listOpenPullRequests, parseArgs, runScan, scanConflicts } from './conflicts-scan.mjs';

// Under a git hook GIT_DIR and friends are exported; a fixture `git init` or
// `git config` would then act on the real repository (lesson 390c0c51). Both the
// fixture calls and the script's own git calls inherit process.env, so strip it.
for (const key of Object.keys(process.env)) if (key.startsWith('GIT_')) delete process.env[key];

function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'atlas-conflicts-')));
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
    sh('config', 'commit.gpgsign', 'false');
    commit('shared.txt', 'one\ntwo\nthree\n', 'base');
    commit('other.txt', 'x\n', 'base other');
    // Three branches cut from main: one conflicting, one overlapping cleanly, one disjoint.
    sh('switch', '-q', '-c', 'feat/theirs-conflict', 'main'); commit('shared.txt', 'ONE\ntwo\nthree\n', 'theirs');
    sh('switch', '-q', '-c', 'feat/theirs-clean', 'main'); commit('shared.txt', 'one\ntwo\nthree\nfour\n', 'append');
    sh('switch', '-q', '-c', 'feat/theirs-disjoint', 'main'); commit('elsewhere.txt', 'e\n', 'elsewhere');
    sh('switch', '-q', '-c', 'feat/mine', 'main'); commit('shared.txt', 'uno\ntwo\nthree\n', 'mine');
    fn({ root, sh, git: makeGit(root) });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const pr = (sh, number, branch, files) => ({ label: `#${number}`, number, branch, oid: sh('rev-parse', branch), files });

test('arguments are explicit and --no-prs needs a branch selection', () => {
  assert.deepEqual(parseArgs(['--', '--match=feat/*', '--no-fetch']).match, ['feat/*']);
  assert.equal(parseArgs([]).prs, true);
  assert.throws(() => parseArgs(['--no-prs']), /needs --match/);
  assert.throws(() => parseArgs(['--bogus']), /unknown argument/);
});

test('only overlapping pull requests are trial-merged, and conflicts name the file', () => fixture(({ sh, git }) => {
  const result = scanConflicts(git, {
    base: 'main',
    head: 'HEAD',
    candidates: [
      pr(sh, 11, 'feat/theirs-conflict', ['shared.txt']),
      pr(sh, 12, 'feat/theirs-clean', ['shared.txt']),
      pr(sh, 13, 'feat/theirs-disjoint', ['elsewhere.txt']),
    ],
  });
  assert.deepEqual(result.ownFiles, ['shared.txt']);
  const byNumber = Object.fromEntries(result.rows.map((row) => [row.number, row]));
  assert.equal(byNumber[11].state, 'conflict');
  assert.deepEqual(byNumber[11].conflicts, ['shared.txt']);
  assert.equal(byNumber[12].state, 'clean');
  assert.deepEqual(byNumber[12].overlap, ['shared.txt']);
  assert.equal(byNumber[13].state, 'no-overlap');
}));

test('a conflict only in files this branch never changed is the other head lagging the base, not ours', () => fixture(({ sh, git }) => {
  // theirs edits other.txt from the old main; main then edits it too; mine is rebuilt on the new main.
  sh('switch', '-q', '-c', 'feat/stale', 'feat/theirs-clean');
  writeFileSync(join(sh('rev-parse', '--show-toplevel'), 'other.txt'), 'stale\n'); sh('commit', '-qam', 'stale other');
  sh('switch', '-q', 'main');
  writeFileSync(join(sh('rev-parse', '--show-toplevel'), 'other.txt'), 'moved on\n'); sh('commit', '-qam', 'main moves');
  sh('switch', '-q', '-c', 'feat/mine-new', 'main');
  writeFileSync(join(sh('rev-parse', '--show-toplevel'), 'shared.txt'), 'uno\ntwo\nthree\n'); sh('commit', '-qam', 'mine');
  const [row] = scanConflicts(git, { base: 'main', head: 'HEAD', candidates: [pr(sh, 51, 'feat/stale', ['shared.txt', 'other.txt'])] }).rows;
  assert.equal(row.state, 'clean');
  assert.equal(row.staleConflicts, 1);
}));

test('a pull request whose gh file list hit the cap is trial-merged even without a listed overlap', () => fixture(({ sh, git }) => {
  const files = Array.from({ length: GH_FILE_CAP }, (_, index) => `f${index}.txt`);
  const [row] = scanConflicts(git, { base: 'main', head: 'HEAD', candidates: [pr(sh, 21, 'feat/theirs-conflict', files)] }).rows;
  assert.equal(row.truncated, true);
  assert.equal(row.state, 'conflict');
}));

test('a head that is not available locally is reported, not guessed', () => fixture(({ git }) => {
  const [row] = scanConflicts(git, {
    base: 'main',
    head: 'HEAD',
    candidates: [{ label: '#31', number: 31, branch: 'feat/remote-only', oid: 'f'.repeat(40), files: ['shared.txt'] }],
  }).rows;
  assert.equal(row.state, 'head-unavailable');
}));

test('the CLI scans local branches by prefix, skips itself, and exits 1 on a conflict without touching refs', () => fixture(({ root, sh }) => {
  const refsBefore = sh('for-each-ref');
  const out = [];
  const io = { log: (line) => out.push(line), error: (line) => out.push(line) };
  const status = runScan(['--base=main', '--no-prs', '--no-fetch', '--match=feat/*'], { io, cwd: root });
  const text = out.join('\n');
  assert.equal(status, 1, text);
  assert.match(text, /feat\/theirs-conflict[\s\S]*CONFLICT in shared\.txt/);
  assert.match(text, /feat\/theirs-clean[\s\S]*merges cleanly/);
  assert.doesNotMatch(text, /branch feat\/mine\b/);
  assert.equal(sh('for-each-ref'), refsBefore);
  assert.equal(sh('status', '--porcelain'), '');

  sh('branch', '-q', '-D', 'feat/theirs-conflict');
  assert.equal(runScan(['--base=main', '--no-prs', '--no-fetch', '--match=feat/*'], { io, cwd: root }), 0);
}));

test('pull requests come from one gh call and exclude the current branch', () => fixture(({ root, sh }) => {
  const calls = [];
  const run = (cmd, argv) => {
    calls.push([cmd, ...argv].join(' '));
    return JSON.stringify([
      { number: 41, headRefName: 'feat/theirs-conflict', headRefOid: sh('rev-parse', 'feat/theirs-conflict'), isDraft: true, files: [{ path: 'shared.txt' }] },
      { number: 42, headRefName: 'feat/mine', headRefOid: sh('rev-parse', 'feat/mine'), isDraft: true, files: [{ path: 'shared.txt' }] },
    ]);
  };
  const out = [];
  const io = { log: (line) => out.push(line), error: (line) => out.push(line) };
  const status = runScan(['--base=main', '--no-fetch', '--json'], { io, cwd: root, listPrs: () => listOpenPullRequests(run) });
  assert.equal(status, 1, out.join('\n'));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^gh pr list --state open .*--json number,headRefName,headRefOid,isDraft,files$/);
  const { rows } = JSON.parse(out.join('\n'));
  assert.deepEqual(rows.map((row) => row.number), [41]);
}));
