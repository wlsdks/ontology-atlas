#!/usr/bin/env node
/**
 * `pnpm pr:land <number>` — the only way a pull request reaches `main`.
 *
 * **The measurement this exists for** (2026-09-12). `main` required eight
 * status contexts with the classic "branch must be up to date" policy on, so
 * every merge turned every other open pull request BEHIND. The next agent ran
 * `gh pr update-branch`, paid a full CI round, and the merge after that did the
 * same thing to everyone else. Five pull requests cost roughly four CI rounds
 * each, and two agents racing for the same window lost both rounds.
 *
 * **The owner's shape** (2026-09-12): most changes overlap anyway, so do not
 * run CI on a branch that is not yet the thing being merged. Open the pull
 * request as a **draft**, which runs nothing; when it is that branch's turn,
 * merge today's `main` into it, then make it ready, which fires **one** CI run
 * on exactly the tree that is about to land. One pull request, one CI run.
 *
 * **Why this script and not GitHub's merge queue.** The merge queue is the
 * right mechanism for this and it is not available here: it requires an
 * organization-owned repository, and `wlsdks/ontology-atlas` is owned by a
 * personal account. Proven twice on 2026-09-12 — `POST /repos/.../rulesets`
 * answers `422 Validation Failed: Invalid rule 'merge_queue'` even with no
 * parameters at all, and GraphQL's `BranchProtectionRule` has no
 * `requiresMergeQueue` field on this account. `docs/DECISIONS.md` carries the
 * record; the workflows already carry the `merge_group` trigger, so an
 * organization transfer turns the queue on and leaves this script a wrapper.
 *
 * **What one landing does.**
 *
 *   1. **Lock.** `refs/atlas/landing-lock` is created through the Git refs API,
 *      whose create is a server-side compare-and-swap: a second creator gets
 *      `422 Reference already exists`. That is the mutex, and while it is held
 *      nothing else can move `main`, which is what makes one CI run enough. The
 *      ref points at a blob naming who holds it, for which pull request, and
 *      since when, so `pnpm pr:queue` can name the holder instead of guessing.
 *      The holder refreshes it every poll; a lock not refreshed for
 *      `LEASE_MINUTES` belongs to a dead process and is taken over, out loud.
 *   2. **Pour main in.** `POST /repos/.../merges` merges `main` into the pull
 *      request's own branch server-side: `201` created a merge commit, `204`
 *      means the branch already contains main, `409` is a conflict only the
 *      author can resolve. No local checkout is touched, so this works from any
 *      worktree, including one that has never seen the branch.
 *   3. **Run the local lanes on the merged source.** `pnpm checks:changed --
 *      --run <changed files>` in the pull request's own worktree, minus the
 *      browser lanes, which CI owns. This is the answer to "green on my branch,
 *      red once main was merged in": it is found here, in minutes, instead of
 *      inside the one CI run.
 *   4. **Fire CI once.** `gh pr ready` turns the draft into a ready pull
 *      request, and `ready_for_review` is what the workflows run on. A draft's
 *      pushes run nothing at all.
 *   5. **Merge, prune, release.** Wait for the required contexts (read from the
 *      branch protection, never listed here), squash merge, delete the remote
 *      branch, prune locally, and always release the lock, including on Ctrl-C.
 *
 * One landing, in order: **lock, merge main, local checks, ready, one CI run,
 * merge, clean.**
 *
 * Never call `gh pr merge` or `gh pr update-branch` by hand, and never open a
 * pull request without `--draft`: each of those spends a CI round nobody asked
 * for or merges past the agent already landing.
 * `.claude/hooks/block-manual-landing.sh` refuses all three.
 */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

import { formatFocusedCheckSuggestions, suggestFocusedChecks } from './lib/focused-check-suggestions.mjs';
import { runFocusedChecks } from './suggest-focused-checks.mjs';

export const LOCK_REF = 'refs/atlas/landing-lock';

/**
 * How long a lock survives without a refresh.
 *
 * The holder rewrites the lock on every poll, so this is not "how long a
 * landing may take" but "how long after a crash the next agent waits". Long
 * enough that a live holder inside one slow CI round is never robbed (the
 * exhaustive lane measured 28 minutes on 2026-09-12), short enough that a
 * killed process does not wedge the repository for an afternoon.
 */
