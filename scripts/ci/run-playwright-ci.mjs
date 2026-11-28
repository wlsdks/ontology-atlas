#!/usr/bin/env node
// Whole files stay together: existing serial suites and file hooks keep their semantics.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { quarantinedBrowserSpecs, readQuarantine } from '../lib/ci/quarantine.mjs';

const CI_MAX_FAILURES = 5;

function* specsIn(suite) {
  yield* suite.specs ?? [];
  for (const child of suite.suites ?? []) yield* specsIn(child);
}

export function inventoryFiles(report) {
  if (report.errors?.length) throw new Error('Playwright discovery reported errors');
  const files = new Map();
  for (const spec of specsIn(report)) {
    if (typeof spec.file !== 'string' || spec.file.match(/^(?:[\w-]+\/)*[\w-]+\.spec\.ts$/)?.[0] !== spec.file) throw new Error(`unsupported spec path: ${spec.file}`);
    if (!Array.isArray(spec.tests) || spec.tests.length === 0) throw new Error(`zero tests in ${spec.file}`);
    files.set(spec.file, (files.get(spec.file) ?? 0) + spec.tests.length);
  }
  if (files.size === 0) throw new Error('Playwright discovery collected zero files');
  return [...files].map(([file, tests]) => ({ file, tests }));
}

export function balanceFiles(files, history, total) {
  if (!Number.isInteger(total) || total < 1) throw new Error('invalid shard count');
  if (new Set(files.map((row) => row.file)).size !== files.length) throw new Error('duplicate inventory file');
  const weighted = files.map((row) => {
    const measured = history.files?.[row.file];
    const seconds = measured && measured.seconds > 0
      ? measured.seconds : 5 * row.tests;
    return { ...row, seconds };
  }).sort((a, b) => b.seconds - a.seconds || a.file.localeCompare(b.file, 'en'));
  const shards = Array.from({ length: total }, () => ({ files: [], seconds: 0, tests: 0 }));
  for (const row of weighted) {
    const target = shards.reduce((best, shard) => shard.seconds < best.seconds ? shard : best);
    target.files.push(row.file);
    target.seconds += row.seconds;
    target.tests += row.tests;
  }
  return shards;
}

function parseArguments(argv) {
  const options = { shard: '1/3', project: [], excluded: [], only: [], help: false };
  const seen = new Set();
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      if (argv.length !== 1) throw new Error('--help must be used alone');
      options.help = true;
      continue;
    }
    const match = /^(--shard|--project|--exclude|--only)=(.+)$/.exec(arg);
    if (!match) throw new Error(`unknown or malformed argument: ${arg}; use --help`);
    const [, key, value] = match;
    const identity = key === '--exclude' || key === '--only' ? arg : key;
    if (seen.has(identity)) throw new Error(`duplicate argument: ${key}`);
    seen.add(identity);
    if (key === '--shard') options.shard = value;
    if (key === '--project') {
      if (!['smoke', 'post-merge', 'website', 'website-post-merge'].includes(value)) throw new Error(`unsupported project: ${value}`);
      options.project = [arg];
    }
    if (key === '--exclude') {
      if (!['web-surface-smoke.spec.ts', 'contextual-meaning-editor.spec.ts'].includes(value)) {
        throw new Error('only separately protected surface specs may be excluded');
      }
      options.excluded.push(value);
    }
    if (key === '--only') {
      if (value.match(/^(?:[\w-]+\/)*[\w-]+\.spec\.ts$/)?.[0] !== value) throw new Error(`unsupported spec path: ${value}`);
      options.only.push(value);
    }
  }
  const { shard } = options;
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(shard)) throw new Error('invalid shard');
  const [index, total] = shard.split('/').map(Number);
  if (!Number.isSafeInteger(index) || !Number.isSafeInteger(total)) throw new Error('invalid shard');
  if (index > total) throw new Error('shard index exceeds total');
  return { ...options, index, total };
}

/**
 * One `::error` line per spec file with a failed test, titled so `pnpm pr:land` can read the
 * failing files of `main`'s full run back from the check annotations without downloading logs.
 */
export const FAILING_SPEC_TITLE = 'failing spec';

export function failingSpecFiles(report) {
  const failed = new Set();
  for (const spec of specsIn(report)) {
    if ((spec.tests ?? []).some((test) => test.status === 'unexpected')) failed.add(spec.file);
  }
  return [...failed].sort();
}

function failureAnnotations(reportFile) {
  let report;
  try { report = JSON.parse(readFileSync(reportFile, 'utf8')); } catch { return []; }
  return failingSpecFiles(report).map((file) => `::error file=tests/e2e/${file},title=${FAILING_SPEC_TITLE}::tests/e2e/${file}`);
}

function executionSummary(report) {
  const summary = { expected: 0, flaky: 0, skipped: 0 };
  for (const spec of specsIn(report)) {
    for (const test of spec.tests) {
      const subject = `${spec.file}: ${spec.title ?? 'test'}`;
      if (!Array.isArray(test.results) || test.results.length === 0) throw new Error(`missing execution results for ${subject}`);
      const last = test.results.at(-1);
      if (test.status === 'skipped') {
        if (test.expectedStatus !== 'skipped' || last.status !== 'skipped') throw new Error(`unexpected skipped outcome for ${subject}`);
      } else if (!['expected', 'flaky'].includes(test.status)
        || !['passed', 'failed', 'timedOut'].includes(last.status)
        || last.status !== test.expectedStatus) {
        throw new Error(`unsuccessful execution outcome for ${subject}`);
      }
      summary[test.status]++;
    }
  }
  return summary;
}

