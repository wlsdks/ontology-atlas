#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUS_COMMANDS = [
  ['cli/src/index.mjs', 'health', 'docs/ontology'],
  ['cli/src/index.mjs', 'workspace-brief', 'docs/ontology'],
];
const DOGFOOD_STATUS_USAGE = `Usage:
  pnpm dogfood:status
  pnpm dogfood:status -- --help

Runs the cheap human-readable health + workspace-brief pair over this repo's
docs/ontology vault and preserves the first failing exit code.
`;

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

  for (const args of STATUS_COMMANDS) {
    const result = spawn(process.execPath, args, { cwd, stdio });
    const diagnostic = dogfoodStatusDiagnostic(args, result);
    if (diagnostic) {
      stderr.write(`${diagnostic}\n`);
    }
    const status = dogfoodStatusExitCode(result);

    if (exitCode === 0 && status !== 0) {
      exitCode = status;
    }
  }

  return exitCode;
}

export function handleDogfoodStatusArgs(argv = [], { stdout = process.stdout, stderr = process.stderr } = {}) {
  const args = normalizeDogfoodStatusArgs(argv);
  if (args.length === 0) return null;
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    stdout.write(DOGFOOD_STATUS_USAGE);
    return 0;
  }
  stderr.write(
    `[dogfood:status] unknown argument: ${args[0]}\n` +
    'Run pnpm dogfood:status -- --help for usage.\n',
  );
  return 2;
}

export function normalizeDogfoodStatusArgs(argv = []) {
  return argv[0] === '--' ? argv.slice(1) : argv;
}

export function dogfoodStatusExitCode(result) {
  if (typeof result?.status === 'number') return result.status;
  if (typeof result?.signal === 'string' && result.signal.length > 0) return 1;
  if (result?.error) return 1;
  return 1;
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
