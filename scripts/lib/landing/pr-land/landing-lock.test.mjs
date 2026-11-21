import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FAST_LOCK_REF, LEASE_MINUTES, LOCK_REF, classifyHolderLiveness, classifyLock, describeLock, parseLockToken, trainsInFlight } from './landing-lock.mjs';

const NOW = Date.parse('2026-09-12T12:00:00Z');

describe('the landing lock', () => {
  it('names one ref for trains and one for fast-path merges', () => {
    assert.equal(LOCK_REF, 'refs/atlas/landing-lock');
    assert.equal(FAST_LOCK_REF, 'refs/atlas/landing-fast');
  });

  it('reads a fresh lock as held and an unrefreshed one as stale', () => {
    const payload = { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:58:00Z', leaseMinutes: LEASE_MINUTES };
    const held = classifyLock({ payload, nowMs: NOW });
    assert.equal(held.state, 'held');
    assert.equal(Math.round(held.ageMinutes), 2);
    assert.equal(Math.round(held.expiresInMinutes), 43);
    assert.equal(classifyLock({ payload: { ...payload, acquiredAt: '2026-09-12T11:00:00Z' }, nowMs: NOW }).state, 'stale');
  });

  it('treats a lock it cannot parse as taken, not as an open door', () => {
    assert.equal(classifyLock({ payload: {}, nowMs: NOW }).state, 'unreadable');
    assert.equal(classifyLock({ payload: { pr: 'twelve' }, nowMs: NOW }).state, 'unreadable');
    assert.equal(classifyLock({ payload: null, nowMs: NOW }).state, 'free');
  });

  /*
   * An older `pr:land` still running in another session classifies the lock itself. It treats a
   * payload with no numeric `pr` as unreadable and takes it over at once, so a conductor's payload
   * must keep a number there even between trains.
   */
  it('keeps a conductor lock readable by the per-PR pr:land that may still be running elsewhere', () => {
    const between = { pr: 0, token: 't', acquiredAt: '2026-09-12T11:59:00Z', train: null };
    assert.equal(classifyLock({ payload: between, nowMs: NOW, liveness: () => 'unknown' }).state, 'held');
    const riding = { pr: 1999, token: 't', holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:59:00Z', train: { pr: 1999, components: [12, 13], startedAt: '2026-09-12T11:50:00Z' } };
    assert.match(describeLock(classifyLock({ payload: riding, nowMs: NOW, liveness: () => 'unknown' }), NOW), /^train #1999 carrying #12 #13, 10 min held by stark@mbp/);
  });

  it('does not render a read that failed as an open door', () => {
    const failure = { reason: 'rate-limited', detail: 'the shared GitHub REST quota is exhausted' };
    const lock = classifyLock({ payload: null, unreadable: failure, nowMs: NOW });
    assert.equal(lock.state, 'unknown');
    assert.match(describeLock(lock), /could not be read: the shared GitHub REST quota is exhausted/);
  });

  it('honours a lease the holder wrote, not only the default', () => {
    assert.equal(classifyLock({ payload: { pr: 1, acquiredAt: '2026-09-12T11:50:00Z', leaseMinutes: 5 }, nowMs: NOW }).state, 'stale');
  });

  it('reads the machine and the process out of a token, right to left', () => {
    assert.deepEqual(parseLockToken('mbp-pro-local-12426-1789854745891'), { host: 'mbp-pro-local', pid: 12426 });
    assert.equal(parseLockToken('me'), null);
    assert.equal(parseLockToken('mbp-notapid-1789854745891'), null);
    assert.equal(parseLockToken(undefined), null);
  });

  it('proves a holder dead only on this machine, and only by its command line', () => {
    const token = 'mbp-4242-1789854745891';
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => 'node /repo/scripts/landing/pr-land.mjs 1704' }), 'alive');
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => '' }), 'dead');
    assert.equal(classifyHolderLiveness({ token }, { host: 'mbp', readProcessCommand: () => '/usr/bin/vim notes.md' }), 'dead');
    assert.equal(classifyHolderLiveness({ token }, { host: 'other', readProcessCommand: () => '' }), 'unknown');
  });

  it('frees a lock whose process is gone without waiting out the lease', () => {
    const payload = { pr: 1727, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:58:00Z' };
    const dead = classifyLock({ payload, nowMs: NOW, liveness: () => 'dead' });
    assert.equal(dead.state, 'stale');
    assert.ok(dead.expiresInMinutes > 0, 'the lease has not run out — liveness is what freed it');
    assert.equal(classifyLock({ payload, nowMs: NOW, liveness: () => 'alive' }).state, 'held');
    assert.equal(classifyLock({ payload, nowMs: NOW, liveness: () => 'unknown' }).state, 'held');
  });

  it('says who holds it and for how long, and why a stale one is free', () => {
    const payload = { pr: 1570, holder: 'stark', host: 'mbp', acquiredAt: '2026-09-12T11:30:00Z' };
    assert.match(describeLock(classifyLock({ payload, nowMs: NOW })), /PR #1570 held by stark@mbp since 30 min ago/);
    assert.match(describeLock(classifyLock({ payload: null, nowMs: NOW })), /nothing is landing/);
    assert.match(describeLock(classifyLock({ payload, nowMs: NOW, liveness: () => 'dead' })), /its process is gone/);
  });

  it('lists the trains a lock records, head first, or the lone train an older lander wrote', () => {
    const [head, speculative] = [{ pr: 1, components: [10] }, { pr: 2, components: [11] }];
    assert.deepEqual(trainsInFlight({ holder: { trains: [head, speculative], train: head } }), [head, speculative]);
    assert.deepEqual(trainsInFlight({ holder: { train: head } }), [head]);
    assert.deepEqual(trainsInFlight({ holder: { train: null } }), []);
    assert.deepEqual(trainsInFlight({ holder: null }), []);
  });
});
