import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runDogfoodStatus } from './dogfood-status.mjs';

describe('dogfood status shortcut', () => {
  it('runs workspace-brief even when health fails and preserves the first non-zero exit', () => {
    const calls = [];
    const exitCode = runDogfoodStatus({
      cwd: '/repo',
      stdio: 'pipe',
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: calls.length === 1 ? 1 : 0 };
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((call) => call.args.slice(1)), [
      ['health', 'docs/ontology'],
      ['workspace-brief', 'docs/ontology'],
    ]);
    assert.equal(calls[0].options.cwd, '/repo');
    assert.equal(calls[0].options.stdio, 'pipe');
  });

  it('returns the workspace-brief failure when health passes first', () => {
    const calls = [];
    const exitCode = runDogfoodStatus({
      spawn(_command, args) {
        calls.push(args);
        return { status: calls.length === 1 ? 0 : 2 };
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(calls.length, 2);
  });
});