export const LEASE_MINUTES = 45;

export const POLL_SECONDS = 30;

export const CONFLICT_INSTRUCTION =
  'conflicts with main, and only its author can resolve that:\n'
  + '    git fetch origin && git merge origin/main\n'
  + '    # resolve the conflict, commit, then push the branch\n'
  + '  If only generated docs-vault JSON, the changelog or the ledger conflict, do not\n'
  + '  resolve those by hand: `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the\n'
  + '  write command. Then run `pnpm pr:land <number>` again. The landing lock was\n'
  + '  released, so another pull request can land meanwhile.';

/** A pull request this script refuses to touch, with the reason a person can act on. */
export function refuseLanding(pr) {
  if (!pr || typeof pr.number !== 'number') return 'no such pull request.';
  if (pr.state !== 'OPEN') {
    return `is ${String(pr.state).toLowerCase()}, not open. Only an open pull request can land.`;
  }
  if (pr.isCrossRepository) {
    return 'comes from a fork. A fork pull request is a security boundary: land it by hand after reading CONTRIBUTING.md.';
  }
  if (pr.mergeStateStatus === 'DIRTY' || pr.mergeable === 'CONFLICTING') return CONFLICT_INSTRUCTION;
  return null;
}

/**
 * What the lock ref says, and whether it still counts.
 *
 * `unreadable` is deliberately not `free`: a lock whose payload cannot be
 * parsed is still a lock somebody took, and treating a shape we do not
 * understand as an open door is how a mutex becomes decoration. It becomes
 * takeable only once it is older than the lease.
 */
export function classifyLock({ payload, nowMs, leaseMinutes = LEASE_MINUTES }) {
  if (payload === null || payload === undefined) return { state: 'free', holder: null, ageMinutes: null };
  const acquiredMs = Date.parse(payload?.acquiredAt ?? '');
  if (!Number.isFinite(acquiredMs) || typeof payload?.pr !== 'number') {
    return { state: 'unreadable', holder: null, ageMinutes: null, payload };
  }
  const ageMinutes = (nowMs - acquiredMs) / 60_000;
  const lease = typeof payload.leaseMinutes === 'number' ? payload.leaseMinutes : leaseMinutes;
  return {
    state: ageMinutes > lease ? 'stale' : 'held',
    holder: payload,
    ageMinutes,
    expiresInMinutes: lease - ageMinutes,
  };
}

export function describeLock(lock) {
  if (lock.state === 'free') return 'nothing is landing';
  if (lock.state === 'unreadable') {
    return `an unreadable lock (${JSON.stringify(lock.payload)}); it can be taken over once it is older than ${LEASE_MINUTES} minutes`;
  }
  const age = `${lock.ageMinutes.toFixed(0)} min ago`;
  const who = `${lock.holder.holder ?? 'unknown'}@${lock.holder.host ?? 'unknown'}`;
  return lock.state === 'stale'
    ? `PR #${lock.holder.pr} held by ${who} since ${age} and never refreshed: stale`
    : `PR #${lock.holder.pr} held by ${who} since ${age}`;
}

/**
 * The required contexts' verdict, read against the protection's own list.
 *
 * **`SKIPPED` is not green here, and that is the whole draft design's safety
 * catch.** A job GitHub skips because the pull request is a draft reports
 * `skipped`, and branch protection counts a skipped job as satisfied. A lander
 * that inherited that reading would merge a draft whose eight required contexts
 * had never executed a line. A genuinely unaffected lane in this repository
 * does not skip its job: it runs, explains the skip, and succeeds
 * (`checks.yml`, "Skip unaffected gate setup"), so refusing `skipped` costs
 * nothing real.
 *
 * A required context that has not reported at all is `missing`, not `pending`:
 * those look identical for the first minute and completely different after ten,
 * and only `missing` means CI was never fired. Both wait, and the printed line
 * says which it is.
 */
