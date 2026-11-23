import assert from 'node:assert/strict';
import { test } from 'node:test';

import { requestCeiling, stopReason } from './map-rest-ledger.mjs';

const start = (note, server) => ({ request: 0, note, server, agentError: false, requestCeiling: 8 });

test('a vault built before the summary line still gets its first request', () => {
  assert.equal(stopReason([start(null, { uncovered: 50, total: 152 })], 8), null);
});

test('with nothing left on the server and no line, the chain does not start', () => {
  assert.equal(stopReason([start(null, { uncovered: 0, total: 152 })], 8), 'noProgress');
});

test('a line that disappears after one request could have closed it reads as finished', () => {
  const first = { request: 1, note: null, server: { uncovered: 0, total: 152 }, agentError: false };
  assert.equal(stopReason([start({ uncovered: 31, total: 152 }, { uncovered: 31, total: 152 }), first], 8), 'finished');
});

test('a line that disappears while more was left than one request reaches is lost, not finished', () => {
  const first = { request: 1, note: null, server: { uncovered: 20, total: 152 }, agentError: false };
  assert.equal(stopReason([start({ uncovered: 50, total: 152 }, { uncovered: 50, total: 152 }), first], 8), 'lineLost');
});

test('a press sends at most a hundred requests, however much the note says is left', () => {
  assert.equal(requestCeiling(26), 6);
  assert.equal(requestCeiling(100_000), 100);
});

test('a line that reads nothing left ends the chain without another request', () => {
  const done = { request: 4, note: { uncovered: 0, total: 146 }, server: { uncovered: 0, total: 146 }, agentError: false };
  const before = { request: 3, note: { uncovered: 4, total: 148 }, server: { uncovered: 4, total: 148 }, agentError: false };
  assert.equal(stopReason([start({ uncovered: 50, total: 152 }, { uncovered: 50, total: 152 }), before, done], 8), 'finished');
});
