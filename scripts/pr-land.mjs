#!/usr/bin/env node
/**
 * `pnpm pr:land <number>` — the only way a pull request reaches `main`.
 *
 * **The measurement this shape answers** (2026-09-26). `main` requires eight status contexts,
 * `strict` is off (no "must be up to date"), history is linear, and the owner is a personal
 * account, so GitHub's merge queue is unavailable (below). One CI run on a pull request costs
 * `checks.yml` 2-5 minutes and `e2e.yml` 17-21 minutes, fanned out to about eight jobs. The
 * previous version of this file held **one lock per pull request** across merge main in → local
 * lanes → mark ready → about 20 minutes of CI → squash merge, and the median gap between merges on
 * `main` was 55 minutes. The target load is 20 people with 20 agents each: about 400 pull requests
 * in a burst, which serial landing turns into roughly 200 hours, and one CI run per pull request
 * at that scale saturates the Actions runners on its own.
 *
 * So the lock now protects a **train**, not a pull request, and a pull request that does not need
 * the lock does not wait for it.
 *
 *   1. **Enqueue, don't lock.** `pnpm pr:land <n>` refuses what it always refused (closed, fork,
 *      conflicting), then puts the `landing-queue` label on the pull request. With the default it
 *      then waits, printing progress, and exits with the pull request's outcome: 0 landed, 1
 *      ejected or closed. `--no-wait` exits right after enqueueing. Whoever finds the lock free
 *      becomes the conductor; `pnpm pr:land --conduct` conducts without queueing anything.
 *   2. **The conductor runs trains.** It takes up to `--batch=<n>` (default 20) queued pull
 *      requests in queue order, creates `train/<timestamp>-<first>` from `origin/main` through the
 *      Git refs API, and merges each component's head into it server-side (`POST .../merges`). A
 *      409 conflict ejects that component with a comment and the train continues without it.
 *   3. **One CI run per train.** The train branch gets its own pull request, opened ready, so its
 *      `opened` event fires the required contexts once for every component. Components stay
 *      drafts and run nothing.
 *   4. **Green → merge.** Before merging, the conductor checks that `main` moved only in files the
 *      train never touched (`strict` is off, so GitHub merges onto today's `main`); an overlap
 *      rebuilds the train. The squash commit lists every component and carries each component's
 *      authors and `Co-authored-by` trailers. Each component is then closed with a comment linking
 *      the train, and its branch is deleted only when `origin/main` provably contains it
 *      (`isContained` from `bundle-branches.mjs`).
 *   5. **Red → bisect.** A red train of more than one component splits into halves that run as
 *      successive trains (bors-style); a red train of one ejects that pull request, naming the
 *      failing contexts and the run. When every failing context is flaky (`--flaky=<name,...>`
 *      or `--allow-failing`), the failed jobs are rerun once before any split or ejection.
 *   6. **Lock-free fast path.** Before enqueueing, a pull request merges immediately, without
 *      the train lock, when all of these hold: every required context is already green on its
 *      head (it was made ready earlier, e.g. `pnpm pr:ci`); `git merge-tree` onto `origin/main` is
 *      clean; the files it changes do not intersect the files `main` changed since its merge base;
 *      no train in flight records a file set that intersects it; and `classify-change` does not
 *      plan the full lanes for it. Each rule prints pass or FAIL. `--no-fast` forces the train.
 *      Fast-path merges serialize on `refs/atlas/landing-fast`, a two-minute lease held only for
 *      the seconds between the last check and the merge call. A train takes the same lease for its
 *      drift check and merge, so a fast path and a train can never interleave check and merge.
 *
 * **Throughput, measured 2026-09-26.** A train costs one CI run (~20 min, ~10 jobs; a public
 * repository runs 20 jobs at once, and the lock keeps one train in flight), so the queue drains at
 * about `--batch` pull requests per 25 minutes: 400 green pull requests in ~8 hours at 20. The
 * weak point is the per-PR red rate `p`: a train of `n` is red with `1 - (1 - p)^n` (64 % at
 * p = 5 %, n = 20) and each red train bisects sequentially. Lower `--batch` when bisects dominate
 * the log; flaky contexts belong in `--flaky`, not in a smaller batch.
 *
 * **Why merging onto a moved `main` is safe here, and exactly when.** Both the fast path and the
 * train merge a tree CI never ran: the tested tree plus whatever reached `main` since. That is
 * sound only when the two differ in files the landing never touched, which is what the disjoint
 * rule and the train's drift check enforce, and the post-merge `push` run on `main` still runs
 * (the workflows' `push: branches: [main]` trigger). Anything that shares a file goes through a
 * train whose CI saw the combination.
 *
 * **What the previous version did that this one no longer does, and why.**
 * - *Local lanes on the merged source.* Every author already ran `pnpm checks:changed`, the train
 *   runs the full required contexts once, and a bisect finds the breaker. Running the local lanes
 *   per component would serialize the conductor by minutes per pull request, which is the cost this
 *   rewrite exists to remove; for the fast path, the disjoint rule already guarantees the merge
 *   cannot change a file the author's own run did not see. `--worktree` is accepted and ignored.
 * - *Merging `main` into each pull request.* The train starts from `main`, so components are never
 *   pushed to, stay drafts, and cost no CI.
 * - *`--parallel-ci`.* Early CI for backlog-only drafts. `pnpm pr:ci <n>` followed by
 *   `pnpm pr:land <n>` does the same for any disjoint change through the fast path. Accepted and
 *   ignored with a note.
 * - *The `refs/atlas/landing-queue` waiting line.* It ordered waiters racing for a per-PR lock.
 *   Order now lives in the label, so a waiter that dies stays queued and still lands.
 *
 * **Why a label is the queue, not a ref.** A label is set and removed atomically per pull request,
 * so two enqueuers can never overwrite each other (the ref was one JSON blob, last write wins,
 * and a waiter could lose its place — measured 2026-09-19). It survives the enqueuing process,
 * which `--no-wait` requires. Listing it is one paginated GraphQL query, which spends the GraphQL
 * budget rather than the REST budget the lock reads already use (2026-09-20: lock and protection
 * reads cost 2 REST each, and twenty-six landers exhausted 5,000/hour). And a person sees the queue
 * in GitHub's own pull-request list and can dequeue by removing the label. Arrival order is the
 * time of the latest `LabeledEvent` for the label.
 *
 * **Why this script and not GitHub's merge queue.** The merge queue requires an
 * organization-owned repository and `wlsdks/ontology-atlas` is owned by a personal account:
 * `POST /repos/.../rulesets` answers `422 Invalid rule 'merge_queue'` (2026-09-12). The workflows
 * carry the `merge_group` trigger, so an organization transfer turns the queue on and leaves this
 * script a wrapper. Train pull requests need no workflow change: `pull_request` has no branch
 * filter, so `train/**` heads run the same required contexts, once.
 *
 * **What is kept.** Never merge a skipped required context (`requiredCheckState`), refuse any
 * unnamed red check (`otherCheckState`, `--allow-failing` escapes only unrequired ones), drafts
 * run no CI, the lock is a Git-refs create (a second creator gets 422), a lease plus the holder's
 * pid proves a dead conductor, and a read that failed never reads as an open door. Never call
 * `gh pr merge` or `gh pr update-branch` by hand and never open a pull request without `--draft`:
 * `.claude/hooks/block-manual-landing.sh` refuses all three. This script is the only caller of the
 * merge API.
 *
 * **Marking ready is still one-way.** A component that was made ready (`pnpm pr:ci`) fires CI on
 * every push. Check `gh pr view <n> --json isDraft` before pushing again to one that failed the
 * fast path, and `gh pr ready --undo` puts it back.
 */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

