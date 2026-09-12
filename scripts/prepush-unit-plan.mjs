#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const TEST = /^(?:app|src)\/.*\.(?:test|spec)\.(?:ts|tsx)$/;
const APP_SOURCE = /^(?:app|src|messages)\//;
const quote = (value) => `'${String(value).replaceAll("'", `'"'"'`)}'`;
const suffix = "--exclude='**/*.perf.test.*' --exclude='tests/contract/**' --passWithNoTests";

export function prepushUnitCommand({ paths, base, exists = existsSync }) {
  if (!SHA.test(base ?? '')) throw new Error('base must be a 40-character lowercase Git object id');
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || path.length === 0 || path.includes('\0'))) {
    throw new Error('paths must be non-empty Git path strings');
  }
  const appPaths = paths.filter((path) => APP_SOURCE.test(path));
  if (appPaths.length === 0) return ':';
  if (appPaths.every((path) => TEST.test(path))) {
    const present = [...new Set(appPaths.filter((path) => exists(path)))].sort();
    if (present.length === 0) return ':';
    return `pnpm exec vitest run ${present.map(quote).join(' ')} ${suffix}`;
  }
  return `pnpm exec vitest run --changed=${quote(base)} ${suffix}`;
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
