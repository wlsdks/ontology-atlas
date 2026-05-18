import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  dogfoodStatusArgSuggestion,
  dogfoodStatusDiagnostic,
  dogfoodStatusExitCode,
  dogfoodStatusFailureHint,
  dogfoodStatusSummary,
  handleDogfoodStatusArgs,
  normalizeDogfoodStatusArgs,
  runDogfoodStatus,
} from './dogfood-status.mjs';

describe('dogfood status shortcut', () => {
  it('prints help without running health or workspace-brief', () => {
    const output = [];
    const exitCode = runDogfoodStatus({
      argv: ['--', '--help'],
      stdout: { write: (text) => output.push(text) },
      spawn() {
        throw new Error('spawn should not run for help');
      },
    });

    assert.equal(exitCode, 0);
    assert.match(output.join(''), /pnpm dogfood:status/);
    assert.match(output.join(''), /health \+ workspace-brief pair/);
    assert.match(output.join(''), /final health\/workspace-brief status summary/);
    assert.match(output.join(''), /pnpm dogfood:verify/);
    assert.match(output.join(''), /full installed-style dogfood vault gate/);
  });

  it('normalizes the pnpm argument separator', () => {
    assert.deepEqual(normalizeDogfoodStatusArgs(['--', '--help']), ['--help']);
    assert.deepEqual(normalizeDogfoodStatusArgs(['--help']), ['--help']);
  });

  it('rejects unknown arguments before running health or workspace-brief', () => {
    const diagnostics = [];
    const exitCode = handleDogfoodStatusArgs(['docs/ontology'], {
      stderr: { write: (text) => diagnostics.push(text) },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, [
      '[dogfood:status] unknown argument: docs/ontology.\n' +
      'Run pnpm dogfood:status -- --help for usage.\n',
    ]);
  });

  it('suggests --help for close unknown help flags', () => {
    const diagnostics = [];
    const exitCode = handleDogfoodStatusArgs(['--hlep'], {
      stderr: { write: (text) => diagnostics.push(text) },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, [
      '[dogfood:status] unknown argument: --hlep. Did you mean --help?\n' +
      'Run pnpm dogfood:status -- --help for usage.\n',
    ]);
    assert.equal(dogfoodStatusArgSuggestion('--hlep'), '--help');
    assert.equal(dogfoodStatusArgSuggestion('docs/ontology'), null);
  });

  it('runs workspace-brief even when health fails and preserves the first non-zero exit', () => {
    const calls = [];
    const output = [];
    const diagnostics = [];
    const exitCode = runDogfoodStatus({
      argv: [],
      cwd: '/repo',
      stdout: { write: (text) => output.push(text) },
      stderr: { write: (text) => diagnostics.push(text) },
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
    assert.equal(calls[0].options.stdio, 'inherit');
    assert.deepEqual(output, ['[dogfood:status] health:1 · workspace-brief:0\n']);
    assert.deepEqual(diagnostics, [
      '[dogfood:status] run pnpm dogfood:verify for the full installed-style dogfood vault gate\n',
    ]);
  });

  it('does not print the verify follow-up hint when both checks pass', () => {
    const output = [];
    const diagnostics = [];
    const exitCode = runDogfoodStatus({
      argv: [],
      stdout: { write: (text) => output.push(text) },
      stderr: { write: (text) => diagnostics.push(text) },
      spawn() {
        return { status: 0 };
      },
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(output, ['[dogfood:status] health:0 · workspace-brief:0\n']);
    assert.deepEqual(diagnostics, []);
  });

  it('returns the workspace-brief failure when health passes first', () => {
    const calls = [];
    const exitCode = runDogfoodStatus({
      stdio: 'pipe',
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
      stdio: 'pipe',
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

  it('formats the final health and workspace-brief status summary', () => {
    assert.equal(
      dogfoodStatusSummary([
        { label: 'health', status: 0 },
        { label: 'workspace-brief', status: 2 },
      ]),
      '[dogfood:status] health:0 · workspace-brief:2',
    );
    assert.equal(
      dogfoodStatusFailureHint(),
      '[dogfood:status] run pnpm dogfood:verify for the full installed-style dogfood vault gate',
    );
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
