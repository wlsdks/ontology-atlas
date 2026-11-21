#!/usr/bin/env node
/**
 * `pnpm bundle:plan` / `pnpm bundle:prune`: plan landing many branches (carry work, file overlap,
 * in-order conflicts via `git merge-tree`), prune only branches whose head is in `main`'s history. Selection
 * is explicit (names, `--match=<glob>`, `--worktrees=<dir>`); procedure in the `/merge` skill.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { basename, join, resolve, sep } from 'node:path';

/** The only history a branch may be deleted against: anything else would drop work main lacks. */
export const PRUNE_BASE = 'origin/main';

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
  if (!args.command) throw new Error('usage: bundle-branches.mjs plan|prune [--base=<ref> (plan only)] [--match=<glob>] [--worktrees=<dir>] [branch...] [--apply] [--json] [--no-fetch]');
  if (args.command === 'prune' && args.base !== PRUNE_BASE) {
    throw new Error(`prune deletes only what ${PRUNE_BASE} holds; --base=${args.base} is for plan`);
  }
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
    return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
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
      current = { path: line.slice('worktree '.length), branch: null, locked: null };
      trees.push(current);
    } else if (current && line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (current && (line === 'locked' || line.startsWith('locked '))) {
      current.locked = line.slice('locked'.length).trim() || 'no reason given';
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
 * The newest commit of `branch` that `base` already contains. After a squash, a three-dot diff
 * lists every file the squash brought and reports phantom conflicts; patch ids cannot see it,
 * per-commit containment can.
 */
export function landedPoint(git, base, branch) {
  const commits = git.out('rev-list', '--first-parent', '--max-count=200', `${base}..${branch}`).split('\n').filter(Boolean);
  return commits.find((sha) => isContained(git, base, sha)) ?? null;
}

/**
 * `{ landedAt }` when `ref`'s head commit is in `base`'s history, else `{ keep }`. Only ancestry
 * counts: a squash, rebase or cherry-pick leaves the branch's own commits out of `main`, so its
 * name must stay until a real merge brings them in. `landedAt` is the first-parent commit of
 * `base` that merged it, or null when `ref` sits on that line itself.
 */
export function headLanded(git, base, ref) {
  if (git.try('merge-base', '--is-ancestor', ref, base).status !== 0) {
    const head = git.out('rev-parse', '--short', ref);
    return { keep: `not provably landed: head ${head} is not in ${base}'s history (unmerged, squashed, rebased or cherry-picked)` };
  }
  const merging = git.out('rev-list', '--ancestry-path', '--first-parent', '--reverse', `${ref}..${base}`).split('\n')[0];
  return { landedAt: merging || null };
}

/** This process and its ancestors. */
export function ownPids(start = process.pid) {
  const pids = new Set();
  let pid = start;
  while (pid > 1 && !pids.has(pid)) {
    pids.add(pid);
    const parent = spawnSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' });
    pid = Number(parent.stdout?.trim());
    if (!Number.isInteger(pid)) break;
  }
  return pids;
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/** Why a locked worktree must stay; null when its process exited or is in `own`. */
export function lockHold(reason, isAlive = processIsAlive, own = new Set()) {
  const pid = Number(/\bpid (\d+)\b/.exec(reason)?.[1]);
  if (!pid) return `worktree locked: ${reason}`;
  if (own.has(pid)) return null;
  return isAlive(pid) ? `worktree locked by a running process (pid ${pid})` : null;
}

/** The `worktree-agent-<id>` branch created beside an agent worktree, when main has it and nothing else checks it out. */
function agentTwin(git, base, tree, trees) {
  const twin = `worktree-${basename(tree.path)}`;
  if (!/^worktree-agent-[0-9a-f]+$/.test(twin) || twin === tree.branch) return null;
  if (git.try('rev-parse', '--verify', '--quiet', `refs/heads/${twin}`).status !== 0) return null;
  if (trees.some((other) => other.branch === twin)) return null;
  return 'keep' in headLanded(git, base, twin) ? null : twin;
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
      ? `; carries commits ${base} took as a squash up to ${row.landed.slice(0, 9)}, so merge ${base} into it first (never rebase)`
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

/** The open pull request of a pushed branch, and how to close one; tests pass their own. */
export const githubPulls = {
  openFor: (branch) => ghJson(['pr', 'list', '--head', branch, '--state', 'open', '--json', 'number'])?.[0]?.number ?? null,
  close: (number, comment) => spawnSync('gh', ['pr', 'close', String(number), '--comment', comment], { stdio: 'ignore' }),
};

/** A branch that lives only on origin, such as a pushed integration branch whose local copy is gone. */
function remoteOnlyPlan(git, base, branch) {
  const ref = `refs/remotes/origin/${branch}`;
  if (git.try('rev-parse', '--verify', '--quiet', ref).status !== 0) return { branch, keep: 'no local or origin branch' };
  const head = git.out('rev-parse', ref);
  const proof = headLanded(git, base, ref);
  if (proof.keep) return { branch, head, keep: proof.keep };
  return { branch, head, landedAt: proof.landedAt, worktree: null, unlock: null, twin: null, remote: true, remoteOnly: true, remoteHead: head };
}

/** Removes worktrees only under `.claude/worktrees/` or a named `--worktrees` dir. */
export function prunePlan(git, base, branches, {
  currentPath = process.cwd(), isAlive = processIsAlive, own = null, worktreeDirs = [],
} = {}) {
  const trees = parseWorktrees(git.out('worktree', 'list', '--porcelain'));
  const roots = [join(trees[0]?.path ?? currentPath, '.claude', 'worktrees'), ...worktreeDirs.map((dir) => resolve(currentPath, dir))]
    .map((dir) => resolve(dir) + sep);
  let ownSet = own;
  return branches.map((branch) => {
    const exists = git.try('rev-parse', '--verify', '--quiet', `refs/heads/${branch}`).status === 0;
    if (!exists) return remoteOnlyPlan(git, base, branch);
    const head = git.out('rev-parse', branch);
    const proof = headLanded(git, base, branch);
    if (proof.keep) return { branch, head, keep: proof.keep };
    const { landedAt } = proof;
    const tree = trees.find((t) => t.branch === branch) ?? null;
    if (tree && resolve(tree.path) === resolve(currentPath)) return { branch, head, keep: 'checked out in this worktree' };
    if (tree && !roots.some((root) => (resolve(tree.path) + sep).startsWith(root))) {
      return { branch, head, keep: `worktree ${tree.path} is outside .claude/worktrees and the named --worktrees; remove it yourself` };
    }
    if (tree && git.try('-C', tree.path, 'status', '--porcelain').stdout !== '') {
      return { branch, head, keep: `worktree ${tree.path} has uncommitted changes` };
    }
    if (tree?.locked) ownSet ??= ownPids();
    const hold = tree?.locked ? lockHold(tree.locked, isAlive, ownSet) : null;
    if (hold) return { branch, head, keep: hold };
    const remote = git.try('rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`).status === 0;
    if (remote && git.try('merge-base', '--is-ancestor', `origin/${branch}`, branch).status !== 0) {
      return { branch, head, keep: 'origin has commits this branch lacks' };
    }
    const twin = tree ? agentTwin(git, base, tree, trees) : null;
    const remoteHead = remote ? git.out('rev-parse', `refs/remotes/origin/${branch}`) : null;
    return { branch, head, landedAt, worktree: tree?.path ?? null, unlock: tree?.locked ?? null, twin, remote, remoteHead };
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
  const actions = prunePlan(git, args.base, branches, { worktreeDirs: args.worktrees });
  applyPrune(git, actions, { apply: args.apply, base: args.base, io });
  return actions;
}

/** Prints each action and, with `apply`, performs it; worktree metadata is pruned once at the end. */
export function applyPrune(git, actions, { apply, base = 'origin/main', io = console, pulls = githubPulls }) {
  for (const action of actions) {
    if (action.keep) {
      io.log(`keep   ${action.branch}: ${action.keep}`);
      continue;
    }
    const prNumber = action.remote ? pulls.openFor(action.branch) : null;
    io.log(`${apply ? 'prune ' : 'would prune'} ${action.branch} @ ${action.head.slice(0, 9)}`
      + `${action.landedAt ? `  landed in ${action.landedAt.slice(0, 9)}` : ''}`
      + `${action.worktree ? `  worktree ${action.worktree}${action.unlock ? ' (unlock)' : ''}` : ''}`
      + `${action.twin ? `  twin ${action.twin}` : ''}${action.remote ? '  origin branch' : ''}${prNumber ? `  PR #${prNumber}` : ''}`);
    if (!apply) continue;
    if (action.worktree) {
      if (action.unlock) git.try('worktree', 'unlock', action.worktree);
      if (git.try('worktree', 'remove', action.worktree).status !== 0) {
        if (action.unlock) git.try('worktree', 'lock', '--reason', action.unlock, action.worktree);
        io.log(`keep   ${action.branch}: worktree ${action.worktree} could not be removed`);
        continue;
      }
    }
    if (prNumber) {
      const where = action.landedAt ? `Landed in ${action.landedAt.slice(0, 9)}` : `Contained in ${base}`;
      pulls.close(prNumber, `${where}; closing the component.`);
    }
    if (!action.remoteOnly) git.try('branch', '-D', action.branch);
    if (action.twin) git.try('branch', '-D', action.twin);
    if (action.remote) git.try('push', '--quiet', `--force-with-lease=${action.branch}:${action.remoteHead}`, 'origin', '--delete', action.branch);
  }
  if (apply) {
    git.try('worktree', 'prune');
    if (git.try('remote', 'get-url', 'origin').status === 0) git.try('fetch', '--quiet', '--prune', 'origin');
  }
  if (!apply) io.log('\nDry run. Re-run with --apply to prune the branches listed above; each head sha is printed for recovery.');
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    runBundle(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
