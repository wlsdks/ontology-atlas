/** Merging a pull request directly: the fast-path check, its short lock, and waiting on its own CI. */

import { buildImpactPlan } from '../../../ci/classify-change.mjs';
import {
  EMPTY_BEFORE_REFIRE,
  describeFastPath,
  fastPathEligibility,
  runIdsFromChecks,
  trainCiStep,
} from '../landing-train.mjs';
import { otherCheckState, requiredCheckState, runInFlight, runStillGoing } from './check-state.mjs';
import { FAST_LEASE_MINUTES, FAST_LOCK_REF } from './landing-lock.mjs';
import { hasQueueLabel, readLockState } from './landing-state.mjs';

/**
 * How often `pnpm pr:land <n>` reads its own pull request's CI. One GraphQL read each, none from
 * the shared REST quota; a run takes minutes, so 20 s adds about 10 s on average.
 */
const OWN_CI_POLL_SECONDS = 20;

export function evaluateFastPath({ pr, deps, requiredContexts, allowFailing = [] }) {
  const rollup = pr.statusCheckRollup ?? [];
  const checks = requiredCheckState({ rollup, requiredContexts });
  const other = otherCheckState({ rollup, requiredContexts, allowFailing });
  const sha = pr.headRefOid;
  let mergeClean = null;
  let containsMain = null;
  let prFiles = null;
  let mainFiles = null;
  let fullPlan = null;
  const fetched = deps.git.fetch(['main', pr.headRefName]);
  const have = fetched && (deps.git.hasCommit(sha) || (deps.git.fetch([sha]) && deps.git.hasCommit(sha)));
  if (have) {
    mergeClean = deps.git.mergeTreeClean('origin/main', sha);
    const mainSha = deps.git.revParse('origin/main');
    containsMain = mainSha ? deps.git.isAncestor(mainSha, sha) : null;
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
  return { ...fastPathEligibility({ checks, other, mergeClean, containsMain, prFiles, mainFiles, lock, fullPlan }), checks, other };
}

export function takeFastLock(deps, token, number) {
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

/** `{ merged, verdict }`: `verdict` is the first reading, which `landingRoute` routes when it did not merge. */
export function tryFastPath({ pr, deps, requiredContexts, args, token }) {
  const verdict = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
  deps.log(`fast path for PR #${pr.number}:`);
  for (const line of describeFastPath(verdict)) deps.log(`  ${line}`);
  if (!verdict.eligible) return { merged: false, verdict };
  if (!takeFastLock(deps, token, pr.number)) {
    deps.log(`another fast-path merge kept ${FAST_LOCK_REF} for 30 s; taking the train`);
    return { merged: false, verdict: null };
  }
  const releaseFast = deps.onExit(() => deps.gh.releaseLock(FAST_LOCK_REF));
  try {
    // Checked again under the fast lock: `main` or the train may have moved since the first read.
    const again = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
    if (!again.eligible) {
      for (const line of describeFastPath(again).filter((l) => l.startsWith('FAIL'))) deps.log(`  now ${line}`);
      deps.log('no longer eligible; taking the train');
      return { merged: false, verdict: null };
    }
    const merged = deps.gh.mergePr(pr.number, { sha: pr.headRefOid, method: 'merge', title: `${pr.title} (#${pr.number})` });
    if (!merged.ok) {
      deps.log(`GitHub refused the fast-path merge (${merged.detail || 'no detail'}); taking the train`);
      return { merged: false, verdict: null };
    }
    deps.log(`PR #${pr.number} merged on the fast path at ${pr.headRefOid.slice(0, 9)}; post-merge CI on main still runs`);
    deps.gh.deleteBranch(pr.headRefName);
    if (hasQueueLabel(pr)) deps.gh.removeLabel(pr.number);
    return { merged: true, verdict: again };
  } finally {
    releaseFast();
    deps.gh.releaseLock(FAST_LOCK_REF);
  }
}

/**
 * Run a pull request's own CI and wait for its verdict: mark a draft ready, which fires the one
 * run, then read its required contexts every `OWN_CI_POLL_SECONDS`. `green` and `red` carry the
 * last read; `stopped` says why it gave up, and the caller decides what that costs.
 */
export function awaitOwnCi({ pr, deps, args, requiredContexts, deadline, red = null }) {
  const { gh, log } = deps;
  // One rerun of only the failed jobs per head: a red train's head often goes green on the next train,
  // and the failed jobs take about half a run. `tryRerun` answers `rerun`, `wait` (the run still has
  // jobs going; GitHub reruns only a finished run), `not-run` (only cancellations: something replaced
  // the run) or the reason it hands the pull request back.
  let rerunHead = null;
  const tryRerun = (failed, sha, rollup) => {
    if (rerunHead === sha) return 'its failed jobs were rerun once already';
    if (!failed.some((check) => check.conclusion === 'FAILURE')) return 'not-run';
    const ids = runIdsFromChecks(failed);
    if (ids.length === 0) return 'no workflow run to rerun was named';
    if (ids.some((id) => runStillGoing(rollup, id))) return 'wait';
    // A run on a second attempt was rerun already, by this lander or anyone; an unreadable attempt
    // is not a first.
    if (ids.some((id) => (gh.readRunAttempt?.(id) ?? null) !== 1)) return 'its run was rerun already';
    rerunHead = sha;
    if (ids.some((id) => !gh.rerunFailed(id))) return `GitHub refused to rerun run ${ids.join(', ')}`;
    log(`PR #${pr.number} is red on ${failed.map((check) => check.name).join(', ')} at ${sha.slice(0, 9)}; `
      + `re-running only the failed jobs of run ${ids.join(', ')} once on the same head before handing it back`);
    return 'rerun';
  };
  let cancelledReads = 0;
  if (red) {
    const first = tryRerun(red, pr.headRefOid, pr.statusCheckRollup ?? []);
    if (!['rerun', 'wait', 'not-run'].includes(first)) return { state: 'red', failed: red, pr, reran: false, why: first };
    if (first !== 'rerun') log(`PR #${pr.number}'s red run is ${first === 'wait' ? 'still finishing' : 'cancelled, not failed'}; waiting before judging it`);
  } else if (pr.isDraft) {
    if (!gh.markReady(pr.number)) return { state: 'stopped', reason: 'GitHub refused to mark it ready, so its CI never started' };
    log(`PR #${pr.number} was a draft; marked ready, so its own CI runs now instead of a train's`);
  } else log(`PR #${pr.number}'s own CI is running on ${pr.headRefOid.slice(0, 9)}; waiting for it instead of a train`);
  let head = pr.headRefOid;
  let idle = 0;
  let refires = 0;
  let current = pr;
  while (deps.now() < deadline) {
    deps.sleep(OWN_CI_POLL_SECONDS);
    current = gh.readPr(pr.number);
    if (current.state !== 'OPEN') return { state: 'stopped', reason: `it is ${String(current.state).toLowerCase()} now`, pr: current };
    if (current.isDraft) return { state: 'stopped', reason: 'it was turned back into a draft while its CI ran', pr: current };
    if (current.headRefOid !== head) {
      log(`PR #${pr.number}'s head moved to ${current.headRefOid.slice(0, 9)}; waiting for that push's CI`);
      head = current.headRefOid;
      idle = 0;
      cancelledReads = 0;
    }
    const rollup = current.statusCheckRollup ?? [];
    const checks = requiredCheckState({ rollup, requiredContexts });
    const other = otherCheckState({ rollup, requiredContexts, allowFailing: args.allowFailing });
    const inFlight = runInFlight(current);
    idle = checks.neverRan && !inFlight ? idle + 1 : 0;
    const step = trainCiStep({ checks, other, inFlight, emptyRollupObservations: idle, refires });
    if (step.action === 'refire') {
      log(`PR #${pr.number} reported no run after ${idle} reads; toggling draft to ask GitHub once`);
      gh.markDraft(pr.number);
      gh.markReady(pr.number);
      refires += 1;
      idle = 0;
    } else if (step.action === 'red') {
      const verdict = tryRerun(step.failed, current.headRefOid, rollup);
      if (verdict === 'rerun' || verdict === 'wait') continue;
      if (verdict === 'not-run') {
        cancelledReads += 1;
        if (cancelledReads >= EMPTY_BEFORE_REFIRE) {
          return { state: 'stopped', reason: `its run on ${current.headRefOid.slice(0, 9)} was cancelled and nothing replaced it`, pr: current };
        }
        continue;
      }
      const reran = rerunHead === current.headRefOid && verdict === 'its failed jobs were rerun once already';
      return { state: 'red', failed: step.failed, pr: current, reran, why: reran ? null : verdict };
    }
    else if (step.action === 'green') return { state: 'green', pr: current };
  }
  return { state: 'stopped', reason: `its CI gave no verdict within ${args.timeoutMinutes} minutes`, pr: current };
}
