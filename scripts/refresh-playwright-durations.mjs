#!/usr/bin/env node
// Rewrites advisory per-file weights that balance browser CI shards from Playwright JSON reports.
// Usage: gh run download <run-id> -p "playwright-timings-*" -D output/timings
// then pnpm e2e:durations -- output/timings [--run=<run-id>]
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HISTORY = new URL('./data/playwright-file-durations.json', import.meta.url);

/** Sum every attempt's duration per spec file: a retry is time the shard really spent. */
export function measureReport(report) {
  const files = new Map();
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      const row = files.get(spec.file) ?? { seconds: 0, tests: 0 };
      for (const test of spec.tests ?? []) {
        row.tests += 1;
        for (const result of test.results ?? []) row.seconds += (result.duration ?? 0) / 1000;
      }
      files.set(spec.file, row);
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  visit(report);
  return files;
}

/** Measured files replace their old weight; files this run did not execute keep theirs while they exist. */
export function mergeDurations(history, measured, runId, isLive = () => true) {
  const files = Object.fromEntries(Object.entries(history.files ?? {}).filter(([file]) => isLive(file)));
  for (const [file, row] of measured) {
    if (row.tests === 0) continue;
    files[file] = { seconds: Number(row.seconds.toFixed(3)), tests: row.tests };
  }
  const sorted = Object.fromEntries(Object.keys(files).sort((a, b) => a.localeCompare(b, 'en')).map((file) => [file, files[file]]));
  const sourceRuns = runId ? [Number(runId), ...(history.sourceRuns ?? []).filter((id) => id !== Number(runId))].slice(0, 5) : history.sourceRuns ?? [];
  return { version: 1, sourceRuns, files: sorted };
}

function reportPaths(target) {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { recursive: true })
    .map((name) => join(target, String(name)))
    .filter((path) => /(?:^|[\\/])results-\d+\.json$/.test(path));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const runId = args.find((arg) => arg.startsWith('--run='))?.slice(6);
  const targets = args.filter((arg) => !arg.startsWith('--'));
  const paths = targets.flatMap(reportPaths);
  if (paths.length === 0) {
    console.error('[e2e:durations] no results-<shard>.json reports under the given paths');
    process.exitCode = 1;
  } else {
    const measured = new Map();
    for (const path of paths) {
      for (const [file, row] of measureReport(JSON.parse(readFileSync(path, 'utf8')))) measured.set(file, row);
    }
    const history = JSON.parse(readFileSync(HISTORY, 'utf8'));
    const specExists = (file) => existsSync(new URL(`../tests/e2e/${file}`, import.meta.url));
    writeFileSync(HISTORY, `${JSON.stringify(mergeDurations(history, measured, runId, specExists), null, 2)}\n`);
    console.log(`[e2e:durations] ${measured.size} files measured from ${paths.length} report(s)`);
  }
}
