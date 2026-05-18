#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closestDogfoodOption, stripLeadingPnpmSeparator } from './lib/dogfood-args.mjs';

const COMPILE_FIX_ARGS = ['cli/src/index.mjs', 'compile', 'docs/ontology', '--fix', '--summary', '--json'];
const DIFF_ARGS = ['diff', '--', 'docs/ontology'];
export function runDogfoodCompileFix({
  spawn = spawnSync,
  cwd = process.cwd(),
  stdio = 'inherit',
  stderr = process.stderr,
  stdout = process.stdout,
  argv = process.argv.slice(2),
} = {}) {
  const argsStatus = handleDogfoodCompileFixArgs(argv, { stdout, stderr });
  if (argsStatus !== null) return argsStatus;

  const before = captureDogfoodOntologyDiff({ spawn, cwd, stderr });
  if (!before.ok) return before.exitCode;

  const compile = spawn(process.execPath, COMPILE_FIX_ARGS, { cwd, stdio });
  const compileDiagnostic = dogfoodCompileFixDiagnostic(['node', ...COMPILE_FIX_ARGS], compile);
  if (compileDiagnostic) stderr.write(`${compileDiagnostic}\n`);

  const compileStatus = dogfoodCompileFixExitCode(compile);
  if (compileStatus !== 0) return compileStatus;

  const after = captureDogfoodOntologyDiff({ spawn, cwd, stderr });
  if (!after.ok) return after.exitCode;
  if (after.stdout !== before.stdout) {
    const files = dogfoodDiffFileSummary(after.stdout);
    stderr.write(
      '[dogfood:compile-fix] compile --fix changed docs/ontology; ' +
      'review and commit the canonicalized vault files.\n' +
      `[dogfood:compile-fix] changed files: ${files}\n` +
      '[dogfood:compile-fix] run pnpm docs-vault:build, then rerun pnpm dogfood:compile-fix.\n',
    );
    return 1;
  }
  if (stdio === 'inherit') {
    stdout.write(`${dogfoodCompileFixSummary()}\n`);
  }
  return 0;
}

export function handleDogfoodCompileFixArgs(argv = [], { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = normalizeDogfoodCompileFixArgs(argv);
  if (args.length === 0) return null;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    stdout.write(dogfoodCompileFixUsage());
    return 0;
  }
  const suggestion = args.length === 1 ? dogfoodCompileFixArgSuggestion(args[0]) : null;
  const suffix = suggestion ? ` Did you mean ${suggestion}?` : '';
  stderr.write(
    `[dogfood:compile-fix] unknown argument: ${args[0]}.${suffix}\n` +
    'Run pnpm dogfood:compile-fix -- --help for usage.\n',
  );
  return 2;
}

export function normalizeDogfoodCompileFixArgs(argv = []) {
  return stripLeadingPnpmSeparator(argv);
}

export function dogfoodCompileFixArgSuggestion(arg) {
  return closestDogfoodOption(arg, ['--help', '-h']);
}

export function captureDogfoodOntologyDiff({ spawn = spawnSync, cwd = process.cwd(), stderr = process.stderr } = {}) {
  const diff = spawn('git', DIFF_ARGS, { cwd, encoding: 'utf-8' });
  const diffDiagnostic = dogfoodCompileFixDiagnostic(['git', ...DIFF_ARGS], diff);
  if (diffDiagnostic) {
    stderr.write(`${diffDiagnostic}\n`);
    return { ok: false, exitCode: dogfoodCompileFixExitCode(diff), stdout: '' };
  }
  const diffStatus = dogfoodCompileFixExitCode(diff);
  if (diffStatus !== 0) return { ok: false, exitCode: diffStatus, stdout: '' };
  return { ok: true, exitCode: 0, stdout: String(diff.stdout ?? '') };
}

export function dogfoodCompileFixExitCode(result) {
  if (typeof result?.status === 'number') return result.status;
  if (typeof result?.signal === 'string' && result.signal.length > 0) return 1;
  if (result?.error) return 1;
  return 1;
}

export function dogfoodCompileFixSummary() {
  return '[dogfood:compile-fix] docs/ontology unchanged';
}

export function dogfoodCompileFixUsage() {
  return `Usage:
  pnpm dogfood:compile-fix
  pnpm dogfood:compile-fix -- --help

Runs compile --fix against this repo's docs/ontology vault and fails if
canonicalization leaves a docs/ontology git diff. Successful runs end with:
  ${dogfoodCompileFixSummary()}
`;
}

export function dogfoodCompileFixDiagnostic(args, result) {
  const command = args.join(' ');
  if (result?.error) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    return `[dogfood:compile-fix] ${command} failed to start: ${message}`;
  }
  if (typeof result?.signal === 'string' && result.signal.length > 0) {
    return `[dogfood:compile-fix] ${command} terminated by ${result.signal}`;
  }
  if (typeof result?.status !== 'number') {
    return `[dogfood:compile-fix] ${command} ended without an exit status`;
  }
  return null;
}

export function dogfoodDiffFileSummary(diffText, { limit = 8 } = {}) {
  const files = [];
  const seen = new Set();
  const diffHeader = /^diff --git a\/.+? b\/(.+)$/gm;
  let match;
  while ((match = diffHeader.exec(String(diffText))) !== null) {
    const file = match[1];
    if (!seen.has(file)) {
      seen.add(file);
      files.push(file);
    }
  }
  if (files.length === 0) return 'unknown docs/ontology diff';
  const shown = files.slice(0, limit);
  const suffix = files.length > limit ? `, +${files.length - limit} more` : '';
  return `${shown.join(', ')}${suffix}`;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runDogfoodCompileFix();
}
