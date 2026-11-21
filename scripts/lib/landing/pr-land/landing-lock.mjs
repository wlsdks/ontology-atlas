/** What a landing lock's payload says: who holds it, whether they are alive, and which trains fly. */

import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

import { describeTrains } from '../landing-train.mjs';

export const LOCK_REF = 'refs/atlas/landing-lock';

/** Serializes fast-path merges among themselves, for the seconds between last check and merge. */
export const FAST_LOCK_REF = 'refs/atlas/landing-fast';
export const FAST_LEASE_MINUTES = 2;

/**
 * How long a lock survives without a refresh: how long after a crash another machine waits, not
 * how long a train takes; a dead pid on this machine frees it at once (`classifyHolderLiveness`).
 * Long enough that a live conductor in one slow CI round is not robbed.
 */
export const LEASE_MINUTES = 45;

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
 * Is the process that took this lock still running? A lease is a guess about liveness; the pid is
 * the fact. Answers are `alive`, `dead` and `unknown` (a lock from another machine, where only the
 * lease applies). The command line is checked too: pids are recycled.
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
 * `unreadable` is deliberately not `free`: an unparseable lock is still a lock. `unknown` is the
 * same rule for a read that never arrived; it never renders as an open door. A train payload keeps
 * the numeric `pr` field so an older `pr:land` reads it as held.
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
  const subject = 'train' in lock.holder ? describeTrains(lock.holder, nowMs) : `PR #${lock.holder.pr}`;
  if (lock.state !== 'stale') return `${subject} held by ${who} since ${age}`;
  const why = lock.holderLiveness === 'dead' ? 'its process is gone' : 'never refreshed: stale';
  return `${subject} held by ${who} since ${age} and ${why}`;
}

/**
 * The payload records every train in flight under `trains`, head first, each with its own file
 * set, so a fast-path lander refuses a change that overlaps the speculative train too. `train` is
 * the head train with `files` widened to the union, for a reader that knows only `train`.
 */
export function lockTrains(trains) {
  const list = [...trains];
  if (list.length === 0) return { train: null, trains: [] };
  const known = list.every((t) => Array.isArray(t.files));
  const files = known ? [...new Set(list.flatMap((t) => t.files))].sort() : null;
  return { train: { ...list[0], files }, trains: list };
}

/** The trains a lock records, head first: the `trains` list, or the lone `train` an older lander wrote. */
export function trainsInFlight(lock) {
  return (Array.isArray(lock.holder?.trains) ? lock.holder.trains : [lock.holder?.train]).filter(Boolean);
}
