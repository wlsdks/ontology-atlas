import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QUEUE_LABEL } from '../landing-train.mjs';
import { hasQueueLabel, queueNeedsConductor, queueNeedsConductorOrWarn, readProtection } from './landing-state.mjs';

const NOW = Date.parse('2026-09-12T12:00:00Z');

function fakeDeps({ contexts = ['Unit'], failure = null, lock = null, queue = [], queueError = null } = {}) {
  const errors = [];
  return {
    errors,
    now: () => NOW,
    liveness: () => 'alive',
    error: (line) => errors.push(line),
    gh: {
      readRequiredContexts: () => ({ contexts, failure }),
      readLock: () => ({ payload: lock, unreadable: null }),
      listQueue: () => {
        if (queueError) throw new Error(queueError);
        return queue;
      },
    },
  };
}

const heldLock = { pr: 5, acquiredAt: '2026-09-12T11:58:00Z', leaseMinutes: 45 };

describe('the queue label', () => {
  it('is found whether the label arrives as an object or as a bare name', () => {
    assert.equal(hasQueueLabel({ labels: [{ name: 'bug' }, { name: QUEUE_LABEL }] }), true);
    assert.equal(hasQueueLabel({ labels: [QUEUE_LABEL] }), true);
    assert.equal(hasQueueLabel({ labels: [{ name: 'bug' }] }), false);
    assert.equal(hasQueueLabel({}), false);
    assert.equal(hasQueueLabel(null), false);
  });
});

describe('the protection a landing reads', () => {
  it('returns the required contexts when main declares some', () => {
    assert.deepEqual(readProtection(fakeDeps({ contexts: ['Unit', 'MCP'] })), ['Unit', 'MCP']);
  });

  it('refuses to land without a gate when main declares none', () => {
    const deps = fakeDeps({ contexts: [] });
    assert.equal(readProtection(deps), null);
    assert.deepEqual(deps.errors, ['main declares no required status checks; refusing to land without a gate']);
  });

  it('says a failed read tells nothing about the protection', () => {
    const deps = fakeDeps({ contexts: null, failure: { reason: 'rate-limited', detail: 'quota gone' } });
    assert.equal(readProtection(deps), null);
    assert.deepEqual(deps.errors, [
      "could not read main's required status checks: quota gone",
      "this says nothing about main's protection; try again once the read works",
    ]);
  });
});

describe('whether the queue needs a conductor', () => {
  it('does when a pull request other than the asker waits and nobody holds the lock', () => {
    assert.equal(queueNeedsConductor(fakeDeps({ queue: [{ number: 7 }] }), 8), true);
  });

  it('does not when the only queued pull request is the asker', () => {
    assert.equal(queueNeedsConductor(fakeDeps({ queue: [{ number: 8 }] }), 8), false);
  });

  it('does not when a live conductor holds the lock', () => {
    assert.equal(queueNeedsConductor(fakeDeps({ lock: heldLock, queue: [{ number: 7 }] }), 8), false);
  });

  it('warns instead of waiting when the queue cannot be read', () => {
    const deps = fakeDeps({ queueError: 'HTTP 502' });
    assert.equal(queueNeedsConductorOrWarn(deps, 8), false);
    assert.deepEqual(deps.errors, ['warning: the landing queue could not be read (HTTP 502); not waiting on it']);
  });
});
