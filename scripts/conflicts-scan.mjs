#!/usr/bin/env node
/**
 * `pnpm conflicts:scan` — find the pull requests and branches this branch will
 * conflict with, while there is still time to change the plan.
 *
 * **Why this exists** (2026-09-26). Parallel rounds found their conflicts at
 * landing: the train or `/land-bundle` hit them after every branch was done, and
 * the fix was a hand merge at the most expensive moment. Research on multi-agent
 * development reports cross-agent pull request pairs conflicting at roughly 42%
 * and recommends surfacing overlap during development. This script answers two
 * questions for the current branch:
 *
 *   - **overlap**: which open pull requests (and, with `--match`, which local
 *     branches) change a file this branch also changes;
 *   - **conflict**: whether a trial merge of this branch with each overlapping
 *     head conflicts, and in which files.
 *
 * It is read-only toward GitHub: one `gh pr list` call (a single GraphQL query)
 * carries every open pull request's changed files. Heads missing locally are
 * fetched by `refs/pull/<n>/head` without writing a ref; the trial merge runs on
 * `git merge-tree --write-tree`, which touches no worktree, index or ref.
 *
 * Exit status: 0 no conflict, 1 at least one conflict, 2 the scan could not run.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { landedPoint, makeGit, selectBranches } from './bundle-branches.mjs';

/** `gh pr list` returns at most this many files per pull request. */
export const GH_FILE_CAP = 100;

export function parseArgs(argv) {
  const args = { base: 'origin/main', head: 'HEAD', fetch: true, prs: true, json: false, match: [] };
  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg.startsWith('--base=')) args.base = arg.slice('--base='.length);
    else if (arg.startsWith('--head=')) args.head = arg.slice('--head='.length);
    else if (arg.startsWith('--match=')) args.match.push(arg.slice('--match='.length));
    else if (arg === '--no-fetch') args.fetch = false;
    else if (arg === '--no-prs') args.prs = false;
    else if (arg === '--json') args.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.prs && args.match.length === 0) throw new Error('--no-prs needs --match=<glob>: nothing to compare against');
  return args;
}

const HELP = `Usage:
  pnpm conflicts:scan [-- --base=origin/main] [--head=HEAD] [--match=<glob>]... [--no-prs] [--no-fetch] [--json]

List open pull requests (and local branches matching --match, e.g. 'feat/round3-*')
whose changed files overlap this branch's, and trial-merge this branch with each
overlapping head. Read-only: one gh call, no GitHub writes, no ref changes.
Exit 0 = no conflict, 1 = conflicts found, 2 = the scan could not run.`;

/** Files `ref` changes relative to `base`, ignoring commits `base` already has as a squash. */
export function changedFiles(git, base, ref) {
  const ahead = Number(git.out('rev-list', '--count', `${base}..${ref}`));
  if (ahead === 0) return [];
  const landed = landedPoint(git, base, ref);
  const range = landed ? [landed, ref] : [`${base}...${ref}`];
  return git.out('diff', '--name-only', ...range).split('\n').filter(Boolean);
}

/** Trial-merge two commits; returns the conflicted paths (empty when clean). */
export function trialMerge(git, ours, theirs) {
  const merged = git.try('merge-tree', '--write-tree', '--name-only', '--no-messages', ours, theirs);
  if (merged.status === 0) return [];
  if (merged.status !== 1) throw new Error(`git merge-tree ${ours} ${theirs} failed: ${merged.stdout}`);
  return merged.stdout.split('\n').filter(Boolean).slice(1);
}

