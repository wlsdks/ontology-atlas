#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

import { readNodeTestNamePattern } from './lib/test-name-pattern.mjs';

function tapCount(output, label) {
  const match = String(output).match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
  return match ? Number.parseInt(match[1], 10) : null;
}

function focusedTestTargets(argv) {
  const targets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--test-name-pattern') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--test-name-pattern=')) continue;
    if (arg.startsWith('-')) continue;
    targets.push(arg);
  }
  return targets;
}

const args = process.argv.slice(2);
const pattern = readNodeTestNamePattern(args);
const testTargets = focusedTestTargets(args);
const result = spawnSync(process.execPath, ['--test', ...args], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf-8',
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) {
  console.error(`[focused-node-test] failed to start node --test: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (pattern) {
  const pass = tapCount(result.stdout, 'pass');
  const fail = tapCount(result.stdout, 'fail');
  const cancelled = tapCount(result.stdout, 'cancelled');
  if (pass === 0 && fail === 0 && cancelled === 0) {
    const targetSuffix = testTargets.length > 0 ? ` in ${testTargets.join(', ')}` : '';
    console.error(`[focused-node-test] no tests matched --test-name-pattern=${pattern}${targetSuffix}`);
    process.exit(1);
  }
}
