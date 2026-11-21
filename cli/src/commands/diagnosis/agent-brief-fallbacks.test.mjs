import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  judgeFallbackExit,
  parseFallbackCommand,
  positiveIntegerFromEnv,
  summarizeFallbackRows,
} from './agent-brief/fallback-verification.mjs';

describe('a fallback command counts as failed', () => {
  it('passes on exit 0 and on an advisory exit 1 that wrote nothing to stderr', () => {
    assert.deepEqual(judgeFallbackExit({ status: 0, stderr: '' }), { advisoryResult: false, failed: false });
    assert.deepEqual(judgeFallbackExit({ status: 1, stderr: ' \n' }), { advisoryResult: true, failed: false });
  });

  it('fails on an exit 1 that explains itself on stderr, on exit 2, a signal, a spawn error and a timeout', () => {
    assert.equal(judgeFallbackExit({ status: 1, stderr: 'boom' }).failed, true);
    assert.equal(judgeFallbackExit({ status: 2, stderr: '' }).failed, true);
    assert.equal(judgeFallbackExit({ status: null, signal: 'SIGTERM', stderr: '' }).failed, true);
    assert.equal(judgeFallbackExit({ status: 1, error: new Error('spawn'), stderr: '' }).failed, true);
    assert.deepEqual(judgeFallbackExit({ status: 1, timedOut: true, stderr: '' }), { advisoryResult: false, failed: true });
  });
});

describe('the fallback report totals', () => {
  it('counts passes, failures and slow rows, and names the slowest', () => {
    const summary = summarizeFallbackRows([
      { command: 'a', status: 'pass', elapsedMs: 10 },
      { command: 'b', status: 'fail', elapsedMs: 40, slow: true },
      { command: 'c', status: 'pass', elapsedMs: 25, slow: true },
    ]);
    assert.deepEqual({ ...summary, slowest: summary.slowest.command }, {
      passed: 2,
      failed: 1,
      slow: 2,
      totalMs: 75,
      slowest: 'b',
    });
  });

  it('has no slowest row when nothing ran', () => {
    assert.deepEqual(summarizeFallbackRows([]), { passed: 0, failed: 0, slow: 0, totalMs: 0, slowest: null });
  });
});

describe('a generated fallback command line', () => {
  it('keeps the arguments after the subcommand for the bare name and for node plus an entry file', () => {
    assert.deepEqual(parseFallbackCommand("ontology-atlas hubs '/my vault' --limit 5"), {
      args: ['hubs', '/my vault', '--limit', '5'],
    });
    assert.deepEqual(parseFallbackCommand('node /repo/cli/src/index.mjs facets /v'), { args: ['facets', '/v'] });
  });

  it('refuses an empty line and any other program', () => {
    assert.deepEqual(parseFallbackCommand('   '), { error: 'empty fallback command' });
    assert.deepEqual(parseFallbackCommand('rm -rf /'), { error: 'expected an ontology-atlas CLI command, got rm' });
  });
});

describe('a fallback setting from the environment', () => {
  it('uses the default when unset or empty and the parsed number when set', () => {
    assert.equal(positiveIntegerFromEnv('X', '--x', 7, {}), 7);
    assert.equal(positiveIntegerFromEnv('X', '--x', 7, { X: '' }), 7);
    assert.equal(positiveIntegerFromEnv('X', '--x', 7, { X: '12' }), 12);
  });

  it('returns an error naming both the variable and the flag for a bad value', () => {
    const result = positiveIntegerFromEnv('X', '--x', 7, { X: 'abc' });
    assert.ok(result instanceof Error);
    assert.match(result.message, /Received: "abc"\. Set X=N or --x N\.$/);
  });
});