export function runPlaywrightCi(argv, { spawn = spawnSync, cwd = process.cwd(), env = process.env, quarantine } = {}) {
  const { shard, index, total, project, excluded, only, help } = parseArguments(argv);
  if (help) {
    console.log('Usage: node scripts/ci/run-playwright-ci.mjs [--shard=N/M] [--project=smoke|post-merge|website|website-post-merge] [--exclude=SPEC] [--only=SPEC...]\nDefaults: shard 1/3, every project, every file. Exclusions: web-surface-smoke.spec.ts, contextual-meaning-editor.spec.ts. --only names files under tests/e2e/; one that discovery cannot find is an error.\nFiles in tests/quarantine.json never run here; `node scripts/ci/quarantine.mjs run-browser` runs them.\nUse --help or -h alone to display this help without running tests.');
    return 0;
  }
  // Every gating run leaves the quarantined specs out, so they block neither a merge nor a release.
  const quarantined = quarantinedBrowserSpecs(quarantine ?? readQuarantine());
  const discovered = spawn('pnpm', ['exec', 'playwright', 'test', ...project, '--list', '--reporter=json'], {
    cwd, env, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (discovered.status !== 0) throw new Error(`Playwright discovery failed: ${discovered.stderr ?? ''}`);
  const discovery = JSON.parse(discovered.stdout);
  const inventory = inventoryFiles(discovery);
  if (only.length > 0) {
    const discovered = new Set(inventory.map((row) => row.file));
    const missing = only.filter((file) => !discovered.has(file));
    if (missing.length > 0) throw new Error(`named spec(s) not discovered: ${missing.join(', ')}`);
  }
  const held = inventory.filter((row) => quarantined.includes(row.file) && (only.length === 0 || only.includes(row.file)))
    .map((row) => row.file);
  if (held.length > 0) console.log(`[playwright-ci] ${held.length} quarantined file(s) left out: ${held.join(', ')}`);
  const files = inventory.filter((row) => !excluded.includes(row.file) && !held.includes(row.file)
    && (only.length === 0 || only.includes(row.file)));
  if (files.length === 0) throw new Error('no suite files remain after surface allocation');
  const history = JSON.parse(readFileSync(new URL('../data/playwright-file-durations.json', import.meta.url), 'utf8'));
  const assignment = balanceFiles(files, history, total);
  const selected = assignment[index - 1];
  mkdirSync(resolve(cwd, 'output/playwright'), { recursive: true });
  writeFileSync(resolve(cwd, `output/playwright/assignment-${index}.json`), JSON.stringify({ shard, excluded, quarantined: held, assignment }, null, 2));
  console.log(`[playwright-ci] shard ${shard}: ${selected.files.length} files, ${selected.tests} tests, estimated ${selected.seconds.toFixed(1)} test-seconds`);
  const unmeasured = files.filter((row) => !history.files?.[row.file]).map((row) => row.file);
  if (unmeasured.length > 0) {
    console.log(`[playwright-ci] ${unmeasured.length} file(s) balanced on a guess; refresh with pnpm e2e:durations: ${unmeasured.join(', ')}`);
  }
  if (selected.files.length === 0) {
    console.log('[playwright-ci] no files assigned; every collected file belongs to another shard');
    return 0;
  }
  // File arguments are regexes. Anchor and escape them to avoid substring matches.
  const filters = selected.files.map((file) => `/tests/e2e/${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  const reportFile = resolve(cwd, `output/playwright/results-${index}.json`);
  rmSync(reportFile, { force: true });
  // A red shard cannot become green by running more files, and a shared setup regression repeats in
  // every spec, so CI stops the shard early; five failures rather than one, so independent ones all show.
  const failFast = env.CI === 'true' || env.CI === '1' ? [`--max-failures=${CI_MAX_FAILURES}`] : [];
  const result = spawn('pnpm', ['exec', 'playwright', 'test', ...project, ...filters, ...failFast, '--reporter=list,json'], {
    cwd, env: { ...env, PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile }, stdio: 'inherit',
  });
  if (result.status !== 0 && (env.GITHUB_ACTIONS === 'true')) {
    for (const line of failureAnnotations(reportFile)) console.log(line);
  }
  if (result.status === 0) {
    const report = JSON.parse(readFileSync(reportFile, 'utf8'));
    const actual = inventoryFiles(report).sort((a, b) => a.file.localeCompare(b.file));
    const expected = files.filter((row) => selected.files.includes(row.file)).sort((a, b) => a.file.localeCompare(b.file));
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('executed test inventory differs from assigned files');
    const summary = executionSummary(report);
    console.log(`[playwright-ci] outcomes: expected=${summary.expected}, flaky=${summary.flaky}, skipped=${summary.skipped}`);
    if (summary.expected + summary.flaky === 0) {
      const runnable = [...specsIn(discovery)].some((spec) => selected.files.includes(spec.file)
        && spec.tests.some((test) => test.expectedStatus !== 'skipped'));
      if (runnable) throw new Error('assigned runnable tests were all skipped; no execution evidence');
      console.log('[playwright-ci] no runnable tests were assigned at discovery; explicit skips provide no execution evidence');
    }
  }
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = runPlaywrightCi(process.argv.slice(2)); }
  catch (error) { console.error(`[playwright-ci] ${error.message}`); process.exitCode = 1; }
}