export function listOpenPullRequests(run = (cmd, argv) => execFileSync(cmd, argv, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })) {
  const raw = run('gh', ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number,headRefName,headRefOid,isDraft,files']);
  return JSON.parse(raw).map((pr) => ({
    number: pr.number,
    branch: pr.headRefName,
    oid: pr.headRefOid,
    draft: Boolean(pr.isDraft),
    files: (pr.files ?? []).map((file) => file.path),
  }));
}

const hasCommit = (git, oid) => git.try('cat-file', '-e', `${oid}^{commit}`).status === 0;

/**
 * Compare `head` with each candidate. A candidate is `{ label, branch, ref?, oid?,
 * number?, files }`; pull requests are resolved to their head commit, fetched
 * from `refs/pull/<n>/head` when missing and `fetch` is on.
 */
export function scanConflicts(git, { base, head, candidates, fetch = false }) {
  const ours = git.out('rev-parse', head);
  const ownFiles = changedFiles(git, base, ours);
  const own = new Set(ownFiles);
  const rows = [];
  for (const candidate of candidates) {
    const overlap = candidate.files.filter((file) => own.has(file));
    const truncated = candidate.files.length >= GH_FILE_CAP && candidate.number !== undefined;
    const row = { ...candidate, overlap, truncated, conflicts: [], state: 'no-overlap' };
    delete row.files;
    rows.push(row);
    if (own.size === 0 || (overlap.length === 0 && !truncated)) continue;
    let theirs = candidate.ref ?? candidate.oid;
    if (candidate.oid && !hasCommit(git, candidate.oid)) {
      if (fetch && candidate.number !== undefined) {
        git.try('fetch', '--quiet', '--no-write-fetch-head', 'origin', `refs/pull/${candidate.number}/head`);
      }
      if (!hasCommit(git, candidate.oid)) {
        row.state = 'head-unavailable';
        continue;
      }
    }
    if (candidate.ref) theirs = git.out('rev-parse', candidate.ref);
    if (theirs === ours) {
      row.state = 'same-commit';
      continue;
    }
    // A conflict in a file this branch never changed comes from the other head
    // lagging the base, not from this branch; that is the other head's rebase.
    const conflicted = trialMerge(git, ours, theirs);
    row.conflicts = conflicted.filter((file) => own.has(file));
    row.staleConflicts = conflicted.length - row.conflicts.length;
    row.state = row.conflicts.length > 0 ? 'conflict' : 'clean';
  }
  return { base, head, ownFiles, rows };
}

export function formatScan({ base, head, ownFiles, rows }) {
  const lines = [`[conflicts] ${head} changes ${ownFiles.length} file(s) against ${base}`];
  const relevant = rows.filter((row) => row.state !== 'no-overlap');
  const quiet = rows.length - relevant.length;
  if (relevant.length === 0) lines.push(`[conflicts] no overlap with ${rows.length} open pull request(s) or branch(es)`);
  for (const row of relevant) {
    const shared = row.truncated && row.overlap.length === 0
      ? 'file list truncated by gh; trial-merged anyway'
      : `overlap: ${row.overlap.join(', ')}`;
    const verdict = row.state === 'conflict' ? `CONFLICT in ${row.conflicts.join(', ')}`
      : row.state === 'clean' ? 'merges cleanly (still read the shared files)'
        : row.state === 'head-unavailable' ? 'head not available locally; run without --no-fetch'
          : 'same commit';
    lines.push(`  ${row.label} ${row.branch}${row.draft ? ' (draft)' : ''}`);
    lines.push(`    ${shared}`);
    lines.push(`    ${verdict}`);
    if (row.staleConflicts > 0) {
      lines.push(`    (${row.staleConflicts} more conflicted file(s) this branch does not change: that head lags ${base})`);
    }
  }
  if (relevant.length > 0 && quiet > 0) lines.push(`[conflicts] ${quiet} other(s) share no file`);
  const conflicted = rows.filter((row) => row.state === 'conflict');
  if (conflicted.length > 0) {
    lines.push(`[conflicts] ${conflicted.length} conflict(s): ${conflicted.map((row) => row.label).join(' ')}`);
  }
  return lines.join('\n');
}

export function runScan(argv, { io = console, cwd = process.cwd(), listPrs = listOpenPullRequests } = {}) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.error(`[conflicts] ${error.message}`);
    return 2;
  }
  if (args.help) {
    io.log(HELP);
    return 0;
  }
  try {
    const git = makeGit(cwd);
    if (args.fetch && args.base.startsWith('origin/')) {
      git.try('fetch', '--quiet', 'origin', args.base.slice('origin/'.length));
    }
    const current = git.try('symbolic-ref', '--quiet', '--short', 'HEAD').stdout;
    const self = args.head === 'HEAD' ? current : args.head;
    const candidates = [];
    if (args.prs) {
      for (const pr of listPrs()) {
        if (pr.branch === self) continue;
        candidates.push({ label: `#${pr.number}`, number: pr.number, branch: pr.branch, oid: pr.oid, draft: pr.draft, files: pr.files });
      }
    }
    const listed = new Set(candidates.map((candidate) => candidate.branch));
    for (const branch of selectBranches(git, { branches: [], match: args.match, worktrees: [] }, cwd)) {
      if (branch === self || listed.has(branch)) continue;
      candidates.push({ label: 'branch', branch, ref: `refs/heads/${branch}`, files: changedFiles(git, args.base, `refs/heads/${branch}`) });
    }
    const result = scanConflicts(git, { base: args.base, head: args.head, candidates, fetch: args.fetch });
    io.log(args.json ? JSON.stringify(result, null, 2) : formatScan(result));
    return result.rows.some((row) => row.state === 'conflict') ? 1 : 0;
  } catch (error) {
    io.error(`[conflicts] ${error.message}`);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runScan(process.argv.slice(2));
}
