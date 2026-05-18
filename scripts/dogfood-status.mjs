#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUS_COMMANDS = [
  ['cli/src/index.mjs', 'health', 'docs/ontology'],
  ['cli/src/index.mjs', 'workspace-brief', 'docs/ontology'],
];

export function runDogfoodStatus({
  spawn = spawnSync,
  cwd = process.cwd(),
  stdio = 'inherit',
  stderr = process.stderr,
} = {}) {
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
