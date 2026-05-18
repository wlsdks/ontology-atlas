#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readNodeTestNamePattern } from './lib/test-name-pattern.mjs';

const NODE_TEST_OPTIONS_WITH_VALUE = new Set([
  '--test-concurrency',
  '--test-name-pattern',
  '--test-reporter',
  '--test-reporter-destination',
  '--test-shard',
  '--test-timeout',
]);
const NODE_TEST_REPORTER_OPTIONS = new Set([
  '--test-reporter',
  '--test-reporter-destination',
]);

function isNodeTestOptionWithInlineValue(arg) {
  for (const option of NODE_TEST_OPTIONS_WITH_VALUE) {
    if (arg.startsWith(`${option}=`)) return true;
  }
  return false;
}

export function tapCount(output, label) {
  const match = String(output).match(new RegExp(`^# ${label} (\\d+)$`, 'm'));
  return match ? Number.parseInt(match[1], 10) : null;
}

export function focusedTestTargets(argv) {
  const targets = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (NODE_TEST_OPTIONS_WITH_VALUE.has(arg)) {
      if (argv[index + 1] && !argv[index + 1].startsWith('-')) index += 1;
      continue;
    }
    if (isNodeTestOptionWithInlineValue(arg)) continue;
    if (arg.startsWith('-')) continue;
    targets.push(arg);
  }
  return targets;
}

export function disallowedReporterOption(argv) {
  for (const arg of argv) {
    if (NODE_TEST_REPORTER_OPTIONS.has(arg)) return arg;
    for (const option of NODE_TEST_REPORTER_OPTIONS) {
      if (arg.startsWith(`${option}=`)) return option;
    }
  }
  return null;
}

export function disallowedReporterSource({ argv = [], env = process.env } = {}) {
  const argOption = disallowedReporterOption(argv);
  if (argOption) return { option: argOption, source: 'argv' };
  const nodeOptions = String(env.NODE_OPTIONS ?? '');
  const envOption = disallowedReporterOption(nodeOptions.split(/\s+/).filter(Boolean));
  return envOption ? { option: envOption, source: 'NODE_OPTIONS' } : null;
}

export function runFocusedNodeTest({
  argv = process.argv.slice(2),
  spawn = spawnSync,
  cwd = process.cwd(),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const pattern = readNodeTestNamePattern(argv);
  const testTargets = focusedTestTargets(argv);
  if (!pattern) {
    const targetSuffix = testTargets.length > 0 ? ` for ${testTargets.join(', ')}` : '';
    stderr.write(
      `[focused-node-test] --test-name-pattern is required${targetSuffix}; ` +
      'use node --test directly for a full test run\n',
    );
    return 2;
  }
  if (testTargets.length === 0) {
    stderr.write(
      '[focused-node-test] at least one test target is required; ' +
      'use node --test directly for a full test run\n',
    );
    return 2;
  }
  const reporterOption = disallowedReporterSource({ argv, env });
  if (reporterOption) {
    const sourceSuffix = reporterOption.source === 'NODE_OPTIONS' ? ' from NODE_OPTIONS' : '';
    stderr.write(
      `[focused-node-test] ${reporterOption.option}${sourceSuffix} is not supported; ` +
      'the wrapper requires the default TAP reporter to verify focused test counts\n',
    );
    return 2;
  }
  const result = spawn(process.execPath, ['--test', ...argv], {
    cwd,
    env,
    encoding: 'utf-8',
  });

  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  if (result.error) {
    stderr.write(`[focused-node-test] failed to start node --test: ${result.error.message}\n`);
    return 1;
  }
  if (result.signal) {
    const targetSuffix = testTargets.length > 0 ? ` in ${testTargets.join(', ')}` : '';
    stderr.write(`[focused-node-test] node --test terminated by ${result.signal}${targetSuffix}\n`);
    return 1;
  }
  if (typeof result.status !== 'number') {
    const targetSuffix = testTargets.length > 0 ? ` in ${testTargets.join(', ')}` : '';
    stderr.write(`[focused-node-test] node --test ended without an exit status${targetSuffix}\n`);
    return 1;
  }
  if (result.status !== 0) {
    return result.status;
  }

  if (pattern) {
    const tests = tapCount(result.stdout, 'tests');
    const pass = tapCount(result.stdout, 'pass');
    const fail = tapCount(result.stdout, 'fail');
    const cancelled = tapCount(result.stdout, 'cancelled');
    const skipped = tapCount(result.stdout, 'skipped');
    if (tests === null || pass === null || fail === null || cancelled === null) {
      const targetSuffix = testTargets.length > 0 ? ` in ${testTargets.join(', ')}` : '';
      stderr.write(
        `[focused-node-test] could not verify --test-name-pattern=${pattern} matched tests${targetSuffix}; ` +
        'use the default TAP reporter\n',
      );
      return 1;
    }
    if (pass === 0 && fail === 0 && cancelled === 0) {
      const targetSuffix = testTargets.length > 0 ? ` in ${testTargets.join(', ')}` : '';
      stderr.write(`[focused-node-test] no tests matched --test-name-pattern=${pattern}${targetSuffix}\n`);
      return 1;
    }
    const skippedText = skipped === null ? '' : ` skipped=${skipped}`;
    stdout.write(
      `[focused-node-test] pattern=${pattern} targets=${testTargets.join(',')} ` +
      `tests=${tests} pass=${pass} fail=${fail} cancelled=${cancelled}${skippedText}\n`,
    );
  }

  return 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runFocusedNodeTest();
}
