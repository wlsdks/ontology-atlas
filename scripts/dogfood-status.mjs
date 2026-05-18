#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { closestDogfoodOption, stripLeadingPnpmSeparator } from './lib/dogfood-args.mjs';

const STATUS_COMMANDS = [
  { label: 'health', args: ['cli/src/index.mjs', 'health', 'docs/ontology'] },
  { label: 'workspace-brief', args: ['cli/src/index.mjs', 'workspace-brief', 'docs/ontology'] },
];
export function runDogfoodStatus({
  spawn = spawnSync,
  cwd = process.cwd(),
  stdio = 'inherit',
  stderr = process.stderr,
  stdout = process.stdout,
  argv = process.argv.slice(2),
} = {}) {
  const argsStatus = handleDogfoodStatusArgs(argv, { stdout, stderr });
  if (argsStatus !== null) return argsStatus;

  let exitCode = 0;
  const results = [];

  for (const { label, args } of STATUS_COMMANDS) {
    const result = spawn(process.execPath, args, { cwd, stdio });
    const diagnostic = dogfoodStatusDiagnostic(args, result);
    if (diagnostic) {
      stderr.write(`${diagnostic}\n`);
    }
    const status = dogfoodStatusExitCode(result);
    results.push({ label, status });

    if (exitCode === 0 && status !== 0) {
      exitCode = status;
    }
  }

  if (stdio === 'inherit') {
    stdout.write(`${dogfoodStatusSummary(results)}\n`);
    if (exitCode !== 0) {
      stderr.write(`${dogfoodStatusFailureHint()}\n`);
    }
  }

  return exitCode;
}

export function handleDogfoodStatusArgs(argv = [], { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = normalizeDogfoodStatusArgs(argv);
  if (args.length === 0) return null;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    stdout.write(dogfoodStatusUsage());
    return 0;
  }
  const suggestion = args.length === 1 ? dogfoodStatusArgSuggestion(args[0]) : null;
  const suffix = suggestion ? ` Did you mean ${suggestion}?` : '';
  stderr.write(
    `[dogfood:status] unknown argument: ${args[0]}.${suffix}\n` +
    'Run pnpm dogfood:status -- --help for usage.\n',
  );
  return 2;
}

export function normalizeDogfoodStatusArgs(argv = []) {
  return stripLeadingPnpmSeparator(argv);
}

export function dogfoodStatusArgSuggestion(arg) {
  return closestDogfoodOption(arg, ['--help', '-h']);
}

export function dogfoodStatusExitCode(result) {
  if (typeof result?.status === 'number') return result.status;
  if (typeof result?.signal === 'string' && result.signal.length > 0) return 1;
  if (result?.error) return 1;
  return 1;
}

export function dogfoodStatusSummary(results = []) {
  const parts = results.map((row) => `${row.label}:${row.status}`);
  return `[dogfood:status] ${parts.join(' · ')}`;
}

export function dogfoodStatusFailureHint() {
  return '[dogfood:status] run pnpm dogfood:verify for the full installed-style dogfood vault gate';
}

export function dogfoodStatusUsage() {
  return `Usage:
  pnpm dogfood:status
  pnpm dogfood:status -- --help

Runs the cheap human-readable health + workspace-brief pair over this repo's
docs/ontology vault, prints a final health/workspace-brief status summary, and
preserves the first failing exit code.
On failure it prints:
  ${dogfoodStatusFailureHint()}
`;
}

export function dogfoodStatusDiagnostic(args, result) {
  const command = `node ${args.join(' ')}`;
  if (result?.error) {
    const message = result.error instanceof Error ? result.error.message : String(result.error);
    return `[dogfood:status] ${command} failed to start: ${message}`;
  }
  if (typeof result?.signal === 'string' && result.signal.length > 0) {
    return `[dogfood:status] ${command} terminated by ${result.signal}`;
  }
  if (typeof result?.status !== 'number') {
    return `[dogfood:status] ${command} ended without an exit status`;
  }
  return null;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runDogfoodStatus();
}
