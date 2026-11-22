#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { readTestReach } from '../lib/import-graph/test-reach.mjs';

const SHA = /^[0-9a-f]{40}$/;
const TEST = /^(?:app|src)\/.*\.(?:test|spec)\.(?:ts|tsx)$/;
const MESSAGE_PART = /^messages\/[^/]+\/[^/]+\.json$/;
const quote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const suffix = "--exclude='**/*.perf.test.*' --exclude='tests/contract/**'";

export function prepushUnitCommand({ paths, base, exists = existsSync, reach }) {
  if (!SHA.test(base ?? '')) throw new Error('base must be a 40-character lowercase Git object id');
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || path.length === 0 || path.includes('\0'))) {
    throw new Error('paths must be non-empty Git path strings');
  }
  const composites = paths.filter((path) => MESSAGE_PART.test(path)).map((path) => `messages/${path.split('/')[1]}.json`);
  const affected = (reach ?? readTestReach()).testsReaching([...new Set([...paths, ...composites])]).unit;
  const tests = [...new Set([...paths.filter((path) => TEST.test(path)), ...affected])]
    .filter((path) => exists(path) && TEST.test(path) && !/\.perf\.test\.tsx?$/.test(path))
    .sort();
  return tests.length ? `pnpm exec vitest run ${tests.map(quote).join(' ')} ${suffix}` : ':';
}

function main(argv) {
  if (argv.length !== 1 || !argv[0].startsWith('--base=')) throw new Error('usage: prepush-unit-plan --base=<40-hex-sha>');
  const base = argv[0].slice('--base='.length);
  if (!SHA.test(base)) throw new Error('base must be a 40-character lowercase Git object id');
  const raw = execFileSync('git', ['diff', '--name-only', '-z', `${base}...HEAD`]);
  const paths = raw.toString('utf8').split('\0').filter(Boolean);
  process.stdout.write(`${prepushUnitCommand({ paths, base })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`[prepush-unit-plan] ${error.message}\n`); process.exitCode = 1; }
}