export function requiredCheckState({ rollup = [], requiredContexts = [] }) {
  const byName = new Map();
  for (const run of rollup) {
    const name = run?.name ?? run?.context;
    if (!name) continue;
    byName.set(name, run);
  }
  const pending = [];
  const failed = [];
  const missing = [];
  const skipped = [];
  for (const context of requiredContexts) {
    const run = byName.get(context);
    if (!run) {
      missing.push(context);
      continue;
    }
    const status = run.status ?? run.state ?? '';
    const conclusion = run.conclusion ?? run.state ?? '';
    if (status !== 'COMPLETED') {
      pending.push(context);
      continue;
    }
    if (conclusion === 'SUCCESS') continue;
    if (conclusion === 'SKIPPED') {
      skipped.push(context);
      continue;
    }
    failed.push({ name: context, conclusion, url: run.detailsUrl ?? run.targetUrl ?? null });
  }
  const unrun = [...missing, ...skipped];
  const state = failed.length > 0 ? 'failed' : pending.length + unrun.length > 0 ? 'waiting' : 'green';
  return { state, pending, failed, missing, skipped, unrun, neverRan: pending.length === 0 && unrun.length === requiredContexts.length };
}

/**
 * Browser evidence belongs to CI, not to a landing.
 *
 * A Playwright command here would add a production build plus three shards to
 * every landing on a laptop, to produce the same verdict the one CI run is
 * about to produce on three parallel runners. The local lanes exist to catch
 * what *only* the merge of main can break: types, lint, contracts, generated
 * output. Those are seconds to minutes.
 */
export const isBrowserCommand = (command) =>
  command.startsWith('pnpm exec playwright test') || /^pnpm test:e2e(?::|$)/.test(command);

/**
 * What to run locally on the merged source, and what is left to CI.
 *
 * Built from the repository's own path-to-check authority
 * (`scripts/lib/focused-check-suggestions.mjs`), so a landing never carries a
 * second, drifting idea of which check a path needs.
 */
export function localCheckPlan(paths) {
  const suggestions = suggestFocusedChecks(paths);
  return {
    suggestions,
    commands: suggestions.commands.filter((row) => !isBrowserCommand(row.command)),
    deferred: suggestions.commands.filter((row) => isBrowserCommand(row.command)),
  };
}

/**
 * Did merging `main` in already ask GitHub for the one CI run?
 *
 * On a **ready** pull request the push of that merge commit is a `synchronize`
 * event, and `synchronize` is in every workflow's trigger, so CI is already
 * starting. On a **draft** the same push runs nothing, and `gh pr ready` is the
 * request instead.
 *
 * Getting this backwards is not cosmetic. The merge commit is a head with no
 * checks yet, which reads as "no required context ever ran", and the lander
 * would answer by toggling draft and back: that cancels the run that was
 * already starting and pays for a second one, on a pull request whose whole
 * promise is one run. Found by reading the machine against a ready pull request
 * before the first of them was landed.
 */
export const mergeFiredCi = ({ merged, isDraft }) => merged === true && isDraft !== true;

/**
 * One step of the landing state machine, as a value.
 *
 * Every branch of the landing decision is here and nowhere else, so the whole
 * machine is testable from recorded `gh` JSON with no network at all.
 *
 * `ciRequested` is the shell telling the machine "I have already fired the one
 * CI run for this landing". Without it, a ready pull request whose checks have
 * not appeared yet would be re-fired on every poll.
 */
export function decideNext({
  pr,
  lock,
  behindBy = 0,
  requiredContexts,
  selfLock = null,
  ciRequested = false,
  localChecksPassed = false,
}) {
  if (pr?.state === 'MERGED') return { action: 'done' };
  const refusal = refuseLanding(pr);
  if (refusal) return { action: 'refuse', reason: refusal };

  const holdsLock = selfLock !== null && lock.state !== 'free' && lock.holder?.token === selfLock;
  if (!holdsLock) {
    if (lock.state === 'held') return { action: 'wait-lock', lock };
    if (lock.state === 'stale' || lock.state === 'unreadable') return { action: 'take-stale-lock', lock };
    return { action: 'take-lock', lock };
  }

  // Pour main in first, while the pull request is still a draft and a push
  // costs nothing. Doing it after `gh pr ready` would spend a second CI run.
  if (behindBy > 0) return { action: 'merge-main', behindBy };

  // Local lanes run on the merged source, while the pull request is still a
  // draft, so a break that only the merge could cause is found before the one
  // CI run rather than inside it. A pull request that is already ready has CI
  // as its gate and does not pay this twice.
  if (pr.isDraft && !localChecksPassed) return { action: 'local-checks' };
  if (pr.isDraft) return { action: 'make-ready' };

  const checks = requiredCheckState({ rollup: pr.statusCheckRollup ?? [], requiredContexts });
  if (checks.state === 'failed') return { action: 'fail-checks', checks };
  // A ready pull request whose required contexts never ran (it was made ready
  // by hand before this repository's draft rule, or its run was cancelled) has
  // no event left to fire. Toggling draft and back is the only way to ask
  // GitHub for that one run.
  if (!ciRequested && checks.neverRan) return { action: 'refire-ci', checks };
  if (checks.state === 'waiting') return { action: 'wait-checks', checks };
  return { action: 'merge' };
}

