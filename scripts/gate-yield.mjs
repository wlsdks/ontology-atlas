#!/usr/bin/env node
/**
 * Which CI checks ever catch anything?
 *
 * `run-ci-lane.mjs` appends one JSON line per command to `CI_LANE_REPORT`, and
 * `checks.yml` uploads that file as a `ci-lane-report-*` artifact kept 90 days. This
 * script downloads those artifacts for recent `checks.yml` runs and counts, per
 * command, how often it ran and how often it failed. A check is a retire candidate only
 * on data: at least 50 runs, no failure, and first seen at least 60 days ago. Until
 * enough runs exist the honest answer is `collecting`, and the table says so.
 *
 * The REST quota is shared with every lander, so the script lists runs one page of 100
 * at a time, lists artifacts once per uncached run, never refetches a cached run, and
 * refuses to start under 500 remaining calls.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const RETIRE_MIN_RUNS = 50;
export const RETIRE_MIN_AGE_DAYS = 60;
export const MIN_REMAINING_QUOTA = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Strips the parts of a command that change every run: comparison bases and shard numbers. */
export function normaliseCommand(command) {
  return String(command)
    .replace(/\s+--base=(?:'[^']*'|"[^"]*"|\S+)/g, '')
    .replace(/\s+--changed=(?:'[^']*'|"[^"]*"|\S+)/g, ' --changed')
    .replace(/\s+--shard=\d+\/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `records`: report lines, each with the run's `at` (ISO time). A `skip` line is not a
 * run of the check. Returns rows sorted by failures ascending, then runs descending.
 */
export function aggregateYield(records, { now = Date.now() } = {}) {
  const byCommand = new Map();
  for (const record of records) {
    if (record.status !== 'pass' && record.status !== 'fail') continue;
    const command = normaliseCommand(record.command);
    const at = Date.parse(record.at);
    const row = byCommand.get(command) ?? { command, runs: 0, failures: 0, firstSeen: null, lastFailure: null };
    row.runs += 1;
    if (Number.isFinite(at) && (row.firstSeen === null || at < row.firstSeen)) row.firstSeen = at;
    if (record.status === 'fail') {
      row.failures += 1;
      if (Number.isFinite(at) && (row.lastFailure === null || at > row.lastFailure)) row.lastFailure = at;
    }
    byCommand.set(command, row);
  }
  return [...byCommand.values()]
    .map((row) => ({
      ...row,
      verdict: row.failures > 0
        ? 'catches'
        : row.runs >= RETIRE_MIN_RUNS && row.firstSeen !== null && now - row.firstSeen >= RETIRE_MIN_AGE_DAYS * DAY_MS
          ? 'retire candidate'
          : 'collecting',
    }))
    .sort((a, b) => a.failures - b.failures || b.runs - a.runs || a.command.localeCompare(b.command));
}

export function formatTable(rows) {
  const day = (ms) => (ms === null ? '-' : new Date(ms).toISOString().slice(0, 10));
  const header = ['failures', 'runs', 'first seen', 'last failure', 'verdict', 'command'];
  const body = rows.map((row) => [String(row.failures), String(row.runs), day(row.firstSeen), day(row.lastFailure), row.verdict, row.command]);
  const widths = header.slice(0, -1).map((title, index) => Math.max(title.length, ...body.map((cells) => cells[index].length)));
  const line = (cells) => cells.map((cell, index) => (index < widths.length ? cell.padEnd(widths[index]) : cell)).join('  ');
  return [line(header), ...body.map(line)].join('\n');
}

/** Parses a JSONL report, dropping lines that are not report records. */
export function parseReport(text, at) {
  return String(text).split('\n').filter(Boolean).flatMap((line) => {
    try {
      const record = JSON.parse(line);
      return record && typeof record.command === 'string' ? [{ ...record, at }] : [];
    } catch {
      return [];
    }
  });
}

function gh(args, encoding = 'utf8') {
  return execFileSync('gh', ['api', ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
}

function readCachedRun(dir) {
  const meta = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const records = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.jsonl')) records.push(...parseReport(readFileSync(path, 'utf8'), meta.at));
    }
  };
  walk(dir);
  return records;
}

function fetchRun(run, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const listing = JSON.parse(gh([`repos/{owner}/{repo}/actions/runs/${run.id}/artifacts?per_page=100`]));
  for (const artifact of listing.artifacts ?? []) {
    if (!artifact.name.startsWith('ci-lane-report-') || artifact.expired) continue;
    const zip = join(dir, `${artifact.name}.zip`);
    writeFileSync(zip, gh([`repos/{owner}/{repo}/actions/artifacts/${artifact.id}/zip`], 'buffer'));
    const target = join(dir, artifact.name);
    mkdirSync(target, { recursive: true });
    execFileSync('unzip', ['-o', '-q', zip, '-d', target]);
    rmSync(zip);
  }
  // Written last: a run counts as cached only once every artifact landed.
  writeFileSync(join(dir, 'run.json'), JSON.stringify({ id: run.id, at: run.created_at }));
}

export function main(argv = process.argv.slice(2)) {
  const runsArg = argv.find((arg) => arg.startsWith('--runs='))?.slice('--runs='.length) ?? '200';
  const limit = Number(runsArg);
  if (!Number.isInteger(limit) || limit < 1) {
    process.stderr.write(`[gates:yield] --runs must be a positive integer, got ${runsArg}\n`);
    return 2;
  }
  const remaining = JSON.parse(gh(['rate_limit'])).resources?.core?.remaining ?? 0;
  if (remaining < MIN_REMAINING_QUOTA) {
    process.stderr.write(`[gates:yield] only ${remaining} REST calls remain (under ${MIN_REMAINING_QUOTA}); the quota is shared with landing, so try again after it resets\n`);
    return 1;
  }
  const cache = join(tmpdir(), 'atlas-gate-yield');
  const runs = [];
  const perPage = Math.min(100, limit);
  for (let page = 1; runs.length < limit; page += 1) {
    const listing = JSON.parse(gh([`repos/{owner}/{repo}/actions/workflows/checks.yml/runs?status=completed&per_page=${perPage}&page=${page}`]));
    const batch = listing.workflow_runs ?? [];
    runs.push(...batch.slice(0, limit - runs.length));
    if (batch.length < perPage) break;
  }
  const records = [];
  let fetched = 0;
  for (const run of runs) {
    const dir = join(cache, String(run.id));
    if (!existsSync(join(dir, 'run.json'))) {
      fetchRun(run, dir);
      fetched += 1;
    }
    records.push(...readCachedRun(dir));
  }
  process.stdout.write(`[gates:yield] ${runs.length} checks.yml run(s): ${fetched} fetched, ${runs.length - fetched} cached in ${cache}\n`);
  if (records.length === 0) {
    process.stdout.write('[gates:yield] no lane reports yet. Reports start with the change that added CI_LANE_REPORT, so earlier runs carry none; run this again once CI has accumulated runs.\n');
    return 0;
  }
  process.stdout.write(`${formatTable(aggregateYield(records))}\n`);
  process.stdout.write(`\nretire candidate = ${RETIRE_MIN_RUNS}+ runs, 0 failures, first seen ${RETIRE_MIN_AGE_DAYS}+ days ago. Reports are kept 90 days.\n`);
  return 0;
}

if (process.argv[1]?.endsWith('gate-yield.mjs')) {
  process.exitCode = main();
}
