/** The conductor: holds the landing lock and runs trains from the queue until it is empty. */

import {
  DEFAULT_BATCH,
  MAX_REBUILDS,
  adaptiveBatch,
  conflictComment,
  ejectComment,
  maySpeculate,
  nextTrain,
  requeueAfterDiscard,
  splitTrain,
  trainHistoryRows,
} from '../landing-train.mjs';
import { CONFLICT_INSTRUCTION, refuseLanding } from './landing-refusals.mjs';
import { LEASE_MINUTES, LOCK_REF, lockTrains } from './landing-lock.mjs';
import { closeMovedTrain, cutTrain, discardTrain, eject, firstMovedTrain, pollTrain, settleHead } from './train-steps.mjs';

const POLL_SECONDS = 30;

/**
 * With one train in flight and nothing queued behind it, how long before the conductor lists the
 * queue again for a speculative train. Every poll would be 120 queue reads an hour for nothing.
 */
const SPECULATION_QUEUE_RECHECK_SECONDS = 300;

/**
 * The train size for this conductor: `--batch` when given, otherwise measured from recent trains
 * (`adaptiveBatch`). Printed either way, with the reason.
 */
export function chooseBatch({ deps, args }) {
  if (args.batch !== null && args.batch !== undefined) {
    deps.log(`train size ${args.batch} (--batch)`);
    return args.batch;
  }
  let history = null;
  try {
    history = typeof deps.gh.listTrainHistory === 'function' ? deps.gh.listTrainHistory() : null;
  } catch {
    history = null;
  }
  if (!Array.isArray(history)) {
    deps.log(`train size ${DEFAULT_BATCH}: recent trains could not be read, so the default`);
    return DEFAULT_BATCH;
  }
  const choice = adaptiveBatch(trainHistoryRows(history));
  deps.log(`train size ${choice.size}: ${choice.reason}`);
  return choice.size;
}

/** The queue in order, after taking out every pull request the conductor must refuse. */
function readQueue(deps) {
  const queue = [];
  for (const pr of deps.gh.listQueue()) {
    const refusal = refuseLanding(pr);
    if (refusal) {
      deps.log(`#${pr.number} ${refusal.split('\n')[0]}; taking it out of the queue`);
      eject(deps, pr.number, refusal === CONFLICT_INSTRUCTION ? conflictComment({}) : ejectComment({ reason: `it ${refusal}` }));
    } else queue.push(pr);
  }
  return queue;
}

/**
 * The conductor's hold on the lock. Every wait while holding goes through `hold`, which renews
 * the lease **before** sleeping: a poll that skipped the refresh would age the lock past its
 * lease under a live conductor and invite the next lander to force-take it.
 */
