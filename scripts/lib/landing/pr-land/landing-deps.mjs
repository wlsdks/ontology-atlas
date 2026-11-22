/** The real machine behind `deps`: local git, worktree removal, the clock, exit hooks, the user. */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

import { isContained, makeGit, planBundle } from '../../../landing/bundle-branches.mjs';
import { createGithub, ghRun } from './github-cli.mjs';
import { classifyHolderLiveness } from './landing-lock.mjs';

/** The worktree a landing removes: `--cleanup`'s path only. `--worktree` removes nothing. */
export function worktreeToRemove(args) {
  return args.cleanup ?? null;
}

/**
 * What a removal says **before** it happens. `git status --porcelain` does not count ignored
 * files, so a worktree holding only gitignored captures reads clean, and the line says so.
 */
export function describeCleanup({ path, status }) {
  if (status === null) return `${path} is not a Git worktree; left alone`;
  if (status !== '') return `${path} still has uncommitted work; left alone`;
  return `removing ${path} — tracked files clean (ignored files are not counted, so anything under an ignored path goes with it)`;
}

/** The local Git side of `deps`. Reads only, apart from `fetch`. */
function createGit(cwd) {
  const git = makeGit(cwd);
  const lines = (text) => text.split('\n').filter(Boolean);
  return {
    fetch: (refs) => git.try('fetch', '--quiet', 'origin', ...refs).status === 0,
    prune: () => git.try('fetch', '--quiet', '--prune', 'origin').status === 0,
    revParse: (ref) => {
      const result = git.try('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
      return result.status === 0 ? result.stdout : null;
    },
    hasCommit: (sha) => git.try('cat-file', '-e', `${sha}^{commit}`).status === 0,
    mergeTreeClean: (left, right) => {
      const result = git.try('merge-tree', '--write-tree', '--no-messages', left, right);
      if (result.status === 0) return true;
      return result.status === 1 ? false : null;
    },
    mergeBase: (left, right) => {
      const result = git.try('merge-base', left, right);
      return result.status === 0 ? result.stdout : null;
    },
    diffNames: (from, to) => {
      const result = git.try('diff', '--name-only', '--no-renames', from, to);
      return result.status === 0 ? lines(result.stdout) : null;
    },
    diffNameStatus: (from, to) => {
      const result = git.try('diff', '--name-status', '--no-renames', from, to);
      if (result.status !== 0) return null;
      return lines(result.stdout).map((line) => {
        const [status, path] = line.split('\t');
        return { status: status.charAt(0), path };
      });
    },
    isContained: (base, sha) => isContained(git, base, sha),
    isAncestor: (ancestor, descendant) => git.try('merge-base', '--is-ancestor', ancestor, descendant).status === 0,
    coAuthorLog: (base, sha) => git.try('log', '--format=Co-authored-by: %an <%ae>%n%B', `${base}..${sha}`).stdout,
    /** Trial-merge the shas in order onto `base` with throwaway commits, as `bundle:plan` does. */
    trialMerge: (base, shas) => {
      const plan = planBundle(git, base, shas);
      return plan.rows.map((row) => {
        const step = plan.steps.find((s) => s.branch === row.branch);
        return { sha: row.branch, state: row.state, conflicts: step?.conflicts ?? [] };
      });
    },
  };
}

function worktreeStatus(path) {
  try {
    return execFileSync('git', ['-C', path, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function cleanupWorktree(path, log) {
  const status = worktreeStatus(path);
  log(`cleanup: ${describeCleanup({ path, status })}`);
  if (status === null || status !== '') return;
  const git = makeGit(process.cwd());
  const branch = git.try('-C', path, 'rev-parse', '--abbrev-ref', 'HEAD').stdout;
  git.try('worktree', 'remove', path);
  if (branch && branch !== 'main' && branch !== 'HEAD') {
    git.try('branch', '-D', branch);
    log(`cleanup: removed ${path} and deleted local branch ${branch}`);
  } else {
    log(`cleanup: removed ${path}`);
  }
}

function sleepBlocking(seconds) {
  // Blocking on purpose: the only other thing this process does is release the lock on its way
  // out, and a synchronous main line keeps that the single exit path.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(seconds * 1000));
}

export function defaultDeps(io = console) {
  const slug = JSON.parse(ghRun(['repo', 'view', '--json', 'nameWithOwner'])).nameWithOwner;
  const exits = new Set();
  const runExits = () => {
    for (const exitHandler of [...exits]) {
      exits.delete(exitHandler);
      try { exitHandler(); } catch { /* best effort on the way out */ }
    }
  };
  process.on('exit', runExits);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      runExits();
      process.exit(130);
    });
  }
  let user = 'unknown';
  try {
    user = execFileSync('git', ['config', 'user.name'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || process.env.USER || 'unknown';
  } catch {
    user = process.env.USER || 'unknown';
  }
  return {
    gh: createGithub(slug),
    git: createGit(process.cwd()),
    now: () => Date.now(),
    sleep: sleepBlocking,
    log: (line) => io.log(`[pr-land] ${line}`),
    error: (line) => io.error(`[pr-land] ${line}`),
    host: hostname(),
    pid: process.pid,
    user,
    liveness: classifyHolderLiveness,
    onExit: (handler) => {
      exits.add(handler);
      return () => exits.delete(handler);
    },
    cleanupWorktree: (path) => cleanupWorktree(path, (line) => io.log(`[pr-land] ${line}`)),
  };
}
