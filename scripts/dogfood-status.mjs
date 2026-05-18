#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATUS_COMMANDS = [
  ['cli/src/index.mjs', 'health', 'docs/ontology'],
  ['cli/src/index.mjs', 'workspace-brief', 'docs/ontology'],
];

export function runDogfoodStatus({ spawn = spawnSync, cwd = process.cwd(), stdio = 'inherit' } = {}) {
  let exitCode = 0;

  for (const args of STATUS_COMMANDS) {
    const result = spawn(process.execPath, args, { cwd, stdio });
    const status = typeof result?.status === 'number' ? result.status : 1;

    if (exitCode === 0 && status !== 0) {
      exitCode = status;
    }
  }

  return exitCode;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runDogfoodStatus();
}
