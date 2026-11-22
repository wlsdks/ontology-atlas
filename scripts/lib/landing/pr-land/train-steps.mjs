/** One train's life: cut from a base, polled for its CI verdict, settled at the head, or discarded. */

import {
  RED_CLOSE_PREFIX,
  componentCommit,
  conflictComment,
  driftVerdict,
  ejectComment,
  landedComment,
  mergeCommitMessage,
  mergeCommitTitle,
  parseCoAuthors,
  redTrainPlan,
  runIdsFromChecks,
  trainBody,
  trainBranchName,
  trainCiStep,
  trainTitle,
} from '../landing-train.mjs';
import { otherCheckState, requiredCheckState, runInFlight, runStillGoing } from './check-state.mjs';
import { takeFastLock } from './direct-merge.mjs';
import { FAST_LOCK_REF } from './landing-lock.mjs';
import { mainBrowserNotes } from './main-health.mjs';
import { UNREPORTED_GRACE_MS, allRunsFinished, brokenRuns } from './workflow-runs.mjs';

/**
 * A train with no result after this long is closed and the conductor stops, leaving the queue
 * intact. Four times the slowest CI run, so only a stuck run reaches it.
 */
const TRAIN_TIMEOUT_MINUTES = 90;

/** How often a train still missing a required context reads its head's workflow runs. */
const RUN_READ_INTERVAL_MS = 60_000;

export function eject(deps, number, body) {
  deps.gh.comment(number, body);
  deps.gh.removeLabel(number);
}

/**
 * Cut one train: a branch from `main` or, when speculating, from the head of the train in flight
 * (`parent`); each component merged into it server-side; a ready pull request whose `opened`
 * event is the one CI run. A speculative train never ejects: a conflict on top of the parent may
 * be the parent's doing, so that component stays queued for a train cut from `main`.
 */