function makeHolder({ deps, token }) {
  const trains = new Map();
  const since = new Date(deps.now()).toISOString();
  let held = false;
  let unregister = () => {};
  const body = () => {
    const recorded = lockTrains(trains.values());
    return {
      pr: recorded.train?.pr ?? recorded.train?.components?.[0] ?? 0,
      token,
      holder: deps.user,
      host: deps.host,
      acquiredAt: new Date(deps.now()).toISOString(),
      leaseMinutes: LEASE_MINUTES,
      via: 'pnpm pr:land (train)',
      conductingSince: since,
      ...recorded,
    };
  };
  const holder = {
    take: ({ force = false } = {}) => {
      held = deps.gh.takeLock(LOCK_REF, body(), { force });
      if (held) unregister = deps.onExit(() => holder.release());
      return held;
    },
    refresh: () => deps.gh.refreshLock(LOCK_REF, body()),
    /** Record or amend the train under `key`, then publish the payload. */
    put: (key, patch) => {
      trains.set(key, { ...(trains.get(key) ?? {}), ...patch });
      holder.refresh();
    },
    drop: (key) => {
      if (trains.delete(key)) holder.refresh();
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

/**
 * Hold the lock and run trains until the queue is empty or the deadline passes. Never stops
 * mid-train: the deadline stops new trains, and the conductor stays until the ones in flight end.
 *
 * Up to `MAX_IN_FLIGHT` trains fly at once. The head is cut from `main`; while its CI runs, the
 * next one is cut from the head's head, so its CI runs concurrently on exactly the tree `main`
 * becomes if the head lands. Verdicts are acted on in order: a speculative train lands only after
 * the train under it landed, and is discarded (never merged) when that train does not.
 */
export function conduct({ deps, args, requiredContexts, token, force = false, deadline }) {
  const holder = makeHolder({ deps, token });
  if (!holder.take({ force })) return { state: 'lost' };
  deps.log('landing lock acquired: this process conducts trains until the queue is empty');
  const batchSize = chooseBatch({ deps, args });
  const speculate = args.speculate !== false;
  let splits = [];
  const rebuilds = new Map();
  const errors = new Map();
  const landed = [];
  const flight = [];
  let blockedOn = null;
  // An empty queue behind the head is read again only every few minutes, not on every poll.
  let quietUntil = Number.NEGATIVE_INFINITY;
  let keys = 0;
  const countErrors = (errored = []) => {
    for (const number of errored) {
      const count = (errors.get(number) ?? 0) + 1;
      errors.set(number, count);
      if (count >= 2) eject(deps, number, ejectComment({ reason: 'GitHub refused to merge it onto two trains for a reason other than a conflict' }));
    }
  };
  const stop = (reason) => {
    deps.error(`the train stopped: ${reason}`);
    return { state: 'aborted', landed };
  };
  try {
    for (;;) {
      // Cut trains while there is room and time: one from main, then one speculating on it.
      while (deps.now() < deadline) {
        const parent = flight.at(-1) ?? null;
        if (parent && !maySpeculate({ enabled: speculate, inFlight: flight.length, parent, blockedOn })) break;
        if (parent && deps.now() < quietUntil) break;
        const riding = new Set(flight.flatMap((train) => train.numbers));
        const next = nextTrain({ queue: readQueue(deps).filter((pr) => !riding.has(pr.number)), splits, batchSize });
        if (next.batch.length === 0) {
          if (parent) quietUntil = deps.now() + SPECULATION_QUEUE_RECHECK_SECONDS * 1000;
          break;
        }
        const numbers = next.batch.map((c) => c.number);
        splits = next.splits;
        keys += 1;
        const cut = cutTrain({ batch: next.batch, parent, deps, holder, key: `train-${keys}` });
        countErrors(cut.errored);
        if (cut.outcome === 'open') {
          flight.push({ ...cut.train, numbers, source: next.source });
          continue;
        }
        if (!parent) {
          if (cut.outcome === 'abort') return stop(cut.reason);
          continue;
        }
        // A speculative cut that opened nothing waits for the parent to settle before trying again.
        if (cut.outcome === 'abort') deps.log(`not speculating on train #${parent.pr}: ${cut.reason}`);
        if (next.source === 'split') splits = [numbers, ...splits];
        blockedOn = parent.pr;
        break;
      }
      if (flight.length === 0) {
        if (deps.now() >= deadline) {
          deps.log('deadline reached between trains; handing the queue to the next lander');
          return { state: 'deadline', landed };
        }
        deps.log('the queue is empty');
        return { state: 'drained', landed };
      }

      holder.hold(POLL_SECONDS);
      for (const train of flight) pollTrain({ train, deps, requiredContexts, args });

      // A pushed head makes its train test replaced code: rebuild it, and drop what rode on it.
      const moved = firstMovedTrain({ flight, deps });
      if (moved) {
        const [train, ...above] = flight.splice(moved.index);
        closeMovedTrain({ train, moves: moved.moves, deps });
        holder.drop(train.key);
        for (const riding of above) {
          discardTrain({ train: riding, deps, why: 'was rebuilt because a pull request it carried moved' });
          holder.drop(riding.key);
        }
        splits = requeueAfterDiscard({ splits, headSplits: [train.numbers], discarded: above });
        blockedOn = null;
        quietUntil = Number.NEGATIVE_INFINITY;
        continue;
      }

      while (flight.length > 0 && flight[0].verdict) {
        const head = flight[0];
        const result = settleHead({ train: head, deps, requiredContexts, token });
        if (result.outcome === 'wait') break;
        flight.shift();
        holder.drop(head.key);
        // A settled head may have left split halves or a new head to speculate on: look again.
        quietUntil = Number.NEGATIVE_INFINITY;
        if (result.outcome === 'merged') {
          landed.push(...result.landed);
          // The train above it now stands on main; its drift check uses its own base.
          if (flight[0]) holder.put(flight[0].key, { onTopOf: null });
          continue;
        }
        const why = result.outcome === 'rebuild' ? 'was rebuilt on a newer main'
          : result.outcome === 'abort' ? 'stopped without a verdict' : 'went red';
        const discarded = flight.splice(0);
        for (const train of discarded) {
          discardTrain({ train, deps, why });
          holder.drop(train.key);
        }
        blockedOn = null;
        let headSplits = [];
        if (result.outcome === 'split') headSplits = result.halves;
        else if (result.outcome === 'rebuild') {
          const key = head.numbers.join(',');
          const count = (rebuilds.get(key) ?? 0) + 1;
          rebuilds.set(key, count);
          if (count <= MAX_REBUILDS) headSplits = [head.numbers];
          else if (head.numbers.length > 1) headSplits = splitTrain(head.numbers);
          else eject(deps, head.numbers[0], ejectComment({ reason: `main kept moving into its files; ${MAX_REBUILDS} rebuilds did not settle` }));
        }
        splits = requeueAfterDiscard({ splits, headSplits, discarded });
        if (result.outcome === 'abort') return stop(result.reason);
      }
    }
  } finally {
    holder.release();
  }
}
