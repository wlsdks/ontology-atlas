#!/usr/bin/env node
/**
 * `pnpm pr:land <n>` is the only way a PR reaches `main`. A head that contains today's `main` and
 * overlaps no train in flight takes the lock-free fast path on its own CI: a draft is marked ready,
 * its one run is awaited, and green merges it directly; red goes back to its author unqueued.
 * Anything else enqueues with the `landing-queue` label, and the lock-holding conductor merges
 * queued PRs into a train with one CI run, bisecting red trains.
 */

import { runMainCopyIfStale } from '../lib/landing/run-main-copy.mjs';
import { DEFAULT_BATCH, QUEUE_LABEL, landingRoute, waiterOutcome, waiterPollSeconds } from '../lib/landing/landing-train.mjs';
import { awaitOwnCi, tryFastPath } from '../lib/landing/pr-land/direct-merge.mjs';
import { worktreeToRemove, defaultDeps } from '../lib/landing/pr-land/landing-deps.mjs';
import { LOCK_REF, describeLock } from '../lib/landing/pr-land/landing-lock.mjs';
import { missingChangeRecord, refuseLanding } from '../lib/landing/pr-land/landing-refusals.mjs';
import { hasQueueLabel, queueNeedsConductorOrWarn, queueNeedsConductor, readLockState, readProtection } from '../lib/landing/pr-land/landing-state.mjs';
import { planLanding, printQueue } from '../lib/landing/pr-land/landing-reports.mjs';
import { parseArgs } from '../lib/landing/pr-land/land-args.mjs';
import { mainHealthWarnings } from '../lib/landing/pr-land/main-health.mjs';
import { conduct } from '../lib/landing/pr-land/train-conductor.mjs';

/** Conduct the queue a direct merge would otherwise leave unconducted. `null` when there was none. */
function conductLeftovers({ deps, args, requiredContexts, token, deadline, except }) {
  if (!queueNeedsConductor(deps, except)) return null;
  const lock = readLockState(deps);
  deps.log('pull requests are queued and nobody conducts them; conducting them before leaving');
  return conduct({ deps, args, requiredContexts, token, force: lock.state !== 'free', deadline }).state;
}

/** A red own run goes back to its author with the contexts and the ways forward. */
function reportOwnRed({ number, failed, deps, reran = false, why = null }) {
  const after = reran ? ', again after one rerun of the failed jobs' : why ? ` and was not rerun (${why})` : '';
  deps.error(`PR #${number} is red on its own CI${after}; nothing was queued:`);
  for (const check of failed) deps.error(`  ${check.name} ${check.conclusion ?? ''} ${check.url ?? ''}`.trimEnd());
  deps.error('  Fix it and push: the pull request is ready now, so the push runs CI again. Then');
  deps.error(`  \`pnpm pr:land ${number}\` again. A context known to flake: add \`--flaky=<context>\`, and the`);
  deps.error('  train reruns it once.');
  return 1;
}

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
    deps.sleep(waiterPollSeconds(position, args.batch ?? DEFAULT_BATCH));
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