export function cutTrain({ batch, parent = null, deps, holder, key }) {
  const { gh, git, log } = deps;
  git.fetch(['main', ...batch.map((c) => c.headRefName)]);
  const base = parent ? parent.head : git.revParse('origin/main');
  if (!base) return { outcome: 'abort', reason: 'could not read origin/main after fetching it' };
  const branch = trainBranchName(deps.now(), batch[0].number);
  if (!gh.createBranch(branch, base)) return { outcome: 'abort', reason: `could not create ${branch}` };
  const onTopOf = parent?.pr ?? null;
  holder.put(key, { branch, base, onTopOf, components: batch.map((c) => c.number), files: null, pr: null, startedAt: new Date(deps.now()).toISOString() });
  const numbers = batch.map((c) => `#${c.number}`).join(' ');
  log(parent
    ? `speculative train ${branch} on top of train #${onTopOf} (${base.slice(0, 9)}), while its CI runs: ${numbers}`
    : `train ${branch} from main@${base.slice(0, 9)}: ${numbers}`);

  const included = [];
  const errored = [];
  for (const component of batch) {
    const { message } = componentCommit({ component, coAuthors: parseCoAuthors(git.coAuthorLog(base, component.headRefOid)) });
    const merged = gh.mergeInto(branch, component.headRefOid, message);
    if (merged.state === 'merged') {
      // Keep the component's original ancestry, including every commit identity and body.
      included.push({ ...component, empty: false });
    } else if (merged.state === 'up-to-date' && !parent) {
      included.push({ ...component, empty: true });
    } else if (merged.state === 'up-to-date' || merged.state === 'conflict') {
      if (parent) {
        log(`#${component.number} ${merged.state === 'conflict' ? 'conflicts' : 'adds nothing'} on top of train #${onTopOf}; it stays queued for a train cut from main`);
        continue;
      }
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
    holder.drop(key);
    if (!parent && included.length > 0) finishComponents({ deps, components: included, trainNumber: null, trainUrl: null });
    return { outcome: 'nothing', errored };
  }

  git.fetch([branch]);
  const head = git.revParse(`origin/${branch}`);
  const files = head ? git.diffNames(base, head) : null;
  if (!files) {
    // Without the file set neither the drift check nor a fast-path lander can reason about this
    // train, and a train nobody can reason about must not merge.
    gh.deleteBranch(branch);
    holder.drop(key);
    return { outcome: 'abort', reason: `could not fetch ${branch} to read its files`, errored };
  }
  holder.put(key, { components: included.map((c) => c.number), files });
  const opened = gh.openPr({ title: trainTitle(included), head: branch, base: 'main', body: trainBody({ components: included, base, onTopOf, notes: mainBrowserNotes(deps) }) });
  holder.put(key, { pr: opened.number, url: opened.url });
  log(`train #${opened.number} opened ready: one CI run for ${included.length} pull request(s)${parent ? `, concurrent with train #${onTopOf}'s` : ''} (${opened.url})`);
  return {
    outcome: 'open',
    errored,
    train: {
      key, branch, base, head, files, included, onTopOf, pr: opened.number, url: opened.url,
      empty: 0, refires: 0, reruns: 0, giveUpAt: deps.now() + TRAIN_TIMEOUT_MINUTES * 60_000, verdict: null,
    },
  };
}

/**
 * Read one train's CI once and record its result. Reruns and refires happen here for any train;
 * acting on a result is `settleHead`'s, only for the train at the head.
 */
export function pollTrain({ train, deps, requiredContexts, args }) {
  if (train.verdict) return;
  const { gh, log } = deps;
  if (deps.now() > train.giveUpAt) {
    train.verdict = { kind: 'timeout' };
    return;
  }
  const trainPr = gh.readPr(train.pr);
  const rollup = trainPr.statusCheckRollup ?? [];
  train.empty = rollup.length === 0 ? train.empty + 1 : 0;
  const checks = requiredCheckState({ rollup, requiredContexts });
  const other = otherCheckState({ rollup, requiredContexts, allowFailing: args.allowFailing });
  const step = trainCiStep({ checks, other, inFlight: runInFlight(trainPr), emptyRollupObservations: train.empty, refires: train.refires });

  if (step.action !== 'red') {
    const lanes = lanesThatCannotReport({ train, trainPr, rollup, checks, step, deps });
    if (lanes) {
      for (const lane of lanes) log(`train #${train.pr}: ${lane.name} ${lane.conclusion}${lane.url ? ` ${lane.url}` : ''}; no rerun can change that, settling it as red`);
      train.verdict = { kind: 'red', plan: redTrainPlan({ components: train.included.map((c) => c.number), failed: lanes, mayRerun: false }), failed: lanes };
      return;
    }
  }
  if (step.action === 'wait') return;
  if (step.action === 'refire') {
    log(`train #${train.pr} reported no run after ${train.empty} polls; toggling draft to ask GitHub once`);
    gh.markDraft(train.pr);
    gh.markReady(train.pr);
    train.refires += 1;
    return;
  }
  if (step.action === 'red') {
    const plan = redTrainPlan({ components: train.included.map((c) => c.number), failed: step.failed, flaky: [...args.flaky, ...args.allowFailing], reruns: train.reruns });
    if (plan.action === 'rerun') {
      const ids = runIdsFromChecks(step.failed);
      // GitHub reruns only a finished run: wait for its other jobs before asking.
      if (ids.some((id) => runStillGoing(rollup, id))) return;
      const failedReally = step.failed.some((check) => check.conclusion === 'FAILURE');
      const refused = !failedReally || ids.length === 0 || ids.some((id) => !gh.rerunFailed(id));
      train.reruns += 1;
      if (refused) {
        log(failedReally
          ? `train #${train.pr} is red and GitHub refused to rerun its failed jobs; settling it as red`
          : `train #${train.pr} has only cancelled contexts, which a rerun would not judge; settling it as red`);
        train.verdict = { kind: 'red', plan: redTrainPlan({ components: train.included.map((c) => c.number), failed: step.failed, flaky: [...args.flaky, ...args.allowFailing], reruns: train.reruns }), failed: step.failed };
        return;
      }
      log(train.included.length === 1
        ? `train #${train.pr} red on ${plan.names.join(', ')}; rerunning only the failed jobs once on the same head before ejecting #${train.included[0].number}, since a red with no code change often passes`
        : `train #${train.pr} red only on flaky context(s) ${plan.names.join(', ')}; rerunning the failed jobs once`);
      return;
    }
    train.verdict = { kind: 'red', plan, failed: step.failed };
    return;
  }
  train.verdict = { kind: 'green', trainPr, other };
}

/**
 * The lanes that can never report on this train, or `null`: a workflow that never started or
 * failed before any job, or, once every run for the head finished and a grace passed, the required
 * contexts still unreported. Read once before a green verdict, and every minute while a required
 * context is missing.
 */
function lanesThatCannotReport({ train, trainPr, rollup, checks, step, deps }) {
  const due = step.action === 'green' || (checks.unrun.length > 0 && deps.now() - (train.runsReadAt ?? Number.NEGATIVE_INFINITY) >= RUN_READ_INTERVAL_MS);
  if (!due) return null;
  train.runsReadAt = deps.now();
  const runs = deps.gh.listWorkflowRuns(trainPr.headRefOid ?? train.head);
  if (!runs) return null;
  const broken = brokenRuns({ runs, rollup, jobCount: (id) => deps.gh.countRunJobs(id) });
  if (broken.length > 0) return broken;
  if (checks.unrun.length === 0 || !allRunsFinished(runs)) {
    train.unreportedSince = null;
    return null;
  }
  train.unreportedSince ??= deps.now();
  if (deps.now() - train.unreportedSince < UNREPORTED_GRACE_MS) return null;
  return checks.unrun.map((name) => ({ name, conclusion: 'never reported, though every workflow run for this head finished', url: null }));
}

/**
 * Act on the result of the train at the head, whose base `main` already contains: merge, split,
 * eject, rebuild or give up. `wait` leaves it for the next poll.
 */
export function settleHead({ train, deps, requiredContexts, token }) {
  const { gh, git, log } = deps;
  const { verdict, included, branch, base, files } = train;
  const number = train.pr;
  if (verdict.kind === 'timeout') {
    gh.closePr(number, `No verdict after ${TRAIN_TIMEOUT_MINUTES} minutes; closed. The components stay queued.`);
    gh.deleteBranch(branch);
    return { outcome: 'abort', reason: `train #${number} had no verdict after ${TRAIN_TIMEOUT_MINUTES} minutes` };
  }
  if (verdict.kind === 'red') {
    const failedLine = verdict.failed.map((c) => `${c.name} ${c.conclusion}`).join(', ');
    if (verdict.plan.action === 'split') {
      const halves = verdict.plan.halves.map((half) => half.map((n) => `#${n}`).join(' ')).join(' | ');
      log(`train #${number} is red (${failedLine}); splitting into ${halves}`);
      gh.closePr(number, `${RED_CLOSE_PREFIX}${failedLine}. Split into ${halves}; each half runs as its own train.`);
      gh.deleteBranch(branch);
      return { outcome: 'split', halves: verdict.plan.halves };
    }
    const [only] = included;
    log(`train #${number} is red (${failedLine}); ejecting #${only.number}`);
    gh.closePr(number, `${RED_CLOSE_PREFIX}${failedLine}; #${only.number} is ejected from the queue.`);
    gh.deleteBranch(branch);
    const hint = verdict.failed.some((c) => !requiredContexts.includes(c.name))
      ? ' An unrequired lane can be accepted by name with `--allow-failing=<context>` by whoever conducts.'
      : '';
    eject(deps, only.number, ejectComment({ reason: `train #${number} failed with it alone.${hint}`, failed: verdict.failed, trainNumber: number }));
    return { outcome: 'ejected', number: only.number };
  }

  // The drift check and the merge run under the fast-path lock, the lock a fast-path merge holds
  // between its last check and its merge, so neither can land between the other's check and merge.
  const { trainPr, other } = verdict;
  if (!takeFastLock(deps, token, number)) {
    log(`a fast-path merge is holding ${FAST_LOCK_REF}; checking again next poll`);
    return { outcome: 'wait' };
  }
  const releaseFast = deps.onExit(() => gh.releaseLock(FAST_LOCK_REF));
  let mergedSha = null;
  try {
    // Main may have moved while CI ran; only a move into this train's files matters. For a train
    // that speculated, `base` is the head of the train under it, which `main` now contains, so
    // the diff is exactly what else reached `main` since that train was cut.
    git.fetch(['main']);
    const mainNow = git.revParse('origin/main');
    const drift = driftVerdict({ trainFiles: files, mainFiles: mainNow ? git.diffNames(base, mainNow) : null });
    if (drift.state === 'unknown') {
      log('could not compare main with the train base; checking again next poll');
      return { outcome: 'wait' };
    }
    if (drift.state === 'overlap') {
      log(`main moved into this train's files (${drift.overlap.slice(0, 3).join(', ')}); rebuilding it on today's main`);
      gh.closePr(number, `Green, but main moved into ${drift.overlap.join(', ')} while CI ran. Rebuilt on the new main.`);
      gh.deleteBranch(branch);
      return { outcome: 'rebuild', reason: 'main moved into its files' };
    }
    for (const name of other.unmatched) log(`--allow-failing named ${name}, which is not failing on this train`);
    const accepted = other.accepted.length > 0 ? `, accepting ${other.accepted.map((c) => `${c.name} ${c.conclusion}`).join(', ')}` : '';
    for (const component of included) component.coAuthors = parseCoAuthors(git.coAuthorLog(base, component.headRefOid));
    log(`train #${number} is green on ${trainPr.headRefOid.slice(0, 9)}${accepted}; preserving original commits from ${included.filter((c) => !c.empty).length} pull request(s)`);
    const merged = gh.mergePr(number, { sha: trainPr.headRefOid, method: 'merge', title: mergeCommitTitle(included), message: mergeCommitMessage(included) });
    mergedSha = merged.sha ?? null;
    if (!merged.ok && gh.readPr(number).state !== 'MERGED') {
      log(`GitHub refused the train merge (${merged.detail || 'no detail'}); rebuilding`);
      gh.closePr(number, `The merge was refused: ${merged.detail || 'no detail'}. Rebuilt on the new main.`);
      gh.deleteBranch(branch);
      return { outcome: 'rebuild', reason: 'the merge was refused' };
    }
  } finally {
    releaseFast();
    gh.releaseLock(FAST_LOCK_REF);
  }
  log(`train #${number} merged: ${train.url}`);
  waitForMainAt(deps, mergedSha);
  git.fetch(['main', branch, ...included.map((c) => c.headRefName)]);
  finishComponents({ deps, components: included, trainNumber: number, trainUrl: train.url });
  gh.deleteBranch(branch);
  return { outcome: 'merged', train: number, landed: included.map((c) => c.number) };
}

/**
 * The first train in flight carrying a pull request whose head moved since the train took it, with
 * each move; `null` when none moved or the heads could not be fetched.
 */
export function firstMovedTrain({ flight, deps }) {
  const refs = flight.flatMap((train) => train.included.map((c) => c.headRefName));
  if (refs.length === 0 || !deps.git.fetch(refs)) return null;
  for (let index = 0; index < flight.length; index += 1) {
    const moves = flight[index].included
      .map((c) => ({ number: c.number, from: c.headRefOid, to: deps.git.revParse(`origin/${c.headRefName}`) }))
      .filter((move) => move.to && move.to !== move.from);
    if (moves.length > 0) return { index, moves };
  }
  return null;
}

/** Close a train that carries a moved head: it tests code its author already replaced. Nothing is ejected. */
export function closeMovedTrain({ train, moves, deps }) {
  const described = moves.map((m) => `#${m.number} moved from ${m.from.slice(0, 9)} to ${m.to.slice(0, 9)}`);
  for (const line of described) deps.log(`${line} while train #${train.pr} was in flight; rebuilding the train from the current heads`);
  deps.gh.closePr(train.pr, `Closed: ${described.join(', ')} while CI ran. Rebuilt from the current heads; nothing is ejected.`);
  deps.gh.deleteBranch(train.branch);
}

/** Close a speculative train whose parent did not land. It never merges; its components stay queued. */
export function discardTrain({ train, deps, why }) {
  deps.gh.closePr(train.pr, `Discarded: it was cut on top of train #${train.onTopOf}, which ${why}. Its pull requests stay queued and ride a train cut from main.`);
  deps.gh.deleteBranch(train.branch);
  deps.log(`speculative train #${train.pr} discarded: train #${train.onTopOf} ${why}`);
}

/**
 * Fetch until `origin/main` is the merge commit GitHub just made: right after a merge the ref can
 * still read the old main, and judging containment against it would re-queue a landed component.
 */
function waitForMainAt(deps, sha) {
  if (!sha) return;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    deps.git.fetch(['main']);
    if (deps.git.revParse('origin/main') === sha) return;
    deps.sleep(5);
  }
  deps.log(`origin/main did not reach the merge commit ${sha.slice(0, 9)} within a minute; judging containment anyway`);
}

/**
 * Close every component a merged train carried, and delete a branch only when its head is in
 * `origin/main`'s history (`git merge-base --is-ancestor`).
 */
function finishComponents({ deps, components, trainNumber, trainUrl }) {
  const { gh, git, log } = deps;
  for (const component of components) {
    const sha = component.headRefOid;
    // Only ancestry deletes a branch: tree containment would also pass a squashed copy of its commits.
    const contained = git.isAncestor(sha, 'origin/main');
    if (!contained) {
      // Never queue it again: a train already carried it, and a second train would land it twice.
      gh.removeLabel(component.number);
      gh.comment(component.number, `Train #${trainNumber ?? 'none'} carried ${sha.slice(0, 9)} and merged, but main does not provably contain it. Check main for this change; queue it again with \`pnpm pr:land ${component.number}\` only if something is missing.`);
      log(`#${component.number}: main does not provably contain ${sha.slice(0, 9)}; taken out of the queue for a person to check`);
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