/* ------------------------------------------------------------------ *
 * Everything below is the IO shell: it talks to `gh` and to the clock,
 * and hands the pure functions above their inputs.
 * ------------------------------------------------------------------ */

function gh(args, { allowFailure = false } = {}) {
  try {
    // `stdio` is explicit because `execFileSync` lets the child's stderr reach
    // this process's stderr by default, and a tolerated 404 (there is no lock)
    // printing `gh: Not Found` reads as a failure in the middle of a clean run.
    return execFileSync('gh', args, {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFailure) return { failed: true, output: `${error.stderr ?? ''}${error.stdout ?? ''}` };
    const detail = `${error.stderr ?? ''}${error.stdout ?? ''}`.trim();
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${detail || error.message}`);
  }
}

function ghJson(args, options) {
  const out = gh(args, options);
  if (out === null || typeof out === 'object') return null;
  try {
    return JSON.parse(out);
  } catch {
    throw new Error(`gh ${args.slice(0, 3).join(' ')} did not return JSON`);
  }
}

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (allowFailure) return null;
    throw error;
  }
}

const log = (line) => process.stdout.write(`[pr-land] ${line}\n`);

function repoSlug() {
  return ghJson(['repo', 'view', '--json', 'nameWithOwner']).nameWithOwner;
}

const PR_FIELDS = [
  'number',
  'state',
  'title',
  'url',
  'isDraft',
  'mergeable',
  'mergeStateStatus',
  'headRefName',
  'headRefOid',
  'baseRefName',
  'isCrossRepository',
  'statusCheckRollup',
].join(',');

function readPr(number) {
  return ghJson(['pr', 'view', String(number), '--json', PR_FIELDS]);
}

function readRequiredContexts(slug) {
  const required = ghJson(['api', `repos/${slug}/branches/main/protection/required_status_checks`], {
    allowFailure: true,
  });
  return Array.isArray(required?.contexts) ? required.contexts : [];
}

/** How far `main` has run ahead of this branch since they parted. */
function readBehindBy(slug, headSha) {
  const comparison = ghJson(['api', `repos/${slug}/compare/main...${headSha}`], { allowFailure: true });
  return comparison?.behind_by ?? 0;
}

/**
 * Merge `main` into the pull request's own branch, server-side.
 *
 * `POST /repos/{owner}/{repo}/merges` is the documented "merge a branch" call:
 * `201` created the merge commit, `204` means the branch already contains
 * main, `409` is a conflict. Nothing local is touched, so a landing works from
 * a worktree that has never fetched this branch.
 */
function mergeMainInto(slug, branch) {
  const result = gh(
    [
      'api',
      '-X',
      'POST',
      `repos/${slug}/merges`,
      '-f',
      `base=${branch}`,
      '-f',
      'head=main',
      '-f',
      `commit_message=chore: merge main into ${branch} before landing`,
    ],
    { allowFailure: true },
  );
  if (typeof result === 'string') {
    return result.trim() === '' ? { state: 'up-to-date' } : { state: 'merged' };
  }
  if (/409|[Mm]erge conflict/.test(result.output ?? '')) return { state: 'conflict', detail: result.output };
  return { state: 'error', detail: result.output };
}

function readLockPayload(slug) {
  const ref = ghJson(['api', `repos/${slug}/git/ref/${LOCK_REF.replace('refs/', '')}`], { allowFailure: true });
  if (!ref?.object?.sha) return { payload: null, sha: null };
  const blob = ghJson(['api', `repos/${slug}/git/blobs/${ref.object.sha}`], { allowFailure: true });
  if (!blob?.content) return { payload: {}, sha: ref.object.sha };
  try {
    const raw = Buffer.from(blob.content, blob.encoding === 'base64' ? 'base64' : 'utf8').toString('utf8');
    return { payload: JSON.parse(raw), sha: ref.object.sha };
  } catch {
    return { payload: {}, sha: ref.object.sha };
  }
}

function writeLockBlob(slug, body) {
  return ghJson([
    'api',
    '-X',
    'POST',
    `repos/${slug}/git/blobs`,
    '-f',
    `content=${JSON.stringify(body)}`,
    '-f',
    'encoding=utf-8',
  ]).sha;
}

function lockBody({ pr, token }) {
  return {
    pr,
    token,
    holder: (git(['config', 'user.name'], { allowFailure: true }) || process.env.USER || 'unknown').trim(),
    host: hostname(),
    acquiredAt: new Date().toISOString(),
    leaseMinutes: LEASE_MINUTES,
    via: 'pnpm pr:land',
  };
}

function takeLock(slug, body, { force = false } = {}) {
  const sha = writeLockBlob(slug, body);
  if (force) {
    gh(['api', '-X', 'PATCH', `repos/${slug}/git/${LOCK_REF}`, '-f', `sha=${sha}`, '-F', 'force=true']);
    return true;
  }
  const created = gh(['api', '-X', 'POST', `repos/${slug}/git/refs`, '-f', `ref=${LOCK_REF}`, '-f', `sha=${sha}`], {
    allowFailure: true,
  });
  return typeof created === 'string';
}

function refreshLock(slug, body) {
  const sha = writeLockBlob(slug, body);
  gh(['api', '-X', 'PATCH', `repos/${slug}/git/${LOCK_REF}`, '-f', `sha=${sha}`, '-F', 'force=true'], {
    allowFailure: true,
  });
}

function releaseLock(slug) {
  gh(['api', '-X', 'DELETE', `repos/${slug}/git/${LOCK_REF}`], { allowFailure: true });
}

function sleep(seconds) {
  // A landing waits on GitHub, not in a tight loop. The wait is blocking on
  // purpose: the only other thing this process does is release the lock on its
  // way out, and a synchronous main line keeps that the single exit path.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.round(seconds * 1000));
}

function cleanupWorktree(path) {
  const status = git(['-C', path, 'status', '--porcelain'], { allowFailure: true });
  if (status === null) {
    log(`cleanup: ${path} is not a Git worktree; left alone`);
    return;
  }
  if (status !== '') {
    log(`cleanup: ${path} still has uncommitted work; left alone`);
    return;
  }
  const branch = git(['-C', path, 'rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true });
  git(['worktree', 'remove', path], { allowFailure: true });
  if (branch && branch !== 'main' && branch !== 'HEAD') {
    git(['branch', '-D', branch], { allowFailure: true });
    log(`cleanup: removed ${path} and deleted local branch ${branch}`);
  } else {
    log(`cleanup: removed ${path}`);
  }
}

/**
 * Run the repository's own focused lanes on the merged source.
 *
 * The server-side merge in the step before put a commit on the branch that no
 * local checkout has seen, so the worktree is fast-forwarded onto it first.
 * Fast-forward is the only move allowed: the merge commit's first parent is the
 * branch head this worktree already has, so a refusal here means the worktree
 * is not that branch, or somebody pushed in the meantime, and either is a
 * reason to stop rather than to invent a merge.
 */
function runLocalChecks({ worktree, pr, io }) {
  const branch = git(['-C', worktree, 'rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true });
  if (branch === null) {
    return { ok: false, reason: `${worktree} is not a Git worktree. Pass the branch's checkout with --worktree <path>.` };
  }
  if (branch !== pr.headRefName) {
    return {
      ok: false,
      reason:
        `${worktree} is on ${branch}, not ${pr.headRefName}, so the local lanes would measure the wrong tree.\n`
        + `  Run this from that branch's worktree, or pass --worktree <path>.`,
    };
  }
  const dirty = git(['-C', worktree, 'status', '--porcelain'], { allowFailure: true });
  if (dirty !== '') {
    return {
      ok: false,
      reason: `${worktree} has uncommitted work, so the local lanes would measure something that is not landing. Commit or set it aside first.`,
    };
  }

  git(['-C', worktree, 'fetch', 'origin', 'main', pr.headRefName], { allowFailure: true });
  const forwarded = git(['-C', worktree, 'merge', '--ff-only', `origin/${pr.headRefName}`], { allowFailure: true });
  if (forwarded === null) {
    return {
      ok: false,
      reason:
        `could not fast-forward ${worktree} onto origin/${pr.headRefName} after merging main in.\n`
        + '  Someone pushed to that branch during this landing. Reconcile it and run `pnpm pr:land` again.',
    };
  }

  const changed = git(['-C', worktree, 'diff', '--name-only', 'origin/main...HEAD'], { allowFailure: true }) ?? '';
  const paths = changed.split('\n').filter(Boolean);
  if (paths.length === 0) {
    log('local checks: this branch changes nothing against main');
    return { ok: true };
  }
  const plan = localCheckPlan(paths);
  log(`local checks on the merged source: ${paths.length} changed file(s)`);
  process.stdout.write(`${formatFocusedCheckSuggestions(plan.suggestions)}\n`);
  for (const row of plan.deferred) {
    log(`left to the one CI run: ${row.command}`);
  }
  const code = runFocusedChecks({ commands: plan.commands, cwd: worktree });
  if (code !== 0) {
    return {
      ok: false,
      reason:
        `the local lanes are red on the merged source (exit ${code}), so CI was never fired.\n`
        + '  Fix what the failing lane above named, push, then run `pnpm pr:land` again.',
    };
  }
  io.log('[pr-land] local checks green on the merged source');
  return { ok: true };
}

function printQueue(slug, io = console) {
  const { payload } = readLockPayload(slug);
  const lock = classifyLock({ payload, nowMs: Date.now() });
  io.log(`[pr-queue] landing now: ${describeLock(lock)}`);
  const open = ghJson([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    'number,title,isDraft,mergeStateStatus,mergeable,headRefName',
  ]);
  if (open.length === 0) {
    io.log('[pr-queue] waiting: none');
    return 0;
  }
  io.log(`[pr-queue] waiting: ${open.length} open pull request(s)`);
  for (const pr of open.sort((a, b) => a.number - b.number)) {
    const held = lock.holder?.pr === pr.number ? ' <- holds the lock' : '';
    io.log(
      `[pr-queue]   #${pr.number} ${pr.isDraft ? 'draft' : 'ready'} ${pr.mergeStateStatus}/${pr.mergeable}${held}`
      + `  ${pr.title.slice(0, 60)}`,
    );
  }
  io.log('[pr-queue] land one with `pnpm pr:land <number>`; never `gh pr merge` by hand.');
  return 0;
}

export function parseArgs(argv) {
  const args = {
    number: null,
    cleanup: null,
    queue: false,
    release: false,
    ci: false,
    // The local lanes run where that branch is checked out. The current
    // directory is the common case: the agent landing a pull request is
    // standing in the worktree that wrote it.
    worktree: null,
    timeoutMinutes: 180,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--' || arg === '') continue;
    if (arg === '--queue') args.queue = true;
    else if (arg === '--release') args.release = true;
    else if (arg === '--ci') args.ci = true;
    else if (arg === '--cleanup') {
      args.cleanup = argv[index + 1] ?? null;
      index += 1;
      if (!args.cleanup) throw new Error('--cleanup needs a worktree path');
    } else if (arg.startsWith('--cleanup=')) args.cleanup = arg.slice('--cleanup='.length);
    else if (arg === '--worktree') {
      args.worktree = argv[index + 1] ?? null;
      index += 1;
      if (!args.worktree) throw new Error('--worktree needs a path');
    } else if (arg.startsWith('--worktree=')) args.worktree = arg.slice('--worktree='.length);
    else if (arg.startsWith('--timeout-minutes=')) {
      const minutes = Number(arg.slice('--timeout-minutes='.length));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error(`--timeout-minutes must be positive; received ${arg}`);
      }
      args.timeoutMinutes = minutes;
    } else if (/^#?\d+$/.test(arg)) args.number = Number(arg.replace('#', ''));
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!args.queue && !args.release && args.number === null) {
    throw new Error('a pull request number is required: pnpm pr:land <number>');
  }
  if (args.ci && args.number === null) throw new Error('pnpm pr:ci needs a pull request number');
  return args;
}

export function runPrLand(argv, io = console) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.error(`[pr-land] ${error.message}`);
    return 2;
  }

  const slug = repoSlug();
  if (args.queue) return printQueue(slug, io);

  if (args.release) {
    const { payload } = readLockPayload(slug);
    const lock = classifyLock({ payload, nowMs: Date.now() });
    if (lock.state === 'free') {
      io.log('[pr-land] the landing lock is already free');
      return 0;
    }
    io.log(`[pr-land] releasing the landing lock: ${describeLock(lock)}`);
    releaseLock(slug);
    return 0;
  }

  const number = args.number;
  let pr = readPr(number);

  if (args.ci) {
    // Opt-in early CI: a draft that wants a round now, without landing. It
    // stays ready afterwards, and `pnpm pr:land` will not fire a second run.
    if (!pr.isDraft) {
      io.log(`[pr-land] PR #${number} is already ready; CI has been asked for`);
      return 0;
    }
    gh(['pr', 'ready', String(number)]);
    log(`PR #${number} is ready: one CI run is now firing. Land it with \`pnpm pr:land ${number}\`.`);
    return 0;
  }

  if (pr?.state === 'MERGED') {
    io.log(`[pr-land] PR #${number} is already merged: ${pr.url}`);
    if (args.cleanup) cleanupWorktree(args.cleanup);
    return 0;
  }
  const refusal = refuseLanding(pr);
  if (refusal) {
    io.error(`[pr-land] PR #${number} ${refusal}`);
    return 1;
  }

  const requiredContexts = readRequiredContexts(slug);
  if (requiredContexts.length === 0) {
    io.error('[pr-land] main declares no required status checks; refusing to land without a gate');
    return 1;
  }
  log(`PR #${number} ${pr.title}`);
  log(`required contexts: ${requiredContexts.length} (${requiredContexts.join(', ')})`);

  const token = `${hostname()}-${process.pid}-${Date.now()}`;
  let held = false;
  const release = () => {
    if (!held) return;
    held = false;
    releaseLock(slug);
    log('landing lock released');
  };
  process.on('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      release();
      process.exit(130);
    });
  }

  const deadline = Date.now() + args.timeoutMinutes * 60_000;
  let ciRequested = false;
  let localChecksPassed = false;

  while (Date.now() < deadline) {
    const { payload } = readLockPayload(slug);
    const lock = classifyLock({ payload, nowMs: Date.now() });
    const behindBy = held ? readBehindBy(slug, pr.headRefOid) : 0;
    const step = decideNext({
      pr,
      lock,
      behindBy,
      requiredContexts,
      selfLock: held ? token : null,
      ciRequested,
      localChecksPassed,
    });

    if (step.action === 'refuse') {
      release();
      io.error(`[pr-land] PR #${number} ${step.reason}`);
      return 1;
    }

    if (step.action === 'wait-lock') {
      log(`waiting for the landing ahead: ${describeLock(step.lock)} (retry in ${POLL_SECONDS}s)`);
      sleep(POLL_SECONDS);
      pr = readPr(number);
      continue;
    }

    if (step.action === 'take-lock' || step.action === 'take-stale-lock') {
      if (step.action === 'take-stale-lock') {
        log(`taking over a lock nobody refreshed: ${describeLock(step.lock)}`);
      }
      held = takeLock(slug, lockBody({ pr: number, token }), { force: step.action === 'take-stale-lock' });
      if (!held) {
        log('another agent took the lock first; waiting');
        sleep(POLL_SECONDS);
        pr = readPr(number);
        continue;
      }
      log('landing lock acquired; main cannot move until this landing finishes');
      continue;
    }

    refreshLock(slug, lockBody({ pr: number, token }));

    if (step.action === 'merge-main') {
      log(`main moved by ${step.behindBy} commit(s); merging it into ${pr.headRefName} while this is still a draft`);
      const merged = mergeMainInto(slug, pr.headRefName);
      if (merged.state === 'conflict') {
        release();
        io.error(`[pr-land] PR #${number} ${CONFLICT_INSTRUCTION}`);
        return 1;
      }
      if (merged.state === 'error') {
        release();
        io.error(`[pr-land] could not merge main into ${pr.headRefName}: ${merged.detail?.trim()}`);
        return 1;
      }
      log(merged.state === 'merged' ? 'main merged into the branch' : 'the branch already contained main');
      if (mergeFiredCi({ merged: merged.state === 'merged', isDraft: pr.isDraft })) {
        ciRequested = true;
        log('that push is this landing\'s one CI run: the pull request was already ready');
      }
      pr = readPr(number);
      continue;
    }

    if (step.action === 'local-checks') {
      const outcome = runLocalChecks({ worktree: args.worktree ?? process.cwd(), pr, io });
      if (!outcome.ok) {
        release();
        io.error(`[pr-land] ${outcome.reason}`);
        return 1;
      }
      localChecksPassed = true;
      pr = readPr(number);
      continue;
    }

    if (step.action === 'make-ready') {
      gh(['pr', 'ready', String(number)]);
      ciRequested = true;
      log('draft marked ready: the one CI run for this landing is firing now');
      sleep(POLL_SECONDS);
      pr = readPr(number);
      continue;
    }

    if (step.action === 'refire-ci') {
      log(
        `PR #${number} is ready but ${step.checks.unrun.length} required context(s) never ran; `
        + 'toggling draft to ask GitHub for that one run',
      );
      gh(['pr', 'ready', String(number), '--undo']);
      gh(['pr', 'ready', String(number)]);
      ciRequested = true;
      sleep(POLL_SECONDS);
      pr = readPr(number);
      continue;
    }

    if (step.action === 'fail-checks') {
      release();
      io.error(`[pr-land] PR #${number} has ${step.checks.failed.length} failing required check(s):`);
      for (const check of step.checks.failed) {
        io.error(`[pr-land]   ${check.name} ${check.conclusion} ${check.url ?? ''}`.trimEnd());
      }
      io.error('[pr-land] fix the failure, push, then run `pnpm pr:land` again.');
      return 1;
    }

    if (step.action === 'wait-checks') {
      const { pending, unrun } = step.checks;
      log(
        `waiting on required checks: ${pending.length} running, ${unrun.length} not reported yet`
        + `${pending.length > 0 ? ` (${pending.join(', ')})` : ''}`,
      );
      sleep(POLL_SECONDS);
      pr = readPr(number);
      continue;
    }

    if (step.action === 'merge') {
      log(`every required context is green on ${pr.headRefOid.slice(0, 9)}; squash merging`);
      /*
       * No `--delete-branch`. Measured on the first real landing (#1576, which
       * merged and then crashed here): that flag makes `gh` do local Git work,
       * switching the checkout to `main` and deleting the local branch, and in
       * a worktree setup `main` belongs to another checkout — `fatal: 'main' is
       * already used by worktree at ...`. The pull request was already merged
       * by then, so the landing "failed" after succeeding, which is the worst
       * shape an error can have. The remote branch is deleted below, through
       * the API, by the repository's own `delete_branch_on_merge` or by us.
       */
      gh(['pr', 'merge', String(number), '--squash']);
      const merged = readPr(number);
      if (merged.state !== 'MERGED') {
        release();
        io.error(`[pr-land] the merge call returned but PR #${number} is ${merged.state}`);
        return 1;
      }
      log(`PR #${number} merged: ${merged.url}`);
      const remote = gh(['api', `repos/${slug}/git/ref/heads/${pr.headRefName}`], { allowFailure: true });
      if (typeof remote === 'string') {
        gh(['api', '-X', 'DELETE', `repos/${slug}/git/refs/heads/${pr.headRefName}`], { allowFailure: true });
        log(`deleted the remote branch ${pr.headRefName}`);
      }
      git(['fetch', '--prune', 'origin'], { allowFailure: true });
      release();
      if (args.cleanup) cleanupWorktree(args.cleanup);
      log('done. Next agent: `pnpm pr:land <number>`.');
      return 0;
    }

    if (step.action === 'done') {
      log(`PR #${number} is already merged`);
      release();
      return 0;
    }

    release();
    io.error(`[pr-land] unhandled landing step: ${step.action}`);
    return 2;
  }

  io.error(`[pr-land] gave up after ${args.timeoutMinutes} minutes; the lock is released and nothing merged`);
  return 1;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runPrLand(process.argv.slice(2));
}
