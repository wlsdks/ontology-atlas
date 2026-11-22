/** What a landing would do, from reads alone (`--plan`), and the queue as it stands (`--queue`). */

import {
  DEFAULT_BATCH,
  QUEUE_LABEL,
  componentCommit,
  describeFastPath,
  landingRoute,
  nextTrain,
  parseCoAuthors,
  trainBranchName,
  trainTitle,
} from '../landing-train.mjs';
import { requiredCheckState } from './check-state.mjs';
import { evaluateFastPath } from './direct-merge.mjs';
import { describeLock, trainsInFlight } from './landing-lock.mjs';
import { missingChangeRecord, refuseLanding } from './landing-refusals.mjs';
import { readLockState, readProtection } from './landing-state.mjs';
import { chooseBatch } from './train-conductor.mjs';

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
    const refusal = refuseLanding(pr) ?? missingChangeRecord(pr, () => deps.gh.readChangedFiles(number));
    if (refusal) {
      deps.log(`PR #${number}: would be refused — ${refusal.split('\n')[0]}`);
      continue;
    }
    if (args.fast) {
      const verdict = evaluateFastPath({ pr, deps, requiredContexts, allowFailing: args.allowFailing });
      deps.log(`PR #${number}: fast path ${verdict.eligible ? 'eligible' : 'not eligible'}`);
      for (const line of describeFastPath(verdict)) deps.log(`  ${line}`);
      if (verdict.eligible) {
        deps.log(`PR #${number}: would merge now at ${pr.headRefOid.slice(0, 9)}, without the train lock`);
        continue;
      }
      const route = landingRoute({ verdict, checks: verdict.checks, other: verdict.other, tolerated: [...args.flaky, ...args.allowFailing] });
      if (route.route === 'own-ci') {
        deps.log(`PR #${number}: would ${pr.isDraft ? 'mark it ready and ' : ''}wait for its own CI, then merge directly if main has not moved`);
        continue;
      }
      if (route.route === 'red') {
        deps.log(`PR #${number}: would be handed back red on its own CI (${route.failed.map((c) => c.name).join(', ')})`);
        continue;
      }
    }
    deps.log(`PR #${number}: would be queued with the \`${QUEUE_LABEL}\` label`);
    joining.push({ ...pr, queuedAt: new Date(deps.now()).toISOString() });
  }

  const queued = deps.gh.listQueue();
  // Pull requests already riding a train in flight are not planned again.
  const flying = trainsInFlight(lock);
  const aboard = new Set(flying.flatMap((t) => t.components ?? []));
  const combined = [...queued, ...joining.filter((pr) => !queued.some((q) => q.number === pr.number))].filter((pr) => !aboard.has(pr.number));
  const batchSize = chooseBatch({ deps, args });
  const { batch } = nextTrain({ queue: combined, batchSize });
  if (batch.length === 0) {
    deps.log('no train would run: the queue would be empty');
    return 0;
  }
  // The speculative train: the next pull requests, cut on top of the first train's head.
  const riding = new Set(batch.map((c) => c.number));
  const speculative = args.speculate ? nextTrain({ queue: combined.filter((pr) => !riding.has(pr.number)), batchSize }).batch : [];
  if (lock.state === 'held' && aboard.size > 0) {
    deps.log(`${flying.length} train(s) in flight carrying ${[...aboard].map((n) => `#${n}`).join(' ')}; the trains below form after ${args.speculate && flying.length < 2 ? 'it, the first one speculating on it' : 'them'}`);
  } else if (lock.state === 'held') deps.log('a train is in flight; the trains below form after it');
  deps.log(`next train (${batch.length} of ${combined.length} queued): ${trainTitle(batch)}`);
  const ridesOn = lock.state === 'held' && args.speculate && flying.length === 1 && flying[0].pr ? flying[0].pr : null;
  deps.log(`  branch ${trainBranchName(deps.now(), batch[0].number)} from ${ridesOn ? `train #${ridesOn}'s head (trial-merged below on origin/main)` : 'origin/main'}`);
  deps.git.fetch(['main', ...batch.map((c) => c.headRefName), ...speculative.map((c) => c.headRefName)]);
  // One trial merge in queue order: the speculative rows are measured on top of the first train.
  const trial = deps.git.trialMerge('origin/main', [...batch, ...speculative].map((c) => c.headRefOid));
  const describeRow = (component, onTop) => {
    const row = trial.find((r) => r.sha === component.headRefOid);
    const verdict = !row ? 'not measured'
      : row.conflicts.length > 0 ? (onTop ? `would conflict on top of it and stay queued (${row.conflicts.join(', ')})` : `would conflict and be ejected (${row.conflicts.join(', ')})`)
        : row.state === 'pending' ? 'merges cleanly' : `adds nothing (${row.state})`;
    deps.log(`  #${component.number} ${component.headRefName}@${String(component.headRefOid).slice(0, 9)}: ${verdict}`);
  };
  for (const component of batch) describeRow(component, false);
  if (speculative.length > 0) {
    deps.log(`speculative train while its CI runs (${speculative.length}): ${trainTitle(speculative)}`);
    deps.log('  cut on top of the train above, CI concurrent; lands only if that train lands, discarded if it does not');
    for (const component of speculative) describeRow(component, true);
  } else if (!args.speculate) deps.log('no speculative train: --no-speculate');
  deps.log('original commits are preserved; integration merge messages, if green:');
  for (const component of batch) {
    const { message, author } = componentCommit({ component, coAuthors: parseCoAuthors(deps.git.coAuthorLog('origin/main', component.headRefOid)) });
    deps.log(`  | ${message.split('\n')[0]}${author ? `  (${author.name})` : ''}`);
  }
  deps.log('dry run: nothing was written to GitHub');
  return 0;
}

export function printQueue({ deps, io = console }) {
  const lock = readLockState(deps);
  io.log(`[pr-queue] landing now: ${describeLock(lock, deps.now())}`);
  const trains = trainsInFlight(lock);
  const inFlight = trains.filter((t) => t.pr);
  const protection = inFlight.length > 0 ? deps.gh.readRequiredContexts() : null;
  for (const train of inFlight) {
    const pr = deps.gh.readPr(train.pr);
    if (protection?.contexts && pr) {
      const checks = requiredCheckState({ rollup: pr.statusCheckRollup ?? [], requiredContexts: protection.contexts });
      const green = protection.contexts.length - checks.pending.length - checks.unrun.length - checks.failed.length;
      io.log(`[pr-queue]   CI on train #${train.pr}: ${green} green, ${checks.pending.length} running, ${checks.unrun.length} not reported, ${checks.failed.length} failed (${pr.url})`);
    }
  }
  const queue = deps.gh.listQueue();
  if (queue.length === 0) {
    io.log('[pr-queue] queue: empty');
  } else {
    io.log(`[pr-queue] queue: ${queue.length} pull request(s), oldest first; a train takes up to ${DEFAULT_BATCH}, fewer when recent trains ran red`);
    const riding = new Set(trains.flatMap((t) => t.components ?? []));
    queue.forEach((pr, index) => {
      const minutes = pr.queuedAt ? Math.max(0, Math.round((deps.now() - Date.parse(pr.queuedAt)) / 60_000)) : null;
      io.log(`[pr-queue]   ${index + 1}. #${pr.number}${riding.has(pr.number) ? ' (on the train)' : ''}${minutes === null ? '' : ` queued ${minutes} min`}  ${String(pr.title ?? '').slice(0, 60)}`);
    });
    if (lock.state === 'free') io.log('[pr-queue] nobody is conducting: `pnpm pr:land --conduct` starts the train');
  }
  io.log('[pr-queue] queue one with `pnpm pr:land <number>`; never `gh pr merge` by hand.');
  return 0;
}
