import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dogfoodStatusDiagnostic, dogfoodStatusExitCode, runDogfoodStatus } from './dogfood-status.mjs';

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

  it('treats spawn errors and signals as failures while still running both checks', () => {
    const calls = [];
    const diagnostics = [];
    const exitCode = runDogfoodStatus({
      stderr: { write: (text) => diagnostics.push(text) },
      spawn(_command, args) {
        calls.push(args);
        return calls.length === 1
          ? { status: null, signal: 'SIGTERM' }
          : { error: new Error('spawn failed') };
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(diagnostics, [
      '[dogfood:status] node cli/src/index.mjs health docs/ontology terminated by SIGTERM\n',
      '[dogfood:status] node cli/src/index.mjs workspace-brief docs/ontology failed to start: spawn failed\n',
    ]);
  });

  it('normalizes missing child status to a failing exit code', () => {
    assert.equal(dogfoodStatusExitCode({ status: 0 }), 0);
    assert.equal(dogfoodStatusExitCode({ status: 2 }), 2);
    assert.equal(dogfoodStatusExitCode({ status: null, signal: 'SIGTERM' }), 1);
    assert.equal(dogfoodStatusExitCode({ error: new Error('spawn failed') }), 1);
    assert.equal(dogfoodStatusExitCode({}), 1);
  });

  it('formats child launch and signal diagnostics without wrapping normal exits', () => {
    assert.equal(dogfoodStatusDiagnostic(['cli/src/index.mjs', 'health'], { status: 1 }), null);
    assert.match(
      dogfoodStatusDiagnostic(['cli/src/index.mjs', 'health'], { error: new Error('spawn failed') }),
      /node cli\/src\/index\.mjs health failed to start: spawn failed/,
    );
    assert.match(
      dogfoodStatusDiagnostic(['cli/src/index.mjs', 'health'], { signal: 'SIGTERM' }),
      /node cli\/src\/index\.mjs health terminated by SIGTERM/,
    );
    assert.match(
      dogfoodStatusDiagnostic(['cli/src/index.mjs', 'health'], {}),
      /node cli\/src\/index\.mjs health ended without an exit status/,
    );
  });
});
