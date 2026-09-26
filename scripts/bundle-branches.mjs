#!/usr/bin/env node
/**
 * `pnpm bundle:plan` / `pnpm bundle:prune` — land many branches as one pull request.
 *
 * **Why this exists** (2026-09-26). A Workflow or a parallel round leaves one
 * branch per agent. Landing each through `pnpm pr:land` costs one lock turn, one
 * main merge, one local lane run and one CI run per branch; on 2026-09-24 nine
 * `design/polish-*` branches landed one by one and the queue took most of a day.
 * Every hand-made bundle (#1787, #1874, #1883) landed the same work behind one CI
 * run. The `/land-bundle` skill owns the procedure; this script owns the two
 * mechanical questions an agent should not answer by eye:
 *
 *   - **plan**: which selected branches still carry work, which files two of them
 *     both touch, and whether merging them in order conflicts. The trial merge
 *     runs on `git merge-tree` and throwaway commits, so no worktree, index or
 *     ref changes.
 *   - **prune**: after the bundle landed, which component branches `main` provably
 *     contains (merging the branch into `main` would change nothing). Only those
 *     lose their worktree, local branch, remote branch and draft pull request.
 *     A branch that is not provably contained is reported and kept, because a
 *     "superseded" label is not evidence that the content arrived.
 *
 * Selection is always explicit: branch names, `--match=<glob>` over local
 * branches, or `--worktrees=<dir>` for the branches checked out under a
 * directory. Nothing sweeps every branch, because other sessions keep theirs in
 * the same repository.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { resolve, sep } from 'node:path';

export function parseArgs(argv) {
  const args = { command: null, base: 'origin/main', fetch: true, apply: false, json: false, match: [], worktrees: [], branches: [] };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (!args.command && (arg === 'plan' || arg === 'prune')) args.command = arg;
    else if (arg.startsWith('--base=')) args.base = arg.slice('--base='.length);
    else if (arg.startsWith('--match=')) args.match.push(arg.slice('--match='.length));
    else if (arg.startsWith('--worktrees=')) args.worktrees.push(arg.slice('--worktrees='.length));
    else if (arg === '--no-fetch') args.fetch = false;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--json') args.json = true;
    else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    else args.branches.push(arg);
  }
  if (!args.command) throw new Error('usage: bundle-branches.mjs plan|prune [--base=origin/main] [--match=<glob>] [--worktrees=<dir>] [branch...] [--apply] [--json] [--no-fetch]');
  if (args.match.length + args.worktrees.length + args.branches.length === 0) {
    throw new Error('select branches explicitly: name them, or pass --match=<glob> or --worktrees=<dir>');
  }
  return args;
}

export function makeGit(cwd) {
  const run = (argv, { allowFailure = false } = {}) => {
    const result = spawnSync('git', argv, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (result.status !== 0 && !allowFailure) {
      throw new Error(`git ${argv.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return { status: result.status, stdout: result.stdout.trim() };
  };
  return {
    out: (...argv) => run(argv).stdout,
    try: (...argv) => run(argv, { allowFailure: true }),
  };
}

/** Parse `git worktree list --porcelain` into `{ path, branch }` records. */
export function parseWorktrees(porcelain) {
  const trees = [];
  let current = null;
  for (const line of porcelain.split('\n')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length), branch: null };
      trees.push(current);
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    }
  }
  return trees;
}

export function selectBranches(git, { branches, match, worktrees }, cwd = process.cwd()) {
  const picked = [...branches];
  for (const pattern of match) {
    const names = git.out('for-each-ref', '--format=%(refname:short)', `refs/heads/${pattern}`);
    picked.push(...names.split('\n').filter(Boolean));
  }
  if (worktrees.length > 0) {
    const trees = parseWorktrees(git.out('worktree', 'list', '--porcelain'));
    for (const dir of worktrees) {
      const root = resolve(cwd, dir) + sep;
      picked.push(...trees.filter((t) => t.branch && (t.path + sep).startsWith(root)).map((t) => t.branch));
    }
  }
  return [...new Set(picked)];
}

/** True when merging `branch` into `base` would leave `base`'s tree unchanged. */
export function isContained(git, base, branch) {
  const merged = git.try('merge-tree', '--write-tree', '--no-messages', base, branch);
  if (merged.status !== 0) return false;
  return merged.stdout.split('\n')[0] === git.out('rev-parse', `${base}^{tree}`);
}

/**
 * The newest commit of `branch` that `base` already contains. A branch cut from
 * commits that later landed as one squash still carries them under other shas,
 * so a three-dot diff lists every file the squash brought to main and reports
 * conflicts that are not there (measured 2026-09-26: 148 files listed for a
 * branch that changed 14). Patch ids cannot see it, because a squash joins
 * several commits into one patch; containment of each commit can.
 */
export function landedPoint(git, base, branch) {
  const commits = git.out('rev-list', '--first-parent', '--max-count=200', `${base}..${branch}`).split('\n').filter(Boolean);
  return commits.find((sha) => isContained(git, base, sha)) ?? null;
}

