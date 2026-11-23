import assert from 'node:assert/strict';
import { test } from 'node:test';

import { stopReason } from './map-rest-ledger.mjs';

const start = (note, server) => ({ request: 0, note, server, agentError: false, requestCeiling: 8 });

test('a vault built before the summary line still gets its first request', () => {
  assert.equal(stopReason([start(null, { uncovered: 50, total: 152 })], 8), null);
});

test('with nothing left on the server and no line, the chain does not start', () => {
  assert.equal(stopReason([start(null, { uncovered: 0, total: 152 })], 8), 'noProgress');
});

test('a line that disappears after the first request reads as finished', () => {
  const first = { request: 1, note: null, server: { uncovered: 0, total: 152 }, agentError: false };
  assert.equal(stopReason([start({ uncovered: 50, total: 152 }, { uncovered: 50, total: 152 }), first], 8), 'finished');
});

test('a line that reads nothing left ends the chain without another request', () => {
  const done = { request: 4, note: { uncovered: 0, total: 146 }, server: { uncovered: 0, total: 146 }, agentError: false };
  const before = { request: 3, note: { uncovered: 4, total: 148 }, server: { uncovered: 4, total: 148 }, agentError: false };
  assert.equal(stopReason([start({ uncovered: 50, total: 152 }, { uncovered: 50, total: 152 }), before, done], 8), 'finished');
});