import { isContained, makeGit, planBundle } from './bundle-branches.mjs';
import { buildImpactPlan } from './classify-change.mjs';
import {
  DEFAULT_BATCH,
  MAX_REBUILDS,
  QUEUE_LABEL,
  composeSquashBody,
  conflictComment,
  describeFastPath,
  describeTrain,
  driftVerdict,
  ejectComment,
  fastPathEligibility,
  landedComment,
  nextTrain,
  parseCoAuthors,
  queueOrder,
  redTrainPlan,
  runIdsFromChecks,
  splitTrain,
  trainBody,
  trainBranchName,
  trainCiStep,
  trainTitle,
  waiterOutcome,
  waiterPollSeconds,
} from './lib/landing-train.mjs';

export const LOCK_REF = 'refs/atlas/landing-lock';

/** Serializes fast-path merges among themselves, for the seconds between last check and merge. */
export const FAST_LOCK_REF = 'refs/atlas/landing-fast';
export const FAST_LEASE_MINUTES = 2;

/**
 * How long a lock survives without a refresh.
 *
 * The conductor rewrites the lock on every poll, so this is not "how long a train may take" but
 * "how long after a crash the next lander waits" on another machine; on this machine a dead pid
 * frees it at once (`classifyHolderLiveness`). Long enough that a live conductor inside one slow
 * CI round is never robbed (the exhaustive lane measured 28 minutes on 2026-09-12).
 */
export const LEASE_MINUTES = 45;

export const POLL_SECONDS = 30;

/**
 * A train with no verdict after this long is closed and the conductor stops, leaving the queue
 * intact. Four times the slowest measured run (e2e 21 minutes), so only a stuck run reaches it.
 */
export const TRAIN_TIMEOUT_MINUTES = 90;

export const CONFLICT_INSTRUCTION =
  'conflicts with main, and only its author can resolve that:\n'
  + '    git fetch origin && git merge origin/main\n'
  + '    # resolve the conflict, commit, then push the branch\n'
  + '  If only generated docs-vault JSON, the changelog or the ledger conflict, do not\n'
  + '  resolve those by hand: `pnpm docs-vault:resolve-conflicts -- --dry-run`, then the\n'
  + '  write command. Then run `pnpm pr:land <number>` again. It was not queued, so\n'
  + '  nothing waits on it meanwhile.';

/** A pull request this script refuses to touch, with the reason a person can act on. */
export function refuseLanding(pr) {
  if (!pr || typeof pr.number !== 'number') return 'no such pull request.';
  if (pr.state !== 'OPEN') {
    return `is ${String(pr.state).toLowerCase()}, not open. Only an open pull request can land.`;
  }
  if (pr.isCrossRepository) {
    return 'comes from a fork. A fork pull request is a security boundary: land it by hand after reading CONTRIBUTING.md.';
  }
  if (pr.baseRefName && pr.baseRefName !== 'main') return `targets ${pr.baseRefName}, not main.`;
  if (String(pr.headRefName ?? '').startsWith('train/')) return 'is a landing train; the conductor lands it.';
  if (pr.mergeStateStatus === 'DIRTY' || pr.mergeable === 'CONFLICTING') return CONFLICT_INSTRUCTION;
  return null;
}

/**
 * Who a lock's token says holds it: the machine and the process id.
 *
 * The token is `${hostname}-${pid}-${Date.now()}`, and a hostname may itself contain dashes, so
 * the two known fields are read from the right. `null` for anything that does not parse, because
 * a token we cannot read is not evidence about anybody.
 */
export function parseLockToken(token) {
  const parts = String(token ?? '').split('-');
  if (parts.length < 3) return null;
  const pid = Number(parts[parts.length - 2]);
  const host = parts.slice(0, -2).join('-');
  if (!host || !Number.isInteger(pid) || pid <= 0) return null;
  return { host, pid };
}

/**
 * Is the process that took this lock still running?
 *
 * ⚠️ **A lease is a guess about liveness; the pid is the fact.** Twice on 2026-09-20 a landing
 * process died holding the lock and it sat for its full 45 minutes with nobody behind it; once it
 * was **561 minutes** old when found.
 *
 * Three answers, never two: `alive`, `dead`, and `unknown`. `unknown` is the honest answer for a
 * lock taken on another machine, and it leaves the lease as the only rule there. The command line
 * is checked, not only the pid's existence: pids are recycled.
 */
export function classifyHolderLiveness(payload, {
  host = hostname(),
  readProcessCommand = (pid) => {
    try {
      return execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // A non-zero exit is `ps` saying no such process, which is the answer we want.
      return '';
    }
  },
} = {}) {
  const token = parseLockToken(payload?.token);
  if (!token) return 'unknown';
  if (token.host !== host) return 'unknown';
  const command = readProcessCommand(token.pid);
  if (!command) return 'dead';
  return command.includes('pr-land') ? 'alive' : 'dead';
}

/**
 * What the lock ref says, and whether it still counts.
 *
 * `unreadable` is deliberately not `free`: a lock whose payload cannot be parsed is still a lock
 * somebody took. `unknown` is the same rule one layer down: a read that never arrived (on
 * 2026-09-19, with the REST quota at 0/5000, `pnpm pr:queue` printed `nothing is landing` while a
 * lock was held and refreshed every minute). A read that did not happen never renders as an open
 * door.
 *
 * A train conductor's payload keeps the numeric `pr` field (the train's pull request, or its first
 * component while it assembles), so an older `pr:land` still running elsewhere reads it as held
 * rather than as unreadable and takeable.
 */
export function classifyLock({
  payload,
  unreadable = null,
  nowMs,
  leaseMinutes = LEASE_MINUTES,
  liveness = classifyHolderLiveness,
}) {
  if (unreadable) return { state: 'unknown', holder: null, ageMinutes: null, failure: unreadable };
  if (payload === null || payload === undefined) return { state: 'free', holder: null, ageMinutes: null };
  const acquiredMs = Date.parse(payload?.acquiredAt ?? '');
  if (!Number.isFinite(acquiredMs) || typeof payload?.pr !== 'number') {
    return { state: 'unreadable', holder: null, ageMinutes: null, payload };
  }
  const ageMinutes = (nowMs - acquiredMs) / 60_000;
  const lease = typeof payload.leaseMinutes === 'number' ? payload.leaseMinutes : leaseMinutes;
  const holderLiveness = liveness(payload);
  const state = holderLiveness === 'dead' || ageMinutes > lease ? 'stale' : 'held';
  return {
    state,
    holder: payload,
    ageMinutes,
    expiresInMinutes: lease - ageMinutes,
    holderLiveness,
  };
}

export function describeLock(lock, nowMs = Date.now()) {
  if (lock.state === 'free') return 'nothing is landing';
  if (lock.state === 'unknown') return `the landing lock could not be read: ${lock.failure?.detail ?? 'the read failed'}`;
  if (lock.state === 'unreadable') {
    return `an unreadable lock (${JSON.stringify(lock.payload)}); it can be taken over once it is older than ${LEASE_MINUTES} minutes`;
  }
  const age = `${lock.ageMinutes.toFixed(0)} min ago`;
  const who = `${lock.holder.holder ?? 'unknown'}@${lock.holder.host ?? 'unknown'}`;
  const subject = 'train' in lock.holder ? describeTrain(lock.holder.train, nowMs) : `PR #${lock.holder.pr}`;
  if (lock.state !== 'stale') return `${subject} held by ${who} since ${age}`;
  const why = lock.holderLiveness === 'dead' ? 'its process is gone' : 'never refreshed: stale';
  return `${subject} held by ${who} since ${age} and ${why}`;
}

/*
 * ------------------------------------------------------------------------------------------------
 * Check verdicts. Shared by the fast path (a component's own head) and the train (its pull request).
 * ------------------------------------------------------------------------------------------------
 */

/** 2 — completed with a real verdict. 1 — still running. 0 — `SKIPPED`. */
function verdictRank(run) {
  const status = String(run?.status ?? run?.state ?? '').toUpperCase();
  const conclusion = String(run?.conclusion ?? run?.state ?? '').toUpperCase();
  if (status !== 'COMPLETED') return 1;
  return conclusion === 'SKIPPED' ? 0 : 2;
}

/**
 * When a rollup entry's check run **started**, which is what orders two runs. `startedAt`, not
 * `completedAt`: a superseded run is cancelled after its successor began, and GitHub writes
 * `0001-01-01T00:00:00Z` as the completion of anything in flight.
 */