export function planBundle(git, base, branches) {
  const rows = branches.map((branch) => {
    const head = git.out('rev-parse', '--short', branch);
    const ahead = Number(git.out('rev-list', '--count', `${base}..${branch}`));
    const landed = ahead === 0 ? null : landedPoint(git, base, branch);
    const from = landed ?? `${base}...${branch}`;
    const files = ahead === 0 ? [] : git.out('diff', '--name-only', ...(landed ? [landed, branch] : [from])).split('\n').filter(Boolean);
    const state = ahead === 0 ? 'empty' : isContained(git, base, branch) ? 'contained' : 'pending';
    return { branch, head, ahead, files, state, landed };
  });

  const touchedBy = new Map();
  for (const row of rows.filter((r) => r.state === 'pending')) {
    for (const file of row.files) touchedBy.set(file, [...(touchedBy.get(file) ?? []), row.branch]);
  }
  const overlaps = [...touchedBy].filter(([, owners]) => owners.length > 1).map(([file, owners]) => ({ file, branches: owners }));

  // Trial merge in the given order on throwaway commits; a conflicting branch is
  // left out of the chain so the steps after it are still measured.
  let tip = git.out('rev-parse', base);
  const steps = [];
  for (const row of rows.filter((r) => r.state === 'pending')) {
    const merged = git.try('merge-tree', '--write-tree', '--name-only', '--no-messages', tip, row.branch);
    const [tree, ...conflicts] = merged.stdout.split('\n').filter(Boolean);
    if (merged.status === 0) {
      tip = git.out('commit-tree', tree, '-p', tip, '-p', row.branch, '-m', `bundle trial: ${row.branch}`);
      steps.push({ branch: row.branch, conflicts: [] });
    } else {
      steps.push({ branch: row.branch, conflicts });
    }
  }
  return { base, rows, overlaps, steps };
}

export function formatPlan({ base, rows, overlaps, steps }) {
  const lines = [`Bundle plan against ${base}`, ''];
  for (const row of rows) {
    const landed = row.landed && row.state === 'pending'
      ? `; carries commits ${base} already has, so first run git rebase --onto ${base} ${row.landed.slice(0, 9)} ${row.branch}`
      : '';
    lines.push(`  ${row.state.padEnd(9)} ${row.branch} @ ${row.head}  (${row.ahead} commit(s), ${row.files.length} file(s)${landed})`);
  }
  const pending = rows.filter((r) => r.state === 'pending');
  lines.push('', `${pending.length} to merge; ${rows.length - pending.length} already empty or contained in ${base} (leave them out).`);
  if (overlaps.length > 0) {
    lines.push('', 'Files touched by more than one branch (read each after merging, even without a textual conflict):');
    for (const { file, branches } of overlaps) lines.push(`  ${file}  <- ${branches.join(', ')}`);
  }
  const conflicted = steps.filter((s) => s.conflicts.length > 0);
  lines.push('', conflicted.length === 0
    ? 'Trial merge in this order: clean.'
    : 'Trial merge in this order: conflicts at');
  for (const step of conflicted) lines.push(`  ${step.branch}: ${step.conflicts.join(', ')}`);
  return lines.join('\n');
}

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}

export function prunePlan(git, base, branches, { currentPath = process.cwd() } = {}) {
  const trees = parseWorktrees(git.out('worktree', 'list', '--porcelain'));
  return branches.map((branch) => {
    const exists = git.try('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0;
    if (!exists) return { branch, keep: 'no local branch' };
    const head = git.out('rev-parse', branch);
    if (!isContained(git, base, branch)) return { branch, head, keep: `not provably contained in ${base}` };
    const tree = trees.find((t) => t.branch === branch) ?? null;
    if (tree && resolve(tree.path) === resolve(currentPath)) return { branch, head, keep: 'checked out in this worktree' };
    if (tree && git.try('-C', tree.path, 'status', '--porcelain').stdout !== '') {
      return { branch, head, keep: `worktree ${tree.path} has uncommitted changes` };
    }
    const remote = git.try('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`).status === 0;
    return { branch, head, worktree: tree?.path ?? null, remote };
  });
}

export function runBundle(argv, io = console) {
  const args = parseArgs(argv);
  const git = makeGit(process.cwd());
  if (args.fetch && args.base.startsWith('origin/')) {
    git.try('fetch', '--quiet', 'origin', args.base.slice('origin/'.length));
  }
  const branches = selectBranches(git, args);
  if (branches.length === 0) throw new Error('the selection matched no branch');

  if (args.command === 'plan') {
    const plan = planBundle(git, args.base, branches);
    io.log(args.json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
    return plan;
  }

  if (args.fetch) git.try('fetch', '--quiet', '--prune', 'origin');
  const actions = prunePlan(git, args.base, branches);
  for (const action of actions) {
    if (action.keep) {
      io.log(`keep   ${action.branch}: ${action.keep}`);
      continue;
    }
    const pr = action.remote ? ghJson(['pr', 'list', '--head', action.branch, '--state', 'open', '--json', 'number']) : null;
    const prNumber = pr?.[0]?.number ?? null;
    io.log(`${args.apply ? 'prune ' : 'would prune'} ${action.branch} @ ${action.head.slice(0, 9)}`
      + `${action.worktree ? `  worktree ${action.worktree}` : ''}${action.remote ? '  origin branch' : ''}${prNumber ? `  PR #${prNumber}` : ''}`);
    if (!args.apply) continue;
    if (prNumber) {
      spawnSync('gh', ['pr', 'close', String(prNumber), '--comment', `Contained in ${args.base} through a bundle landing; closing the component.`], { stdio: 'ignore' });
    }
    if (action.worktree) git.try('worktree', 'remove', action.worktree);
    git.try('branch', '-D', action.branch);
    if (action.remote) git.try('push', '--quiet', 'origin', '--delete', action.branch);
  }
  if (!args.apply) io.log('\nDry run. Re-run with --apply to prune the branches listed above; each head sha is printed for recovery.');
  return actions;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    runBundle(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
