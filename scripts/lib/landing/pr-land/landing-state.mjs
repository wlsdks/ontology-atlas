/** Reads of the shared state a landing decides on: the lock, main's protection, the queue label. */

import { QUEUE_LABEL } from '../landing-train.mjs';
import { LOCK_REF, classifyLock } from './landing-lock.mjs';

export const hasQueueLabel = (pr) => (pr?.labels ?? []).some((label) => (label?.name ?? label) === QUEUE_LABEL);

export function readLockState(deps, ref = LOCK_REF) {
  const { payload, unreadable } = deps.gh.readLock(ref);
  return classifyLock({ payload, unreadable, nowMs: deps.now(), liveness: deps.liveness });
}

export function readProtection(deps) {
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

/** Pull requests other than `except` wait in the queue, and no live conductor holds the lock. */
export function queueNeedsConductor(deps, except) {
  const lock = readLockState(deps);
  if (lock.state === 'held' || lock.state === 'unknown') return false;
  return deps.gh.listQueue().some((queued) => queued.number !== except);
}

/** `queueNeedsConductor`, where an unreadable queue is a warning and no reason to wait. */
export function queueNeedsConductorOrWarn(deps, except) {
  try {
    return queueNeedsConductor(deps, except);
  } catch (error) {
    deps.error(`warning: the landing queue could not be read (${error.message}); not waiting on it`);
    return false;
  }
}