function runStamp(run) {
  for (const field of [run?.startedAt, run?.completedAt]) {
    if (!field) continue;
    const ms = Date.parse(field);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

/**
 * The newest real verdict per context name.
 *
 * ⚠️ One name reports several times: a draft's `SKIPPED`, then the real run after `ready`, then a
 * rerun. Keeping whichever the API listed last once read a genuine FAILURE as "never ran" and held
 * the lock 45 minutes (#1578, 2026-09-12); ranking by verdict first then aborted a landing on its
 * own superseded `CANCELLED` run. The newest run wins; the verdict rank breaks ties without stamps.
 */
export function latestByName(rollup = []) {
  const byName = new Map();
  for (const run of rollup) {
    const name = run?.name ?? run?.context;
    if (!name) continue;
    const held = byName.get(name);
    if (!held) {
      byName.set(name, run);
      continue;
    }
    const newer = runStamp(run) - runStamp(held);
    const better = newer > 0 || (newer === 0 && verdictRank(run) > verdictRank(held));
    if (better) byName.set(name, run);
  }
  return byName;
}

function isFailedRun(run) {
  const status = String(run?.status ?? run?.state ?? '').toUpperCase();
  if (status !== 'COMPLETED') return false;
  const conclusion = String(run?.conclusion ?? run?.state ?? '').toUpperCase();
  return conclusion !== 'SUCCESS' && conclusion !== 'SKIPPED';
}

/**
 * **Every check that is not a required context, and whether it failed** (2026-09-13).
 *
 * `windows-beta-check.yml` was red on `main` and on the v1.2.2 release pull request and produces
 * no required context, so "every required context is green" merged it twice. Accepting a red lane
 * is a decision made **by name** (`--allow-failing`), never a blanket `--force`.
 */
export function otherCheckState({ rollup = [], requiredContexts = [], allowFailing = [] }) {
  const required = new Set(requiredContexts);
  const allowed = new Set(allowFailing);
  const failed = [];
  const accepted = [];
  for (const [name, run] of latestByName(rollup)) {
    if (required.has(name) || !isFailedRun(run)) continue;
    const row = {
      name,
      conclusion: String(run.conclusion ?? run.state ?? '').toUpperCase(),
      url: run.detailsUrl ?? run.targetUrl ?? null,
    };
    (allowed.has(name) ? accepted : failed).push(row);
  }
  const unmatched = [...allowed].filter((name) => !accepted.some((row) => row.name === name));
  return { state: failed.length > 0 ? 'failed' : 'clear', failed, accepted, unmatched };
}

/**
 * The required contexts' verdict, read against the protection's own list.
 *
 * **`SKIPPED` is not green**, and that is the draft design's safety catch: a draft's jobs report
 * `skipped`, branch protection counts that as satisfied, and a lander inheriting that reading
 * would merge a tree nothing ran on. `missing` (never reported) and `pending` both wait.
 */
export function requiredCheckState({ rollup = [], requiredContexts = [] }) {
  const byName = latestByName(rollup);
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
    const status = String(run.status ?? run.state ?? '').toUpperCase();
    const conclusion = String(run.conclusion ?? run.state ?? '').toUpperCase();
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

/** Is any check run for this head still queued or running? */
export function runInFlight(pr) {
  return (pr?.statusCheckRollup ?? []).some((run) => {
    const status = String(run?.status ?? run?.state ?? '').toUpperCase();
    return status === 'QUEUED' || status === 'IN_PROGRESS' || status === 'WAITING' || status === 'PENDING';
  });
}

/*
 * ------------------------------------------------------------------------------------------------
 * Reads that can fail, and what a failure is allowed to mean.
 * ------------------------------------------------------------------------------------------------
 */

export function describeReadFailure(output) {
  const text = String(output ?? '');
  if (/rate limit exceeded/i.test(text)) {
    return {
      reason: 'rate-limited',
      detail: 'the shared GitHub REST quota is exhausted (`gh api rate_limit` says when it returns)',
    };
  }
  const first = text.trim().split('\n').find((line) => line.trim().length > 0) ?? '';
  return { reason: 'unreachable', detail: first.trim() || 'the request failed without a message' };
}

/**
 * `{ value }` when the repository answered — including the 404 that means 「there is no such
 * ref」, which arrives as a null value — or `{ failure }` when the request did not happen at all.
 */
export function readOutcome(out) {
  if (typeof out === 'string') {
    try {
      return { value: JSON.parse(out), failure: null };
    } catch {
      return { value: null, failure: { reason: 'unreadable', detail: 'the reply was not JSON' } };
    }
  }
  const text = String(out?.output ?? '');
  if (/HTTP 404|Not Found/i.test(text)) return { value: null, failure: null };
  return { value: null, failure: describeReadFailure(text) };
}

/**
 * The protection's own list, or `null` when the question could not be asked. A 404 here is not an
 * answer: the endpoint answers a caller without admin rights much as it answers a branch with no
 * rule, and 「main declares no required status checks」 is the one sentence that invites a person
 * to go and weaken branch protection.
 */
export function protectionFrom(read) {
  if (read.failure) return { contexts: null, failure: read.failure };
  if (!read.value) {
    return {
      contexts: null,
      failure: { reason: 'unreadable', detail: "main's protection returned no body; 「no rule」 and 「not allowed to look」 read alike here" },
    };
  }
  return { contexts: Array.isArray(read.value.contexts) ? read.value.contexts : [], failure: null };
}

/**
 * **Which worktree a landing removes: `--cleanup`'s path, and nothing else.** `--worktree` never
 * removed anything (2026-09-13, an agent believed it had), and it now does nothing at all.
 */
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

const RETIRED_FLAGS = {
  '--parallel-ci': '--parallel-ci is retired: `pnpm pr:ci <n>` then `pnpm pr:land <n>` lets the fast path merge any disjoint green change',
  '--worktree': '--worktree is retired: a landing runs no local lanes now (each author ran `pnpm checks:changed`; the train runs CI once)',
};

export function parseArgs(argv) {
  const args = {
    numbers: [],
    number: null,
    cleanup: null,
    queue: false,
    release: false,
    ci: false,
    plan: false,
    conduct: false,
    wait: true,
    fast: true,
    batch: DEFAULT_BATCH,
    worktree: null,
    timeoutMinutes: 180,
    allowFailing: [],
    flaky: [],
    notes: [],
  };
  const names = (arg, flag) => {
    const list = arg.slice(flag.length).split(',').map((name) => name.trim()).filter(Boolean);
    if (list.length === 0) throw new Error(`${flag.slice(0, -1)} must name at least one check context`);
    return list;
  };
  const retire = (flag) => {
    if (!args.notes.includes(RETIRED_FLAGS[flag])) args.notes.push(RETIRED_FLAGS[flag]);
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--' || arg === '') continue;
    if (arg === '--queue') args.queue = true;
    else if (arg === '--release') args.release = true;
    else if (arg === '--ci') args.ci = true;
    else if (arg === '--plan') args.plan = true;
    else if (arg === '--conduct') args.conduct = true;
    else if (arg === '--no-wait') args.wait = false;
    else if (arg === '--no-fast') args.fast = false;
    else if (arg === '--parallel-ci') retire(arg);
    else if (arg.startsWith('--batch=')) {
      const size = Number(arg.slice('--batch='.length));
      if (!Number.isInteger(size) || size < 1) throw new Error(`--batch must be a positive integer; received ${arg}`);
      args.batch = size;
    } else if (arg === '--cleanup') {
      args.cleanup = argv[index + 1] ?? null;
      index += 1;
      if (!args.cleanup) throw new Error('--cleanup needs a worktree path');
    } else if (arg.startsWith('--cleanup=')) args.cleanup = arg.slice('--cleanup='.length);
    else if (arg === '--worktree') {
      args.worktree = argv[index + 1] ?? null;
      index += 1;
      if (!args.worktree) throw new Error('--worktree needs a path');
      retire('--worktree');
    } else if (arg.startsWith('--worktree=')) {
      args.worktree = arg.slice('--worktree='.length);
      retire('--worktree');
    } else if (arg.startsWith('--timeout-minutes=')) {
      const minutes = Number(arg.slice('--timeout-minutes='.length));
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new Error(`--timeout-minutes must be positive; received ${arg}`);
      }
      args.timeoutMinutes = minutes;
    } else if (arg.startsWith('--allow-failing=')) {
      args.allowFailing = [...new Set([...args.allowFailing, ...names(arg, '--allow-failing=')])];
    } else if (arg.startsWith('--flaky=')) {
      args.flaky = [...new Set([...args.flaky, ...names(arg, '--flaky=')])];
    } else if (/^#?\d+$/.test(arg)) args.numbers.push(Number(arg.replace('#', '')));
    else throw new Error(`unknown argument: ${arg}`);
  }
  args.number = args.numbers[0] ?? null;
  const modes = [args.queue, args.release, args.ci, args.plan, args.conduct].filter(Boolean).length;
  if (modes > 1) throw new Error('--queue, --release, --ci, --plan and --conduct are separate commands');
  if (args.plan && args.numbers.length === 0) throw new Error('--plan needs at least one pull request number');
  if (args.ci && args.number === null) throw new Error('pnpm pr:ci needs a pull request number');
  if (!args.plan && args.numbers.length > 1) throw new Error('land one pull request per command; `--plan` takes several');
  if (!args.queue && !args.release && !args.conduct && args.number === null) {
    throw new Error('a pull request number is required: pnpm pr:land <number>');
  }
  return args;
}

/*
 * ------------------------------------------------------------------------------------------------
 * The IO shell. Everything below talks to `gh`, `git` and the clock through `deps`, so the tests
 * drive the whole conductor against a fake GitHub and never reach the real one.
 * ------------------------------------------------------------------------------------------------
 */

function ghRun(args, { allowFailure = false } = {}) {
  try {
    // `stdio` is explicit: a tolerated 404 printing `gh: Not Found` reads as a failure mid-run.
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
  'labels',
].join(',');

const QUEUE_QUERY = `query($owner: String!, $name: String!, $endCursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, labels: ["${QUEUE_LABEL}"], first: 50, after: $endCursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url state isDraft mergeable isCrossRepository headRefName headRefOid baseRefName
        timelineItems(itemTypes: [LABELED_EVENT], last: 20) { nodes { ... on LabeledEvent { createdAt label { name } } } }
      }
    }
  }
}`;

/** The GitHub side of `deps`, over the `gh` CLI. */
export function createGithub(slug, run = ghRun) {
  const read = (args) => readOutcome(run(args, { allowFailure: true }));
  const json = (args) => {
    const out = run(args);
    try {
      return JSON.parse(out);
    } catch {
      throw new Error(`gh ${args.slice(0, 3).join(' ')} did not return JSON`);
    }
  };
  const ok = (args) => typeof run(args, { allowFailure: true }) === 'string';
  const writeBlob = (body) => json(['api', '-X', 'POST', `repos/${slug}/git/blobs`, '-f', `content=${JSON.stringify(body)}`, '-f', 'encoding=utf-8']).sha;
  const [owner, name] = slug.split('/');

  return {
    slug,
    readPr: (number) => json(['pr', 'view', String(number), '--json', PR_FIELDS]),
    readPrComments: (number) => json(['pr', 'view', String(number), '--json', 'comments']).comments ?? [],
    listQueue: () => {
      const out = run(['api', 'graphql', '--paginate', '-F', `owner=${owner}`, '-F', `name=${name}`, '-f', `query=${QUEUE_QUERY}`,
        '--jq', '.data.repository.pullRequests.nodes[]']);
      const nodes = String(out).split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line));
      return queueOrder(nodes);
    },
    readRequiredContexts: () => protectionFrom(read(['api', `repos/${slug}/branches/main/protection/required_status_checks`])),
    readLock: (ref) => {
      const refRead = read(['api', `repos/${slug}/git/ref/${ref.replace('refs/', '')}`]);
      if (refRead.failure) return { payload: null, unreadable: refRead.failure };
      const sha = refRead.value?.object?.sha ?? null;
      if (!sha) return { payload: null, unreadable: null };
      const blob = read(['api', `repos/${slug}/git/blobs/${sha}`]);
      if (blob.failure) return { payload: null, unreadable: blob.failure };
      if (!blob.value?.content) return { payload: {}, unreadable: null };
      try {
        const encoding = blob.value.encoding === 'base64' ? 'base64' : 'utf8';
        return { payload: JSON.parse(Buffer.from(blob.value.content, encoding).toString('utf8')), unreadable: null };
      } catch {
        return { payload: {}, unreadable: null };
      }
    },
    takeLock: (ref, body, { force = false } = {}) => {
      const sha = writeBlob(body);
      if (force) return ok(['api', '-X', 'PATCH', `repos/${slug}/git/${ref}`, '-f', `sha=${sha}`, '-F', 'force=true']);
      return ok(['api', '-X', 'POST', `repos/${slug}/git/refs`, '-f', `ref=${ref}`, '-f', `sha=${sha}`]);
    },
    refreshLock: (ref, body) => {
      const sha = writeBlob(body);
      ok(['api', '-X', 'PATCH', `repos/${slug}/git/${ref}`, '-f', `sha=${sha}`, '-F', 'force=true']);
    },
    releaseLock: (ref) => ok(['api', '-X', 'DELETE', `repos/${slug}/git/${ref}`]),
    addLabel: (number) => {
      if (ok(['pr', 'edit', String(number), '--add-label', QUEUE_LABEL])) return true;
      ok(['label', 'create', QUEUE_LABEL, '--color', '5319e7', '--description', 'Queued for the landing train (pnpm pr:land)']);
      return ok(['pr', 'edit', String(number), '--add-label', QUEUE_LABEL]);
    },
    removeLabel: (number) => ok(['pr', 'edit', String(number), '--remove-label', QUEUE_LABEL]),
    comment: (number, body) => ok(['pr', 'comment', String(number), '--body', body]),
    closePr: (number, body) => ok(['pr', 'close', String(number), '--comment', body]),
    createBranch: (branch, sha) => ok(['api', '-X', 'POST', `repos/${slug}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${sha}`]),
    deleteBranch: (branch) => ok(['api', '-X', 'DELETE', `repos/${slug}/git/refs/heads/${branch}`]),
    /**
     * `POST /repos/{owner}/{repo}/merges`: `201` created a merge commit, `204` means the base
     * already contains the head, `409` is a conflict. Server-side; no checkout is touched.
     */
    mergeInto: (base, head, message) => {
      const result = run(['api', '-X', 'POST', `repos/${slug}/merges`, '-f', `base=${base}`, '-f', `head=${head}`, '-f', `commit_message=${message}`],
        { allowFailure: true });
      if (typeof result === 'string') return { state: result.trim() === '' ? 'up-to-date' : 'merged' };
      if (/409|[Mm]erge conflict/.test(result.output ?? '')) return { state: 'conflict', detail: result.output };
      return { state: 'error', detail: result.output };
    },
    openPr: ({ title, head, base, body }) => {
      const created = json(['api', '-X', 'POST', `repos/${slug}/pulls`, '-f', `title=${title}`, '-f', `head=${head}`, '-f', `base=${base}`, '-f', `body=${body}`, '-F', 'draft=false']);
      return { number: created.number, url: created.html_url };
    },
    /** The only merge call in the repository: squash, pinned to the head sha CI measured. */
    mergePr: (number, { sha, title, message = null }) => {
      const args = ['api', '-X', 'PUT', `repos/${slug}/pulls/${number}/merge`, '-f', 'merge_method=squash', '-f', `sha=${sha}`, '-f', `commit_title=${title}`];
      if (message) args.push('-f', `commit_message=${message}`);
      const result = run(args, { allowFailure: true });
      if (typeof result !== 'string') return { ok: false, detail: String(result.output ?? '').trim() };
      try {
        return { ok: JSON.parse(result).merged === true, detail: result.trim() };
      } catch {
        return { ok: false, detail: result.trim() };
      }
    },
    markReady: (number) => ok(['pr', 'ready', String(number)]),
    markDraft: (number) => ok(['pr', 'ready', String(number), '--undo']),
    rerunFailed: (runId) => ok(['run', 'rerun', String(runId), '--failed']),
  };
}

/** The local Git side of `deps`. Reads only, apart from `fetch`. */
export function createGit(cwd) {
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
    for (const fn of [...exits]) {
      exits.delete(fn);
      try { fn(); } catch { /* best effort on the way out */ }
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
    onExit: (fn) => {
      exits.add(fn);
      return () => exits.delete(fn);
    },
    cleanupWorktree: (path) => cleanupWorktree(path, (line) => io.log(`[pr-land] ${line}`)),
  };
}

const hasQueueLabel = (pr) => (pr?.labels ?? []).some((label) => (label?.name ?? label) === QUEUE_LABEL);

function readLockState(deps, ref = LOCK_REF) {
  const { payload, unreadable } = deps.gh.readLock(ref);
  return classifyLock({ payload, unreadable, nowMs: deps.now(), liveness: deps.liveness });
}

/**
 * The conductor's hold on the lock. Every wait while holding goes through `hold`, which renews
 * the lease **before** sleeping: a poll that skipped the refresh would age the lock past its
 * lease under a live conductor and invite the next lander to force-take it.
 */
function makeHolder({ deps, token }) {
  let train = null;
  const since = new Date(deps.now()).toISOString();
  let held = false;
  let unregister = () => {};
  const body = () => ({
    pr: train?.pr ?? train?.components?.[0] ?? 0,
    token,
    holder: deps.user,
    host: deps.host,
    acquiredAt: new Date(deps.now()).toISOString(),
    leaseMinutes: LEASE_MINUTES,
    via: 'pnpm pr:land (train)',
    conductingSince: since,
    train,
  });
  const holder = {
    take: ({ force = false } = {}) => {
      held = deps.gh.takeLock(LOCK_REF, body(), { force });
      if (held) unregister = deps.onExit(() => holder.release());
      return held;
    },
    refresh: () => deps.gh.refreshLock(LOCK_REF, body()),
    update: (patch) => {
      train = patch === null ? null : { ...(train ?? {}), ...patch };
      holder.refresh();
    },
    hold: (seconds) => {
      holder.refresh();
      deps.sleep(seconds);
    },
    release: () => {
      if (!held) return;
      held = false;
      unregister();
      deps.gh.releaseLock(LOCK_REF);
      deps.log('landing lock released');
    },
  };
  return holder;
}

/*
 * ------------------------------------------------------------------------------------------------
 * The fast path.
 * ------------------------------------------------------------------------------------------------
 */

export function evaluateFastPath({ pr, deps, requiredContexts, allowFailing = [] }) {
  const rollup = pr.statusCheckRollup ?? [];
  const checks = requiredCheckState({ rollup, requiredContexts });
  const other = otherCheckState({ rollup, requiredContexts, allowFailing });
  const sha = pr.headRefOid;
  let mergeClean = null;
  let prFiles = null;
  let mainFiles = null;
  let fullPlan = null;
  const fetched = deps.git.fetch(['main', pr.headRefName]);
  const have = fetched && (deps.git.hasCommit(sha) || (deps.git.fetch([sha]) && deps.git.hasCommit(sha)));
  if (have) {
    mergeClean = deps.git.mergeTreeClean('origin/main', sha);
    const base = deps.git.mergeBase('origin/main', sha);
    if (base) {
      const changes = deps.git.diffNameStatus(base, sha);
      mainFiles = deps.git.diffNames(base, 'origin/main');
      if (changes) {
        prFiles = changes.map((change) => change.path);
        fullPlan = buildImpactPlan({
          files: changes.filter((change) => change.status !== 'D').map((change) => change.path),
          deletedFiles: changes.filter((change) => change.status === 'D').map((change) => change.path),
        });
      }
    }
  }
  const lock = readLockState(deps);
  return fastPathEligibility({ checks, other, mergeClean, prFiles, mainFiles, lock, fullPlan });
}

function takeFastLock(deps, token, number) {
  const body = () => ({
    pr: number,
    token,
    holder: deps.user,
    host: deps.host,
    acquiredAt: new Date(deps.now()).toISOString(),
    leaseMinutes: FAST_LEASE_MINUTES,
    via: 'pnpm pr:land (fast path)',
  });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const lock = readLockState(deps, FAST_LOCK_REF);
    if (lock.state === 'free' && deps.gh.takeLock(FAST_LOCK_REF, body())) return true;
    if ((lock.state === 'stale' || lock.state === 'unreadable') && deps.gh.takeLock(FAST_LOCK_REF, body(), { force: true })) return true;
    deps.sleep(5);
  }
  return false;
}

function tryFastPath({ pr, deps, requiredContexts, args, token }) {
  const verdict = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
  deps.log(`fast path for PR #${pr.number}:`);
  for (const line of describeFastPath(verdict)) deps.log(`  ${line}`);
  if (!verdict.eligible) {
    deps.log('not eligible for the fast path; taking the train');
    return false;
  }
  if (!takeFastLock(deps, token, pr.number)) {
    deps.log(`another fast-path merge kept ${FAST_LOCK_REF} for 30 s; taking the train`);
    return false;
  }
  const releaseFast = deps.onExit(() => deps.gh.releaseLock(FAST_LOCK_REF));
  try {
    // Checked again under the fast lock: `main` or the train may have moved since the first read.
    const again = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
    if (!again.eligible) {
      for (const line of describeFastPath(again).filter((l) => l.startsWith('FAIL'))) deps.log(`  now ${line}`);
      deps.log('no longer eligible; taking the train');
      return false;
    }
    const merged = deps.gh.mergePr(pr.number, { sha: pr.headRefOid, title: `${pr.title} (#${pr.number})` });
    if (!merged.ok) {
      deps.log(`GitHub refused the fast-path merge (${merged.detail || 'no detail'}); taking the train`);
      return false;
    }
    deps.log(`PR #${pr.number} merged on the fast path at ${pr.headRefOid.slice(0, 9)}; post-merge CI on main still runs`);
    deps.gh.deleteBranch(pr.headRefName);
    if (hasQueueLabel(pr)) deps.gh.removeLabel(pr.number);
    return true;
  } finally {
    releaseFast();
    deps.gh.releaseLock(FAST_LOCK_REF);
  }
}

/*
 * ------------------------------------------------------------------------------------------------
 * The conductor.
 * ------------------------------------------------------------------------------------------------
 */

function eject(deps, number, body) {
  deps.gh.comment(number, body);
  deps.gh.removeLabel(number);
}

/**
 * One train, start to finish: cut, merge components, open, wait for CI, then merge, split, rerun,
 * rebuild or eject. Returns the outcome for `conduct` to schedule the next train.
 */
export function runTrain({ batch, deps, holder, requiredContexts, args, token = 'train' }) {
  const { gh, git, log } = deps;
  git.fetch(['main', ...batch.map((c) => c.headRefName)]);
  const base = git.revParse('origin/main');
  if (!base) return { outcome: 'abort', reason: 'could not read origin/main after fetching it' };
  const branch = trainBranchName(deps.now(), batch[0].number);
  if (!gh.createBranch(branch, base)) return { outcome: 'abort', reason: `could not create ${branch}` };
  holder.update({ branch, base, components: batch.map((c) => c.number), files: null, pr: null, startedAt: new Date(deps.now()).toISOString() });
  log(`train ${branch} from main@${base.slice(0, 9)}: ${batch.map((c) => `#${c.number}`).join(' ')}`);

  const included = [];
  const errored = [];
  for (const component of batch) {
    const merged = gh.mergeInto(branch, component.headRefOid, `chore(train): merge #${component.number} ${component.headRefName}`);
    if (merged.state === 'merged' || merged.state === 'up-to-date') {
      included.push({ ...component, empty: merged.state === 'up-to-date' });
    } else if (merged.state === 'conflict') {
      log(`#${component.number} conflicts on the train; ejecting it`);
      eject(deps, component.number, conflictComment({ ahead: included.filter((c) => !c.empty) }));
    } else {
      log(`#${component.number} could not be merged onto the train (${String(merged.detail ?? '').trim().split('\n')[0]}); it stays queued`);
      errored.push(component.number);
    }
  }
  const carrying = included.filter((c) => !c.empty);
  if (carrying.length === 0) {
    gh.deleteBranch(branch);
    if (included.length > 0) finishComponents({ deps, components: included, trainHead: null, trainNumber: null, trainUrl: null });
    return { outcome: 'nothing', errored };
  }

  git.fetch([branch]);
  const head = git.revParse(`origin/${branch}`);
  const files = head ? git.diffNames(base, head) : null;
  if (!files) {
    // Without the file set neither the drift check nor a fast-path lander can reason about this
    // train, and a train nobody can reason about must not merge.
    gh.deleteBranch(branch);
    return { outcome: 'abort', reason: `could not fetch ${branch} to read its files`, errored };
  }
  holder.update({ components: included.map((c) => c.number), files });
  const opened = gh.openPr({ title: trainTitle(included), head: branch, base: 'main', body: trainBody({ components: included, base }) });
  holder.update({ pr: opened.number, url: opened.url });
  log(`train #${opened.number} opened ready: one CI run for ${included.length} pull request(s) (${opened.url})`);

  let empty = 0;
  let refires = 0;
  let reruns = 0;
  const giveUpAt = deps.now() + TRAIN_TIMEOUT_MINUTES * 60_000;
  for (;;) {
    holder.hold(POLL_SECONDS);
    if (deps.now() > giveUpAt) {
      gh.closePr(opened.number, `No verdict after ${TRAIN_TIMEOUT_MINUTES} minutes; closed. The components stay queued.`);
      gh.deleteBranch(branch);
      return { outcome: 'abort', reason: `train #${opened.number} had no verdict after ${TRAIN_TIMEOUT_MINUTES} minutes` };
    }
    const trainPr = gh.readPr(opened.number);
    const rollup = trainPr.statusCheckRollup ?? [];
    empty = rollup.length === 0 ? empty + 1 : 0;
    const checks = requiredCheckState({ rollup, requiredContexts });
    const other = otherCheckState({ rollup, requiredContexts, allowFailing: args.allowFailing });
    const step = trainCiStep({ checks, other, inFlight: runInFlight(trainPr), emptyRollupObservations: empty, refires });

    if (step.action === 'wait') continue;
    if (step.action === 'refire') {
      log(`train #${opened.number} reported no run after ${empty} polls; toggling draft to ask GitHub once`);
      gh.markDraft(opened.number);
      gh.markReady(opened.number);
      refires += 1;
      continue;
    }
    if (step.action === 'red') {
      const plan = redTrainPlan({ components: included.map((c) => c.number), failed: step.failed, flaky: [...args.flaky, ...args.allowFailing], reruns });
      if (plan.action === 'rerun') {
        const ids = runIdsFromChecks(step.failed);
        log(`train #${opened.number} red only on flaky context(s) ${plan.names.join(', ')}; rerunning the failed jobs once`);
        for (const id of ids) gh.rerunFailed(id);
        reruns += 1;
        continue;
      }
      const failedLine = step.failed.map((c) => `${c.name} ${c.conclusion}`).join(', ');
      if (plan.action === 'split') {
        const halves = plan.halves.map((half) => half.map((n) => `#${n}`).join(' ')).join(' | ');
        log(`train #${opened.number} is red (${failedLine}); splitting into ${halves}`);
        gh.closePr(opened.number, `Red on ${failedLine}. Split into ${halves}; each half runs as its own train.`);
        gh.deleteBranch(branch);
        return { outcome: 'split', halves: plan.halves };
      }
      const [only] = included;
      log(`train #${opened.number} is red (${failedLine}); ejecting #${only.number}`);
      gh.closePr(opened.number, `Red on ${failedLine}; #${only.number} is ejected from the queue.`);
      gh.deleteBranch(branch);
      const hint = step.failed.some((c) => !requiredContexts.includes(c.name))
        ? ' An unrequired lane can be accepted by name with `--allow-failing=<context>` by whoever conducts.'
        : '';
      eject(deps, only.number, ejectComment({ reason: `train #${opened.number} failed with it alone.${hint}`, failed: step.failed, trainNumber: opened.number }));
      return { outcome: 'ejected', number: only.number };
    }

    // Green. The drift check and the merge run under the fast-path lock, the same lock a fast-path
    // merge holds between its last check and its merge, so neither can land between the other's
    // check and merge (the window left open when only the fast path took it, 2026-09-26).
    if (!takeFastLock(deps, token, opened.number)) {
      log(`a fast-path merge is holding ${FAST_LOCK_REF}; checking again next poll`);
      continue;
    }
    const releaseFast = deps.onExit(() => gh.releaseLock(FAST_LOCK_REF));
    try {
      // Green. Main may have moved while CI ran; only a move into this train's files matters.
      git.fetch(['main']);
      const mainNow = git.revParse('origin/main');
      const drift = driftVerdict({ trainFiles: files, mainFiles: mainNow ? git.diffNames(base, mainNow) : null });
      if (drift.state === 'unknown') {
        log('could not compare main with the train base; checking again next poll');
        continue;
      }
      if (drift.state === 'overlap') {
        log(`main moved into this train's files (${drift.overlap.slice(0, 3).join(', ')}); rebuilding it on today's main`);
        gh.closePr(opened.number, `Green, but main moved into ${drift.overlap.join(', ')} while CI ran. Rebuilt on the new main.`);
        gh.deleteBranch(branch);
        return { outcome: 'rebuild', reason: 'main moved into its files' };
      }
      for (const name of other.unmatched) log(`--allow-failing named ${name}, which is not failing on this train`);
      const accepted = other.accepted.length > 0 ? `, accepting ${other.accepted.map((c) => `${c.name} ${c.conclusion}`).join(', ')}` : '';
      for (const component of included) component.coAuthors = parseCoAuthors(git.coAuthorLog(base, component.headRefOid));
      log(`train #${opened.number} is green on ${trainPr.headRefOid.slice(0, 9)}${accepted}; squash merging`);
      const merged = gh.mergePr(opened.number, {
        sha: trainPr.headRefOid,
        title: `${trainTitle(included)} (#${opened.number})`,
        message: composeSquashBody({ components: included, trainNumber: opened.number }),
      });
      if (!merged.ok && gh.readPr(opened.number).state !== 'MERGED') {
        log(`GitHub refused the train merge (${merged.detail || 'no detail'}); rebuilding`);
        gh.closePr(opened.number, `The merge was refused: ${merged.detail || 'no detail'}. Rebuilt on the new main.`);
        gh.deleteBranch(branch);
        return { outcome: 'rebuild', reason: 'the merge was refused' };
      }
    } finally {
      releaseFast();
      gh.releaseLock(FAST_LOCK_REF);
    }
    log(`train #${opened.number} merged: ${opened.url}`);
    git.fetch(['main', branch, ...included.map((c) => c.headRefName)]);
    finishComponents({ deps, components: included, trainHead: trainPr.headRefOid, trainNumber: opened.number, trainUrl: opened.url });
    gh.deleteBranch(branch);
    return { outcome: 'merged', train: opened.number, landed: included.map((c) => c.number) };
  }
}

/**
 * Close every component a merged train carried, and delete a branch only when `origin/main`
 * provably contains it. Directly (`isContained`), or through the train: the component's sha is an
 * ancestor of the train head and `main` contains the train head. The second form is what proves
 * two components that edited the same file, where a three-way merge of one alone against the
 * squash can conflict.
 */
function finishComponents({ deps, components, trainHead, trainNumber, trainUrl }) {
  const { gh, git, log } = deps;
  const trainContained = trainHead ? git.isContained('origin/main', trainHead) : false;
  for (const component of components) {
    const sha = component.headRefOid;
    const contained = git.isContained('origin/main', sha) || (trainContained && git.isAncestor(sha, trainHead));
    if (!contained) {
      log(`#${component.number}: main does not provably contain ${sha.slice(0, 9)}; left open and queued`);
      continue;
    }
    const current = git.revParse(`origin/${component.headRefName}`);
    const branchKept = current !== null && current !== sha;
    gh.closePr(component.number, landedComment({ trainNumber: trainNumber ?? 'none', trainUrl: trainUrl ?? 'main already contained it', sha, branchKept }));
    gh.removeLabel(component.number);
    if (!branchKept) gh.deleteBranch(component.headRefName);
    log(`#${component.number} closed as landed${branchKept ? '; its branch moved after the train took it, so it was kept' : ' and its branch deleted'}`);
  }
}

/**
 * Hold the lock and run trains until the queue is empty or the deadline passes. Never stops
 * mid-train: the deadline is checked between trains.
 */
export function conduct({ deps, args, requiredContexts, token, force = false, deadline }) {
  const holder = makeHolder({ deps, token });
  if (!holder.take({ force })) return { state: 'lost' };
  deps.log('landing lock acquired: this process conducts trains until the queue is empty');
  let splits = [];
  const rebuilds = new Map();
  const errors = new Map();
  const landed = [];
  try {
    while (deps.now() < deadline) {
      holder.update(null);
      const queue = [];
      for (const pr of deps.gh.listQueue()) {
        const refusal = refuseLanding(pr);
        if (refusal) {
          deps.log(`#${pr.number} ${refusal.split('\n')[0]}; taking it out of the queue`);
          eject(deps, pr.number, refusal === CONFLICT_INSTRUCTION ? conflictComment({}) : ejectComment({ reason: `it ${refusal}` }));
        } else queue.push(pr);
      }
      const next = nextTrain({ queue, splits, batchSize: args.batch });
      splits = next.splits;
      if (next.batch.length === 0) {
        deps.log('the queue is empty');
        return { state: 'drained', landed };
      }
      const result = runTrain({ batch: next.batch, deps, holder, requiredContexts, args, token });
      const key = next.batch.map((c) => c.number).join(',');
      if (result.outcome === 'merged') landed.push(...result.landed);
      else if (result.outcome === 'split') splits = [...result.halves, ...splits];
      else if (result.outcome === 'rebuild') {
        const count = (rebuilds.get(key) ?? 0) + 1;
        rebuilds.set(key, count);
        const numbers = next.batch.map((c) => c.number);
        if (count <= MAX_REBUILDS) splits = [numbers, ...splits];
        else if (numbers.length > 1) splits = [...splitTrain(numbers), ...splits];
        else eject(deps, numbers[0], ejectComment({ reason: `main kept moving into its files; ${MAX_REBUILDS} rebuilds did not settle` }));
      } else if (result.outcome === 'abort') {
        deps.error(`the train stopped: ${result.reason}`);
        return { state: 'aborted', landed };
      }
      for (const number of result.errored ?? []) {
        const count = (errors.get(number) ?? 0) + 1;
        errors.set(number, count);
        if (count >= 2) eject(deps, number, ejectComment({ reason: 'GitHub refused to merge it onto two trains for a reason other than a conflict' }));
      }
    }
    deps.log('deadline reached between trains; handing the queue to the next lander');
    return { state: 'deadline', landed };
  } finally {
    holder.release();
  }
}

/*
 * ------------------------------------------------------------------------------------------------
 * Commands.
 * ------------------------------------------------------------------------------------------------
 */

function queuePosition(queue, number) {
  const index = queue.findIndex((pr) => pr.number === number);
  return index === -1 ? null : index + 1;
}

function waitForOutcome({ number, sinceIso, deps, args, requiredContexts, token, deadline }) {
  let lastLine = '';
  let queue = null;
  let queueReadAt = Number.NEGATIVE_INFINITY;
  while (deps.now() < deadline) {
    const pr = deps.gh.readPr(number);
    const needsComments = pr.state !== 'OPEN' || !hasQueueLabel(pr);
    const outcome = waiterOutcome({ pr, comments: needsComments ? deps.gh.readPrComments(number) : [], sinceIso });
    if (outcome.exitCode !== null) return reportOutcome({ number, outcome, deps, args });

    const lock = readLockState(deps);
    if (lock.state === 'free' || lock.state === 'stale' || lock.state === 'unreadable') {
      if (lock.state !== 'free') deps.log(`taking over a lock nobody holds any more: ${describeLock(lock, deps.now())}`);
      const result = conduct({ deps, args, requiredContexts, token, force: lock.state !== 'free', deadline });
      if (result.state === 'lost') deps.log('another lander took the lock first; waiting behind it');
      if (result.state === 'aborted') {
        deps.error(`PR #${number} stays queued; \`pnpm pr:land --conduct\` resumes once the cause above is fixed`);
        return 1;
      }
      continue;
    }
    if (deps.now() - queueReadAt >= 10 * 60_000) {
      queue = deps.gh.listQueue();
      queueReadAt = deps.now();
    }
    const position = queuePosition(queue ?? [], number);
    const line = `queued${position ? ` at ${position} of ${queue.length}` : ''}; landing now: ${describeLock(lock, deps.now())}`;
    if (line !== lastLine) deps.log(line);
    lastLine = line;
    deps.sleep(waiterPollSeconds(position, args.batch));
  }
  deps.error(`stopped waiting after ${args.timeoutMinutes} minutes. PR #${number} stays queued and the next conductor lands it;`);
  deps.error(`\`gh pr edit ${number} --remove-label ${QUEUE_LABEL}\` takes it out.`);
  return 1;
}

function reportOutcome({ number, outcome, deps, args }) {
  if (outcome.state === 'merged' || outcome.state === 'landed') {
    deps.log(`PR #${number} ${outcome.state === 'merged' ? 'is merged' : 'landed through a train'}`);
    deps.git.prune();
    const removal = worktreeToRemove(args);
    if (removal) deps.cleanupWorktree(removal);
    return 0;
  }
  if (outcome.state === 'ejected') {
    deps.error(`PR #${number} was taken out of the queue:`);
    for (const line of String(outcome.comment?.body ?? '').split('\n').filter((l) => l && !l.startsWith('<!--'))) deps.error(`  ${line}`);
    return 1;
  }
  if (outcome.state === 'closed') deps.error(`PR #${number} was closed without landing`);
  else deps.error(`PR #${number} lost the \`${QUEUE_LABEL}\` label without a conductor comment; someone dequeued it`);
  return 1;
}

function readProtection(deps) {
  const protection = deps.gh.readRequiredContexts();
  if (protection.failure) {
    deps.error(`could not read main's required status checks: ${protection.failure.detail}`);
    deps.error("this says nothing about main's protection; try again once the read works");
    return null;
  }
  if (protection.contexts.length === 0) {
    deps.error('main declares no required status checks; refusing to land without a gate');
    return null;
  }
  return protection.contexts;
}

function landOne({ args, deps }) {
  const number = args.number;
  const pr = deps.gh.readPr(number);
  if (pr?.state === 'MERGED') {
    deps.log(`PR #${number} is already merged: ${pr.url}`);
    const removal = worktreeToRemove(args);
    if (removal) deps.cleanupWorktree(removal);
    return 0;
  }
  const refusal = refuseLanding(pr);
  if (refusal) {
    deps.error(`PR #${number} ${refusal}`);
    return 1;
  }
  const requiredContexts = readProtection(deps);
  if (!requiredContexts) return 1;
  deps.log(`PR #${number} ${pr.title}`);
  const token = `${deps.host}-${deps.pid}-${deps.now()}`;

  if (args.fast && tryFastPath({ pr, deps, requiredContexts, args, token })) {
    return reportOutcome({ number, outcome: { state: 'merged' }, deps, args });
  }

  const sinceIso = new Date(deps.now()).toISOString();
  if (!hasQueueLabel(pr) && !deps.gh.addLabel(number)) {
    deps.error(`could not put the \`${QUEUE_LABEL}\` label on PR #${number}; nothing was queued`);
    return 1;
  }
  deps.log(`PR #${number} is queued for the next train (label \`${QUEUE_LABEL}\`)`);
  if (!args.wait) {
    const lock = readLockState(deps);
    deps.log(lock.state === 'free'
      ? 'nobody is conducting: run `pnpm pr:land --conduct`, or any waiting `pnpm pr:land`, to start the train'
      : `landing now: ${describeLock(lock, deps.now())}. \`pnpm pr:queue\` shows the line.`);
    return 0;
  }
  const deadline = deps.now() + args.timeoutMinutes * 60_000;
  return waitForOutcome({ number, sinceIso, deps, args, requiredContexts, token, deadline });
}

function conductOnly({ args, deps }) {
  const requiredContexts = readProtection(deps);
  if (!requiredContexts) return 1;
  const lock = readLockState(deps);
  if (lock.state === 'held' || lock.state === 'unknown') {
    deps.log(`not conducting: ${describeLock(lock, deps.now())}`);
    return lock.state === 'held' ? 0 : 1;
  }
  const token = `${deps.host}-${deps.pid}-${deps.now()}`;
  const result = conduct({ deps, args, requiredContexts, token, force: lock.state !== 'free', deadline: deps.now() + args.timeoutMinutes * 60_000 });
  if (result.state === 'lost') {
    deps.log('another lander took the lock first; it conducts');
    return 0;
  }
  return result.state === 'aborted' ? 1 : 0;
}

/**
 * `pnpm pr:land --plan <n...>`: what would happen, from reads alone. Fetches locally, reads the
 * pull requests, the protection, the lock and the queue, and trial-merges on throwaway commits.
 * It never writes to GitHub: no label, ref, comment, pull request or merge.
 */
export function planLanding({ args, deps }) {
  const requiredContexts = readProtection(deps);
  if (!requiredContexts) return 1;
  const lock = readLockState(deps);
  deps.log(`landing now: ${describeLock(lock, deps.now())}`);
  const joining = [];
  for (const number of args.numbers) {
    const pr = deps.gh.readPr(number);
    if (pr?.state === 'MERGED') {
      deps.log(`PR #${number}: already merged`);
      continue;
    }
    const refusal = refuseLanding(pr);
    if (refusal) {
      deps.log(`PR #${number}: would be refused — ${refusal.split('\n')[0]}`);
      continue;
    }
    if (args.fast) {
      const verdict = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
      deps.log(`PR #${number}: fast path ${verdict.eligible ? 'eligible' : 'not eligible'}`);
      for (const line of describeFastPath(verdict)) deps.log(`  ${line}`);
      if (verdict.eligible) {
        deps.log(`PR #${number}: would squash-merge now at ${pr.headRefOid.slice(0, 9)}, without the train lock`);
        continue;
      }
    }
    deps.log(`PR #${number}: would be queued with the \`${QUEUE_LABEL}\` label`);
    joining.push({ ...pr, queuedAt: new Date(deps.now()).toISOString() });
  }

  const queued = deps.gh.listQueue();
  const combined = [...queued, ...joining.filter((pr) => !queued.some((q) => q.number === pr.number))];
  const { batch } = nextTrain({ queue: combined, batchSize: args.batch });
  if (batch.length === 0) {
    deps.log('no train would run: the queue would be empty');
    return 0;
  }
  if (lock.state === 'held') deps.log('a train is in flight; the train below forms after it');
  deps.log(`next train (${batch.length} of ${combined.length} queued): ${trainTitle(batch)}`);
  deps.log(`  branch ${trainBranchName(deps.now(), batch[0].number)} from origin/main`);
  deps.git.fetch(['main', ...batch.map((c) => c.headRefName)]);
  const trial = deps.git.trialMerge('origin/main', batch.map((c) => c.headRefOid));
  for (const component of batch) {
    const row = trial.find((r) => r.sha === component.headRefOid);
    const verdict = !row ? 'not measured'
      : row.conflicts.length > 0 ? `would conflict and be ejected (${row.conflicts.join(', ')})`
        : row.state === 'pending' ? 'merges cleanly' : `adds nothing (${row.state})`;
    deps.log(`  #${component.number} ${component.headRefName}@${String(component.headRefOid).slice(0, 9)}: ${verdict}`);
  }
  for (const component of batch) component.coAuthors = parseCoAuthors(deps.git.coAuthorLog('origin/main', component.headRefOid));
  deps.log('squash commit, if green:');
  for (const line of composeSquashBody({ components: batch, trainNumber: '<train>' }).split('\n')) deps.log(`  | ${line}`);
  deps.log('dry run: nothing was written to GitHub');
  return 0;
}

export function printQueue({ deps, io = console }) {
  const lock = readLockState(deps);
  io.log(`[pr-queue] landing now: ${describeLock(lock, deps.now())}`);
  const trainPr = lock.holder?.train?.pr;
  if (trainPr) {
    const protection = deps.gh.readRequiredContexts();
    const pr = deps.gh.readPr(trainPr);
    if (protection.contexts && pr) {
      const checks = requiredCheckState({ rollup: pr.statusCheckRollup ?? [], requiredContexts: protection.contexts });
      const green = protection.contexts.length - checks.pending.length - checks.unrun.length - checks.failed.length;
      io.log(`[pr-queue]   CI on train #${trainPr}: ${green} green, ${checks.pending.length} running, ${checks.unrun.length} not reported, ${checks.failed.length} failed (${pr.url})`);
    }
  }
  const queue = deps.gh.listQueue();
  if (queue.length === 0) {
    io.log('[pr-queue] queue: empty');
  } else {
    io.log(`[pr-queue] queue: ${queue.length} pull request(s), oldest first; the next train takes up to ${DEFAULT_BATCH}`);
    const riding = new Set(lock.holder?.train?.components ?? []);
    queue.forEach((pr, index) => {
      const minutes = pr.queuedAt ? Math.max(0, Math.round((deps.now() - Date.parse(pr.queuedAt)) / 60_000)) : null;
      io.log(`[pr-queue]   ${index + 1}. #${pr.number}${riding.has(pr.number) ? ' (on the train)' : ''}${minutes === null ? '' : ` queued ${minutes} min`}  ${String(pr.title ?? '').slice(0, 60)}`);
    });
    if (lock.state === 'free') io.log('[pr-queue] nobody is conducting: `pnpm pr:land --conduct` starts the train');
  }
  io.log('[pr-queue] queue one with `pnpm pr:land <number>`; never `gh pr merge` by hand.');
  return 0;
}

export function runPrLand(argv, io = console, makeDeps = defaultDeps) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.error(`[pr-land] ${error.message}`);
    return 2;
  }
  for (const note of args.notes) io.log(`[pr-land] ${note}`);
  const deps = makeDeps(io);

  if (args.queue) return printQueue({ deps, io });

  if (args.release) {
    const lock = readLockState(deps);
    if (lock.state === 'unknown') {
      deps.error(`${describeLock(lock, deps.now())}; not releasing a lock nobody can see`);
      return 1;
    }
    if (lock.state === 'free') {
      deps.log('the landing lock is already free');
      return 0;
    }
    deps.log(`releasing the landing lock: ${describeLock(lock, deps.now())}`);
    deps.gh.releaseLock(LOCK_REF);
    return 0;
  }

  if (args.ci) {
    // Opt-in early CI: a draft that wants a round now, so the fast path can take it once green.
    const pr = deps.gh.readPr(args.number);
    if (!pr.isDraft) {
      deps.log(`PR #${args.number} is already ready; CI has been asked for`);
      return 0;
    }
    deps.gh.markReady(args.number);
    deps.log(`PR #${args.number} is ready: one CI run is now firing. Once green, \`pnpm pr:land ${args.number}\` can take the fast path.`);
    return 0;
  }

  if (args.plan) return planLanding({ args, deps });
  if (args.conduct) return conductOnly({ args, deps });
  return landOne({ args, deps });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runPrLand(process.argv.slice(2));
}
