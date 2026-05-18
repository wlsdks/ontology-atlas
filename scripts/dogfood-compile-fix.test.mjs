import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  captureDogfoodOntologyDiff,
  dogfoodCompileFixDiagnostic,
  dogfoodCompileFixExitCode,
  dogfoodDiffFileSummary,
  handleDogfoodCompileFixArgs,
  normalizeDogfoodCompileFixArgs,
  runDogfoodCompileFix,
} from './dogfood-compile-fix.mjs';

describe('dogfood compile-fix shortcut', () => {
  it('prints help without running compile --fix', () => {
    const output = [];
    const exitCode = runDogfoodCompileFix({
      argv: ['--', '--help'],
      stdout: { write: (text) => output.push(text) },
      spawn() {
        throw new Error('spawn should not run for help');
      },
    });

    assert.equal(exitCode, 0);
    assert.match(output.join(''), /pnpm dogfood:compile-fix/);
    assert.match(output.join(''), /canonicalization leaves a docs\/ontology git diff/);
  });

  it('normalizes the pnpm argument separator', () => {
    assert.deepEqual(normalizeDogfoodCompileFixArgs(['--', '--help']), ['--help']);
    assert.deepEqual(normalizeDogfoodCompileFixArgs(['--help']), ['--help']);
  });

  it('rejects unknown arguments before running compile --fix', () => {
    const diagnostics = [];
    const exitCode = handleDogfoodCompileFixArgs(['docs/ontology'], {
      stderr: { write: (text) => diagnostics.push(text) },
    });

    assert.equal(exitCode, 2);
    assert.deepEqual(diagnostics, [
      '[dogfood:compile-fix] unknown argument: docs/ontology\n' +
      'Run pnpm dogfood:compile-fix -- --help for usage.\n',
    ]);
  });

  it('runs compile --fix before checking the dogfood vault is unchanged', () => {
    const calls = [];
    const exitCode = runDogfoodCompileFix({
      argv: [],
      cwd: '/repo',
      stdio: 'pipe',
      spawn(command, args, options) {
        calls.push({ command, args, options });
        return { status: 0, stdout: 'existing diff' };
      },
    });

    assert.equal(exitCode, 0);
    assert.equal(calls.length, 3);
    assert.equal(calls[0].command, 'git');
    assert.deepEqual(calls[0].args, ['diff', '--', 'docs/ontology']);
    assert.equal(calls[0].options.cwd, '/repo');
    assert.equal(calls[0].options.encoding, 'utf-8');
    assert.equal(calls[1].command, process.execPath);
    assert.deepEqual(calls[1].args, ['cli/src/index.mjs', 'compile', 'docs/ontology', '--fix', '--summary', '--json']);
    assert.equal(calls[1].options.stdio, 'pipe');
    assert.deepEqual(calls[2].args, ['diff', '--', 'docs/ontology']);
  });

  it('skips the post-fix diff when compile --fix fails', () => {
    const calls = [];
    const exitCode = runDogfoodCompileFix({
      spawn(command, args) {
        calls.push({ command, args });
        return { status: calls.length === 1 ? 0 : 2, stdout: '' };
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(calls.length, 2);
  });

  it('fails when compile --fix changed docs/ontology', () => {
    const calls = [];
    const diagnostics = [];
    const exitCode = runDogfoodCompileFix({
      stderr: { write: (text) => diagnostics.push(text) },
      spawn(_command, args) {
        calls.push(args);
        return {
          status: 0,
          stdout: calls.length === 3
            ? 'diff --git a/docs/ontology/a.md b/docs/ontology/a.md\n'
            : 'before',
        };
      },
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(diagnostics, [
      '[dogfood:compile-fix] compile --fix changed docs/ontology; review and commit the canonicalized vault files.\n' +
      '[dogfood:compile-fix] changed files: docs/ontology/a.md\n',
    ]);
  });

  it('treats git diff launch anomalies as failures before compile --fix', () => {
    const calls = [];
    const diagnostics = [];
    const exitCode = runDogfoodCompileFix({
      stderr: { write: (text) => diagnostics.push(text) },
      spawn(_command, args) {
        calls.push(args);
        return { error: new Error('git missing') };
      },
    });

    assert.equal(exitCode, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(diagnostics, [
      '[dogfood:compile-fix] git diff -- docs/ontology failed to start: git missing\n',
    ]);
  });

  it('captures an existing docs/ontology diff as an allowed baseline', () => {
    const diagnostics = [];
    const result = captureDogfoodOntologyDiff({
      cwd: '/repo',
      stderr: { write: (text) => diagnostics.push(text) },
      spawn(command, args, options) {
        assert.equal(command, 'git');
        assert.deepEqual(args, ['diff', '--', 'docs/ontology']);
        assert.equal(options.cwd, '/repo');
        assert.equal(options.encoding, 'utf-8');
        return { status: 0, stdout: 'diff --git a/docs/ontology/x b/docs/ontology/x' };
      },
    });

    assert.deepEqual(result, {
      ok: true,
      exitCode: 0,
      stdout: 'diff --git a/docs/ontology/x b/docs/ontology/x',
    });
    assert.deepEqual(diagnostics, []);
  });

  it('normalizes child process exit status and diagnostics', () => {
    assert.equal(dogfoodCompileFixExitCode({ status: 0 }), 0);
    assert.equal(dogfoodCompileFixExitCode({ status: 2 }), 2);
    assert.equal(dogfoodCompileFixExitCode({ signal: 'SIGTERM' }), 1);
    assert.equal(dogfoodCompileFixExitCode({ error: new Error('spawn failed') }), 1);
    assert.equal(dogfoodCompileFixExitCode({}), 1);

    assert.equal(dogfoodCompileFixDiagnostic(['node', 'compile'], { status: 0 }), null);
    assert.match(
      dogfoodCompileFixDiagnostic(['node', 'compile'], { error: new Error('spawn failed') }),
      /node compile failed to start: spawn failed/,
    );
    assert.match(
      dogfoodCompileFixDiagnostic(['git', 'diff'], { signal: 'SIGTERM' }),
      /git diff terminated by SIGTERM/,
    );
    assert.match(
      dogfoodCompileFixDiagnostic(['git', 'diff'], {}),
      /git diff ended without an exit status/,
    );
  });

  it('summarizes changed files from git diff output', () => {
    const diff = [
      'diff --git a/docs/ontology/a.md b/docs/ontology/a.md',
      'index 1..2 100644',
      'diff --git a/docs/ontology/b.md b/docs/ontology/b.md',
      'index 3..4 100644',
      'diff --git a/docs/ontology/a.md b/docs/ontology/a.md',
    ].join('\n');

    assert.equal(dogfoodDiffFileSummary(diff), 'docs/ontology/a.md, docs/ontology/b.md');
    assert.equal(dogfoodDiffFileSummary(diff, { limit: 1 }), 'docs/ontology/a.md, +1 more');
    assert.equal(dogfoodDiffFileSummary(''), 'unknown docs/ontology diff');
  });
});