function landOne({ args, deps }) {
  const number = args.number;
  const pr = deps.gh.readPr(number);
  if (pr?.state === 'MERGED') {
    deps.log(`PR #${number} is already merged: ${pr.url}`);
    const removal = worktreeToRemove(args);
    if (removal) deps.cleanupWorktree(removal);
    return 0;
  }
  const refusal = refuseLanding(pr) ?? missingChangeRecord(pr, () => deps.gh.readChangedFiles(number));
  if (refusal) {
    deps.error(`PR #${number} ${refusal}`);
    return 1;
  }
  const requiredContexts = readProtection(deps);
  if (!requiredContexts) return 1;
  deps.log(`PR #${number} ${pr.title}`);
  for (const warning of mainHealthWarnings(deps)) deps.error(`warning: ${warning}`);
  const token = `${deps.host}-${deps.pid}-${deps.now()}`;
  const deadline = deps.now() + args.timeoutMinutes * 60_000;
  const tolerated = [...args.flaky, ...args.allowFailing];

  let current = pr;
  if (args.fast) {
    const direct = () => {
      const code = reportOutcome({ number, outcome: { state: 'merged' }, deps, args });
      // A direct merge leaves no queue behind: whatever waits with nobody conducting is conducted
      // now. This pull request is merged either way, so a failure here is a warning.
      try {
        const leftovers = conductLeftovers({ deps, args, requiredContexts, token, deadline, except: number });
        if (leftovers === 'aborted') deps.error('warning: the queue this lander picked up stopped; `pnpm pr:land --conduct` resumes it');
      } catch (error) {
        deps.error(`warning: PR #${number} is merged, but the queue behind it could not be conducted (${error.message}); \`pnpm pr:land --conduct\` resumes it`);
      }
      return code;
    };
    let attempt = tryFastPath({ pr: current, deps, requiredContexts, args, token });
    if (attempt.merged) return direct();
    const route = attempt.verdict
      ? landingRoute({ verdict: attempt.verdict, checks: attempt.verdict.checks, other: attempt.verdict.other, tolerated })
      : { route: 'train', blockers: [] };
    const ownRoute = route.route === 'own-ci' || route.route === 'red';
    // A queued pull request is the conductor's; one that waits unconducted means this lander conducts.
    const yieldTo = !ownRoute ? null
      : hasQueueLabel(current) ? 'it is already queued for a train'
        : args.wait && queueNeedsConductorOrWarn(deps, number) ? 'other pull requests are queued and nobody conducts them' : null;
    if (yieldTo) deps.log(`taking the train: ${yieldTo}`);
    else if (route.route === 'red' && !args.wait) return reportOwnRed({ number, failed: route.failed, deps });
    // `--no-wait` keeps its meaning: queue and leave. Waiting on its own run is for a lander that stays.
    else if ((route.route === 'own-ci' || route.route === 'red') && args.wait) {
      const own = awaitOwnCi({ pr: current, deps, args, requiredContexts, deadline, red: route.route === 'red' ? route.failed : null });
      current = own.pr ?? current;
      if (own.state === 'red' && !own.failed.every((check) => tolerated.includes(check.name))) {
        return reportOwnRed({ number, failed: own.failed, deps, reran: own.reran, why: own.why });
      }
      if (own.state === 'stopped') {
        deps.error(`PR #${number} stopped waiting for its own CI: ${own.reason}; nothing was queued`);
        return 1;
      }
      if (own.state === 'green') {
        attempt = tryFastPath({ pr: current, deps, requiredContexts, args, token });
        if (attempt.merged) return direct();
      }
      deps.log(own.state === 'red'
        ? `PR #${number}'s own CI is red only on ${own.failed.map((check) => check.name).join(', ')}, named as tolerated; the train reruns it`
        : `PR #${number}'s own CI is green, but it cannot merge directly; the train runs it on today's main`);
    } else if (route.route === 'train' && route.blockers.length > 0) {
      deps.log(`taking the train: ${route.blockers.join(', ')}`);
    } else if (route.route !== 'merge') deps.log('taking the train');
  }

  const sinceIso = new Date(deps.now()).toISOString();
  if (!hasQueueLabel(current) && !deps.gh.addLabel(number)) {
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
    // Early CI: the author is done, so the one run starts now and is ready, or nearly, at landing.
    const pr = deps.gh.readPr(args.number);
    if (!pr.isDraft) {
      deps.log(`PR #${args.number} is already ready; CI has been asked for`);
      return 0;
    }
    deps.gh.markReady(args.number);
    deps.log(`PR #${args.number} is ready: one CI run is now firing, and every later push runs it again. \`pnpm pr:land ${args.number}\` waits for it and merges directly when the branch contains main.`);
    return 0;
  }

  if (args.plan) return planLanding({ args, deps });
  if (args.conduct) return conductOnly({ args, deps });
  return landOne({ args, deps });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  // The conductor's code is shared infrastructure: run main's copy when this checkout's is older.
  const argv = process.argv.slice(2);
  process.exitCode = runMainCopyIfStale({ entry: 'scripts/landing/pr-land.mjs', argv }) ?? runPrLand(argv);
}
